// Iron Log 逻辑测试：用 DOM 桩在 node 中执行 js/app.js
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf8');
if(script.length < 1000) { console.error('FAIL js/app.js 过短（' + script.length + ' 字符）'); process.exit(1); }
// index.html 不得残留内联脚本/样式（拆分约定）
if(/<script>/.test(html) || /<style>/.test(html)) { console.error('FAIL index.html 残留内联 <script>/<style>'); process.exit(1); }

// ---- DOM / 浏览器 API 桩 ----
function makeEl(id){
  return {
    id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{},
    classList:{ toggle(){}, add(){}, remove(){} },
    attrs: {}, setAttribute(k, v){ this.attrs[k] = v; },
    addEventListener(){}, querySelectorAll(){ return []; },
    replaceWith(){}, focus(){}, select(){}, setSelectionRange(){}
  };
}
const touchedIds = new Set();   // 记录被访问过的元素 id，供测试断言 id 未被改名
const missingIds = [];          // 桩在 HTML 中找不到的 id = 代码引用了不存在的元素
const elsById = new Map();      // 同一 id 复用同一桩，便于断言渲染结果
const timers = [];              // 捕获 setTimeout 回调，供防抖测试手动触发
let patchTarget = null;         // 增量渲染测试注入的 .sets 容器：{ matches, node }
global.document = {
  visibilityState: 'visible',
  addEventListener(){},
  createElement(){ const e = makeEl('tmp'); e.children = [makeEl('a'), makeEl('b')]; return e; },
  querySelector(sel){ return patchTarget && patchTarget.matches(sel) ? patchTarget.node : null; },
  getElementById(id){
    touchedIds.add(id);
    if(!html.includes(`id="${id}"`)) missingIds.push(id);
    if(!elsById.has(id)) elsById.set(id, makeEl(id));
    return elsById.get(id);
  }
};
// 只读容器桩内容；不存在的 id 返回 null（避免污染 missingIds）
function htmlTouchedHTML(id){ return elsById.has(id) ? elsById.get(id).innerHTML : null; }
function textOf(id){ return elsById.has(id) ? elsById.get(id).textContent : null; }
global.localStorage = {
  _d: {},
  getItem(k){ return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k,v){ this._d[k] = String(v); },
  removeItem(k){ delete this._d[k]; }
};
global.setTimeout = (fn) => { timers.push(fn); return timers.length; };
global.clearTimeout = () => {};
function runTimers(){ const n = timers.length; for(let i = 0; i < n; i++){ try{ timers[i](); }catch(e){} } timers.splice(0, n); }
global.setInterval = () => 0;
global.clearInterval = () => {};
global.confirm = () => true;
global.window = { addEventListener(){}, AudioContext: null };
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: async t => { globalThis.copied = t; } } },
  configurable: true, writable: true
});

const testScript = script + `
;globalThis.__T = {
  get state(){ return state; },
  get restEndsAt(){ return restEndsAt; },
  get restTotal(){ return restTotalSec(); },
  get restDone(){ return restDone; },
  set restEndsAt(v){ restEndsAt = v; },
  importPlan, validatePlan, normalizeItem, lastValues, getItems,
  startSessionIfNeeded, endSession, switchDay, switchView, targetLabel,
  buildExport, buildTrends, topSet, doExport, doExportData, buildPrompt, cycleCondition,
  esc, APP_VERSION, TREND_WINDOW, toast, render, saveSoon, flushSave,
  startRestTimer, tickRest, adjustRest, skipRest, resetRest, patchRow
};`;
(0, eval)(testScript);
const T = globalThis.__T;

let pass = 0, fail = 0;
function check(name, cond){
  if(cond){ pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

console.log('== 1. 种子迁移（旧格式 -> 逐组数组） ==');
check('program A 项被归一化为数组', Array.isArray(T.state.program.A[0].sets) && T.state.program.A[0].sets.length === 4);
check('旧 reps 范围保留为 repsRange', T.state.program.A[0].repsRange === '6-8');
check('targetLabel 使用 repsRange', T.targetLabel(T.state.program.A[0]) === '4 × 6-8');

console.log('== 2. 导入 plan-A.json ==');
const planText = fs.readFileSync(path.join(__dirname, 'plan-A.json'), 'utf8');
let r = T.importPlan(planText);
check('导入成功', r.ok === true);
check('program A 22 项', T.state.program.A.length === 22);
check('动作库 >= 22 项', Object.keys(T.state.exercises).length >= 22);
check('分区保留', T.state.program.A[0].section === '1. 动态升温与激活');
const goblet = T.state.program.A.find(p => p.exerciseId === 'goblet_squat');
check('高脚杯深蹲 3 组含热身组', goblet && goblet.sets.length === 3 && goblet.sets[0].type === 'warmup' && goblet.sets[0].weight === 5.35);
const plank = T.state.program.A.find(p => p.exerciseId === 'plank');
check('平板支撑 duration=30', plank && plank.sets[0].duration === 30);
check('组含 side 预留字段', T.state.program.A[0].sets[0].side === null);
check('lastDay 切到计划指定日', T.state.settings.lastDay === 'A');
check('targetLabel 热身+正式', T.targetLabel(goblet) === '热身 1 + 2 × 10');
check('targetLabel 计时组（时长不一显示范围）', T.targetLabel(plank) === '4 × 25-30s');

console.log('== 3. 容错：markdown 包裹 + 尾逗号 ==');
const messy = '```json\n' + planText.slice(0, -1) + ',\n}\n```';
r = T.importPlan(messy);
check('fence + 尾逗号导入成功', r.ok === true);

console.log('== 4. 校验：非法输入 ==');
r = T.importPlan('{"type":"ai-plan","exercises":{},"program":{"A":[{"exerciseId":"ghost","sets":[]}]}}');
check('拒绝 exerciseId 不存在', !r.ok && /不在 exercises 中/.test(r.error));
r = T.importPlan('not json at all');
check('拒绝非 JSON', !r.ok && /解析失败/.test(r.error));
r = T.importPlan('{"type":"ai-plan","exercises":{"x":{"name":"X"}},"program":{"A":[{"exerciseId":"x","sets":[{"type":"work","weight":"heavy"}]}]}}');
check('拒绝非数字 weight 且带路径', !r.ok && /sets\[0\]\.weight/.test(r.error));
r = T.importPlan('{"type":"ai-plan","exercises":{"x":{"name":"X"}},"program":{"A":[]}}');
check('拒绝空计划数组', !r.ok && /空数组/.test(r.error));

console.log('== 5. 合并规则：personal 保留 ==');
T.state.exercises.wall_angel.personal = '个人注意：颈部不适时停止';
r = T.importPlan(planText);
check('导入后 personal 保留', T.state.exercises.wall_angel.personal === '个人注意：颈部不适时停止');
check('导入后 tips 被更新', T.state.exercises.wall_angel.tips === '后脑/上背/臀紧贴，下背压死，手臂沿墙上滑下滑');

console.log('== 6. 草稿预填：计划规格优先 ==');
T.switchDay('A');
const items = T.getItems('A');
const g2 = items.find(i => i.exerciseId === 'goblet_squat');
check('预填计划重量 11.35', g2.sets[1].weight === 11.35 && g2.sets[1].type === 'work');
check('预填热身组重量 5.35', g2.sets[0].weight === 5.35 && g2.sets[0].type === 'warmup');
const p2 = items.find(i => i.exerciseId === 'plank');
check('预填时长 30s', p2.sets[0].duration === 30);
const wa = items.find(i => i.exerciseId === 'wall_angel');
check('自重动作预填 targetRpe', wa.sets[0].targetRpe === 6);

console.log('== 7. 会话流程：确认 -> 结束 -> 落盘 ==');
T.switchDay('A');
const items2 = T.getItems('A');
items2[0].sets[0].done = true;
T.startSessionIfNeeded('A');
check('会话已建立', !!T.state.sessions.A);
T.endSession();
check('日志已写入', T.state.logs.length === 1 && T.state.logs[0].exercises.length === 1);
check('日志组含 rpe 字段', T.state.logs[0].exercises[0].sets[0].rpe === null);
check('日志组含 done 标记', T.state.logs[0].exercises[0].sets.every(s => typeof s.done === 'boolean'));
check('会话已清除', T.state.sessions.A === null);

console.log('== 8. 导入保护：有进行中记录时拒绝 ==');
T.switchDay('A');
const items3 = T.getItems('A');
items3[0].sets[0].done = true;
T.startSessionIfNeeded('A');
r = T.importPlan(planText);
check('有会话时拒绝导入', !r.ok && /进行中/.test(r.error));
T.state.sessions.A = null;

console.log('== 9. P0-3 导出给 AI（数据 + 固定 prompt） ==');
// 追加 3 次日志：goblet_squat 重量递增（top 12.5 -> 15 -> 15）
const mkLog = (date, sets) => ({
  date, day: 'A', startedAt: 0, endedAt: 0, durationSec: 3600,
  exercises: [{ exerciseId: 'goblet_squat', sets: sets.map(s => Object.assign({ done: true }, s)) }]
});
T.state.logs.push(
  mkLog('2026-02-01', [{weight:10, reps:10, duration:null, rpe:7}, {weight:12.5, reps:8, duration:null, rpe:8}]),
  mkLog('2026-02-08', [{weight:12.5, reps:8, duration:null, rpe:8}, {weight:15, reps:6, duration:null, rpe:9}]),
  mkLog('2026-02-15', [{weight:15, reps:6, duration:null, rpe:8.5}, {weight:15, reps:8, duration:null, rpe:8}])
);
const exp = T.buildExport(4);
check('type 为 ironlog-export', exp.type === 'ironlog-export');
check('recentLogs 取最近 4 条', exp.recentLogs.length === 4);
check('program/exercises 原样打包', exp.program === T.state.program && exp.exercises === T.state.exercises);
const gt = exp.trends.goblet_squat;
check('趋势含 3 次会话', gt.sessions.length === 3);
check('top 组取最大重量', gt.sessions[0].top.weight === 12.5 && gt.sessions[2].top.weight === 15);
check('平均 RPE 计算', gt.sessions[0].avgRpe === 7.5);
check('趋势方向 up', gt.direction === 'up');
const exp2 = T.buildExport(2);
check('n=2 只取最近 2 条', exp2.recentLogs.length === 2 && exp2.recentLogs[0].date === '2026-02-08');
// 未完成组（带预填值）不进趋势
T.state.logs.push(mkLog('2026-02-22', [
  {weight:15, reps:8, duration:null, rpe:8, done:true},
  {weight:99, reps:1, duration:null, rpe:null, done:false}
]));
const exp3 = T.buildExport(10);
check('趋势不含未完成组', exp3.trends.goblet_squat.sessions[3].top.weight === 15 && exp3.trends.goblet_squat.sessions[3].sets === 1);
// 当日状态标记
T.switchDay('A');
const items4 = T.getItems('A');
items4[0].sets[0].done = true;
T.startSessionIfNeeded('A');
T.cycleCondition('A'); // null -> 佳
T.endSession();
check('日志含状态标记', T.state.logs[T.state.logs.length-1].condition === '佳');
// 固定 prompt
T.state.settings.restNote = '固定 90 秒';
T.state.profile.background = '体态问题：X 型腿、肋骨外扩';
check('导出 settings 含组间休息', T.buildExport(4).settings.restNote === '固定 90 秒');
const prompt = T.buildPrompt(T.buildExport(4));
check('prompt 含固定背景', prompt.includes('体态问题：X 型腿、肋骨外扩'));
check('prompt 内嵌数据', prompt.includes('```json') && prompt.includes('ironlog-export'));
check('prompt 含时间跨度', /A 日 \d+ 次/.test(prompt));
check('prompt 含输出模板', prompt.includes('"type": "ai-plan"') && prompt.includes('不要注释、不要多余逗号'));
const rt = T.importPlan(JSON.stringify(exp));
check('导出 JSON 可被导入（格式兼容）', rt.ok === true);

(async () => {
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async t => { globalThis.copied = t; } } },
    configurable: true
  });
  await T.doExport();
  check('doExport 复制 prompt（含数据）', globalThis.copied && globalThis.copied.startsWith('你是我的力量训练数据分析助手') && globalThis.copied.includes('ironlog-export'));
  await T.doExportData();
  check('doExportData 复制纯数据', globalThis.copied && JSON.parse(globalThis.copied).type === 'ironlog-export');

  console.log('== 10. P0 安全与健壮性 ==');
  check('esc 转义 & < > " \'',
    T.esc(`<a href="x">&'</>`) === '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/&gt;');
  check('esc 处理非字符串输入', T.esc(12.5) === '12.5' && T.esc(null) === 'null');

  // AI 返回的方案里带 HTML 时，渲染必须转义（否则在本地源里执行任意 JS）
  const xssPlan = JSON.stringify({
    type: 'ai-plan',
    exercises: { xss_ex: { name: '<img src=x onerror=alert(1)>', muscles: '<script>s</script>',
                           tips: '<b>t</b>', personal: '"q"' } },
    program: { B: [{ section: '<i>sec</i>', exerciseId: 'xss_ex',
                     sets: [{ type: 'work', weight: 10, reps: 8 }] }] }
  });
  check('XSS 方案导入成功', T.importPlan(xssPlan).ok === true);
  T.switchDay('B');
  const rendered = htmlTouchedHTML('ex-list');
  check('渲染无裸 <img onerror', !/<img src=x onerror=/.test(rendered));
  check('渲染保留转义实体', /&lt;img src=x onerror=alert\(1\)&gt;/.test(rendered));
  check('分区名已转义', /&lt;i&gt;sec&lt;\/i&gt;/.test(rendered));
  check('要点已转义', /<b>要点<\/b>&lt;b&gt;t&lt;\/b&gt;/.test(rendered));

  // 版本号单一来源
  check('APP_VERSION 为 x.y.z', /^\d+\.\d+\.\d+$/.test(T.APP_VERSION));
  // 版本只能有 APP_VERSION 定义处 + sw.js 缓存戳两处；渲染位必须是 id 占位，不得写死
  check('页头/关于卡片无硬编码版本', !/<span class="ver">[^<]/.test(html) && !/Iron Log v\d/.test(html));
  check('版本号仅出现在定义处与 sw.js', (html.match(/v?\b\d+\.\d+\.\d+/g) || []).length <= 2);
  check('sw.js 版本串与 APP_VERSION 一致',
    fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8').includes("ironlog-v" + T.APP_VERSION));

  // 代码引用的每个元素 id 都必须真实存在于 index.html（防止改名后静默失效）
  check('getElementById 未命中缺失 id' + (missingIds.length ? '：' + [...new Set(missingIds)].join(', ') : ''),
    missingIds.length === 0);
  check('被访问的元素 id 数量合理（共 ' + touchedIds.size + ' 个）', touchedIds.size > 5);
  // 强制走一遍三个视图 + toast，让所有 id 都被访问到，扩大缺失 id 的覆盖面
  ['today','history','settings'].forEach(v => { T.switchView(v); T.render(); });
  T.toast('x');
  check('三视图 + toast 渲染后仍无缺失 id' + (missingIds.length ? '：' + [...new Set(missingIds)].join(', ') : ''),
    missingIds.length === 0);
  check('id 覆盖面扩大到 ' + touchedIds.size + ' 个', touchedIds.size > 20);

  console.log('== 11. P1 组间休息倒计时 ==');
  check('migrate 补齐 restSec 默认值', T.state.settings.restSec === 90);
  T.skipRest();
  check('restSec=0 时不启动', (() => { T.state.settings.restSec = 0; T.startRestTimer(); return T.restEndsAt === null; })());
  T.state.settings.restSec = 90;
  T.startRestTimer();
  check('启动后 restTotal=90', T.restEndsAt !== null && T.restTotal === 90);
  T.adjustRest(15);
  check('+15s 延长到 105', T.restTotal === 105);
  T.adjustRest(-15);
  check('−15s 回到 90', T.restTotal === 90);
  T.skipRest();
  check('跳过清空倒计时', T.restEndsAt === null);
  T.startRestTimer();
  T.restEndsAt = Date.now() - 1000;   // 拨到已过期
  T.tickRest();
  check('到期后标记 done 并提示', T.restDone === true && String(textOf('toast')).includes('休息结束'));
  T.adjustRest(15);
  check('到期后 +15s 可续用', T.restDone === false && T.restEndsAt > Date.now());
  T.resetRest();
  check('resetRest 清空', T.restEndsAt === null);
  check('导出 settings 含 restSec', T.buildExport(2).settings.restSec === 90);

  console.log('== 12. P1 防抖保存 ==');
  const before = JSON.parse(global.localStorage._d['ironlog.v1']).settings.weightStep;
  T.state.settings.weightStep = 1.25;
  T.saveSoon();
  check('saveSoon 未立即落盘', JSON.parse(global.localStorage._d['ironlog.v1']).settings.weightStep === before);
  runTimers();
  check('定时器触发后落盘', JSON.parse(global.localStorage._d['ironlog.v1']).settings.weightStep === 1.25);
  T.state.settings.weightStep = 5;
  T.saveSoon();
  T.flushSave();
  check('flushSave 立即落盘', JSON.parse(global.localStorage._d['ironlog.v1']).settings.weightStep === 5);
  T.state.settings.weightStep = before;
  T.flushSave();

  console.log('== 13. P1 PWA 资源 ==');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.webmanifest'), 'utf8'));
  check('manifest 合法且 start_url=./', manifest.start_url === './' && manifest.display === 'standalone');
  check('manifest 有图标', Array.isArray(manifest.icons) && manifest.icons.length > 0);
  check('index.html 引用 manifest', html.includes('rel="manifest"'));
  check('app.js 注册 service worker', script.includes("register('sw.js')"));
  const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
  check('sw.js 版本串与 APP_VERSION 一致', sw.includes("ironlog-v" + T.APP_VERSION));
  check('sw.js 预缓存 css/js', sw.includes('./css/style.css') && sw.includes('./js/app.js'));
  check('sw.js 的 SHELL 覆盖 index.html 引用的全部本地资源', (() => {
    const shell = (sw.match(/SHELL = \[([^\]]*)\]/) || ['', ''])[1];
    const refs = [...html.matchAll(/(?:href|src)="(?!http|data:)([^"]+)"/g)].map(x => x[1]);
    return refs.length > 0 && refs.every(r => shell.includes('./' + r));
  })());
  check('sw.js 有 install/activate/fetch', ['install','activate','fetch'].every(k => sw.includes("'" + k + "'")));
  check('deploy.yml 发布 css/js 与 PWA 资源', /cp index.html manifest.webmanifest icon.svg sw.js/.test(
    fs.readFileSync(path.join(__dirname, '.github/workflows/deploy.yml'), 'utf8'))
    && /cp css\/style.css dist\/css\//.test(fs.readFileSync(path.join(__dirname, '.github/workflows/deploy.yml'), 'utf8'))
    && /cp js\/app.js dist\/js\//.test(fs.readFileSync(path.join(__dirname, '.github/workflows/deploy.yml'), 'utf8')));

  console.log('== 14. P1 增量渲染（patchRow） ==');
  // 注入一个带 2 组（每组 set-row + rpe-row）的 .sets 容器，模拟真实 DOM
  const mkRow = tag => ({ tag, replaced: false, replaceWith(n){ this.replacedWith = n; } });
  const rows = [mkRow('r0'), mkRow('p0'), mkRow('r1'), mkRow('p1')];
  const container = { children: rows };
  patchTarget = { matches: sel => sel === '.sets[data-rows="0:A:2"]', node: container };
  T.switchDay('A');
  const it = T.getItems('A');
  const ex0 = T.state.exercises[it[0].exerciseId];
  const mkSet = () => ({ type: 'work', weight: 10, reps: 8, duration: null, rpe: null, side: null, targetRpe: null, done: false });
  it[0].sets = [mkSet(), mkSet()];   // 对齐注入容器的组数
  const patched = T.patchRow(0, 1);
  check('patchRow 命中并替换目标组', patched === true && rows[2].replacedWith !== undefined && rows[3].replacedWith !== undefined);
  check('只替换该组，未动其他组', rows[0].replacedWith === undefined && rows[1].replacedWith === undefined);
  patchTarget = { matches: () => false, node: container };
  check('容器不匹配时回退 false（触发全量渲染）', T.patchRow(0, 1) === false);
  patchTarget = null;

  console.log('== 15. P2 无障碍与结构 ==');
  check('tablist + 三个 tab 角色', (html.match(/role="tab"/g) || []).length === 3 && html.includes('role="tablist"'));
  check('tab 有 aria-controls/aria-selected', (html.match(/aria-controls="view-/g) || []).length === 3
    && (html.match(/aria-selected=/g) || []).length >= 3);
  check('三个视图都是 tabpanel', (html.match(/role="tabpanel"/g) || []).length === 3);
  check('日期按钮有 aria-pressed', html.includes('id="day-btn-A" aria-pressed="true"') && html.includes('id="day-btn-B" aria-pressed="false"'));
  check('toast 是 status 实时区域', html.includes('id="toast" role="status" aria-live="polite"'));
  check('总结弹层是 dialog', html.includes('role="dialog"') && html.includes('aria-modal="true"'));
  check('休息条是 timer 且计时不播报', html.includes('role="timer"') && html.includes('aria-live="off"'));
  check('±15s 按钮有可读标签', html.includes('aria-label="减少 15 秒"') && html.includes('aria-label="增加 15 秒"'));
  check('未禁用双指缩放（WCAG 1.4.4）', !/maximum-scale/.test(html));
  check('确认按钮带 aria-pressed', T.state.program.A.length > 0 && /aria-pressed="(true|false)"/.test(htmlTouchedHTML('ex-list') || ''));
  T.switchView('history');
  check('切视图同步 aria-selected', elsById.get('tab-history').attrs['aria-selected'] === 'true'
    && elsById.get('tab-today').attrs['aria-selected'] === 'false');
  T.switchDay('B');
  check('切日同步 aria-pressed', elsById.get('day-btn-B').attrs['aria-pressed'] === 'true'
    && elsById.get('day-btn-A').attrs['aria-pressed'] === 'false');

  console.log('== 16. P2 拆分与趋势窗口 ==');
  check('index.html 无内联脚本/样式', !/<script>/.test(html) && !/<style>/.test(html));
  check('index.html 引用外链资源', html.includes('href="css/style.css"') && html.includes('src="js/app.js"'));
  check('app.js 用 defer 加载', html.includes('<script src="js/app.js" defer>'));
  check('TREND_WINDOW 常量存在', T.TREND_WINDOW === 12);
  check('导出含 trendsSpan', typeof T.buildExport(2).trendsSpan === 'number');

  // 趋势窗口 > 导出窗口：n=2 时仍能看到完整历史的方向；「涨上去后停滞」不再误判为 up
  const mkTrendLog = (date, w) => ({
    date, day: 'A', startedAt: 0, endedAt: 0, durationSec: 3000,
    exercises: [{ exerciseId: 'goblet_squat', sets: [{ weight: w, reps: 8, duration: null, rpe: 8, done: true }] }]
  });
  T.state.logs.length = 0;
  [10, 12.5, 15, 15, 15, 15].forEach((w, i) => T.state.logs.push(mkTrendLog(`2026-03-0${i + 1}`, w)));
  const wide = T.buildExport(2);
  check('n=2 时 recentLogs 仍只有 2 条', wide.recentLogs.length === 2);
  check('趋势回看全部 6 次', wide.trendsSpan === 6 && wide.trends.goblet_squat.sessions.length === 6);
  T.state.logs.length = 0;
  [10, 12.5, 15, 17.5, 20, 22.5].forEach((w, i) => T.state.logs.push(mkTrendLog(`2026-03-0${i + 1}`, w)));
  check('持续上涨判定 up', T.buildExport(2).trends.goblet_squat.direction === 'up');
  T.state.logs.length = 0;
  [15, 15, 15, 15, 15, 15].forEach((w, i) => T.state.logs.push(mkTrendLog(`2026-04-0${i + 1}`, w)));
  check('完全停滞判定 plateau', T.buildExport(2).trends.goblet_squat.direction === 'plateau');
  T.state.logs.length = 0;
  [15, 15, 15, 14, 13, 12].forEach((w, i) => T.state.logs.push(mkTrendLog(`2026-05-0${i + 1}`, w)));
  check('持续下降判定 down', T.buildExport(2).trends.goblet_squat.direction === 'down');

  console.log('== 17. P2 lastValues 跳过热身组 ==');
  T.state.logs.length = 0;
  T.state.logs.push({
    date: '2026-06-01', day: 'A', startedAt: 0, endedAt: 0, durationSec: 3000,
    exercises: [{ exerciseId: 'goblet_squat', sets: [
      { weight: 5.35, reps: 10, duration: null, rpe: null, done: true, type: 'warmup' },
      { weight: 15, reps: 8, duration: null, rpe: 8, done: true, type: 'work' },
      { weight: 12.5, reps: 8, duration: null, rpe: 8, done: true, type: 'work' },
      { weight: 99, reps: 1, duration: null, rpe: null, done: false, type: 'work' }
    ] }]
  });
  const lv = T.lastValues('goblet_squat');
  check('取正式组最重值而非热身组', lv.weight === 15 && lv.reps === 8);
  check('忽略未完成组', lv.weight !== 99);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();