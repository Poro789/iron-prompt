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
const handlers = new Map();     // (id + '|' + type) -> addEventListener 回调，供点击模拟测试
let patchTarget = null;         // 增量渲染测试注入的 .sets 容器：{ matches, node }
global.document = {
  visibilityState: 'visible',
  addEventListener(){},
  createElement(){ const e = makeEl('tmp'); e.children = [makeEl('a'), makeEl('b')]; return e; },
  querySelector(sel){ return patchTarget && patchTarget.matches(sel) ? patchTarget.node : null; },
  getElementById(id){
    touchedIds.add(id);
    if(!html.includes(`id="${id}"`)) missingIds.push(id);
    if(!elsById.has(id)){
      const e = makeEl(id);
      if(id === 'ex-list'){
        e.addEventListener = (type, fn) => handlers.set(id + '|' + type, fn);
        e.querySelectorAll = () => [];
        const desc = [];
        Object.defineProperty(e, 'innerHTML', { get(){ return desc.join(''); }, set(v){ desc.length = 0; desc.push(String(v)); } });
      }
      elsById.set(id, e);
    }
    return elsById.get(id);
  }
};
// 向 ex-list 的事件委托处理器派发一次按钮点击（target 需自带 closest）
function clickExList(target){
  const h = handlers.get('ex-list|click');
  if(!h) throw new Error('ex-list click handler 未注册');
  h({ target });
}
function btnOf(ds){ return { closest: sel => (sel === 'button[data-act]' ? { dataset: ds } : null) }; }
function doneBtn(exIdx, setIdx){ return btnOf({ act: 'confirm', ex: String(exIdx), set: String(setIdx) }); }
function navBtn(act){ return btnOf({ act }); }
// 从当前渲染的 ex-list 中按组位置提取完成按钮。
// 完成按钮在 HTML 中按「当前渲染位置」生成 data-ex/data-set，因此先校验它确实指向目标组，
// 点击时按 DOM 的真实绑定派发（与真实浏览器一致）。
function doneBtnFromDOM(exIdx, setIdx){
  const h = elsById.get('ex-list').innerHTML;
  const m = h.match(/class="fs-done[^"]*" data-ex="(\d+)" data-set="(\d+)" data-act="confirm"/);
  if(!m) throw new Error('DOM 中未找到完成按钮');
  if(+m[1] !== exIdx || +m[2] !== setIdx) throw new Error('渲染位置 ex=' + m[1] + ' set=' + m[2] + '，期望 ' + exIdx + '/' + setIdx);
  return btnOf({ act: 'confirm', ex: m[1], set: m[2] });
}
// 只读容器桩内容；不存在的 id 返回 null（避免污染 missingIds）
function htmlTouchedHTML(id){ return elsById.has(id) ? elsById.get(id).innerHTML : null; }
function textOf(id){ return elsById.has(id) ? elsById.get(id).textContent : null; }
// localStorage 桩：写入时深拷贝，隔离内存对象与已序列化快照（防止引用泄漏）
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
// 虚拟时钟：可手动推进，用于验证「500ms 内幽灵点击抑制」不随真实时间放行
const RealDate = Date;
let clockOffset = 0;
// 必须用普通函数构造：类实例没有内部 [[DateValue]]，app.js 里 new Date(str) + 算术会 NaN；
// own property 需齐全，否则被 eval 代码 JSON.stringify 时会丢字段
global.Date = function(...a){ return a.length ? new RealDate(...a) : new RealDate(RealDate.now() + clockOffset); };
global.Date.now = () => RealDate.now() + clockOffset;
global.Date.parse = RealDate.parse;
global.Date.UTC = RealDate.UTC;
global.Date.prototype = RealDate.prototype;
function advanceClock(ms){ clockOffset += ms; }
global.confirm = () => true;
global.window = { addEventListener(){}, scrollTo(){}, AudioContext: null };
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: async t => { globalThis.copied = t; } } },
  configurable: true, writable: true
});

const testScript = script + `
;globalThis.__T = {
  get state(){ return state; },
  get restEndsAt(){ return restEndsAt; },
  get restStartsAt(){ return restStartsAt; },
  set restStartsAt(v){ restStartsAt = v; },
  get restTotal(){ return restTotalSec(); },
  get restDone(){ return restDone; },
  set restStartsAt(v){ restStartsAt = v; },
  set restEndsAt(v){ restEndsAt = v; },
  importPlan, validatePlan, normalizeItem, lastValues, getItems,
  startSessionIfNeeded, endSession, switchDay, switchView, targetLabel,
  buildExport, buildTrends, topSet, doExport, doExportData, buildPrompt, cycleCondition,
  buildBackup, parseBackup, restoreBackupText,
  esc, APP_VERSION, TREND_WINDOW, toast, render, saveSoon, flushSave,
  get openNotes(){ return openNotes; },
  startRestTimer, tickRest, finishRest, skipRest, resetRest, askConfirm, answerConfirm,
  toggleDrawer, closeDrawer,
  cycleDone, setDoneState, nextPos, prevPos, get curPos(){ return curPos; },
  set curPos(v){ curPos = v; },
  localDateStr, trimSet, migrate, bindDrafts, clampPos,
  get restForPos(){ return restForPos; },
  get draft(){ return draft; },
  clearDraft(day){ delete draft[day]; },
  fullScreenHTML, flatPos, posLabel
};`;
(0, eval)(testScript);
const T = globalThis.__T;

let pass = 0, fail = 0;
function check(name, cond){
  if(cond){ pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

console.log('== 1. 种子迁移（旧格式 -> 逐组数组） ==');
check('program A 项被归一化为数组', Array.isArray(T.state.program.A[0].sets) && T.state.program.A[0].sets.length === 1);
check('B 日蚌式 2 组（左右各一）', T.state.program.B[3].exerciseId === 'clamshell' && T.state.program.B[3].sets.length === 2 && T.state.program.B[3].sets[0].side === 'L');
check('targetLabel 单侧动作', T.targetLabel(T.state.program.B[3]) === '2 × 15');

console.log('== 2. 导入 plan-A.json ==');
const planText = fs.readFileSync(path.join(__dirname, 'fixtures/plan-A.json'), 'utf8');
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
T.setDoneState('A', 0, 0, true);
items2[0].note = '动作备注';
T.startSessionIfNeeded('A');
check('会话已建立', !!T.state.sessions.A);
T.endSession();
check('日志已写入', T.state.logs.length === 1 && T.state.logs[0].exercises.length === 1);
check('日志组含 rpe 字段', T.state.logs[0].exercises[0].sets[0].rpe === null);
check('日志组含 done 标记', T.state.logs[0].exercises[0].sets.every(s => typeof s.done === 'boolean'));
check('日志组含 restAfter 字段', T.state.logs[0].exercises[0].sets[0].restAfter === null);
check('日志动作含 note 字段', T.state.logs[0].exercises[0].note === '动作备注');
check('会话已清除', T.state.sessions.A === null);

console.log('== 8. 导入保护：有进行中记录时拒绝 ==');
T.switchDay('A');
const items3 = T.getItems('A');
T.setDoneState('A', 0, 0, true);
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
T.setDoneState('A', 0, 0, true);
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
  const rendered = T.fullScreenHTML('B');
  check('渲染无裸 <img onerror', !/<img src=x onerror=/.test(rendered));
  check('渲染保留转义实体', /&lt;img src=x onerror=alert\(1\)&gt;/.test(rendered));
  T.openNotes['B:0'] = true;   // 展开要点详情，验证 tips 转义
  check('要点已转义', /<b>要点<\/b>&lt;b&gt;t&lt;\/b&gt;/.test(T.fullScreenHTML('B')));
  T.openNotes['B:0'] = false;
  // 恢复 A 日计划（XSS 测试覆盖了 B 日，A 日可能在前面的测试中被改过）
  T.importPlan(planText);
  T.switchDay('A');
  T.curPos = 0;
  

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

  console.log('== 11. P1 组间休息计时（v0.9：超时继续 + 自动记录） ==');
  check('migrate 补齐 restSec 默认值', T.state.settings.restSec === 90);
  T.resetRest();
  check('restSec=0 时不启动', (() => { T.state.settings.restSec = 0; T.startRestTimer(); return T.restEndsAt === null; })());
  T.state.settings.restSec = 90;
  T.startRestTimer();
  check('启动后 restTotal=90', T.restEndsAt !== null && T.restTotal === 90);
  check('restStartsAt 已设置', T.restStartsAt !== null);
  T.finishRest();
  check('finishRest 清空计时', T.restEndsAt === null && T.restStartsAt === null);
  T.startRestTimer();
  T.restEndsAt = Date.now() - 1000;   // 拨到已过期（超时）
  T.tickRest();
  check('超时后标记 done（不自动跳转）', T.restDone === true && T.restEndsAt !== null);
  T.finishRest();
  check('finishRest 后清空', T.restEndsAt === null);
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

  console.log('== 14. P1 全屏交互（二态 / 导航 / 备注） ==');
  T.resetRest();
  T.switchDay('A');
  T.switchView('today');
  T.render();
  const it14 = T.getItems('A');
  const s14 = it14[0].sets[0];
  // 重置 done 为 false（前面测试可能改过）
  s14.done = false;
  // 二态循环：false → true → false
  check('初始为未完成（false）', s14.done === false);
  T.cycleDone('A', 0, 0);
  check('第一次点击 → 完成', s14.done === true);
  T.cycleDone('A', 0, 0);
  check('第二次点击 → 未完成', s14.done === false);
  // 组导航
  const pos0 = T.curPos;
  T.nextPos('A');
  check('nextPos 前进', T.curPos === pos0 + 1);
  T.prevPos('A');
  check('prevPos 回退', T.curPos === pos0);
  // 动作级备注
  it14[0].note = '今天状态一般';
  check('动作级备注可存', it14[0].note === '今天状态一般');

  console.log('== 14b. 快速点击与休息归属（v0.9.1） ==');
  T.resetRest();
  T.switchDay('A'); T.switchView('today');
  T.state.logs = [];                     // 清空日志，避免前序用例完成组干扰渲染位置
  T.state.sessions.A = null;
  T.render();
  T.getItems('A')[0].sets[0].done = false;
  T.curPos = 0;
  T.render();
  const it14b = T.getItems('A');
  clickExList(doneBtnFromDOM(0, 0));
  check('点击完成按钮 → 当前组完成', it14b[0].sets[0].done === true);
  check('点击后未跳到下一组', T.curPos === 0);
  check('休息归属指向被确认的组', T.restForPos && T.restForPos.exIdx === 0 && T.restForPos.setIdx === 0);
  it14b[0].sets[0].done = true;
  clickExList(doneBtnFromDOM(0, 0));
  check('紧接的第二次点击不被吞（故意的快速撤销立即生效）', it14b[0].sets[0].done === false);
  clickExList(doneBtnFromDOM(0, 0));
  check('再次点击重新完成该组', it14b[0].sets[0].done === true);
  T.resetRest();

  console.log('== 14c. 跳过休息与手动切组（v0.9.1 修复） ==');
  T.resetRest();
  T.switchDay('A'); T.switchView('today');
  T.state.settings.restSec = 90;         // 前面的用例可能改过休息时长，确保计时开启
  T.state.logs = [];                     // 清空日志，避免前序用例注入的完成组干扰
  T.state.sessions.A = null;             // 结束进行中的会话
  T.clearDraft('A');                     // 清空 A 日草稿（内存态）
  T.render();
  const it14c = T.getItems('A');
  it14c[0].sets[0].done = false;
  advanceClock(1000);                    // 让上一轮的计时状态过期
  T.curPos = 0;
  clickExList(doneBtnFromDOM(0, 0));     // 确认第 1 组 → 自动开始休息，停在第 1 组
  check('确认组后休息计时启动', T.restEndsAt !== null);
  check('确认组后停留在该组等待休息', T.curPos === 0);
  clickExList(navBtn('next'));           // 用户手动切到下一组
  check('手动切组前进', T.curPos === 1);
  T.skipRest();                          // 再点休息条「跳过」→ 再前进一组（跳过=开始下一组）
  check('已手动切组后跳过 → 再前进一组', T.curPos === 2);
  T.resetRest();
  T.state.sessions.A.items.forEach(it => it.sets.forEach(s => { s.done = false; }));
  T.curPos = 0;
  T.render();
  const it14c2 = T.getItems('A');
  advanceClock(1000);
  it14c2[0].sets[0].done = false;        // 上一轮点击把该组标记为完成，先复位
  T.curPos = 0;
  clickExList(doneBtnFromDOM(0, 0));
  check('确认组休息已启动', T.restEndsAt !== null);
  T.skipRest();                          // 仍停在确认组时点跳过 → 前进一组
  check('仍停在确认组时跳过 → 前进一组', T.curPos === 1);
  T.resetRest();

  console.log('== 14d. 热身组独立休息时长（v0.9.1 新增） ==');
  T.resetRest();
  T.state.settings.restSec = 90;
  T.state.settings.warmupRestSec = 30;
  // 找到含热身组的动作（goblet_squat：warmup,work,work），直接走函数层
  const warmIdx = T.state.program.A.findIndex(it => it.sets.some(s => s.type === 'warmup'));
  check('设置已写入（warm=' + T.state.settings.warmupRestSec + ' work=' + T.state.settings.restSec + '）', T.state.settings.warmupRestSec === 30 && T.state.settings.restSec === 90);
  T.state.sessions.A = { startedAt: 0, items: T.getItems('A'), condition: null };
  check('热身组类型确为 warmup（type=' + T.state.sessions.A.items[warmIdx].sets[0].type + '）', T.state.sessions.A.items[warmIdx].sets[0].type === 'warmup');
  T.state.sessions.A.items[warmIdx].sets[0].done = false;
  T.state.sessions.A.items[warmIdx].sets[1].done = false;
  T.cycleDone('A', warmIdx, 0);          // 确认热身组
  check('热身组休息时长 = warmupRestSec（starts=' + T.restStartsAt + ' ends=' + T.restEndsAt + '）', T.restEndsAt - T.restStartsAt === 30000);
  T.resetRest();
  T.cycleDone('A', warmIdx, 1);          // 确认正式组
  check('正式组休息时长 = restSec（90s）', T.restEndsAt - T.restStartsAt === 90000);
  // 诊断：startRestTimer 在调用方未传位置时会回退到 flatPos(curPos)，
// 这里显式传入热身组位置，观察它是否按 warmupRestSec 启动
  T.resetRest();
  T.startRestTimer({ exIdx: warmIdx, setIdx: 0 });
  check('显式传热身组位置 → 30s（ends-starts=' + (T.restEndsAt - T.restStartsAt) + '）', T.restEndsAt - T.restStartsAt === 30000);
  T.resetRest();
  T.startRestTimer({ exIdx: warmIdx, setIdx: 1 });
  check('显式传正式组位置 → 90s', T.restEndsAt - T.restStartsAt === 90000);
  T.resetRest();
  check('tablist + 三个 tab 角色', (html.match(/role="tab"/g) || []).length === 3 && html.includes('role="tablist"'));
  check('tab 有 aria-controls/aria-selected', (html.match(/aria-controls="view-/g) || []).length === 3
    && (html.match(/aria-selected=/g) || []).length >= 3);
  check('三个视图都是 tabpanel', (html.match(/role="tabpanel"/g) || []).length === 3);
  check('日期按钮有 aria-pressed', html.includes('id="day-btn-A" aria-pressed="true"') && html.includes('id="day-btn-B" aria-pressed="false"'));
  check('toast 是 status 实时区域', html.includes('id="toast" role="status" aria-live="polite"'));
  check('总结弹层是 dialog', html.includes('role="dialog"') && html.includes('aria-modal="true"'));
  T.resetRest(); // 清除 section 14 遗留的休息计时
  T.switchDay('A');                      // 后续用例切到 B 日，这里显式切回 A
  T.curPos = 0;  // 复位组位置，使渲染与断言针对同一组
  const fsA = T.fullScreenHTML('A');
  const dotsCur = T.posLabel('A', T.flatPos('A')[T.curPos]).item;
  check('全屏卡片渲染（一次一组）', fsA.includes('fs-card'));
  check('二态完成按钮存在', /fs-done/.test(fsA));
  check('组导航按钮存在', /data-act="prev"/.test(fsA) && /data-act="next"/.test(fsA));
  check('无步进按钮（除 RPE）', !/step-btn/.test(fsA));
  check('完成按钮带 aria-pressed', /aria-pressed="(true|false)"/.test(fsA));
  check('进度条存在', /fs-progress/.test(fsA));
  // 组点指示器：当前组带 cur，已完成带 ok，未完成带 no。
  // 只统计渲染位置（完成按钮的 data-ex）所指动作的组点。
  const renderEx = +fsA.match(/class="fs-done[^"]*" data-ex="(\d+)"/)[1];
  const dotsSlice = (() => {
    const i = fsA.indexOf('fs-dots');
    if(i === -1) return '';
    const j = fsA.indexOf('</div>', i);
    return fsA.slice(i, j);
  })();
  const dotMatches = [...dotsSlice.matchAll(/class="fs-dot([^"]*)"/g)].map(m => m[1].trim());
  const dotsItem = T.getItems('A')[renderEx];
  check('组点数量与渲染动作组数一致（' + dotsItem.exerciseId + '：' + dotMatches.length + '/' + dotsItem.sets.length + '）', dotMatches.length === dotsItem.sets.length);
  check('组点标记当前组', dotMatches.filter(d => /\bcur\b/.test(d)).length === 1);
  T.switchDay('A');
  check('休息窄条不替换内容', !/fs-rest-bar/.test(fsA)); // 无休息时不显示
  T.switchDay('B');
  check('未禁用双指缩放（WCAG 1.4.4）', !/maximum-scale/.test(html));
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

  console.log('== 18. P3 工程约定 ==');
  const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
  const changelog = fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf8');
  const ci = fs.readFileSync(path.join(__dirname, '.github/workflows/deploy.yml'), 'utf8');
  check('README 有 CI 与 License 徽章', readme.includes('actions/workflows/deploy.yml/badge.svg')
    && readme.includes('License-MIT'));
  check('README 链接到 CHANGELOG', readme.includes('CHANGELOG.md'));
  check('CHANGELOG 顶部版本与 APP_VERSION 一致',
    changelog.includes('## [' + T.APP_VERSION + ']'));
  check('CHANGELOG 版本条目降序', (() => {
    const vs = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]$/gm)].map(m => m[1]);
    return vs.length >= 3 && vs.every((v, i) => i === 0 || vs[i - 1].localeCompare(v, undefined, { numeric: true }) > 0);
  })());
  check('CI 在 PR 上触发', /pull_request:/.test(ci));
  check('CI 的 build/deploy 在 PR 上跳过', (ci.match(/if: github.event_name != 'pull_request'/g) || []).length === 2);
  // 模拟 CI 的版本戳步骤：它靠 grep 从某个文件抓 APP_VERSION，拆分后源文件变了就会静默失败
  check('CI 版本戳抓取的源文件确实含 APP_VERSION', (() => {
    const m = ci.match(/APP_VERSION = '\\K\[0-9.\]\+" ([\w./-]+)/);
    if(!m) return false;
    return fs.readFileSync(path.join(__dirname, m[1]), 'utf8').includes("APP_VERSION = '" + T.APP_VERSION + "'");
  })());
  check('CI 版本戳有 VER 非空守卫', /test -n "\$VER"/.test(ci));
  check('测试夹具在 fixtures/ 下', fs.existsSync(path.join(__dirname, 'fixtures/plan-A.json'))
    && !fs.existsSync(path.join(__dirname, 'plan-A.json')));
  check('README 结构清单与实际文件一致', ['index.html','css/style.css','js/app.js','manifest.webmanifest','icon.svg','sw.js','fixtures/plan-A.json']
    .every(f => readme.includes(f) && fs.existsSync(path.join(__dirname, f))));

  console.log('== 19. P3 应用内确认弹层 ==');
  check('无原生 confirm 调用（排除注释行）', !script.split('\n')
    .some(l => /^\s*(\*|\/\/)/.test(l) === false && /[^.\w]confirm\(/.test(l)));
  check('弹层是 alertdialog 且有描述', html.includes('role="alertdialog"') && html.includes('aria-describedby="confirm-desc"'));
  const p = T.askConfirm({ title: '放弃本次记录？', desc: '已确认的组数将丢失。', okLabel: '放弃' });
  check('弹出后写入标题/描述/按钮文案', textOf('confirm-title') === '放弃本次记录？'
    && textOf('confirm-desc') === '已确认的组数将丢失。'
    && elsById.get('confirm-ok-btn').textContent === '放弃');
  T.answerConfirm(true);
  check('点确定 resolve true', await p === true);
  const p2 = T.askConfirm({ title: 'x' });
  T.answerConfirm(false);
  check('点取消 resolve false', await p2 === false);

  console.log('== 20. v0.9.2 日志日期与草稿存盘 ==');
  const tsLocal = new Date(2026, 0, 5, 0, 30, 0).getTime();   // 本地时间 2026-01-05 00:30 结束训练
  check('localDateStr 按本地日历取日期', T.localDateStr(tsLocal) === '2026-01-05');
  check('对照：UTC 串在东八区会记成前一天',
    new Date(tsLocal).getTimezoneOffset() < 0 ? new Date(tsLocal).toISOString().slice(0, 10) === '2026-01-04' : true);

  T.resetRest();
  T.switchDay('A');
  T.state.sessions.A = null;
  T.clearDraft('A');
  const its20 = T.getItems('A');
  its20[0].sets[0].weight = 42.5;                 // 输入过、但还没确认任何一组
  check('草稿挂在 state 上（不再是内存变量）', T.state.drafts.A === its20);
  check('草稿随 state 一起可序列化', JSON.parse(JSON.stringify(T.state)).drafts.A[0].sets[0].weight === 42.5);
  const legacy = JSON.parse(JSON.stringify(T.state));
  delete legacy.drafts; delete legacy.condDraft; delete legacy.ui;
  const mig = T.migrate(legacy);
  check('旧数据补出 drafts/condDraft/ui.curPos 默认值',
    !!mig.drafts && !!mig.condDraft && typeof mig.ui.curPos === 'object');
  const revived = T.migrate(JSON.parse(JSON.stringify(T.state)));
  check('重启后草稿里的数值还在', revived.drafts.A[0].sets[0].weight === 42.5);
  T.bindDrafts();                                  // 整体替换 state 后必须重新绑定（备份恢复同理）
  T.cycleCondition('A');                           // 会话前的状态选择也要存得住
  check('当日状态草稿进 state', T.state.condDraft.A === '佳');
  check('当日状态可序列化', JSON.parse(JSON.stringify(T.state)).condDraft.A === '佳');

  console.log('== 21. v0.9.2 浏览位置与过期草稿 ==');
  T.switchView('today');       // render() 只渲染当前视图，位置写入发生在训练视图
  T.curPos = 2; T.render();
  check('位置写入 state.ui.curPos', T.state.ui.curPos.A === 2);
  check('位置随 state 可序列化', JSON.parse(JSON.stringify(T.state)).ui.curPos.A === 2);
  T.switchDay('B');
  check('切到 B 不串到 A 的位置', T.curPos === (T.state.ui.curPos.B || 0));
  T.switchDay('A');
  check('切回 A 停在原来那组', T.curPos === 2);
  const fullProgram = JSON.parse(JSON.stringify(T.state.program.A));
  T.state.program.A = fullProgram.slice(0, 3);
  check('计划变短后草稿重建，而不是对着不存在的组编辑', T.getItems('A').length === 3);
  T.state.program.A = fullProgram;
  check('计划恢复后草稿同样重建', T.getItems('A').length === fullProgram.length);

  console.log('== 22. v0.9.2 PR 落盘与日志日期 ==');
  T.state.logs = [{ date: '2026-01-01', day: 'A', exercises: [
    { exerciseId: 'goblet_squat', note: null, sets: [
      { weight: 60, reps: 8, duration: null, rpe: 8, done: true, type: 'work' }] }] }];
  T.state.sessions.A = null;
  T.clearDraft('A');
  const items22 = T.getItems('A');
  const gi = items22.findIndex(i => i.exerciseId === 'goblet_squat');
  const gsi = items22[gi].sets.findIndex(s => s.type !== 'warmup');
  items22[gi].sets[gsi].weight = 65;
  T.curPos = T.flatPos('A').findIndex(p => p.exIdx === gi && p.setIdx === gsi);
  T.cycleDone('A', gi, gsi);
  check('确认时识别出 PR', items22[gi].sets[gsi].isPR === true);
  T.endSession();
  const entry22 = T.state.logs[T.state.logs.length - 1];
  const glog = entry22.exercises.find(e => e.exerciseId === 'goblet_squat');
  check('PR 写进日志（重开页面后还在）', glog.sets.some(s => s.isPR === true));
  check('非 PR 组不带 isPR 字段（不增加体积）', glog.sets.filter(s => !s.isPR).every(s => !('isPR' in s)));
  check('日志日期 = 本地结束日期', entry22.date === T.localDateStr(entry22.endedAt));
  T.resetRest();

  console.log('== 23. v0.9.2 导出瘦身 / 缺动作兜底 / RPE 范围 ==');
  const trLogs = [{ date: '2026-01-01', day: 'A', exercises: [
    { exerciseId: 'goblet_squat', sets: [
      { weight: 60, reps: 8, duration: null, rpe: 8, done: true, type: 'work', restAfter: 90, side: 'L', isPR: true }] }] }];
  const top0 = T.buildTrends(trLogs).goblet_squat.sessions[0].top;
  check('趋势 top 只留可比较的四个数值', Object.keys(top0).sort().join(',') === 'duration,reps,rpe,weight');
  check('瘦身后仍能取到最好一组的数值', top0.weight === 60 && top0.reps === 8 && top0.rpe === 8);

  const savedEx = T.state.exercises.goblet_squat;
  delete T.state.exercises.goblet_squat;
  T.curPos = T.flatPos('A').findIndex(p => T.getItems('A')[p.exIdx].exerciseId === 'goblet_squat');
  T.switchView('today');
  T.render();
  const card = htmlTouchedHTML('ex-list');
  check('缺动作定义时不是死路（仍可确认与导航）', /data-act="confirm"/.test(card) && /data-act="next"/.test(card));
  check('缺动作时点名是哪个 id', card.includes('动作库里没有 <b>goblet_squat</b>'));
  T.state.exercises.goblet_squat = savedEx;
  T.render();
  check('补回定义后警示消失', !htmlTouchedHTML('ex-list').includes('warn-inline'));

  const items23 = T.getItems('A');
  let low = null;
  items23.forEach((it, ei) => it.sets.forEach((s, si) => {
    if(!low && s.targetRpe != null && s.targetRpe <= 4) low = { ei, si, s };
  }));
  check('计划里存在低目标 RPE 的组（拉伸/呼吸）', !!low);
  const lowBtn = act => btnOf({ act, ex: String(low.ei), set: String(low.si) });
  clickExList(lowBtn('dec'));
  check('RPE 从目标值起步（不是固定 8.5）', low.s.rpe === low.s.targetRpe - 0.5);
  for(let i = 0; i < 12; i++) clickExList(lowBtn('dec'));
  check('RPE 能降到 1（旧代码下限卡在 5）', low.s.rpe === 1);
  for(let i = 0; i < 40; i++) clickExList(lowBtn('inc'));
  check('RPE 上限仍是 10', low.s.rpe === 10);

  console.log('== 24. v0.9.3 ± 步进（训练中最常用的一步）==');
  T.switchView('today');
  const items24 = T.getItems('A');
  const modeOf = id => (T.state.exercises[id] || {}).mode || 'weight';
  const wEx = items24.findIndex(i => modeOf(i.exerciseId) === 'weight');
  const tEx = items24.findIndex(i => modeOf(i.exerciseId) === 'time');
  const stepBtn = (ex, set, f, dir) => btnOf({ act: 'step', ex: String(ex), set: String(set), f, dir: String(dir) });
  T.state.settings.weightStep = 2.5;
  items24[wEx].sets[0].weight = 20;
  items24[wEx].sets[0].reps = 8;
  clickExList(stepBtn(wEx, 0, 'weight', 1));
  check('重量 + 一个步进', items24[wEx].sets[0].weight === 22.5);
  clickExList(stepBtn(wEx, 0, 'weight', -1));
  check('重量 − 一个步进', items24[wEx].sets[0].weight === 20);
  clickExList(stepBtn(wEx, 0, 'reps', -1));
  check('次数 −1', items24[wEx].sets[0].reps === 7);
  items24[wEx].sets[0].reps = 1;
  clickExList(stepBtn(wEx, 0, 'reps', -1));
  check('次数不低于 1', items24[wEx].sets[0].reps === 1);
  items24[wEx].sets[0].weight = 1.25;
  clickExList(stepBtn(wEx, 0, 'weight', -1));
  check('重量不会减成负数', items24[wEx].sets[0].weight === 0);
  items24[tEx].sets[0].duration = 30;
  clickExList(stepBtn(tEx, 0, 'duration', 1));
  check('时长 +5 秒', items24[tEx].sets[0].duration === 35);
  T.curPos = T.flatPos('A').findIndex(p => p.exIdx === wEx && p.setIdx === 0);
  T.render();
  const card24 = htmlTouchedHTML('ex-list');
  check('卡片上渲染出四个步进按钮', (card24.match(/data-act="step"/g) || []).length === 4);
  check('按钮有可读标签（含实际步进值）', card24.includes('aria-label="重量增加 2.5 kg"'));

  console.log('== 25. v0.9.3 全量备份与恢复 ==');
  const bk = T.buildBackup();
  check('备份含完整 state（日志/计划/动作库/进行中记录）',
    bk.state.logs.length === T.state.logs.length && !!bk.state.program.A
    && Object.keys(bk.state.exercises).length === Object.keys(T.state.exercises).length
    && 'A' in bk.state.sessions);
  check('备份标记类型/版本/生成日期',
    bk.type === 'ironlog-backup' && bk.version === 1 && bk.appVersion === T.APP_VERSION && /^\d{4}-\d{2}-\d{2}$/.test(bk.exportedAt));
  check('拒绝非 JSON', !T.parseBackup('not json').ok && /不是有效 JSON/.test(T.parseBackup('not json').error));
  check('拒绝不像备份的对象', !T.parseBackup('{"hello":1}').ok && /不像 Iron Log 的备份/.test(T.parseBackup('{"hello":1}').error));
  check('接受去掉外壳的裸 state', T.parseBackup(JSON.stringify(bk.state)).ok === true);

  const before25 = { logs: T.state.logs.length, ex: Object.keys(T.state.exercises).length };
  T.state.profile.background = '恢复之后这行应该被备份里的旧值覆盖';
  const snapText = JSON.stringify(bk);
  const rp1 = T.restoreBackupText(snapText);
  T.answerConfirm(false);
  check('取消则不动数据', (await rp1) === false && T.state.profile.background === '恢复之后这行应该被备份里的旧值覆盖');
  const rp2 = T.restoreBackupText(snapText);
  T.answerConfirm(true);
  check('确认后恢复成功', (await rp2) === true);
  check('日志与动作库原样回来',
    T.state.logs.length === before25.logs && Object.keys(T.state.exercises).length === before25.ex);
  check('备份里的旧值覆盖了对当前数据的改动', T.state.profile.background !== '恢复之后这行应该被备份里的旧值覆盖');
  check('恢复后草稿别名指向新 state（不会写回旧对象）', T.draft === T.state.drafts);
  check('恢复后数据已落盘', JSON.parse(localStorage.getItem('ironlog.v1')).logs.length === before25.logs);
  const oldBk = JSON.parse(snapText);
  delete oldBk.state.drafts; delete oldBk.state.condDraft; delete oldBk.state.ui;
  const rp3 = T.restoreBackupText(JSON.stringify(oldBk));
  T.answerConfirm(true);
  await rp3;
  check('旧版本备份恢复后补出草稿/位置默认值',
    !!T.state.drafts && !!T.state.condDraft && typeof T.state.ui.curPos === 'object');
  check('恢复后仍能正常渲染', (T.switchView('today'), T.render(), /fs-done/.test(htmlTouchedHTML('ex-list'))));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();