// tools/visual-check.js — 真实浏览器闸门（本地与 CI 共用；需要本机 Edge/Chrome，或设 CHROME_PATH）
// 目的：单测的 DOM 桩看不到真实布局，也接不住真实事件。这里用无头 Chromium 内核 + CDP 做三类检查：
//   A) 每个状态在指定视口下有没有水平溢出；
//   B) 可点元素的触达尺寸（AGENTS.md：≥44px 高）——这类问题逻辑测试测不出来，历史上真出过三次；
//   C) 点击链路：用真 click 事件驱动抽屉/视图/日期切换并核对结果（data-action 委托是否真的接住）。
//   D) 可读性：文本对比度（WCAG 2.1，正文 4.5:1 / 大字 3:1）与键盘焦点是否可见（真按 Tab，看焦点框还在不在）。
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
// D 项阈值：WCAG 2.1 的 1.4.3（正文 4.5:1）与 1.4.5（≥24px，或 ≥18.66px 且粗体，3:1）。
// 阈值写在代码里、不写在文档里：改阈值要同时改这里和 AGENTS.md，两处不一致会被 CI 里的这条闸门反问。
const D_TEXT = 4.5, D_LARGE = 3.0;
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
/* 下载落点（v0.9.153）：C 段真点「现在导出备份」，浏览器默认会把文件丢进系统的下载夹——
 * 跑一次闸门就在用户的 Downloads 里堆一个 ironlog-backup-*.json（那里真攒过 20 个测试桩备份）。
 * 重定向到 .visual/downloads（不入库）：不动用户目录，同时这个文件正好用来核对备份的文件名。
 * 每次先清空：这样「出现了备份文件」就是本轮真的下载了，不是上一轮留下的。 */
const dlDir = path.join(outDir, 'downloads');
fs.rmSync(dlDir, { recursive: true, force: true });
fs.mkdirSync(dlDir, { recursive: true });
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

/* D1) 文本对比度：在页面里算，因为「文字实际压在哪层背景上」只有渲染出来才知道。
 * 相对亮度与对比度按 WCAG 2.1；背景沿祖先链逐层合成——页面上大量用半透明 rgba 覆在 --bg 上，只看一层会算错。
 * 跳过 display:none / visibility:hidden / opacity:0 / 零尺寸（屏幕阅读器专用的文本不需要可见对比度）。
 * 顺带查 ::placeholder：它肉眼看得见、常常灰到看不见，而它不是「内容」所以最容易漏。 */
const CONTRAST_SCAN = `(() => {
  const NEED_TEXT = ${D_TEXT}, NEED_LARGE = ${D_LARGE};
  const lum = (r, g, b) => { const f = c => { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const parse = s => {
    const m = /^rgba?\\(([^)]+)\\)$/.exec(String(s).trim()); if (!m) return null;
    const p = m[1].trim().split(/[\\s,/]+/).map(Number);
    if (p.length < 3 || p.slice(0, 3).some(x => !isFinite(x))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const rgb = c => 'rgb(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ')';
  const ratio = (x, y) => { const a = lum(x.r, x.g, x.b), b = lum(y.r, y.g, y.b); const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); };
  // 找不到不透明底就按白底算（这个页面的 body 一直是实色，走不到这里；走到了也不会算成「对比度无限」）
  const bgOf = el => {
    const st = [];
    for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { st.push(c); if (c.a >= 1) break; } }
    let acc = { r: 255, g: 255, b: 255, a: 1 };
    if (st.length && st[st.length - 1].a >= 1) acc = st.pop();
    for (let i = st.length - 1; i >= 0; i--) acc = over(st[i], acc);
    return acc;
  };
  const shown = el => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const selOf = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
  const ownText = el => Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
  const out = [];
  const push = (sel, text, need, got, fg, bg) => out.push({ sel, text: String(text).trim().slice(0, 24), need, got: +got.toFixed(2), fg, bg });
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el)) continue;
    const st = getComputedStyle(el);
    const size = parseFloat(st.fontSize) || 0;
    const large = size >= 24 || (size >= 18.66 && (parseInt(st.fontWeight, 10) || 400) >= 700);
    const bg = bgOf(el);
    if (ownText(el)) {
      const fg = parse(st.color);
      if (fg) {
        const c = fg.a < 1 ? over(fg, bg) : fg;
        const r = ratio(c, bg);
        if (r < (large ? NEED_LARGE : NEED_TEXT)) push(selOf(el), el.textContent, large ? NEED_LARGE : NEED_TEXT, r, rgb(c), rgb(bg));
      }
    }
    if (el.matches('input,textarea') && el.placeholder) {
      const pst = getComputedStyle(el, '::placeholder');
      const ph = parse(pst.color);
      if (ph) {
        const c = ph.a < 1 ? over(ph, bg) : ph;
        const r = ratio(c, bg);
        if (r < NEED_TEXT) push(selOf(el) + '::placeholder', el.placeholder, NEED_TEXT, r, rgb(c), rgb(bg));
      }
    }
  }
  return out;
})()`;

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
  // 把下载定向到 .visual/downloads。页面会话上的 Page 域命令是最窄的接口（只影响这个标签页），
  // 它被拒就退回 Browser 域——两者都失败时后面那条「备份文件出现了吗」会红，不会静默污染下载夹。
  const dlResp = await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir });
  if (dlResp.error) await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir });
  const evaljs = async expression => {
    const m = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (m.result.exceptionDetails) throw new Error('页面求值失败: ' + JSON.stringify(m.result.exceptionDetails.exception && m.result.exceptionDetails.exception.description || m.result.exceptionDetails.text));
    return m.result.result.value;
  };

  const waitReady = async () => { for (let i = 0; i < 60; i++) { if (await evaljs('document.readyState') === 'complete') { await sleep(300); return; } await sleep(200); } throw new Error('页面未就绪'); };

  let stateLabel = '空状态首屏';
  let overflow = false;
  const applyMetrics = () => send('Emulation.setDeviceMetricsOverride', { width: W, height: 844, deviceScaleFactor: 2, mobile: true });
  // 两套主题都要跑（v0.9.152）：A/B 与主题无关但按状态重测不花钱，D 项才是关键——
  // 「深色下刚好合格的色值」换到浅色可能又不达标，只有真的按主题渲染才算验收。
  const THEMES = ['dark', 'light'];
  const setTheme = async theme => {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
    await sleep(120);   // 让媒体条件生效后再读样式，否则可能测到上一套
  };
  // 页面上「独立的可点目标」：嵌套在另一个可点元素里的（按钮里的 span）由外层负责，不重复计。
  const TARGETS = 'a[href], button, summary, [role="tab"], [role="button"], [data-action], [data-act], input, select, textarea';
  // 同一个选择器只留最差的一条：嵌套的文字会被重复计，噪音会盖过信号。按「离阈值的相对差距」排序。
  const contrastScan = async () => {
    const raw = await evaljs(CONTRAST_SCAN);
    const worst = new Map();
    for (const v of raw) { if (!worst.has(v.sel) || worst.get(v.sel).got > v.got) worst.set(v.sel, v); }
    return [...worst.values()].sort((a, b) => a.got / a.need - b.got / b.need).slice(0, 12);
  };
  const measure = () => evaljs(`(() => {
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
  const audit = async label => {
    await applyMetrics();   // 覆盖可能被导航/时序悄悄清掉——每次测量前重下发，视口读数才可信
    let r;
    for (const theme of THEMES) {
      await setTheme(theme);
      r = await measure();
      const hit = r.scrollW > W + 1 || r.bad.length > 0 || r.vw !== W;
      if (hit) overflow = true;
      console.log(`[${label} ${theme}] viewport=${r.vw} scrollWidth=${r.scrollW} 溢出=${hit ? '有' : '无'} 触达不足=${r.tiny.length}`);
      if (r.bad.length) console.log('  越界元素:\n  ' + r.bad.join('\n  '));
      if (r.tiny.length) console.log('  触达不足元素:\n  ' + r.tiny.join('\n  '));
      check(`A ${label}（${theme}）：无水平溢出`, !hit, r.bad.join(' | '));
      check(`B ${label}（${theme}）：可点目标触达 ≥${TOUCH_MIN}px`, r.tiny.length === 0, r.tiny.join(' | '));
      // D1) 跟着每个状态跑：低对比文本常常只在某个视图/某个状态下出现（比如历史页的空状态提示）。
      const low = await contrastScan();
      console.log(`  [${theme}] 低对比文本=${low.length}`);
      if (low.length) console.log('  低对比:\n  ' + low.map(v => `${v.sel} ${v.got}:1（需 ${v.need}）${v.fg} over ${v.bg} 「${v.text}」`).join('\n  '));
      check(`D ${label}（${theme}）：文本对比度 正文≥${D_TEXT}:1 / 大字≥${D_LARGE}:1`, low.length === 0, low.map(v => v.sel + ' ' + v.got + ':1').join(' | '));
    }
    return r;
  };
  const shot = async name => {
    for (const theme of THEMES) {
      await applyMetrics();
      await setTheme(theme);
      const m = await send('Page.captureScreenshot', { format: 'png' });
      const f = path.join(outDir, `vc-${W}-${name}${theme === 'light' ? '-light' : ''}.png`);
      fs.writeFileSync(f, Buffer.from(m.result.data, 'base64'));
      console.log('  截图 -> .visual/' + path.basename(f));
    }
  };
  // 真 click：element.click() 会完整走完 target→bubble→document，与手指点屏幕等价。
  const click = async sel => {
    const ok = await evaljs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if(!el) return false; el.click(); return true; })()`);
    check(`C ${stateLabel}：找到并点击 ${sel}`, ok);
    await sleep(250);
  };

  await applyMetrics();
  await waitReady();
  // F) 两套主题真的被应用（v0.9.152）：媒体条件写错（比如把 light 拼错）时，浅色那一轮会「全绿、但量的还是深色」，
  //    等于整个浅色主题从没被验收过。所以先钉最硬的那条可观察后果：matchMedia 命中，且 :root 的 --bg 真的换了。
  await setTheme('dark');
  const bgDark = await evaljs(`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()`);
  await setTheme('light');
  const bgLight = await evaljs(`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()`);
  const mmLight = await evaljs(`matchMedia('(prefers-color-scheme: light)').matches`);
  check('F 浅色主题真的生效（matchMedia 命中且 --bg 跟着换）', mmLight === true && !!bgLight && bgLight !== bgDark, '深色 --bg=' + bgDark + ' 浅色 --bg=' + bgLight);
  await audit('空状态首屏'); await shot('empty');

  // 填充真实形态数据：两次 A 日全完成的日志（6 天前重量打九折、3 天前按计划）——真机上「点按沿用」「状态」等行就是靠它出现的。
  // 为什么是两次而不是一次：趋势折线要同一个动作至少 2 次记录（buildTrendCharts 把不足 2 点的线全过滤掉），
  // 只造一天的话历史页永远显示「再练两次」，图上的网格、刻度、折线在两套主题里都没被审过（v0.9.152 补）。
  // 注意：program 条目的键是 exerciseId（不是 id）；组要带 type——lastValues 会过滤热身组。
  await evaljs(`(() => {
    const dayAt = n => { const d = new Date(Date.now() - n * 864e5); return { d, ds: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }; };
    const log = (n, scale) => { const { d, ds } = dayAt(n); return { date: ds, startedAt: d.getTime(), endedAt: d.getTime() + 36e5, day: 'A',
      exercises: state.program.A.map(it => ({ exerciseId: it.exerciseId, sets: it.sets.map(s => ({ type: s.type, weight: Math.round(s.weight * scale * 100) / 100, reps: s.reps, duration: s.duration, done: true })) })) }; };
    state.logs.push(log(6, 0.9), log(3, 1));
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

  /* 要审的视图从页面里读，不写死名字。之前写死过一次，里面有个 'trends' —— switchView 只认
   * today/history/settings（js/app.js:692），传进去会把三个视图的 active 全摘掉：那一轮只审了个头，
   * 却照样全绿。列表来自 DOM 之后，新增视图会自动进审计，名字写错也不会静默空转。 */
  const VIEWS = await evaljs(`[...document.querySelectorAll('.view')].map(v => v.id.replace(/^view-/, ''))`);
  check('视图清单：从页面里读到三个以上视图', Array.isArray(VIEWS) && VIEWS.length >= 3, '读到 ' + (VIEWS || []).join(','));
  for (const v of VIEWS) {
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
  await setTheme('dark');   // 点击链路固定在默认（深色）主题下跑：上面每个状态的两套主题审计已经做完了
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
    // D 项必须覆盖「只有交互之后才出现的状态」：`.fs-done.done` 这类实心按钮平时不在任何被审状态里，
    // 于是「白字压 --green」（实测 2.51:1）从上一版闸门的缝里漏掉了。这里补一个状态。
    await audit('卡片：一组已完成'); await shot('card-done');
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

  /* 备份提醒（v0.9.148）：这份档案从没导出过备份，今日页必须出现提醒；点一键导出后收起。
   * §208 在 DOM 桩里测过天数口径与显示切换；这里补的是真实接线——渲染出来的横幅、
   * 委托按钮、以及 doBackup 在真浏览器里生成下载文件这条链。 */
  await click('#hamburger-btn');
  await click('#tab-today');
  check('C 全新档案：今日页出现备份提醒', await evaljs(`document.getElementById('backup-nag').style.display !== 'none' && document.getElementById('backup-nag-text').textContent.length > 0`));
  await click('[data-action="backupNow"]');
  await sleep(300);
  check('C 点「现在导出备份」：提醒收起并记下时间', await evaljs(`document.getElementById('backup-nag').style.display === 'none' && state.settings.lastBackupAt > 0`));
  check('C 备份这条链不产生未捕获异常', await evaljs(`(window.__vcErr || 0) === 0`));

  /* 下载真的落在 .visual/downloads、且名字精确到秒（v0.9.153）。这条同时钉两件事：
   * ① 重定向真的生效——闸门不再往用户的下载夹丢文件（开头清空过，所以出现的文件必是本轮的）；
   * ② 备份名带 HHMMSS：只到日期时同一天第二次导出会被浏览器静默存成 " (1)"、" (2)"，
   *    换设备时看不出哪个是最新的——真实下载夹里就因此堆过 20 个这样的副本。 */
  let bakName = '';
  for (let i = 0; i < 20 && !bakName; i++) {
    bakName = fs.readdirSync(dlDir).find(f => /^ironlog-backup-\d{4}-\d{2}-\d{2}-\d{6}\.json$/.test(f)) || '';
    if (!bakName) await sleep(250);
  }
  check('C 备份文件落在 .visual/downloads，文件名精确到秒' + (bakName ? '：' + bakName : ''), !!bakName);

  /* E) 两个模态各开一轮审计（P1-5 的收尾，v0.9.152）：C 段以前从不点开确认框和小结，
   * 所以上一版对比度修复里的 `.confirm-ok`、`.summary-card button` 是「同机制所以大概也超标」推出来的，
   * 不是测出来的——被修的东西必须有闸门看着它。这里先结束训练开小结，关掉后再开确认框（点「取消」，
   * 不真的清数据：后面还要用这份档案）。顺带这也把提示条（.toast）渲染进审计——它的底色在浅色主题下换过。 */
  stateLabel = '模态';
  console.log('\n[模态] 结束训练的小结与确认框');
  await click('#hamburger-btn');
  await click('#tab-today');
  check('C 模态：今日页有可点的「结束训练」', await evaljs(`getComputedStyle(document.getElementById('end-btn')).display !== 'none'`));
  const logsBefore = await evaljs(`state.logs.length`);
  await click('#end-btn');
  check('C 点「结束训练」：小结打开', await evaljs(`document.getElementById('summary-overlay').classList.contains('show')`));
  await audit('小结打开'); await shot('summary');
  await click('#summary-close');
  const summaryClosed = await evaljs(`!document.getElementById('summary-overlay').classList.contains('show')`);
  const logsAfter = await evaljs(`state.logs.length`);
  check(`C 点「好的」：小结关闭且这次记录写入日志（${logsBefore} → ${logsAfter}）`, summaryClosed && logsAfter === logsBefore + 1);

  await click('#hamburger-btn');
  await click('#tab-settings');
  await click('[data-action="clearAll"]');
  check('C 点「清除全部数据」：确认框打开', await evaljs(`document.getElementById('confirm-overlay').classList.contains('show')`));
  // 确认框里那个实心按钮的真实底色：必须是 --red-fill，不是 --red（白字压后者只有 3.82:1）。
  // 读渲染出来的 computed 值，比在源码里找 CSS 规则强——它连「被别的规则覆盖了」这种情况也算。
  const okBg = await evaljs(`(() => {
    const probe = document.createElement('span'); probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--red-fill').trim();
    document.body.appendChild(probe);
    const want = getComputedStyle(probe).color; probe.remove();
    const got = getComputedStyle(document.getElementById('confirm-ok-btn')).backgroundColor;
    return { want, got, match: got === want };
  })()`);
  check(`E 确认框「确定」的真实底色就是 --red-fill（${okBg.got}）`, okBg.match, `期望 ${okBg.want}，实际 ${okBg.got}`);
  await audit('确认框打开'); await shot('modal');
  await click('[data-action="confirmNo"]');
  check('C 点「取消」：确认框关闭且数据没被清', await evaljs(`!document.getElementById('confirm-overlay').classList.contains('show') && state.logs.length > 1`));

  /* D2) 键盘焦点：真按 Tab 走焦点（:focus-visible 只认键盘路径，element.focus() 不算），逐个读 computed outline / box-shadow。
   * Chrome 自己的焦点环在 computed style 里是 outline-style:auto，所以 auto 算可见；只有 outline 被抹成 none 又没有 box-shadow 兜底才算看不见。
   * 这个仓库的 CSS 里从来没有 outline:none——这条防的是以后为了「好看」把它加进来，那会让键盘用户找不到自己在哪。 */
  stateLabel = '键盘焦点';
  console.log('\n[键盘焦点] 真按 Tab，逐个检查焦点框');
  const seenFocus = new Map();
  const TABKEY = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
  // 不在「转回起点」时提前停：起点取决于上一步留在哪个元素上，提前停会把屏幕前半段漏掉。
  // 固定按 60 次（比这个页面所有焦点目标都多），去重收集。
  for (let i = 0; i < 60; i++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...TABKEY });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...TABKEY });
    const info = await evaljs(`(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      const st = getComputedStyle(el), r = el.getBoundingClientRect();
      const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
      return { sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls,
        outline: st.outlineStyle, width: st.outlineWidth, shadow: st.boxShadow !== 'none', shown: r.width > 0 && r.height > 0 };
    })()`);
    if (!info) continue;                        // 焦点暂时在页面外（浏览器 UI），继续按
    seenFocus.set(info.sel, info);
  }
  const noRing = [...seenFocus.values()].filter(x => x.shown && x.outline === 'none' && !x.shadow);
  console.log(`  Tab 走到 ${seenFocus.size} 个焦点目标，无焦点框=${noRing.length}` + (noRing.length ? '\n  无焦点框:\n  ' + noRing.map(x => x.sel).join('\n  ') : ''));
  if (seenFocus.size < 8) {
    // 走不动时，这两行是唯一能分辨「Tab 没生效」和「这一屏本来就没几个焦点目标」的信息
    const nf = await evaljs(`(() => { let n = 0; for (const el of document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')) {
      if (el.disabled || el.closest('[inert]')) continue; const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden' || st.pointerEvents === 'none') continue; n++; } return n; })()`);
    console.log('  焦点序列: ' + [...seenFocus.keys()].join(' → ') + '\n  （页面上可见且可聚焦的元素有 ' + nf + ' 个）');
  }
  check('D 键盘焦点：Tab 能走起来（走不动是工具没跑成，不能算过）', seenFocus.size >= 3, '只走到 ' + seenFocus.size + ' 个焦点目标');
  check('D 键盘焦点：每个焦点目标都有可见焦点框', noRing.length === 0, noRing.map(x => x.sel).join(' | '));

  // 还原日期，免得工具跑完把用户的本机数据停在 B 日
  await evaljs(`switchDay(${JSON.stringify(dayBefore)}); true`);

  ws.close();
  child.kill();
  console.log(`\n结论：${pass} 项通过，${fail} 项失败` + (overflow ? '（其中含水平溢出）' : ''));
  if (problems.length) console.log('失败明细:\n  ' + problems.join('\n  '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('运行失败:', e.message); try { child.kill(); } catch (x) {} process.exit(2); });
