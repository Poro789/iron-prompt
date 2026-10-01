// tools/visual-check.js — 真实浏览器视觉冒烟（手动工具，不属于单测；需要本机 Edge/Chrome）
// 目的：单测的 DOM 桩看不到真实布局。这里用无头 Chromium 内核（Edge）+ CDP 程序化审计：
//   1) 空状态首屏；2) 填充真实形态数据（历史日志→「点按沿用」等行会出现）后的首屏；
//   3) 趋势/历史/设置各视图；4) 抽屉。
// 每个状态：扫描所有元素是否超出视口（水平溢出），并截图保存到 .visual/ 供人眼复核。
// 用法：node tools/visual-check.js [视口宽] [调试端口]   例：node tools/visual-check.js 390
// 退出码：0=无溢出；1=任一状态出现水平溢出（列出越界元素）。
// 零依赖：Node ≥22 全局 fetch/WebSocket + CDP。
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const W = Number(process.argv[2] || 390);
const PORT = Number(process.argv[3] || 9323);
const ROOT = path.join(__dirname, '..');
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const browser = BROWSERS.find(p => fs.existsSync(p));
if (!browser) { console.error('未找到 Edge/Chrome，无法做真实布局审计'); process.exit(2); }

const outDir = path.join(ROOT, '.visual');
fs.mkdirSync(outDir, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'iron-vc-'));
const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const child = spawn(browser, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
  '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`,
  `--window-size=${W},844`, '--hide-scrollbars', url,
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find(t => t.type === 'page');
    } catch (e) { /* 浏览器还在启动 */ }
    if (!target) await sleep(250);
  }
  if (!target) { console.error('CDP 目标未出现（Edge 可能被沙箱拦截）'); child.kill(); process.exit(2); }

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

  let overflow = false;
  const applyMetrics = () => send('Emulation.setDeviceMetricsOverride', { width: W, height: 844, deviceScaleFactor: 2, mobile: true });
  const audit = async label => {
    await applyMetrics();   // 覆盖可能被导航/时序悄悄清掉——每次测量前重下发，视口读数才可信
    const r = await evaljs(`(() => {
      const vw = innerWidth, bad = [];
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
      return { vw, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 12) };
    })()`);
    const hit = r.scrollW > W + 1 || r.bad.length > 0 || r.vw !== W;
    if (hit) overflow = true;
    console.log(`[${label}] viewport=${r.vw} scrollWidth=${r.scrollW} 溢出=${hit ? '有' : '无'}` + (r.vw !== W ? '（视口被内容撑开——内容宽超过目标宽）' : ''));
    if (r.bad.length) console.log('  越界元素:\n  ' + r.bad.join('\n  '));
    return r;
  };
  const shot = async name => {
    await applyMetrics();
    const m = await send('Page.captureScreenshot', { format: 'png' });
    const f = path.join(outDir, `vc-${W}-${name}.png`);
    fs.writeFileSync(f, Buffer.from(m.result.data, 'base64'));
    console.log(`  截图 -> .visual/${path.basename(f)}`);
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
  await evaljs('toggleDrawer()'); await sleep(350);
  await audit('抽屉打开'); await shot('drawer');

  ws.close();
  child.kill();
  console.log(overflow ? '\n结论：存在水平溢出' : '\n结论：所有状态无水平溢出');
  process.exit(overflow ? 1 : 0);
})().catch(e => { console.error('运行失败:', e.message); try { child.kill(); } catch (x) {} process.exit(2); });
