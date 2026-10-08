// tools/visual-check.js — 真实浏览器闸门（本地与 CI 共用；需要本机 Edge/Chrome，或设 CHROME_PATH）
// 目的：单测的 DOM 桩看不到真实布局，也接不住真实事件。这里用无头 Chromium 内核 + CDP 做三类检查：
//   A) 每个状态在指定视口下有没有水平溢出；
//   B) 可点元素的触达尺寸（AGENTS.md：≥44px 高）——这类问题逻辑测试测不出来，历史上真出过三次；
//   C) 点击链路：用真 click 事件驱动抽屉/视图/日期切换并核对结果（data-action 委托是否真的接住）。
// 用法：node tools/visual-check.js [视口宽] [调试端口]   例：node tools/visual-check.js 390
// 退出码：0=全部通过；1=任一检查失败（逐条列出状态与元素）；2=浏览器或 CDP 不可用（工具没跑成，不算通过）。
// 零依赖：Node ≥22 的全局 fetch/WebSocket + CDP。CI 里用 ubuntu 镜像自带的 google-chrome。
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const W = Number(process.argv[2] || 390);
const PORT = Number(process.argv[3] || 9323);
const ROOT = path.join(__dirname, '..');
const TOUCH_MIN = 44;   // 触达高度下限（px），与 AGENTS.md「可点元素触达高度 ≥44px」一致
const TOUCH_MIN_W = 24; // 触达宽度下限：细长的可点条同样按不准（比如 44×8）
const BROWSERS = [
  ...(process.env.CHROME_PATH ? [process.env.CHROME_PATH] : []),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const browser = BROWSERS.find(p => fs.existsSync(p));
if (!browser) {
  console.error('未找到 Edge/Chrome（可设 CHROME_PATH 指定），无法做真实浏览器审计');
  process.exit(2);
}

const outDir = path.join(ROOT, '.visual');
fs.mkdirSync(outDir, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'iron-vc-'));
const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
// Linux（CI 容器）里 Chrome 的 setuid sandbox 常不可用；Windows 不需要这两个开关。
const flags = ['--headless=new', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
  '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--window-size=${W},844`, '--hide-scrollbars'];
if (process.platform !== 'win32') flags.push('--no-sandbox', '--disable-dev-shm-usage');
const child = spawn(browser, [...flags, url], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const problems = [];
// 与逻辑测试同一套读法：ok / FAIL 逐行打，末尾给计数；失败的具体元素另存一份供 CI 汇总。
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; problems.push(name + (detail ? ' —— ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' ' + detail : '')); }
};

(async () => {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find(t => t.type === 'page');
    } catch (e) { /* 浏览器还在启动 */ }
    if (!target) await sleep(250);
  }
  if (!target) { console.error('CDP 目标未出现（浏览器可能被沙箱拦截）'); child.kill(); process.exit(2); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws 连接失败')); });
  let mid = 0;
  const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const id = ++mid; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evaljs = async expression => {
    const m = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (m.result.exceptionDetails) throw new Error('页面求值失败: ' + JSON.stringify(m.result.exceptionDetails.exception && m.result.exceptionDetails.exception.description || m.result.exceptionDetails.text));
    return m.result.result.value;
  };

  const waitReady = async () => { for (let i = 0; i < 60; i++) { if (await evaljs('document.readyState') === 'complete') { await sleep(300); return; } await sleep(200); } throw new Error('页面未就绪'); };

  let stateLabel = '空状态首屏';
  let overflow = false;
  const applyMetrics = () => send('Emulation.setDeviceMetricsOverride', { width: W, height: 844, deviceScaleFactor: 2, mobile: true });
  // 页面上「独立的可点目标」：嵌套在另一个可点元素里的（按钮里的 span）由外层负责，不重复计。
  const TARGETS = 'a[href], button, summary, [role="tab"], [role="button"], [data-action], [data-act], input, select, textarea';
  const audit = async label => {
    await applyMetrics();   // 覆盖可能被导航/时序悄悄清掉——每次测量前重下发，视口读数才可信
    const r = await evaljs(`(() => {
      const vw = innerWidth, bad = [], tiny = [];
      const SEL = ${JSON.stringify(TARGETS)};
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        const st = getComputedStyle(el);
        if (st.visibility === 'hidden' || st.display === 'none') continue;
        if (r.right > ${W} + 0.5 || r.left < -0.5) {
          const cls = (el.className && el.className.toString ? el.className.toString() : '').split(/\\s+/).filter(Boolean).join('.');
          bad.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '') + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
        }
      }
      for (const el of document.querySelectorAll(SEL)) {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        const st = getComputedStyle(el);
        if (st.visibility === 'hidden' || st.display === 'none' || st.pointerEvents === 'none') continue;
        if (el.parentElement && el.parentElement.closest(SEL)) continue;   // 内层不算独立触达目标
        if (r.height < ${TOUCH_MIN} || r.width < ${TOUCH_MIN_W}) {
          const cls = (el.className && el.className.toString ? el.className.toString() : '').split(/\\s+/).filter(Boolean).join('.');
          tiny.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '') + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
        }
      }
      return { vw, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 12), tiny: tiny.slice(0, 12) };
    })()`);
    const hit = r.scrollW > W + 1 || r.bad.length > 0 || r.vw !== W;
    if (hit) overflow = true;
    console.log(`[${label}] viewport=${r.vw} scrollWidth=${r.scrollW} 溢出=${hit ? '有' : '无'} 触达不足=${r.tiny.length}`);
    if (r.bad.length) console.log('  越界元素:\n  ' + r.bad.join('\n  '));
    if (r.tiny.length) console.log('  触达不足元素:\n  ' + r.tiny.join('\n  '));
    check(`A ${label}：无水平溢出`, !hit, r.bad.join(' | '));
    check(`B ${label}：可点目标触达 ≥${TOUCH_MIN}px`, r.tiny.length === 0, r.tiny.join(' | '));
    return r;
  };
  const shot = async name => {
    await applyMetrics();
    const m = await send('Page.captureScreenshot', { format: 'png' });
    const f = path.join(outDir, `vc-${W}-${name}.png`);
    fs.writeFileSync(f, Buffer.from(m.result.data, 'base64'));
    console.log('  截图 -> .visual/' + path.basename(f));
  };
  // 真 click：element.click() 会完整走完 target→bubble→document，与手指点屏幕等价。
  const click = async sel => {
    const ok = await evaljs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if(!el) return false; el.click(); return true; })()`);
    check(`C ${stateLabel}：找到并点击 ${sel}`, ok);
    await sleep(250);
  };

  await applyMetrics();
  await waitReady();
  await audit('空状态首屏'); await shot('empty');

  // 填充真实形态数据：3 天前一次 A 日全完成的日志——真机上「点按沿用」「状态」等行就是靠它出现的。
  // 注意：program 条目的键是 exerciseId（不是 id）；组要带 type——lastValues 会过滤热身组。
  await evaljs(`(() => {
    const d = new Date(Date.now() - 3 * 864e5);
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    state.logs.push({ date: ds, startedAt: d.getTime(), endedAt: d.getTime() + 36e5, day: 'A',
      exercises: state.program.A.map(it => ({ exerciseId: it.exerciseId, sets: it.sets.map(s => ({ type: s.type, weight: s.weight, reps: s.reps, duration: s.duration, done: true })) })) });
    save();
    return true;
  })()`);
  await send('Page.reload');
  await waitReady();
  // 页面重新加载会清掉设备度量覆盖——重载后必须重新下发，否则视口退回窗口最小宽。
  await applyMetrics();
  // 首张卡是热身动作（热身组不显示「点按沿用」）——把游标挪到当天第一个正式组，让该行进入截图。
  await evaljs(`(() => {
    const day = state.settings.lastDay;
    curPos = flatPos(day).findIndex(p => getItems(day)[p.exIdx].sets[p.setIdx].type !== 'warmup');
    render();
    return curPos;
  })()`);
  await audit('有数据首屏'); await shot('filled');

  for (const v of ['trends', 'history', 'settings']) {
    await evaljs(`switchView('${v}')`);
    await sleep(250);
    await audit('视图:' + v); await shot(v);
  }
  await evaljs("switchView('today')"); await sleep(200);

  /* ---------------- C) 点击链路：真 click 驱动状态，再核对结果 ----------------
   * 页面上的可点动作全部走 data-action + app.js 的 ACTIONS 表（v0.9.145）。
   * 逻辑测试在 DOM 桩里派发假事件，接不住「真实浏览器里 closest 选不中 / 监听器没注册」这类断链；
   * 这里用真 click，断链会直接表现为下面的断言失败。 */
  stateLabel = '点击链路';
  console.log('\n[点击链路] 真实 click 事件走 data-action 委托');
  let pageErrors = 0;
  await evaljs(`window.addEventListener('error', () => window.__vcErr = (window.__vcErr||0)+1); true`);

  await click('#hamburger-btn');
  check('C 点汉堡按钮：抽屉打开', await evaljs(`document.getElementById('drawer').classList.contains('open')`));
  await audit('抽屉打开'); await shot('drawer');

  // 抽屉里的日期按钮：复合动作（切日 + 关抽屉）。兜底对 .drawer 内的点击会直接返回，
  // 所以「抽屉关了」只能来自 ACTIONS 里的动作。
  const dayBefore = await evaljs(`state.settings.lastDay`);
  await click('#day-btn-B');
  check('C 点 B 日按钮：切到 B 日', await evaljs(`state.settings.lastDay === 'B'`));
  check('C 点 B 日按钮：同一个动作关掉抽屉', await evaljs(`!document.getElementById('drawer').classList.contains('open')`));

  // 视图标签：切视图 + 关抽屉
  await click('#hamburger-btn');
  await click('#tab-settings');
  check('C 点「设置」标签：设置视图激活', await evaljs(`document.getElementById('view-settings').classList.contains('active')`));
  check('C 点「设置」标签：抽屉关闭', await evaljs(`!document.getElementById('drawer').classList.contains('open')`));

  // 遮罩：点遮罩关抽屉
  await click('#hamburger-btn');
  await click('.drawer-overlay');
  check('C 点遮罩：抽屉关闭', await evaljs(`!document.getElementById('drawer').classList.contains('open')`));

  // 回今日视图，真点渲染出来的「状态」按钮（带参数的动作：data-day 要先收窄类型）
  await click('#hamburger-btn');
  await click('#tab-today');
  const condSel = '[data-action="cycleCondition"]';
  check('C 今日视图渲染出带 data-day 的状态按钮', await evaljs(`/data-action="cycleCondition" data-day="[AB]"/.test(document.getElementById('session-status').innerHTML)`));
  const condBefore = await evaljs(`(document.querySelector(${JSON.stringify(condSel)}) || {}).textContent || ''`);
  await click(condSel);
  const condAfter = await evaljs(`(document.querySelector(${JSON.stringify(condSel)}) || {}).textContent || ''`);
  check('C 点状态按钮：文案跟着变（' + String(condBefore).trim() + ' → ' + String(condAfter).trim() + '）', condAfter !== condBefore && /状态：/.test(condAfter));

  /* 训练卡片上的按钮（data-act → exClick 的三层 act 表）。
   * v0.9.147 把那条 172 行的 if(act===…) 链拆成 EX_NAV_ACTS / EX_ITEM_ACTS / EX_SET_ACTS。
   * 逻辑测试（§207）在 DOM 桩里测过派发，但桩里的 closest 是假的；这里真点一次，
   * 三层各挑一个：± 步进（set 层）、加一组（item 层）、完成这组（set 层）。
   * 拆处理器时接错一层、少传一个 data-* ——在这里会直接表现为「按了没用」。 */
  const posC = await evaljs(`(() => {
    // 卡片只渲染当前那一组，所以先把游标挪到一个「力量模式」的位置——
    // 时长类动作的卡片上没有 ±reps，拿它测步进会假失败。
    const d = state.settings.lastDay, ps = flatPos(d);
    for(let i = 0; i < ps.length; i++){
      const it = getItems(d)[ps[i].exIdx];
      if(((state.exercises[it.exerciseId] || {}).mode || 'weight') === 'weight'){ curPos = i; render(); return { ex: ps[i].exIdx, set: ps[i].setIdx }; }
    }
    return null;
  })()`);
  await sleep(250);
  check('C 今日视图渲染出可操作的训练卡片', !!posC);
  if (posC) {
    const repsSel = `#ex-list .fs-input[data-f="reps"][data-ex="${posC.ex}"][data-set="${posC.set}"]`;
    const repsBefore = await evaljs(`(document.querySelector(${JSON.stringify(repsSel)}) || {}).value`);
    await click(`#ex-list button.fs-step[data-act="step"][data-f="reps"][data-dir="1"][data-ex="${posC.ex}"][data-set="${posC.set}"]`);
    const repsAfter = await evaljs(`(document.querySelector(${JSON.stringify(repsSel)}) || {}).value`);
    check(`C 卡片上点「+」：reps ${repsBefore} → ${repsAfter}`, Number(repsAfter) === Number(repsBefore) + 1);

    const setsBefore = await evaljs(`getItems(state.settings.lastDay)[${posC.ex}].sets.length`);
    await click(`#ex-list button.add-set[data-act="addset"][data-ex="${posC.ex}"]`);
    const setsAfter = await evaljs(`getItems(state.settings.lastDay)[${posC.ex}].sets.length`);
    check(`C 点「加一组」：组数 ${setsBefore} → ${setsAfter}`, setsAfter === setsBefore + 1);

    const doneBefore = await evaljs(`getItems(state.settings.lastDay)[${posC.ex}].sets[${posC.set}].done === true`);
    await click(`#ex-list .fs-done[data-ex="${posC.ex}"][data-set="${posC.set}"]`);
    const doneAfter = await evaljs(`getItems(state.settings.lastDay)[${posC.ex}].sets[${posC.set}].done === true`);
    check(`C 点「完成这组」：该组的完成状态翻转（${doneBefore} → ${doneAfter}）`, doneAfter !== doneBefore);
    // 休息计时会被「完成这组」起起来：停掉它，免得后面的截图里挂着倒计时
    await evaljs(`if(restEndsAt !== null) finishRest(); true`);
  }

  // 导出：真点一次，核对回执出现且没有未捕获异常
  await click('#hamburger-btn');
  await click('#tab-history');
  await click('[data-action="doExport"]');
  await sleep(400);
  check('C 点导出不产生未捕获异常', await evaljs(`(window.__vcErr || 0) === 0`));
  check('C 点导出后有回执文案', await evaljs(`document.getElementById('export-msg').textContent.length > 0`));
  check('C 点导出后文本框里有内容', await evaljs(`document.getElementById('export-text').value.length > 100`));

  // 还原日期，免得工具跑完把用户的本机数据停在 B 日
  await evaljs(`switchDay(${JSON.stringify(dayBefore)}); true`);

  ws.close();
  child.kill();
  console.log(`\n结论：${pass} 项通过，${fail} 项失败` + (overflow ? '（其中含水平溢出）' : ''));
  if (problems.length) console.log('失败明细:\n  ' + problems.join('\n  '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('运行失败:', e.message); try { child.kill(); } catch (x) {} process.exit(2); });
