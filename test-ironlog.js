// Iron Log 逻辑测试：用 DOM 桩在 node 中执行 js/app.js
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf8');
if(script.length < 1000) { console.error('FAIL js/app.js 过短（' + script.length + ' 字符）'); process.exit(1); }
// index.html 不得残留内联脚本/样式（拆分约定）
if(/<script>/.test(html) || /<style>/.test(html)) { console.error('FAIL index.html 残留内联 <script>/<style>'); process.exit(1); }
// 挂起保护：await 一个永不 resolve 的 Promise 会让 node 以退出码 0 静默结束（假全绿）。
let __finished = false;
process.on('beforeExit', () => {
  if(!__finished){ console.error('FAIL 测试未跑到汇总行（疑似 await 挂起，事件循环已空）'); process.exit(1); }
});

// ---- DOM / 浏览器 API 桩 ----
function makeClassList(){
  const s = new Set();
  return { toggle(c){ s.has(c) ? s.delete(c) : s.add(c); }, add(c){ s.add(c); }, remove(c){ s.delete(c); }, contains(c){ return s.has(c); } };
}
function makeEl(id){
  return {
    id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{},
    classList: makeClassList(),
    attrs: {}, setAttribute(k, v){ this.attrs[k] = v; },
    removeAttribute(k){ delete this.attrs[k]; }, getAttribute(k){ return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    // 记录所有元素的事件回调（委托容器另有覆盖），供设置页 change 处理测试直接派发
    addEventListener(type, fn){ handlers.set(id + '|' + type, fn); },
    querySelectorAll(){ return []; },
    replaceWith(){}, focus(){}, select(){}, setSelectionRange(){}
  };
}
const touchedIds = new Set();   // 记录被访问过的元素 id，供测试断言 id 未被改名
const missingIds = [];          // 桩在 HTML 中找不到的 id = 代码引用了不存在的元素
const elsById = new Map();      // 同一 id 复用同一桩，便于断言渲染结果
const timers = [];              // 捕获 setTimeout 回调，供防抖测试手动触发
const handlers = new Map();     // (id + '|' + type) -> addEventListener 回调，供点击模拟测试
const docHandlers = new Map();  // document 级事件（visibilitychange 等），供前后台切换测试
const DELEGATED = new Set(['ex-list', 'hist-list', 'toast']);   // 用事件委托的容器，需要能向它们派发点击
let patchTarget = null;         // 增量渲染测试注入的 .sets 容器：{ matches, node }
global.document = {
  visibilityState: 'visible',
  addEventListener(type, fn){ docHandlers.set(type, fn); },
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
    if(DELEGATED.has(id)){
      elsById.get(id).addEventListener = (type, fn) => handlers.set(id + '|' + type, fn);
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
function btnOf(ds){ return { closest: sel => (/^button\[data-act/.test(sel) ? { dataset: ds } : null) }; }
// 向任意委托容器派发一次点击
function clickEl(id, target){
  const h = handlers.get(id + '|click');
  if(!h) throw new Error(id + ' click handler 未注册');
  h({ target });
}
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
const windowHandlers = new Map();  // window 级事件（pagehide / popstate / load），供落盘与返回键测试
const historyStub = {              // 极简历史栈：pushState 入栈，back() 出栈并同步触发 popstate
  stack: [null],
  pushState(s){ this.stack.push(s); },
  back(){ if(this.stack.length > 1){ this.stack.pop(); const h = windowHandlers.get('popstate'); if(h) h(); } },
  get state(){ return this.stack[this.stack.length - 1]; }
};
global.window = { addEventListener(t, fn){ windowHandlers.set(t, fn); }, scrollTo(){}, AudioContext: null, history: historyStub };
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
  // restTotalSec/setDoneState 曾住在 app.js 里但应用从不调用（纯测试桩）；
  // 为了让发布代码不含死函数，桩搬到这里（语义逐字保持）。
  get restTotal(){ return restEndsAt === null ? 0 : Math.round((restEndsAt - restStartsAt) / 1000); },
  get restDone(){ return restDone; },
  set restStartsAt(v){ restStartsAt = v; },
  set restEndsAt(v){ restEndsAt = v; },
  // §110 的 clearAll 用空 reload 桩：真实浏览器 reload 会重置整个 JS 上下文，
  // 桩里 clearingAll 会一直挂着 true 吞掉后续所有 save——测试需要显式放行。
  get clearingAll(){ return clearingAll; }, set clearingAll(v){ clearingAll = v; },
  importPlan, validatePlan, normalizeItem, lastValues, getItems,
  doImport, undoImport, planDiffText, parsePlanInput, planSessionConflict, clearAll,
  startSessionIfNeeded, endSession, switchDay, switchView, targetLabel,
  insertLog,
  reeditSession, closeSummary, showSummary, discardSession, get lastEnded(){ return lastEnded; },
  buildExport, buildTrends, topSet, doExport, doExportData, runExport, buildPrompt, cycleCondition,
  sessionVolume, sessionAvgRest, itemsVolume,
  buildBackup, parseBackup, restoreBackupText, PLAN_SCHEMA, copyText,
  renderBakRow, restoreBak, dropBak,
  buildTrendCharts, trendKind, sessionKind, normUnit, programOrder,
  startTimer, stopTimer, clearTimer, timerElapsedSec, resumeTimers, get timerFor(){ return timerFor; },
  esc, APP_VERSION, TREND_WINDOW, toast, render, saveSoon, flushSave,
  get openNotes(){ return openNotes; },
  startRestTimer, tickRest, finishRest, skipRest, resetRest, resumeClocks, askConfirm, answerConfirm,
  toggleDrawer, closeDrawer,
  cycleDone, setDoneState: (day, exIdx, setIdx, val) => { const st = getItems(day)[exIdx].sets[setIdx]; if(st) st.done = val; }, nextPos, prevPos, get curPos(){ return curPos; },
  set curPos(v){ curPos = v; },
  localDateStr, fmtDate, trimSet, migrate, bindDrafts, clampPos, load,
  beep, unlockAudio, refreshPR,
  get restForPos(){ return restForPos; },
  get draft(){ return draft; },
  clearDraft(day){ delete draft[day]; },
  fullScreenHTML, flatPos, posLabel, openNotes: () => openNotes
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
check('targetLabel 单侧动作', T.targetLabel(T.state.program.B[7]) === '2 × 10');   // 保加利亚蹲（work 组）
check('targetLabel 纯热身项念热身组', T.targetLabel(T.state.program.B[3]) === '热身 2 × 15');   // v0.9.90 起热身分区是纯 warmup 项，不是「热身 2 + 0 组」

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
check('program/exercises 原样打包', JSON.stringify(exp.program) === JSON.stringify(T.state.program) && exp.exercises === T.state.exercises);
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
check('prompt 数据说明含热身组语义', prompt.includes('type="warmup" 的组是热身组'));
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
  check('manifest 声明语言（安装提示与无障碍按语言处理）', manifest.lang === 'zh-CN' && manifest.dir === 'ltr');
  check('manifest 有图标', Array.isArray(manifest.icons) && manifest.icons.length > 0);
  check('manifest 提供 192/512 PNG 与 maskable（只有 SVG 时 Android 安装不显示图标）',
    manifest.icons.some(i => i.sizes === '192x192' && i.type === 'image/png')
    && manifest.icons.some(i => i.sizes === '512x512' && i.type === 'image/png')
    && manifest.icons.some(i => i.purpose === 'maskable'));
  check('iOS 主屏图标指向 PNG（apple-touch-icon 不认 SVG）', /rel="apple-touch-icon" href="apple-touch-icon\.png"/.test(html));
  check('图标 PNG 文件存在且是真 PNG', ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']
    .every(f => fs.existsSync(path.join(__dirname, f))
      && fs.readFileSync(path.join(__dirname, f)).slice(0, 8).toString('hex') === '89504e470d0a1a0a'));
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
  check('sw.js 的 SHELL 也覆盖 manifest 声明的全部图标', (() => {
    const shell = (sw.match(/SHELL = \[([^\]]*)\]/) || ['', ''])[1];
    const icons = (JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.webmanifest'), 'utf8')).icons || []).map(i => i.src);
    return icons.length > 0 && icons.every(r => shell.includes('./' + r));
  })());
  check('sw.js 有 install/activate/fetch', ['install','activate','fetch'].every(k => sw.includes("'" + k + "'")));
  check('sw.js 只缓存成功响应（404 不会污染离线回退）', /if\(res\.ok\)/.test(sw) && /res\.status === 200/.test(sw));
  const ciPrepare = fs.readFileSync(path.join(__dirname, '.github/workflows/deploy.yml'), 'utf8');
  check('deploy.yml 发布 css/js 与全部 PWA 资源（新增静态文件必须同步加 cp）',
    ['index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'sw.js']
      .every(f => new RegExp('cp [^\\n]*?\\b' + f.replace('.', '\\.') + '\\b').test(ciPrepare))
    && /cp css\/style.css dist\/css\//.test(ciPrepare)
    && /cp js\/app.js dist\/js\//.test(ciPrepare));

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
  // 组进度细条（v0.9.134 替代小圆环）：宽度 = 渲染动作的已完成组数/总组数。
  const renderEx = +fsA.match(/class="fs-done[^"]*" data-ex="(\d+)"/)[1];
  const barM = fsA.match(/class="fs-setbar"[^>]*>\s*<div class="fs-setbar-fill" style="width:(\d+)%"/);
  const dotsItem = T.getItems('A')[renderEx];
  const doneCnt = dotsItem.sets.filter(st => st.done === true).length;
  check('组进度细条存在（' + dotsItem.exerciseId + '）', !!barM);
  check('细条宽度与已完成组数一致（' + doneCnt + '/' + dotsItem.sets.length + '）',
    barM && +barM[1] === Math.round(doneCnt / dotsItem.sets.length * 100));
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
  check('README 结构清单与实际文件一致', ['index.html','css/style.css','js/app.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','apple-touch-icon.png','sw.js','fixtures/plan-A.json','fixtures/plan-B.json']
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

  console.log('== 26. v0.9.4 趋势图可读性 ==');
  const mkLog = (date, id, vals) => ({
    date, day: 'A', condition: null, durationSec: 3600,
    exercises: [{ exerciseId: id, note: '', sets: vals.map(v => ({
      type: '正式', weight: v.weight ?? null, reps: v.reps ?? null, duration: v.duration ?? null, rpe: 8, done: true,
    })) }],
  });
  T.state.logs = [
    mkLog('2026-01-01', 'goblet_squat', [{ weight: 40 }, { weight: 42 }]),
    mkLog('2026-01-03', 'goblet_squat', [{ weight: 45 }]),
    mkLog('2026-01-05', 'goblet_squat', [{ weight: 47 }]),
    mkLog('2026-01-06', 'clamshell', [{ reps: 12 }]),
    mkLog('2026-01-08', 'clamshell', [{ reps: 15 }]),
    mkLog('2026-01-04', 'plank', [{ duration: 30 }]),
    mkLog('2026-01-09', 'plank', [{ duration: 45 }]),
    mkLog('2026-01-02', 'db_bench', [{ weight: 14 }]),
    mkLog('2026-01-07', 'db_bench', [{ weight: 16 }]),
    mkLog('2026-01-02', 'lateral_raise', [{ weight: 5 }]),
    mkLog('2026-01-07', 'lateral_raise', [{ weight: 6 }]),
  ];
  const trendsAll = T.buildTrends(T.state.logs);
  check('指标归类正确（重量/次数/时长）',
    T.trendKind(trendsAll.goblet_squat) === 'weight' && T.trendKind(trendsAll.clamshell) === 'reps' && T.trendKind(trendsAll.plank) === 'duration');
  const charts = T.buildTrendCharts(trendsAll, 5);
  const blocks = charts.split('<div class="trend-block">').slice(1);
  const nameOf = id => (T.state.exercises[id] || {}).name || id;
  const blockOf = id => blocks.find(b => b.includes(nameOf(id))) || '';
  const hasUnit = (b, u) => new RegExp('\\d\\s*' + u).test(b.replace(/\s+/g, ' '));
  check('kg / 次 / 秒 各自一张图，不共用 Y 轴', blocks.length === 3
    && !hasUnit(blockOf('plank'), 'kg') && !hasUnit(blockOf('clamshell'), 'kg') && hasUnit(blockOf('goblet_squat'), 'kg'));
  check('图例单位与指标一致', hasUnit(blockOf('plank'), '秒') && hasUnit(blockOf('clamshell'), '次') && hasUnit(blockOf('goblet_squat'), 'kg'));
  check('每张图有标题（重量（kg）等）', /重量（kg）/.test(charts) && /时长（秒）/.test(charts) && /次数/.test(charts));
  check('Y 轴有网格线与刻度', (charts.match(/<line /g) || []).length >= 9 && /text-anchor="end"/.test(charts));
  check('横轴说明两端含义而不是假日期刻度', /最早/.test(charts) && /最近/.test(charts) && !/2026-01/.test(charts));
  check('数值不再用折线颜色画在图上（改看图例）', !/<text[^>]*fill="#(4f8cff|3fb96f|e0a030|e05252|9b6dff)"/.test(charts));
  check('图例给出动作名、最新值与方向',
    blockOf('goblet_squat').includes(nameOf('goblet_squat')) && /47\s*kg/.test(blockOf('goblet_squat'))
    && /上升/.test(blockOf('goblet_squat')) && /3 次/.test(blockOf('goblet_squat')));
  check('同一张图内按练习次数排，次数相同按训练顺序排', (() => {
    const wblock = blocks.find(b => /重量（kg）/.test(b)) || '';
    const got = [...wblock.matchAll(/class="lg-name">([^<]+)</g)].map(m => m[1]);
    const ord = T.programOrder();
    const expected = ['goblet_squat', 'db_bench', 'lateral_raise']
      .sort((a, b) => (trendsAll[b].sessions.length - trendsAll[a].sessions.length) || (ord[a] - ord[b]))
      .map(nameOf);
    return got.length === 3 && JSON.stringify(got) === JSON.stringify(expected);
  })());
  check('历史页渲染出分组趋势图', (T.switchView('history'), T.render(), /trend-block/.test(htmlTouchedHTML('hist-list'))));
  check('没有 ≥2 次记录时给说明而不是空白', /至少记录 2 次/.test(T.buildTrendCharts(T.buildTrends([]), 5)));
  check('programOrder 按 A→B 首次出现的顺序编号', (() => {
    const seq = [];
    ['A', 'B'].forEach(d => (T.state.program[d] || []).forEach(p => { if(!seq.includes(p.exerciseId)) seq.push(p.exerciseId); }));
    const o = T.programOrder();
    return seq.length > 10 && seq.every((id, i) => o[id] === i);
  })());

  console.log('== 27. v0.9.4 回到前台纠正计时 ==');
  const onVis = docHandlers.get('visibilitychange');
  check('注册了 document visibilitychange 处理', typeof onVis === 'function');
  T.switchView('today'); T.render();
  const restClock = document.getElementById('rest-clock');
  T.resetRest();
  T.restStartsAt = Date.now() - 20000;
  T.restEndsAt = Date.now() + 40000;      // 还剩 40 秒
  restClock.textContent = '0:03';         // 模拟后台挂起时留下的旧倒计时
  global.document.visibilityState = 'visible';
  onVis();
  check('回到前台立刻按时间戳纠正休息倒计时', restClock.textContent === '0:40');
  ['A', 'B'].forEach(d => { T.state.sessions[d] = { startedAt: Date.now() - 90000, items: T.getItems(d), condition: null }; });
  const sessClock = document.getElementById('session-clock');
  sessClock.textContent = '0:05';
  onVis();
  check('回到前台也纠正训练总用时', sessClock.textContent === '1:30');
  let vibrateArg = null;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { vibrate(p){ vibrateArg = p; return true; } }
  });
  T.resetRest();
  T.restStartsAt = Date.now() - 120000;
  T.restEndsAt = Date.now() - 5000;       // 后台期间已经到点
  T.tickRest();
  check('休息到点会震动提醒（静音时也能察觉）', Array.isArray(vibrateArg) && vibrateArg.length >= 2);
  check('到点后重复 tick 不重复提醒', (vibrateArg = null, T.tickRest(), vibrateArg === null));

  console.log('== 28. v0.9.5 计时动作的秒表 ==');
  T.switchDay('A');
  T.state.sessions.A = null; T.clearDraft('A');
  const itemsA = T.getItems('A');
  const ti = itemsA.findIndex(it => (T.state.exercises[it.exerciseId] || {}).mode === 'time');
  check('A 日确实有计时动作（平板/拉伸/呼吸）', ti >= 0);
  const si = itemsA[ti].sets.length > 1 ? 1 : 0;
  itemsA[ti].sets[si].duration = null;
  T.clearTimer();
  T.startTimer(ti, si);
  check('开始计时后记住是哪一组', !!T.timerFor && T.timerFor.exIdx === ti && T.timerFor.setIdx === si);
  advanceClock(65000);
  check('经过的秒数按时间戳算（不看 setInterval 次数）', T.timerElapsedSec() === 65);
  T.stopTimer();
  check('停表把经过的秒数填进这一组', itemsA[ti].sets[si].duration === 65);
  check('停表后不再挂着计时组', T.timerFor === null);
  const posT = T.flatPos('A').findIndex(p => p.exIdx === ti && p.setIdx === si);
  T.switchView('today'); T.curPos = posT; T.render();
  let tcard = htmlTouchedHTML('ex-list');
  check('计时动作卡片上有「计时」按钮', /data-act="timer"/.test(tcard) && />计时</.test(tcard));
  T.startTimer(ti, si);
  advanceClock(40000);
  T.render();
  tcard = htmlTouchedHTML('ex-list');
  check('计时中按钮变成「停止」并高亮', /fs-timer running/.test(tcard) && />停止</.test(tcard));
  check('计时中输入框就是读数，显示已经过的秒数', /value="40"[^>]*aria-label="时长（秒）"/.test(tcard));
  itemsA[ti].sets[si].duration = null;
  itemsA[ti].sets[si].done = false;
  clickExList(doneBtnFromDOM(ti, si));
  check('确认这一组时自动停表并填入时长', itemsA[ti].sets[si].duration === 40 && itemsA[ti].sets[si].done === true);
  check('确认后秒表清空', T.timerFor === null);
  T.startTimer(ti, si);
  T.switchDay('B');
  check('换日会丢掉上一日的秒表', T.timerFor === null);
  T.switchDay('A');
  const wi = itemsA.findIndex(it => (T.state.exercises[it.exerciseId] || {}).mode === 'weight');
  T.curPos = T.flatPos('A').findIndex(p => p.exIdx === wi);
  T.render();
  check('力量动作卡片上不出现秒表', !/data-act="timer"/.test(htmlTouchedHTML('ex-list')));

  console.log('== 29. v0.9.5 导出更短 + 历史详情可读 ==');
  const exp29 = T.buildExport(4);
  const prompt29 = T.buildPrompt(exp29);
  const fence29 = (prompt29.match(/```json\n([\s\S]*?)\n```/) || [, ''])[1];
  check('prompt 内的记录 JSON 是紧凑单行（缩进会让字符数翻倍）',
    fence29.includes('"type":"ironlog-export"') && !fence29.includes('\n'));
  check('紧凑后字符数明显少于缩进版', prompt29.length < JSON.stringify(exp29, null, 2).length * 0.7);
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, writable: true,
    value: Object.assign({}, globalThis.navigator, { clipboard: { writeText: async () => {} } })
  });
  T.switchView('history');
  T.doExport();
  check('复制成功后告知字符数（好判断该导出几次）', /k 字符/.test(textOf('export-msg')));
  T.state.logs = [{
    date: '2026-06-01', day: 'A', startedAt: 0, endedAt: 0, durationSec: 2400, condition: null,
    exercises: [
      { exerciseId: 'goblet_squat', sets: [{ done: true, weight: 20, reps: 8, duration: null, rpe: 8 }] },
      { exerciseId: 'plank', sets: [{ done: true, weight: null, reps: null, duration: 45, rpe: null }] },
      { exerciseId: 'clamshell', sets: [{ done: true, weight: null, reps: 15, duration: null, rpe: null }] }
    ]
  }];
  T.render();
  const hist29 = htmlTouchedHTML('hist-list');
  check('历史详情：力量组写清单位 20kg×8', /20kg×8/.test(hist29));
  check('历史详情：计时组写「45 秒」而不是 45s', /45 秒/.test(hist29) && !/45s/.test(hist29));
  check('历史详情：自重组写「15 次」', /15 次/.test(hist29));

  console.log('== 30. 卡片上的「上次」一行（看到上次做到多少 + 一键沿用）==');
  T.state.sessions = {};
  Object.keys(T.draft).forEach(k => delete T.draft[k]);
  const modeOf30 = id => (T.state.exercises[id] || {}).mode || 'weight';
  const items30 = T.getItems('A');
  const itemsB30 = T.getItems('B');
  /* 用「当前计划里真实存在的动作」造历史：前面的用例可能已经用备份替换过计划，
   * 写死 goblet_squat/clamshell 会找不到位置。 */
  const pick30 = (items, mode) => items.find(it => modeOf30(it.exerciseId) === mode && it.sets.some(st => st.type !== 'warmup'));
  const wEx30 = pick30(items30, 'weight');
  const tEx30 = pick30(items30, 'time');
  const bInB30 = pick30(itemsB30, 'bodyweight');
  const bEx30 = bInB30 || pick30(items30, 'bodyweight');
  const bDay30 = bInB30 ? 'B' : 'A';
  const bItems30 = bInB30 ? itemsB30 : items30;
  T.state.logs = [{
    date: '2026-06-01', day: 'A', startedAt: 0, endedAt: 0, durationSec: 1200, condition: null,
    exercises: [
      { exerciseId: wEx30.exerciseId, sets: [{ done: true, weight: 20, reps: 8, duration: null, rpe: 8 }] },
      { exerciseId: tEx30.exerciseId, sets: [{ done: true, weight: null, reps: null, duration: 45, rpe: null }] },
      { exerciseId: bEx30.exerciseId, sets: [{ done: true, weight: null, reps: 15, duration: null, rpe: null }] }
    ]
  }];
  function goCard30(day, items, item, setIdx){
    const exIdx = items.indexOf(item);
    const at = T.flatPos(day).findIndex(p => p.exIdx === exIdx && p.setIdx === setIdx);
    T.switchView('today');
    T.curPos = at;
    T.render();
    return { exIdx, html: htmlTouchedHTML('ex-list') };
  }
  const gi30 = items30.indexOf(wEx30);
  const gwork30 = wEx30.sets.findIndex(st => st.type !== 'warmup');
  const c30 = goCard30('A', items30, wEx30, gwork30);
  check('正式组卡片显示上次最重的数值', /上次最重 20kg×8/.test(c30.html));
  check('并写清是哪一天记录的', /06-01/.test(c30.html));
  check('这一行是可点的「点按沿用」', /data-act="uselast"/.test(c30.html) && /点按沿用/.test(c30.html));
  // 沿用：先把这组改成别的数，再点按钮
  wEx30.sets[gwork30].weight = 12.5;
  wEx30.sets[gwork30].reps = 3;
  clickExList(btnOf({ act: 'uselast', ex: String(gi30), set: String(gwork30) }));
  check('点按沿用把上次的重量与次数填进这一组',
    wEx30.sets[gwork30].weight === 20 && wEx30.sets[gwork30].reps === 8);
  check('沿用只填数值，不会顺手把组标成完成', wEx30.sets[gwork30].done === false);
  // 热身组：目标本来就比正式组低，不该出现「上次」
  const warmIdx30 = items30.findIndex(it => it.sets.some(st => st.type === 'warmup'));
  if(warmIdx30 < 0){
    check('当前计划里没有热身组（跳过热身断言）', true);
  }else{
    const warmSet30 = items30[warmIdx30].sets.findIndex(st => st.type === 'warmup');
    check('热身组卡片上不出现「上次」',
      !/data-act="uselast"/.test(goCard30('A', items30, items30[warmIdx30], warmSet30).html));
  }
  // 没记录过的动作不该编造「上次」
  const logged30 = new Set(T.state.logs.flatMap(l => (l.exercises || []).map(e => e.exerciseId)));
  const fresh30 = items30.find(it => !logged30.has(it.exerciseId));
  check('没有历史记录的动作不显示「上次」',
    !/data-act="uselast"/.test(goCard30('A', items30, fresh30, 0).html));
  // 计时动作按秒说，自重组按次说
  check('计时动作显示「上次最长 45 秒」而不是重量', (() => {
    const h = goCard30('A', items30, tEx30, tEx30.sets.findIndex(st => st.type !== 'warmup')).html;
    return /上次最长 45 秒/.test(h) && !/上次最重/.test(h);
  })());
  const cB30 = goCard30(bDay30, bItems30, bEx30, 0);
  check('自重组显示「上次最多 15 次」', /上次最多 15 次/.test(cB30.html));
  check('自重组的「上次」不提重量', !/上次最重/.test(cB30.html));
  bEx30.sets[0].reps = 4;
  clickExList(btnOf({ act: 'uselast', ex: String(cB30.exIdx), set: '0' }));
  check('自重组沿用后次数变成 15', bEx30.sets[0].reps === 15);

  console.log('== 31. 结束训练后的「改一下」（把记录放回编辑，而不是重来一遍）==');
  T.state.sessions = {};
  Object.keys(T.draft).forEach(k => delete T.draft[k]);
  T.state.logs = [];
  T.switchView('today');
  T.switchDay('A');
  const itA31 = T.getItems('A');
  const firstWork31 = itA31.findIndex(it => it.sets.some(st => st.type !== 'warmup'));
  const wSet31 = itA31[firstWork31].sets.findIndex(st => st.type !== 'warmup');
  itA31[firstWork31].sets[wSet31] = { done: true, weight: 20, reps: 5, duration: null, rpe: 8, type: 'work' };
  itA31[firstWork31].sets[wSet31 + 1] && (itA31[firstWork31].sets[wSet31 + 1] = { done: true, weight: 20, reps: 2, duration: null, rpe: 9, type: 'work' });
  T.state.sessions.A = { startedAt: Date.now() - 90000, items: itA31, condition: '佳' };
  T.endSession();
  check('结束训练写入一条日志', T.state.logs.length === 1);
  check('小结里给出「改一下」按钮', document.getElementById('summary-reedit').style.display === '');
  T.reeditSession();
  check('点「改一下」撤掉刚写入的那条日志', T.state.logs.length === 0);
  check('记录回到进行中，组和数值原样还在', (() => {
    const s = T.state.sessions.A;
    return !!s && s.items[firstWork31].sets[wSet31].weight === 20 && s.items[firstWork31].sets[wSet31].done === true;
  })());
  check('撤销后不留悬挂引用', T.lastEnded === null);
  // 改完再结束：只有一条，不重复
  T.state.sessions.A.items[firstWork31].sets[wSet31].reps = 7;
  T.endSession();
  check('改完再结束，日志仍然只有一条', T.state.logs.length === 1);
  check('改过的次数被记进日志', T.state.logs[0].exercises.some(e => e.sets.some(s => s.reps === 7)));
  // 关掉小结就不能再撤销（不会把已经确认过的记录偷偷撤掉）
  T.closeSummary();
  T.reeditSession();
  check('关掉小结后「改一下」失效，日志不受影响', T.state.logs.length === 1);
  // 已经另开一次记录时，撤销不会覆盖新记录
  T.state.sessions.A = { startedAt: Date.now() - 1000, items: itA31, condition: null };
  T.endSession();
  check('再结束一次，日志两条', T.state.logs.length === 2);
  const marker31 = { startedAt: Date.now(), items: T.getItems('A'), condition: null };
  T.state.sessions.A = marker31;
  T.reeditSession();
  check('这一日已有新记录时不覆盖它', T.state.sessions.A === marker31 && T.state.logs.length === 2);

  console.log('== 32. 历史里删除整次记录（试训、填错的记录不必一直留着，删了还能反悔）==');
  T.state.sessions = {};
  Object.keys(T.draft).forEach(k => delete T.draft[k]);
  T.state.logs = [];
  T.switchView('today');
  T.switchDay('A');
  const itA32 = T.getItems('A');
  itA32[0].sets[0] = { done: true, weight: 20, reps: 5, duration: null, rpe: 8, type: 'work' };
  T.state.sessions.A = { startedAt: 1700000000000, items: itA32, condition: null };
  T.endSession();
  T.closeSummary();
  T.switchDay('B');
  const itB32 = T.getItems('B');
  itB32[0].sets[0] = { done: true, weight: 12, reps: 5, duration: null, rpe: 7, type: 'work' };
  T.state.sessions.B = { startedAt: 1700000009000, items: itB32, condition: null };
  T.endSession();
  T.closeSummary();
  check('先造出两条记录', T.state.logs.length === 2);
  T.switchView('history');
  const hh32 = htmlTouchedHTML('hist-list');
  check('展开的历史详情里有「删除这次记录」', /data-act="dellog"/.test(hh32));
  check('删除按钮带上这条记录的时间戳', /data-act="dellog" data-ts="\d+"/.test(hh32));
  const ts0 = T.state.logs[0].startedAt;
  clickEl('hist-list', btnOf({ act: 'dellog', ts: String(ts0), i: '0' }));
  check('删除要先确认，按钮文案是「删除」', textOf('confirm-ok-btn') === '删除');
  T.answerConfirm(false);
  await null;
  check('取消则不删', T.state.logs.length === 2);
  clickEl('hist-list', btnOf({ act: 'dellog', ts: String(ts0), i: '0' }));
  T.answerConfirm(true);
  await null;
  check('确认删除后只剩另一条', T.state.logs.length === 1 && T.state.logs[0].startedAt !== ts0);
  check('提示条给出「撤销」按钮', /data-act="undo"/.test(htmlTouchedHTML('toast')));
  clickEl('toast', btnOf({ act: 'undo' }));
  check('点撤销，记录按原来的位置放回', T.state.logs.length === 2 && T.state.logs[0].startedAt === ts0);
  clickEl('hist-list', btnOf({ act: 'dellog', ts: '999', i: '' }));
  await null;
  check('对应记录已不在时只提示，不会删错', T.state.logs.length === 2);

  console.log('== 33. 导入方案：先列出会改什么，导入后还能换回来 ==');
  T.state.lastImport = null;
  T.importPlan(planText);
  const base33 = JSON.parse(planText);
  const idsA33 = base33.program.A.map(it => it.exerciseId);
  const oldLabel33 = T.targetLabel(T.normalizeItem(base33.program.A[0]));
  const mod33 = JSON.parse(planText);
  const dropped33 = mod33.program.A.pop();                       // 去掉最后一个动作
  mod33.program.A[0].sets = [{ type: 'work', weight: 40, reps: 3 }, { type: 'work', weight: 40, reps: 3 }]; // 改目标
  mod33.exercises.new_ex33 = { name: '新动作甲', mode: 'weight' };
  mod33.program.A.push({ section: '', exerciseId: 'new_ex33', sets: [{ type: 'work', weight: 10, reps: 10 }] }); // 加动作
  const diff33 = T.planDiffText(mod33);
  check('差异说明写了 A 日的动作数变化', diff33.includes(`A 日 ${idsA33.length} → ${idsA33.length} 个动作`));
  check('差异说明列出被移除的动作名', diff33.includes('移除 ' + base33.exercises[dropped33.exerciseId].name));
  check('差异说明列出新增的动作', diff33.includes('新增 新动作甲'));
  check('差异说明列出目标变化',
    diff33.includes(`目标改为 ${base33.exercises[idsA33[0]].name} ${oldLabel33} → 2 × 3`));
  check('差异说明写明日志不动', diff33.includes('日志不会改动'));
  T.switchView('settings');
  T.render();
  document.getElementById('import-text').value = JSON.stringify(mod33);
  check('没有快照时「撤销上次导入」不显示', document.getElementById('undo-import').style.display === 'none');
  check('导入前计划里没有新动作', !T.state.program.A.some(i => i.exerciseId === 'new_ex33'));
  T.doImport();
  check('导入先弹确认', textOf('confirm-title') === '按这份方案更新计划？');
  check('确认框里就是那份差异说明', textOf('confirm-desc') === diff33);
  T.answerConfirm(false);
  await null;
  check('取消则计划一字未改', T.state.program.A.map(i => i.exerciseId).join() === idsA33.join());
  check('取消则不留快照', T.state.lastImport === null);
  T.doImport();
  T.answerConfirm(true);
  await null;
  check('确认后才按计划替换',
    T.state.program.A.some(i => i.exerciseId === 'new_ex33')
    && !T.state.program.A.some(i => i.exerciseId === dropped33.exerciseId)
    && T.state.program.A[0].sets[0].weight === 40);
  check('替换前留了一份快照', !!T.state.lastImport && T.state.lastImport.program.A.map(i => i.exerciseId).join() === idsA33.join());
  check('设置页出现「撤销上次导入」', document.getElementById('undo-import').style.display === '');
  T.undoImport();
  check('撤销后计划换回原样', T.state.program.A.map(i => i.exerciseId).join() === idsA33.join());
  // v0.9.96 政策：动作库条目从不随撤销删除（applyPlan 也从不删库），只是计划里不再引用它
  check('导入新增的动作留在库中但已不在计划里', !!T.state.exercises.new_ex33 && !T.state.program.A.some(i => i.exerciseId === 'new_ex33'));
  check('快照只留一层，撤销后按钮消失',
    T.state.lastImport === null && document.getElementById('undo-import').style.display === 'none');
  check('没有快照时撤销只提示，不改数据',
    (T.undoImport(), T.state.program.A.map(i => i.exerciseId).join() === idsA33.join()));

  console.log('== 34. 结束/换日时休息计时的归属（v0.9.10）==');
  T.resetRest();
  T.state.sessions = {};
  Object.keys(T.draft).forEach(k => delete T.draft[k]);
  T.state.logs = [];
  T.state.settings.restSec = 90;
  T.switchView('today');
  T.switchDay('A');
  const it34 = T.getItems('A');
  const gi34 = it34.findIndex(i => i.exerciseId === 'goblet_squat');
  const ws34 = it34[gi34].sets.findIndex(s => s.type !== 'warmup');
  it34[gi34].sets[ws34].done = false;
  T.state.sessions.A = { startedAt: Date.now() - 60000, items: it34, condition: null };
  T.curPos = T.flatPos('A').findIndex(p => p.exIdx === gi34 && p.setIdx === ws34);
  T.render();
  advanceClock(1000);
  clickExList(doneBtnFromDOM(gi34, ws34));   // 确认这组 → 休息开始
  check('确认组后休息计时启动', T.restEndsAt !== null);
  advanceClock(45000);                        // 真实休息了 45 秒
  T.endSession();                             // 直接结束训练
  const log34 = T.state.logs[T.state.logs.length - 1];
  const glog34 = log34.exercises.find(e => e.exerciseId === 'goblet_squat');
  check('结束训练前把休息结算到被确认的组上（不凭空消失）',
    glog34.sets[ws34].restAfter === 45);
  check('结束后休息计时清空', T.restEndsAt === null && T.restForPos === null);

  // 换日：休息属于上一日，结算到上一日的组，不会写进新的一天
  T.resetRest();
  T.state.sessions = {};
  Object.keys(T.draft).forEach(k => delete T.draft[k]);
  T.switchDay('A');
  const it34b = T.getItems('A');
  it34b[gi34].sets[ws34].done = false;
  T.state.sessions.A = { startedAt: Date.now() - 10000, items: it34b, condition: null };
  T.curPos = T.flatPos('A').findIndex(p => p.exIdx === gi34 && p.setIdx === ws34);
  T.render();
  clickExList(doneBtnFromDOM(gi34, ws34));
  advanceClock(20000);
  T.switchDay('B');
  check('换日前把休息结算到 A 日的组上', it34b[gi34].sets[ws34].restAfter === 20);
  check('换日后休息计时清空', T.restEndsAt === null && T.restForPos === null);
  const bItems = T.getItems('B');
  check('休息没有写进 B 日的任何组',
    bItems.every(it => it.sets.every(s => s.restAfter == null)));
  T.resetRest();
  T.switchDay('A');

  // 结束训练时秒表还在跑：经过的秒数先填进这一组，再做日志快照
  T.resetRest();
  T.state.sessions = {};
  Object.keys(T.draft).forEach(k => delete T.draft[k]);
  const it34c = T.getItems('A');
  const ti34 = it34c.findIndex(it => (T.state.exercises[it.exerciseId] || {}).mode === 'time');
  it34c[ti34].sets[0].duration = null;
  it34c[ti34].sets[0].done = true;
  T.state.sessions.A = { startedAt: Date.now() - 10000, items: it34c, condition: null };
  T.startTimer(ti34, 0);
  advanceClock(40000);
  T.endSession();
  const log34c = T.state.logs[T.state.logs.length - 1];
  check('结束训练时秒表先结算：平板的 40 秒进了日志',
    log34c.exercises.find(e => e.exerciseId === it34c[ti34].exerciseId).sets[0].duration === 40);
  check('结算后秒表清空', T.timerFor === null);
  T.resetRest();
  T.switchDay('A');

  console.log('== 35. PR 判定：只有刷新历史最好成绩才算（v0.9.11）==');
  T.resetRest();
  T.state.sessions = {};
  Object.keys(T.draft).forEach(k => delete T.draft[k]);
  T.state.logs = [];
  T.switchView('today');
  T.switchDay('A');
  const mkLog35 = (date, w) => ({ date, day: 'A', startedAt: 0, endedAt: 1, durationSec: 1, condition: null,
    exercises: [{ exerciseId: 'goblet_squat', note: null,
      sets: [{ weight: w, reps: 5, duration: null, rpe: 8, side: null, restAfter: null, done: true }] }] });
  T.state.logs.push(mkLog35('2026-01-01', 100), mkLog35('2026-02-01', 50));   // 更早 100，最近 50（减载）
  const it35 = T.getItems('A');
  const g35 = it35.findIndex(i => i.exerciseId === 'goblet_squat');
  const w35 = it35[g35].sets.findIndex(s => s.type !== 'warmup');
  const w35b = it35[g35].sets.findIndex((s, i) => i > w35 && s.type !== 'warmup');
  T.state.sessions.A = { startedAt: Date.now() - 1000, items: it35, condition: null };
  it35[g35].sets[w35].weight = 60;
  T.cycleDone('A', g35, w35);
  check('减载后 60kg 不超过历史最好 100：不算 PR（旧逻辑按「上次的 50」会误标）',
    it35[g35].sets[w35].isPR === false);
  it35[g35].sets[w35].done = false;
  it35[g35].sets[w35].weight = 105;
  T.cycleDone('A', g35, w35);
  check('105kg 超过历史最好 100 → PR', it35[g35].sets[w35].isPR === true);
  it35[g35].sets[w35b].weight = 60;
  T.cycleDone('A', g35, w35b);
  check('本次会话已确认过 105：60 再超过历史也不算破纪录',
    it35[g35].sets[w35b].isPR === false);
  T.endSession();
  const log35 = T.state.logs[T.state.logs.length - 1];
  const gl35 = log35.exercises.find(e => e.exerciseId === 'goblet_squat');
  check('热身组在日志里带 type 标记（正式组不带，不增加体积）',
    gl35.sets[0].type === 'warmup' && gl35.sets[1].type === undefined);

  T.state.sessions = {};
  Object.keys(T.draft).forEach(k => delete T.draft[k]);
  T.state.logs = [];
  const it35c = T.getItems('A');
  T.state.sessions.A = { startedAt: Date.now() - 1000, items: it35c, condition: null };
  T.cycleDone('A', g35, 0);   // 只确认 goblet 的热身组
  check('热身组不挂 PR 徽章', it35c[g35].sets[0].isPR !== true);
  T.endSession();
  check('只完成热身组不会提供「上次」数值', T.lastValues('goblet_squat').weight === null);

  T.state.sessions = {};
  Object.keys(T.draft).forEach(k => delete T.draft[k]);
  const it35d = T.getItems('A');
  const g35d = it35d.findIndex(i => i.exerciseId === 'goblet_squat');
  const n35 = it35d[g35d].sets.length;
  it35d[g35d].sets[n35 - 1].targetRpe = 8;
  it35d[g35d].sets[n35 - 1].targetRpeLabel = '留 2 次';
  clickExList(btnOf({ act: 'addset', ex: String(g35d) }));
  check('addset 会带上目标 RPE 与其说明',
    it35d[g35d].sets.length === n35 + 1 && it35d[g35d].sets[n35].targetRpe === 8 &&
    it35d[g35d].sets[n35].targetRpeLabel === '留 2 次');
  T.state.sessions = {};
  Object.keys(T.draft).forEach(k => delete T.draft[k]);

  console.log('== 36. 导入/撤销/恢复会丢掉挂在下层草稿上的秒表（v0.9.12）==');
  T.state.sessions = {};
  Object.keys(T.draft).forEach(k => delete T.draft[k]);
  T.state.logs = [];
  T.state.lastImport = null;
  T.switchView('today');
  T.switchDay('A');
  const it36 = T.getItems('A');
  const ti36 = it36.findIndex(it => (T.state.exercises[it.exerciseId] || {}).mode === 'time');
  check('夹具里有计时动作', ti36 >= 0);
  T.startTimer(ti36, 0);
  advanceClock(37000);
  T.importPlan(planText);   // 无进行中记录，允许导入
  check('导入后秒表被清空（旧草稿已不存在）', T.timerFor === null);
  const it36b = T.getItems('A');
  check('旧秒表不会把 37 秒写进重建后的草稿', it36b[ti36].sets[0].duration !== 37);

  T.startTimer(ti36, 0);
  advanceClock(21000);
  T.importPlan(planText);
  T.undoImport();           // importPlan 不留快照：只有设置页的导入才留
  check('没有快照时撤销不动数据', T.state.lastImport === null);
  // 手工构造可撤销快照，并让第二次导入真的往 A 计划加动作（旧断言曾空过）
  const pre36 = { at: Date.now(), program: JSON.parse(JSON.stringify(T.state.program)), exercises: JSON.parse(JSON.stringify(T.state.exercises)) };
  const snapPlan = JSON.parse(planText);
  snapPlan.program.A.push({ exerciseId: 'marker36', sets: [{ weight: 1, reps: 1 }] });
  snapPlan.exercises.marker36 = { name: '标记动作', mode: 'weight', unit: 'kg' };
  T.startTimer(ti36, 0);
  advanceClock(15000);
  const r36 = T.importPlan(JSON.stringify(snapPlan));
  check('第二次导入真的往 A 计划加了动作', r36.ok === true && T.state.program.A.some(i => i.exerciseId === 'marker36'));
  check('导入前秒表又被清空', T.timerFor === null);
  T.state.lastImport = pre36;
  T.undoImport();
  check('撤销后计划换回原样且无秒表残留',
    !T.state.program.A.some(i => i.exerciseId === 'marker36') && T.timerFor === null);
  delete T.state.exercises.marker36;
  Object.keys(T.draft).forEach(k => delete T.draft[k]);

  const snap36 = T.buildBackup();
  const it36c = T.getItems('A');
  T.startTimer(ti36, 0);
  advanceClock(25000);
  T.restoreBackupText(JSON.stringify(snap36));
  T.answerConfirm(true);
  await null;
  check('恢复备份后秒表被清空', T.timerFor === null);
  const it36d = T.getItems('A');
  check('恢复后的草稿不带旧秒表读数', it36d[ti36].sets[0].duration !== 25);
  T.state.lastImport = null;

  console.log('== 37. migrate 给不完整备份补默认值（v0.9.13）==');
  const bare = { version: 1, program: { A: [], B: [] }, exercises: {} };
  const m37 = T.migrate(JSON.parse(JSON.stringify(bare)));
  check('logs 缺省补 []', Array.isArray(m37.logs) && m37.logs.length === 0);
  check('lastDay 缺省补 A', m37.settings.lastDay === 'A');
  check('weightStep 缺省补 2.5', m37.settings.weightStep === 2.5);
  const bad37 = { version: 1, program: { A: [], B: [] }, exercises: {},
    settings: { lastDay: 'C', weightStep: 0 }, logs: 'x' };
  const m37b = T.migrate(bad37);
  check('非法 lastDay 被纠正', m37b.settings.lastDay === 'A');
  check('weightStep<=0 被纠正', m37b.settings.weightStep === 2.5);
  check('logs 非数组被纠正', Array.isArray(m37b.logs));

  // 端到端：恢复一个只有 version/program/exercises 的备份，之后 app 仍可用
  T.restoreBackupText(JSON.stringify(bare));
  T.answerConfirm(true);
  await null;
  check('恢复极简备份后状态被补全',
    T.state.settings.lastDay === 'A' && Array.isArray(T.state.logs) && T.state.logs.length === 0);
  T.switchView('today');
  check('恢复后仍能安全渲染', String(document.getElementById('today-view').innerHTML).indexOf('undefined') < 0);

  console.log('== 38. 组进度条：未开始 0%，确认后按完成数前进（二态遗留 v0.9.14 → 细条 v0.9.134）==');
  T.importPlan(planText);   // 37 节把状态换成了空计划的极简备份，先恢复真实计划
  Object.keys(T.draft).forEach(k => delete T.draft[k]);
  T.resetRest(); T.clearTimer();
  T.switchView('today'); T.switchDay('A');
  const it38 = T.getItems('A')[0];
  const pctOf38 = () => Math.round(it38.sets.filter(s => s.done === true).length / it38.sets.length * 100);
  const h38a = T.fullScreenHTML('A');
  check('未开始的卡片进度条为 ' + pctOf38() + '%（没有红色，红色留给破坏性操作）',
    h38a.includes('style="width:' + pctOf38() + '%"') && !/fs-setbar[^>]*--red/.test(h38a));
  T.cycleDone('A', 0, 0);
  const h38b = T.fullScreenHTML('A');
  check('确认一组后进度条前进到 ' + pctOf38() + '%', h38b.includes('style="width:' + pctOf38() + '%"'));
  T.state.sessions = {};
  Object.keys(T.draft).forEach(k => delete T.draft[k]);
  T.resetRest();

  console.log('== 39. 趋势只统计正式组，热身组不进 top/avgRpe/sets/volume（v0.9.15）==');
  const warmLog = { date: '2026-01-01', day: 'A', startedAt: 1, endedAt: 2, durationSec: 1, condition: null, exercises: [{ exerciseId: 'db_bench', note: null, sets: [
    { weight: 20, reps: 10, duration: null, rpe: 3, side: null, restAfter: null, done: true, type: 'warmup' },
    { weight: 60, reps: 10, duration: null, rpe: 8, side: null, restAfter: null, done: true }
  ] }] };
  const tr39 = T.buildTrends([warmLog]);
  check('top 取正式组最重', tr39.db_bench.sessions[0].top.weight === 60);
  check('sets 只数正式组', tr39.db_bench.sessions[0].sets === 1);
  check('avgRpe 不含热身 RPE', tr39.db_bench.sessions[0].avgRpe === 8);
  check('volume 只算正式组', tr39.db_bench.sessions[0].volume === 600);
  const warmOnly = JSON.parse(JSON.stringify(warmLog));
  warmOnly.exercises[0].sets = [warmOnly.exercises[0].sets[0]];
  check('只完成热身组的会话不产生趋势', !T.buildTrends([warmOnly]).db_bench);
  const legacy39 = JSON.parse(JSON.stringify(warmLog));
  legacy39.exercises[0].sets.forEach(s => delete s.type);
  check('旧日志（无 type 字段）按正式组处理', T.buildTrends([legacy39]).db_bench.sessions[0].sets === 2);

  console.log('== 40. 历史详情：热身组标注、重量用动作单位（v0.9.16）==');
  T.state.exercises.test_band = { name: '弹力侧举', muscles: '', mode: 'band', unit: 'lb', tips: '', pitfalls: '', tempo: '', alternatives: '', personal: '' };
  T.state.logs.push({ date: '2026-02-01', day: 'A', startedAt: 900, endedAt: 901, durationSec: 1, condition: null,
    exercises: [{ exerciseId: 'test_band', note: null, sets: [
      { weight: 10, reps: 10, duration: null, rpe: 4, side: null, restAfter: null, done: true, type: 'warmup' },
      { weight: 20, reps: 10, duration: null, rpe: 8, side: null, restAfter: null, done: true, isPR: true }
    ] }] });
  T.switchView('history'); T.render();
  const hh40 = htmlTouchedHTML('hist-list');
  check('热身组标注「热身」', hh40.includes('热身 10lb×10'));
  check('重量用动作单位 lb', hh40.includes('20lb×10'));
  check('PR 组仍有火焰标记', hh40.includes('🔥'));
  T.state.logs.pop(); delete T.state.exercises.test_band;

  console.log('== 41. 设置页：非法步进纠正后写回输入框（v0.9.17）==');
  const wsEl = document.getElementById('weight-step');
  const wsH = handlers.get('weight-step|change');
  check('步进 change 处理已注册', typeof wsH === 'function');
  wsEl.value = '0.2'; wsH({ target: wsEl });
  check('非法步进纠正为 2.5 并写回输入框', T.state.settings.weightStep === 2.5 && String(wsEl.value) === '2.5');
  wsEl.value = 'abc'; wsH({ target: wsEl });
  check('非数字输入纠正为 2.5', T.state.settings.weightStep === 2.5 && String(wsEl.value) === '2.5');
  wsEl.value = '1.5'; wsH({ target: wsEl });
  check('合法步进 1.5 生效', T.state.settings.weightStep === 1.5 && String(wsEl.value) === '1.5');
  T.state.settings.weightStep = 2.5;

  console.log('== 42. lastValues 按模式取最好一组（v0.9.18）==');
  const mk = (name, mode) => ({ name, muscles: '', mode, unit: null, tips: '', pitfalls: '', tempo: '', alternatives: '', personal: '' });
  const tset = o => ({ weight: null, reps: null, duration: null, rpe: null, side: null, restAfter: null, done: true, ...o });
  T.state.exercises.test_plank = mk('平板支撑', 'time');
  T.state.exercises.test_bw = mk('引体向上', 'bodyweight');
  T.state.logs.push({ date: '2026-03-01', day: 'A', startedAt: 1000, endedAt: 1001, durationSec: 1, condition: null, exercises: [
    { exerciseId: 'test_plank', note: null, sets: [tset({ duration: 30 }), tset({ duration: 60 }), tset({ duration: 45 })] },
    { exerciseId: 'test_bw', note: null, sets: [tset({ reps: 10 }), tset({ reps: 15 }), tset({ reps: 12 })] }
  ] });
  check('计时动作取最长时长（不是第一组）', T.lastValues('test_plank').duration === 60);
  check('自重动作取最多次数', T.lastValues('test_bw').reps === 15);
  T.state.logs.pop(); delete T.state.exercises.test_plank; delete T.state.exercises.test_bw;

  console.log('== 43. 已确认组改数字后 PR 徽章重算（v0.9.20）==');
  T.state.exercises.test_pr = mk('测试推举', 'weight');
  T.state.logs.push({ date: '2026-04-01', day: 'A', startedAt: 2222, endedAt: 2223, durationSec: 1, condition: null, exercises: [
    { exerciseId: 'test_pr', note: null, sets: [tset({ weight: 100, reps: 5 })] }
  ] });
  T.state.program.A = [{ section: '', exerciseId: 'test_pr', repsRange: '', sets: [{ type: 'work', weight: 90, reps: 5, duration: null, rpe: null, rpeLabel: '', side: null }] }];
  delete T.state.drafts.A; T.state.sessions.A = null; T.state.ui.curPos.A = 0;
  T.state.settings.lastDay = 'A'; T.curPos = 0;
  clickExList(doneBtn(0, 0));   // 确认 90：低于历史 100，不算 PR
  const prSet = () => T.state.sessions.A.items[0].sets[0];
  check('确认 90 不算 PR', prSet().isPR !== true);
  const chH = handlers.get('ex-list|change');
  const inp43 = makeEl('fs-input-43');
  inp43.dataset = { ex: '0', set: '0', f: 'weight' };
  const fire43 = v => { inp43.value = v; chH({ target: { closest: sel => sel === 'input' ? inp43 : null } }); };
  fire43('105');
  check('确认后改成 105 → PR 点亮', prSet().isPR === true);
  fire43('95');
  check('再改成 95 → PR 熄灭', prSet().isPR === false);
  fire43('100');
  check('等于历史最好 100 → 不算 PR', prSet().isPR !== true);
  fire43('102.5');
  clickExList(btnOf({ act: 'step', ex: '0', set: '0', f: 'weight', dir: '1' }));   // +2.5（section 41 已把步进复位为 2.5）→ 105
  check('±步进把已确认组加到 105 → PR 点亮', prSet().isPR === true && prSet().weight === 105);
  T.state.logs.pop(); delete T.state.exercises.test_pr;

  console.log('== 44. 用户手势解锁 AudioContext（v0.9.21）==');
  let created44 = null;
  global.window.AudioContext = function(){
    created44 = this;
    this.state = 'suspended';
    this.resume = () => { this.state = 'running'; };
    this.createOscillator = () => { throw new Error('stub'); };
    this.destination = {};
  };
  T.beep._ctx = null;
  clickExList(navBtn({ act: 'next' }));
  check('点击训练卡片按钮时创建并恢复 AudioContext', !!created44 && created44.state === 'running');
  clickExList(navBtn({ act: 'prev' }));
  check('重复点击不重复创建', T.beep._ctx === created44);
  T.beep._ctx = null;
  global.window.AudioContext = null;

  console.log('== 45. 步进按钮 aria-label 与实际单位一致（v0.9.22）==');
  T.state.exercises.test_pr = { name: '测试卧推', muscles: '', mode: 'weight', unit: 'lb', tips: '', pitfalls: '', tempo: '', alternatives: '', personal: '' };
  T.state.sessions.A = null; delete T.state.drafts.A; T.curPos = 0;
  const card45 = T.fullScreenHTML('A');
  check('lb 动作的 ± 按钮读屏文案用 lb', card45.includes('aria-label="重量增加 2.5 lb"') && card45.includes('aria-label="重量减少 2.5 lb"'));
  check('读屏文案不再硬编码 kg', !card45.includes('重量增加 2.5 kg'));

  console.log('== 46. PR 状态翻转时卡片必须重画（🔥 徽章不残留，v0.9.23）==');
  T.state.exercises.test_pr = mk('测试推举', 'weight');
  T.state.logs.push({ date: '2026-04-01', day: 'A', startedAt: 2222, endedAt: 2223, durationSec: 1, condition: null, exercises: [
    { exerciseId: 'test_pr', note: null, sets: [tset({ weight: 100, reps: 5 })] }
  ] });
  T.state.program.A = [{ section: '', exerciseId: 'test_pr', repsRange: '', sets: [{ type: 'work', weight: 90, reps: 5, duration: null, rpe: null, rpeLabel: '', side: null }] }];
  delete T.state.drafts.A; T.state.sessions.A = null; T.state.ui.curPos.A = 0;
  T.state.settings.lastDay = 'A'; T.curPos = 0;
  clickExList(doneBtn(0, 0));   // 确认 90：不是 PR，卡片上也不该有徽章
  check('确认 90：数据与卡片都无 PR', prSet().isPR !== true && !String(htmlTouchedHTML('ex-list')).includes('pr-badge'));
  const inp46 = makeEl('fs-input-46');
  inp46.dataset = { ex: '0', set: '0', f: 'weight' };
  const fire46 = v => { inp46.value = v; handlers.get('ex-list|change')({ target: { closest: sel => sel === 'input' ? inp46 : null } }); };
  fire46('105');
  check('改成 105：徽章出现在重画后的卡片里', prSet().isPR === true && String(htmlTouchedHTML('ex-list')).includes('pr-badge'));
  fire46('95');
  check('改回 95：徽章从卡片上消失', prSet().isPR === false && !String(htmlTouchedHTML('ex-list')).includes('pr-badge'));
  fire46('102.5');
  clickExList(btnOf({ act: 'step', ex: '0', set: '0', f: 'weight', dir: '1' }));   // +2.5 → 105，PR 点亮
  check('±步进点亮徽章', prSet().isPR === true && String(htmlTouchedHTML('ex-list')).includes('pr-badge'));
  clickExList(btnOf({ act: 'step', ex: '0', set: '0', f: 'weight', dir: '-1' }));  // -2.5 → 102.5，仍是 PR
  check('仍破纪录时徽章保留', prSet().isPR === true && String(htmlTouchedHTML('ex-list')).includes('pr-badge'));
  clickExList(btnOf({ act: 'step', ex: '0', set: '0', f: 'weight', dir: '-1' }));  // -2.5 → 100，等于历史最好，熄灭
  check('步进到等于历史最好：徽章熄灭', prSet().isPR === false && !String(htmlTouchedHTML('ex-list')).includes('pr-badge'));
  T.state.logs.pop(); delete T.state.exercises.test_pr;

  console.log('== 47. 趋势图标题单位跟随动作实际单位（v0.9.24）==');
  const lbLog = (d, id, w) => ({ date: d, day: 'A', startedAt: 1, endedAt: 2, durationSec: 1, condition: null, exercises: [
    { exerciseId: id, note: null, sets: [tset({ weight: w, reps: 5 })] }
  ] });
  T.state.exercises.test_lb1 = { ...mk('测试推举甲', 'weight'), unit: 'lb' };
  T.state.exercises.test_lb2 = { ...mk('测试推举乙', 'weight'), unit: 'lb' };
  const lbCharts = T.buildTrendCharts(T.buildTrends([
    lbLog('2026-01-01', 'test_lb1', 100), lbLog('2026-01-05', 'test_lb1', 110),
    lbLog('2026-01-02', 'test_lb2', 50), lbLog('2026-01-06', 'test_lb2', 55)
  ]), 5);
  check('全 lb 动作组标题写 lb 不写 kg', lbCharts.includes('重量（lb）') && !lbCharts.includes('重量（kg）'));
  check('全 lb 组不换算：图例仍是 110 lb', lbCharts.includes('110 lb'));
  T.state.exercises.test_kg1 = { ...mk('测试推举丙', 'weight'), unit: 'kg' };
  const mixCharts = T.buildTrendCharts(T.buildTrends([
    lbLog('2026-01-01', 'test_lb1', 100), lbLog('2026-01-05', 'test_lb1', 110),
    lbLog('2026-01-02', 'test_kg1', 80), lbLog('2026-01-06', 'test_kg1', 85)
  ]), 5);
  check('单位混用时全部换算成 kg 上同一条轴（v0.9.46）',
    mixCharts.includes('重量（kg）') && mixCharts.includes('49.9 kg') && !mixCharts.includes('110 lb'));
  delete T.state.exercises.test_lb1; delete T.state.exercises.test_lb2; delete T.state.exercises.test_kg1;

  console.log('== 48. 训练小结显示破 PR 组数（v0.9.25）==');
  const entry48 = { day: 'A', startedAt: 1, durationSec: 600, condition: null, exercises: [
    { exerciseId: 'test_pr', note: null, sets: [
      { weight: 105, reps: 5, done: true, isPR: true },
      { weight: 90, reps: 5, done: true },
      { weight: 60, reps: 5, done: true, type: 'warmup' }
    ] }
  ] };
  T.showSummary(entry48);
  const sumHtml = String(elsById.get('summary-body').innerHTML);
  check('小结列出破 PR 组数', /破 PR <b>1<\/b>/.test(sumHtml));
  const entry48b = { day: 'A', startedAt: 1, durationSec: 600, condition: null, exercises: [
    { exerciseId: 'test_pr', note: null, sets: [{ weight: 90, reps: 5, done: true }] }
  ] };
  T.showSummary(entry48b);
  check('没有 PR 时不显示该行（旧日志同样不显示）', !/破 PR/.test(String(elsById.get('summary-body').innerHTML)));
  T.closeSummary();

  console.log('== 49. 文案不谎称单位/指标（v0.9.26）==');
  T.state.exercises.test_hint = { ...mk('测试提示动作', 'weight') };
  T.state.logs.push({ date: '2026-02-01', day: 'A', startedAt: 1, endedAt: 2, durationSec: 1, condition: null, exercises: [
    { exerciseId: 'test_hint', note: null, sets: [tset({ weight: null, reps: 8 })] }
  ] });
  T.state.program.A = [{ exerciseId: 'test_hint', sets: [{ targetReps: 8 }] }];
  delete T.state.drafts.A; delete T.state.sessions.A;
  T.switchView('today'); T.curPos = 0; T.render();
  const hint49 = String(htmlTouchedHTML('ex-list'));
  check('历史只有次数时提示「上次做过 ×8」而不是「上次最重」', hint49.includes('上次做过 ×8') && !hint49.includes('上次最重 ×8'));
  handlers.get('weight-step|change')({ target: { value: '0.2' } });
  // 提示文案走两个通道：无待撤销时是 textContent；有（测试残留的）待撤销时保留撤销按钮、文案进 innerHTML（v0.9.78）
  const toast49 = String(elsById.get('toast').textContent) + String(htmlTouchedHTML('toast') || '');
  check('步进提示不写死 kg 单位', toast49.includes('重量步进：2.5') && !toast49.includes('重量步进：2.5kg'));
  check('设置页标签不再声称步进是 kg', !html.includes('重量步进（kg）'));
  T.state.logs.pop(); delete T.state.exercises.test_hint;

  console.log('== 50. 卡片不渲染源码注释（v0.9.27）==');
  T.switchView('today'); T.render();
  const card50 = String(htmlTouchedHTML('ex-list'));
  check('卡片里有正常的组进度条结构', card50.includes('fs-setbar'));
  check('写在模板字符串里的 // 注释不再原样显示在卡片上', !card50.includes('二态模型') && !/\/\/\s/.test(card50));

  console.log('== 51. 可输入控件 ≥16px（iOS 聚焦不放大页面，v0.9.28）==');
  const css51 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
  const rule16 = sel => new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*font-size:1[6-9]px').test(css51);
  check('卡片备注输入框 16px', rule16('.fs-exnote'));
  check('设置页数字输入 16px', rule16('.set-row2 input'));
  check('个人背景文本域 16px', rule16('.wide-area'));
  check('导入文本框 16px', rule16('#import-text'));

  console.log('== 52. 整段粘贴 AI 两段式回复也能导入（v0.9.29）==');
  const plan52 = { exercises: { test52: { name: '测试动作52', mode: 'weight' } },
    program: { A: [{ exerciseId: 'test52', sets: [{ weight: 20, reps: 8 }] }] } };
  const json52 = JSON.stringify(plan52);
  const twoPart = '好的，我分析了你的数据。建议把测试动作52保留，重量维持。\n\n```json\n' + json52 + '\n```\n\n以上，注意热身。';
  const r52a = T.importPlan(twoPart);
  check('中文总结+代码块整段粘贴可导入', r52a.ok === true && (T.state.program.A[0] || {}).exerciseId === 'test52');
  const r52b = T.importPlan('方案如下：' + json52 + ' （无代码块）');
  check('无代码块时取首个{到末个}的跨度', r52b.ok === true);
  const r52c = T.importPlan('抱歉，我没法给出方案。');
  check('确实没有 JSON 时仍报解析失败', r52c.ok === false && /JSON 解析失败/.test(r52c.error));
  const multi = '先给个示例：\n```json\n{"exercises":{},"program":{"A":[]}}\n```\n最终方案：\n```json\n' + json52 + '\n```';
  const r52d = T.importPlan(multi);
  check('多个代码块取最后一个（最终方案）', r52d.ok === true && (T.state.program.A[0] || {}).exerciseId === 'test52');

  console.log('== 53. 历史详情标注单侧动作的左/右（v0.9.30）==');
  T.state.exercises.test53 = { ...mk('测试单侧', 'weight'), unit: 'kg' };
  const sideLog = { date: '2026-02-01', day: 'B', startedAt: 91, endedAt: 92, durationSec: 1, condition: null, exercises: [
    { exerciseId: 'test53', note: null, sets: [
      tset({ weight: 10, reps: 10, side: 'L' }),
      tset({ weight: 10, reps: 10, side: 'R' })
    ] }
  ] };
  const logsBak53 = T.state.logs;
  T.state.logs = [sideLog];
  T.switchView('history'); T.render();
  const hist53 = htmlTouchedHTML('hist-list');
  check('历史详情里 L/R 两组分别标左右侧', hist53.includes('左侧 10kg×10') && hist53.includes('右侧 10kg×10'));
  T.state.logs = logsBak53;
  delete T.state.exercises.test53;

  console.log('== 54. 单侧动作「加一组」沿用左/右（v0.9.31）==');
  T.state.exercises.test54 = mk('测试单侧54', 'bodyweight');
  T.state.program.A = [{ exerciseId: 'test54', sets: [{ type: 'work', weight: null, reps: 10, duration: null, rpe: 8, side: 'R' }] }];
  delete T.state.drafts.A; delete T.state.sessions.A; delete T.state.sessions.B;
  T.switchView('today'); T.curPos = 0; T.render();
  clickExList(btnOf({ act: 'addset', ex: 0 }));
  const sets54 = T.state.drafts.A[0].sets;
  check('补的组继承最后一组的 side=R', sets54.length === 2 && sets54[1].side === 'R');
  check('补的组卡片上带右侧标记', htmlTouchedHTML('ex-list').includes('右侧'));

  console.log('== 55. 卡片显示计划段落名（v0.9.32）==');
  T.state.program.A[0].section = '2. 主课力量';
  delete T.state.drafts.A;
  const cardSec = T.fullScreenHTML('A');
  check('卡片带段落名', cardSec.includes('fs-section') && cardSec.includes('2. 主课力量'));
  T.state.program.A[0].section = '';
  delete T.state.drafts.A;
  check('无段落名时不渲染该元素', !T.fullScreenHTML('A').includes('fs-section'));

  console.log('== 56. prompt 数据说明解释 restAfter（v0.9.33）==');
  const prompt56 = T.buildPrompt(T.buildExport(5));
  check('说明含 restAfter 含义', prompt56.includes('restAfter 是该组之后实际休息的秒数'));

  console.log('== 57. 导入计划会说明丢弃了未确认草稿（v0.9.34）==');
  const plan57 = { exercises: { test57: { name: '测试动作57', mode: 'weight' } },
    program: { A: [{ exerciseId: 'test57', sets: [{ weight: 20, reps: 8 }] }] } };
  // 生产里 getItems 写的 drafts[day] 就是 items 数组本身（见 section 54 的 drafts.A[0]），
  // 不是 {items:[...]} 包装对象——fixture 必须用真实形状，否则测的是不存在的代码。
  T.state.drafts.A = [{ exerciseId: 'test57', note: '', sets: [{ weight: 99, reps: 5, done: false }] }];
  const r57a = T.importPlan(JSON.stringify(plan57));
  check('只有预填数值的草稿不提丢弃', r57a.ok === true && !/已丢弃/.test(r57a.summary));
  T.state.drafts.A = [{ exerciseId: 'test57', note: '左肩不适', sets: [{ weight: 20, reps: 8, done: false }] }];
  const r57b = T.importPlan(JSON.stringify(plan57));
  check('有备注的草稿会说明已丢弃', r57b.ok === true && /已丢弃未确认草稿/.test(r57b.summary));

  console.log('== 58. 聚合容量把 lb 换算成 kg（v0.9.35）==');
  T.state.exercises.test58kg = { name: '测试58kg', mode: 'weight', unit: 'kg' };
  T.state.exercises.test58lb = { name: '测试58lb', mode: 'band', unit: 'lb' };
  const entry58 = { exercises: [
    { exerciseId: 'test58kg', sets: [{ weight: 20, reps: 10, done: true }] },
    { exerciseId: 'test58lb', sets: [{ weight: 20, reps: 10, done: true }] },
    { exerciseId: 'test58gone', sets: [{ weight: 5, reps: 2, done: true }] } ] };
  const vol58 = T.sessionVolume(entry58);
  const want58 = 20 * 10 + 20 * 0.45359237 * 10 + 5 * 2;
  check('lb 组按 0.4536 换算后累加', Math.abs(vol58 - want58) < 1e-6);
  check('动作库缺失时按 kg 不换算', T.sessionVolume({ exercises: entry58.exercises.slice(0, 1) }) === 200);
  delete T.state.exercises.test58kg; delete T.state.exercises.test58lb;

  console.log('== 59. 小结显示组间平均休息（v0.9.36）==');
  const entry59 = { day: 'A', startedAt: 1, durationSec: 600, condition: null, exercises: [
    { exerciseId: 'test_pr', note: null, sets: [
      { weight: 60, reps: 5, done: true, restAfter: 60 },
      { weight: 60, reps: 5, done: true, restAfter: 90 },
      { weight: 60, reps: 5, done: true, restAfter: 0 },
      { weight: 60, reps: 5, done: true, restAfter: null }
    ] }
  ] };
  check('restAfter 均值（含 0，忽略 null）', T.sessionAvgRest(entry59) === 50);
  T.showSummary(entry59);
  const sum59 = String(elsById.get('summary-body').innerHTML);
  check('小结显示平均休息 0:50', /平均休息 <b>0:50<\/b>/.test(sum59));
  T.closeSummary();
  const entry59b = { day: 'A', startedAt: 1, durationSec: 600, condition: null, exercises: [
    { exerciseId: 'test_pr', note: null, sets: [{ weight: 60, reps: 5, done: true }] }
  ] };
  check('没有任何休息记录时返回 null', T.sessionAvgRest(entry59b) === null);
  T.showSummary(entry59b);
  check('无记录时小结不显示该行（旧日志同样不显示）', !/平均休息/.test(String(elsById.get('summary-body').innerHTML)));
  T.closeSummary();

  console.log('== 60. 放弃记录可在 6 秒内撤销（v0.9.38）==');
  T.switchDay('A');
  delete T.state.drafts.A;
  const it60 = T.getItems('A');
  it60[0].sets[0] = { done: true, weight: 30, reps: 8, duration: null, rpe: 8, type: 'work' };
  T.state.sessions.A = { startedAt: 1700000900000, items: it60, condition: '差' };
  T.discardSession();
  T.answerConfirm(true);
  await null;
  check('放弃后记录清空', T.state.sessions.A === null);
  check('提示条给出「撤销」按钮', /data-act="undo"/.test(htmlTouchedHTML('toast')));
  clickEl('toast', btnOf({ act: 'undo' }));
  check('撤销把记录放回编辑态（含数值与当日状态）',
    !!T.state.sessions.A && T.state.sessions.A.items[0].sets[0].weight === 30 && T.state.sessions.A.condition === '差');
  // 撤销时已经另开了新记录：不能覆盖
  T.discardSession();
  T.answerConfirm(true);
  await null;
  const fresh60 = { startedAt: 1700000900001, items: T.getItems('A'), condition: null };
  T.state.sessions.A = fresh60;
  clickEl('toast', btnOf({ act: 'undo' }));
  check('已有新记录时撤销只提示，不覆盖',
    T.state.sessions.A === fresh60 && T.state.sessions.A.startedAt === 1700000900001);
  T.state.sessions.A = null;

  console.log('== 61. 误加的未确认组可以删掉（带撤销）（v0.9.39）==');
  T.switchDay('A');
  delete T.state.drafts.A; delete T.state.sessions.A;
  T.curPos = 0; T.render();
  check('只有一组时不出现删除按钮', !/data-act="delset"/.test(htmlTouchedHTML('ex-list')));
  clickExList(btnOf({ act: 'addset', ex: 0 }));
  check('加一组后出现删除按钮', /data-act="delset"/.test(htmlTouchedHTML('ex-list')) && T.state.drafts.A[0].sets.length === 2);
  T.startTimer(0, 1);
  clickExList(btnOf({ act: 'delset', ex: 0 }));
  check('删组同时清掉挂在被删组上的秒表', T.state.drafts.A[0].sets.length === 1 && T.timerFor === null);
  check('提示条给出「撤销」按钮', /data-act="undo"/.test(htmlTouchedHTML('toast')));
  clickEl('toast', btnOf({ act: 'undo' }));
  check('撤销把组放回', T.state.drafts.A[0].sets.length === 2);
  clickExList(doneBtn(0, 1));
  check('已确认的最后一组不出现删除按钮', !/data-act="delset"/.test(htmlTouchedHTML('ex-list')));

  console.log('== 62. 历史里的旧记录可以「改一下」，按原日期写回（v0.9.40）==');
  // section 61 确认过组：这一日还挂着进行中记录，先清掉（改一下的守卫会拒绝它）
  delete T.state.sessions.A; delete T.state.drafts.A;
  const oldStarted = 1700000000000;
  const oldLog = { date: '2023-11-15', day: 'A', startedAt: oldStarted, endedAt: oldStarted + 600000, durationSec: 600, condition: null,
    exercises: [{ exerciseId: 'test_pr', note: null, sets: [{ weight: 50, reps: 5, done: true }] }] };
  const newerLog = { date: '2023-11-20', day: 'A', startedAt: oldStarted + 999999, endedAt: oldStarted + 999999, durationSec: 1, condition: null,
    exercises: [{ exerciseId: 'test_pr', note: null, sets: [{ weight: 51, reps: 5, done: true }] }] };
  T.state.logs.push(oldLog, newerLog);
  T.switchView('history'); T.render();
  check('历史详情有「改一下」按钮', /data-act="reeditlog"/.test(htmlTouchedHTML('hist-list')));
  const eb62 = btnOf({ act: 'reeditlog', ts: String(oldStarted), i: '1' });
  clickEl('hist-list', eb62);
  check('旧记录进入编辑态（时间戳存进 keepMeta）',
    T.state.logs.indexOf(oldLog) === -1 && !!T.state.sessions.A && T.state.sessions.A.keepMeta.date === '2023-11-15');
  check('编辑态带着原数值', T.state.sessions.A.items[0].sets[0].weight === 50);
  T.state.sessions.A.items[0].sets[0].weight = 55;
  T.endSession();
  T.closeSummary();
  const back62 = T.state.logs.find(l => l.startedAt === oldStarted);
  check('按原日期写回（日期/时长不变，数值已改）',
    !!back62 && back62.date === '2023-11-15' && back62.durationSec === 600 && back62.exercises[0].sets[0].weight === 55);
  check('按时间顺序插回原位（在新记录之前）', T.state.logs.indexOf(back62) < T.state.logs.indexOf(newerLog));
  T.state.logs = T.state.logs.filter(l => l !== back62 && l !== newerLog);
  delete T.state.sessions.A; delete T.state.drafts.A;

  console.log('== 63. 放弃「改一下」的编辑时，原记录原样放回（v0.9.41）==');
  const ts63 = 1700000111000;
  const log63 = { date: '2023-11-16', day: 'A', startedAt: ts63, endedAt: ts63 + 1000, durationSec: 1, condition: null,
    exercises: [{ exerciseId: 'test_pr', note: null, sets: [{ weight: 70, reps: 5, done: true }] }] };
  T.state.logs.push(log63);
  T.switchView('history'); T.render();
  clickEl('hist-list', btnOf({ act: 'reeditlog', ts: String(ts63), i: '0' }));
  check('进入编辑态（日志里暂摘）', !!T.state.sessions.A && T.state.logs.indexOf(log63) === -1);
  T.discardSession(); T.answerConfirm(true); await null;
  check('放弃编辑后原记录原样放回', T.state.logs.indexOf(log63) !== -1 && T.state.logs[0].exercises[0].sets[0].weight === 70);
  clickEl('toast', btnOf({ act: 'undo' }));
  check('6 秒内撤销仍回到编辑态', !!T.state.sessions.A && T.state.sessions.A.items[0].sets[0].weight === 70);
  T.state.sessions.A.items[0].sets[0].weight = 60;
  T.endSession(); T.closeSummary();
  const same63 = T.state.logs.filter(l => l.startedAt === ts63);
  check('再结束不重复写两条（原条目被替换）', same63.length === 1 && same63[0].exercises[0].sets[0].weight === 60);
  T.state.sessions.A = { startedAt: Date.now(), items: [{ exerciseId: 'test_pr', note: '', sets: [{ weight: 1, reps: 1, done: true }] }], condition: null };
  const before63 = T.state.logs.length;
  T.discardSession(); T.answerConfirm(true); await null;
  check('普通记录的放弃不会往日志里塞东西', T.state.logs.length === before63);
  T.state.logs = T.state.logs.filter(l => l.startedAt !== ts63);
  delete T.state.sessions.A; delete T.state.drafts.A;

  console.log('== 64. 实时进度头部容量与小结同口径（lb 换算，v0.9.42）==');
  T.state.exercises.test64lb = { name: '测试绳64', mode: 'band', unit: 'lb' };
  T.state.exercises.test64kg = { name: '测试哑铃64', mode: 'weight', unit: 'kg' };
  const items64 = [
    { exerciseId: 'test64lb', note: '', sets: [{ weight: 20, reps: 10, done: true }] },
    { exerciseId: 'test64kg', note: '', sets: [{ weight: 100, reps: 5, done: true }] }
  ];
  const expected64 = 100 * 5 + 20 * 0.45359237 * 10;
  check('itemsVolume 换算 lb→kg', Math.abs(T.itemsVolume(items64) - expected64) < 1e-6);
  check('sessionVolume 与 itemsVolume 同结果', Math.abs(T.sessionVolume({ exercises: items64 }) - T.itemsVolume(items64)) < 1e-9);
  T.state.sessions.A = { startedAt: Date.now(), items: items64, condition: null };
  T.switchView('today'); T.render();
  const statusHtml = elsById.get('session-status').innerHTML;
  check('头部显示换算后的容量 591kg', statusHtml.includes('591kg'));
  check('头部不再显示未换算的 700kg', !statusHtml.includes('700kg'));
  delete T.state.sessions.A; delete T.state.drafts.A;
  delete T.state.exercises.test64lb; delete T.state.exercises.test64kg;

  console.log('== 65. 放弃小结「改一下」的编辑时，原记录原样放回（v0.9.43）==');
  const ts65 = 1700000222000;
  T.state.sessions.A = { startedAt: ts65, items: [{ exerciseId: 'test_pr', note: '', sets: [{ weight: 80, reps: 5, done: true }] }], condition: null };
  T.endSession();
  const log65 = T.state.logs.find(l => l.startedAt === ts65);
  check('先正常写出一条记录', !!log65 && log65.exercises[0].sets[0].weight === 80);
  T.reeditSession();
  check('小结改一下：日志摘除、进入编辑态', T.state.logs.indexOf(log65) === -1 && !!T.state.sessions.A);
  T.discardSession(); T.answerConfirm(true); await null;
  check('放弃编辑后原记录原样放回', T.state.logs.indexOf(log65) !== -1 && log65.exercises[0].sets[0].weight === 80);
  clickEl('toast', btnOf({ act: 'undo' }));
  check('撤销仍回到编辑态', !!T.state.sessions.A);
  T.state.sessions.A.items[0].sets[0].weight = 75;
  T.endSession(); T.closeSummary();
  const same65 = T.state.logs.filter(l => l.startedAt === ts65);
  check('再结束只留一条且是新值（原条目被替换）', same65.length === 1 && same65[0].exercises[0].sets[0].weight === 75);
  T.state.logs = T.state.logs.filter(l => l.startedAt !== ts65);
  delete T.state.sessions.A; delete T.state.drafts.A;

  console.log('== 66. 小结「改一下」不膨胀日期与用时（v0.9.44）==');
  const ts66 = Date.now() - 1234000;
  T.state.sessions.A = { startedAt: ts66, items: [{ exerciseId: 'test_pr', note: '', sets: [{ weight: 50, reps: 5, done: true }] }], condition: null };
  T.endSession();
  const log66 = T.state.logs.find(l => l.startedAt === ts66);
  check('首次结束：用时如实', !!log66 && log66.durationSec >= 1233 && log66.durationSec <= 1235);
  const realNow66 = Date.now;
  Date.now = () => realNow66.call(Date) + 30000;   // 模拟用户多想 30 秒（stub 的 setTimeout 不会真的到点）
  T.reeditSession();
  T.state.sessions.A.items[0].sets[0].weight = 55;
  T.endSession(); T.closeSummary();
  Date.now = realNow66;
  const same66 = T.state.logs.filter(l => l.startedAt === ts66);
  check('再结束：endedAt/durationSec 沿用原值', same66.length === 1 && same66[0].endedAt === log66.endedAt && same66[0].durationSec === log66.durationSec);
  check('数值改动仍然生效', same66[0].exercises[0].sets[0].weight === 55);
  T.state.logs = T.state.logs.filter(l => l.startedAt !== ts66);
  delete T.state.sessions.A; delete T.state.drafts.A;

  console.log('== 67. 「改一下」旧记录结束时不清掉当日草稿（v0.9.45）==');
  const ts67 = 1700000333000;
  const log67 = { date: '2023-11-14', day: 'A', startedAt: ts67, endedAt: ts67 + 60000, durationSec: 60, condition: null,
    exercises: [{ exerciseId: 'test_pr', note: null, sets: [{ weight: 40, reps: 5, done: true }] }] };
  T.state.logs.push(log67);
  // 草稿必须与当前计划的动作 id 对齐（v0.9.98 起换动作会重建草稿），fixture 自带计划
  T.state.program.A = [{ section: '', exerciseId: 'test_pr', repsRange: '', sets: [{ type: 'work', weight: null, reps: null, duration: null, rpe: null, rpeLabel: '', side: null }] }];
  T.state.drafts.A = [{ exerciseId: 'test_pr', note: '今天肩膀有点响', sets: [{ weight: null, reps: null, done: false }] }];
  T.switchView('history'); T.render();
  clickEl('hist-list', btnOf({ act: 'reeditlog', ts: String(ts67), i: '0' }));
  check('进入旧记录编辑态', !!T.state.sessions.A && T.state.sessions.A.keepMeta && T.state.sessions.A.keepMeta.startedAt === ts67);
  T.endSession(); T.closeSummary();
  const back67 = T.state.logs.find(l => l.startedAt === ts67);
  check('旧记录按原时间戳写回', !!back67);
  check('当日草稿原样保留', Array.isArray(T.state.drafts.A) && T.state.drafts.A[0].note === '今天肩膀有点响');
  // 普通结束仍会清掉升格后的草稿
  T.state.drafts.A = [{ exerciseId: 'test_pr', note: '普通流程', sets: [{ weight: 20, reps: 5, done: true }] }];
  const n67 = T.state.logs.length;
  T.startSessionIfNeeded('A');
  T.endSession(); T.closeSummary();
  // 普通结束：那份草稿已升格进记录；render 会按当前计划重新预填一份新草稿（既有设计）
  check('普通结束不留旧草稿（只剩按计划重新预填的）', !T.state.drafts.A || T.state.drafts.A.every(it => it.note !== '普通流程'));
  T.state.logs.splice(n67);   // 移除这次普通结束写出的当日日志
  T.state.logs = T.state.logs.filter(l => l.startedAt !== ts67);
  delete T.state.sessions.A; delete T.state.drafts.A;

  console.log('== 68. 数字输入被纠正后写回输入框（v0.9.47）==');
  T.state.exercises.test47 = { ...mk('测试深蹲47', 'weight'), unit: 'kg' };
  T.state.program.A = [{ section: '', exerciseId: 'test47', repsRange: '', sets: [{ type: 'work', weight: 50, reps: 5, duration: null, rpe: null, rpeLabel: '', side: null }] }];
  delete T.state.drafts.A; delete T.state.sessions.A; T.state.settings.lastDay = 'A'; T.curPos = 0;
  const inp47 = makeEl('fs-input-47');
  inp47.dataset = { ex: '0', set: '0', f: 'weight' };
  const fire47 = v => { inp47.value = v; handlers.get('ex-list|change')({ target: { closest: sel => sel === 'input' ? inp47 : null } }); };
  const s47 = () => T.getItems('A')[0].sets[0];
  fire47('abc');
  check('乱字符：数据记 null，输入框不再显示乱字符', s47().weight === null && inp47.value === '');
  fire47('62.499');
  check('超精度：写回纠正后的值', s47().weight === 62.5 && String(inp47.value) === '62.5');
  fire47('-3');
  check('负数：纠正为 0 并写回', s47().weight === 0 && String(inp47.value) === '0');
  fire47('70');
  check('正常输入不被多改', s47().weight === 70 && String(inp47.value) === '70');
  inp47.dataset.f = 'reps';
  fire47('x2');
  check('次数字段同样清空乱字符', s47().reps === null && inp47.value === '');
  delete T.state.exercises.test47; delete T.state.drafts.A; delete T.state.sessions.A;

  console.log('== 69. 撤销删除按时间戳有序插回（v0.9.48）==');
  const lA = { date: '2023-11-15', day: 'A', startedAt: 1700000400000, endedAt: 1700000460000, durationSec: 60, condition: null, exercises: [] };
  const lB = { date: '2023-11-16', day: 'A', startedAt: 1700000500000, endedAt: 1700000560000, durationSec: 60, condition: null, exercises: [] };
  T.state.logs.push(lA, lB);
  T.switchView('history'); T.render();
  clickEl('hist-list', btnOf({ act: 'dellog', ts: String(lA.startedAt), i: '0' }));
  T.answerConfirm(true);
  await null;
  check('已删除最早的一条', T.state.logs.length === 1 && T.state.logs[0] === lB);
  // 撤销窗口内又结束了一次新训练（时间戳在中间）：正常结束走有序插入，列表保持时间序
  const lC = { date: '2023-11-15', day: 'A', startedAt: 1700000450000, endedAt: 1700000510000, durationSec: 60, condition: null, exercises: [] };
  T.state.logs.splice(0, 0, lC);   // lC 比剩下的 lB 早：有序插入会排在 lB 前
  clickEl('toast', btnOf({ act: 'undo' }));
  check('撤销后三条都在', T.state.logs.length === 3);
  check('放回的不是塞回旧下标，而是按时间戳排在中间',
    T.state.logs[0] === lA && T.state.logs[1] === lC && T.state.logs[2] === lB);
  T.state.logs = T.state.logs.filter(l => l !== lA && l !== lB && l !== lC);

  console.log('== 70. migrate 剔除备份里的坏日志条目（v0.9.49）==');
  const bare70 = { version: 1, program: JSON.parse(JSON.stringify(T.state.program)), exercises: JSON.parse(JSON.stringify(T.state.exercises)),
    settings: JSON.parse(JSON.stringify(T.state.settings)), sessions: { A: null, B: null },
    logs: [null, 'oops', 42, { date: '2023-11-15', day: 'A', startedAt: 1700000600000, exercises: [] },
      { date: '2023-11-15', day: 'A', startedAt: 1700000600000 }] };   // 最后一条缺 exercises
  const m70 = T.migrate(bare70);
  check('坏条目（null/字符串/数字/缺 exercises）被剔除，完整记录保留',
    m70.logs.length === 1 && m70.logs[0].startedAt === 1700000600000);
  const m70b = T.migrate({ version: 1, program: bare70.program, exercises: bare70.exercises, logs: null });
  check('logs 不是数组时补空数组', Array.isArray(m70b.logs) && m70b.logs.length === 0);

  console.log('== 71. 趋势图只画与当前类型同指标的会话（v0.9.50）==');
  const sess71 = (id, top, ts) => ({ date: '2023-11-0' + (ts % 9), day: 'A', startedAt: 1700000000000 + ts,
    exercises: [{ exerciseId: id, sets: [{ weight: top.weight ?? null, reps: top.reps ?? null, duration: top.duration ?? null, done: true }] }] });
  const mixed71 = [
    sess71('test48', { duration: 30 }, 710001), sess71('test48', { duration: 45 }, 710002),
    sess71('test48', { weight: 20, reps: 8 }, 710003),                    // 最近一次是重量 → 当前类型 weight
    sess71('test49', { weight: 50, reps: 8 }, 710004), sess71('test49', { weight: 60, reps: 8 }, 710005)
  ];
  const tr71 = T.buildTrends(mixed71);
  check('导出趋势仍含全部历史（不受图表过滤影响）', tr71.test48.sessions.length === 3);
  const ch71 = T.buildTrendCharts(tr71, 5);
  check('改过类型的动作不再进重量图（30/45 秒不会被画成 kg）', ch71.includes('test49') && !ch71.includes('test48'));
  check('没有同类型的旧记录时也不凭空生成时长图', !ch71.includes('时长（秒）'));

  console.log('== 72. 手工编辑的日志缺 date/durationSec 不显示 NaN（v0.9.51）==');
  const n72 = T.state.logs.length;
  T.state.logs.push({ day: 'A', startedAt: 1700000800000,
    exercises: [{ exerciseId: 'goblet_squat', sets: [{ weight: 20, reps: 5, done: true }] }] });
  T.switchView('history'); T.render();
  const hist72 = htmlTouchedHTML('hist-list');
  check('缺 date 显示「未知日期」而不是 undefined 周NaN', hist72.includes('未知日期') && !/undefined 周NaN/.test(hist72));
  check('缺 durationSec 显示破折号而不是 NaN:NaN:NaN', hist72.includes(' · —') && !/NaN:NaN/.test(hist72));
  T.state.logs.splice(n72);

  console.log('== 73. migrate 纠正字符串形 profile（v0.9.52）==');
  const bare73 = { version: 1, program: T.state.program, exercises: T.state.exercises };
  const m73a = T.migrate({ ...bare73, profile: '直接在备份里写的背景' });
  check('字符串 profile 保住内容并纠正成对象', m73a.profile && m73a.profile.background === '直接在备份里写的背景');
  const m73b = T.migrate({ ...bare73, profile: null });
  check('缺失 profile 补默认空背景', m73b.profile && m73b.profile.background === '');

  console.log('== 74. 放弃「改一下」的旧记录不清当日草稿（v0.9.53）==');
  const ts74 = 1700000740000;
  const log74 = { date: '2023-11-14', day: 'A', startedAt: ts74, endedAt: ts74 + 60000, durationSec: 60, condition: null,
    exercises: [{ exerciseId: 'test_pr', note: null, sets: [{ weight: 40, reps: 5, done: true }] }] };
  T.state.sessions.A = null;
  T.state.logs.push(log74);
  T.state.drafts.A = [{ exerciseId: 'test47', note: '今天的笔记74', sets: [{ weight: null, reps: null, done: false }] }];
  T.switchView('history'); T.render();
  clickEl('hist-list', btnOf({ act: 'reeditlog', ts: String(ts74), i: '0' }));
  check('进入旧记录编辑态', !!T.state.sessions.A && T.state.sessions.A.originalEntry === log74);
  T.discardSession(); T.answerConfirm(true); await null;
  check('放弃后原记录放回日志', T.state.logs.includes(log74));
  check('放弃旧记录不动当日草稿', Array.isArray(T.state.drafts.A) && T.state.drafts.A[0].note === '今天的笔记74');
  clickEl('toast', btnOf({ act: 'undo' }));
  check('撤销回到旧记录编辑态', !!T.state.sessions.A && T.state.sessions.A.originalEntry === log74);
  T.state.sessions.A = null;
  T.state.logs = T.state.logs.filter(l => l.startedAt !== ts74);
  delete T.state.drafts.A; delete T.state.sessions.A;

  console.log('== 75. 休息说明：设置写入 → 导出 → prompt 解释（v0.9.54）==');
  const tgt75 = { value: '  健身房时段限制，休息最多 60 秒  ' };
  handlers.get('rest-note|change')({ target: tgt75 });
  check('restNote 去空白后保存', T.state.settings.restNote === '健身房时段限制，休息最多 60 秒');
  check('输入框写回纠正结果', tgt75.value === '健身房时段限制，休息最多 60 秒');
  check('导出 settings 含 restNote', T.buildExport(4).settings.restNote === '健身房时段限制，休息最多 60 秒');
  check('prompt 解释 restNote', /restNote/.test(T.buildPrompt(T.buildExport(4))));
  handlers.get('rest-note|change')({ target: { value: '   ' } });
  check('空白输入等于清除', T.state.settings.restNote === '');
  T.state.settings.restNote = '';

  console.log('== 76. 重量 0.05 半档精度不再被显示/步进打歪（v0.9.55）==');
  T.state.exercises.test47 = { ...mk('测试深蹲47', 'weight'), unit: 'kg' };
  T.state.program.A = [{ section: '', exerciseId: 'test47', repsRange: '', sets: [{ type: 'work', weight: 11.35, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null }] }];
  delete T.state.drafts.A; delete T.state.sessions.A; T.state.settings.lastDay = 'A'; T.curPos = 0;
  T.state.settings.weightStep = 2.5;
  T.render();
  check('卡片预填显示 11.35 原值', /value="11\.35"/.test(htmlTouchedHTML('ex-list')));
  const inp76 = makeEl('fs-input-76');
  inp76.dataset = { ex: '0', set: '0', f: 'weight' };
  inp76.value = '11.35';
  handlers.get('ex-list|change')({ target: { closest: sel => sel === 'input' ? inp76 : null } });
  check('手输 11.35 原样保存', T.getItems('A')[0].sets[0].weight === 11.35);
  clickExList(btnOf({ act: 'step', ex: 0, set: 0, f: 'weight', dir: 1 }));
  check('步进 11.35+2.5=13.85 不漂', T.getItems('A')[0].sets[0].weight === 13.85);
  const l76 = { date: '2023-11-20', day: 'A', startedAt: 1700000760000, endedAt: 1700000860000, durationSec: 100, condition: null,
    exercises: [{ exerciseId: 'test47', note: '', sets: [{ type: 'work', weight: 11.35, reps: 10, duration: null, rpe: null, side: null, done: true }] }] };
  T.state.logs.push(l76);
  T.switchView('history'); T.render();
  check('历史详情显示 11.35kg×10', htmlTouchedHTML('hist-list').includes('11.35kg×10'));
  T.state.logs.splice(T.state.logs.findIndex(l => l.startedAt === 1700000760000), 1);
  delete T.state.exercises.test47; delete T.state.drafts.A; delete T.state.sessions.A;

  console.log('== 77. 「沿用上次」改了已确认组的数字，🔥 跟着重算（v0.9.56）==');
  T.state.exercises.test_pr = mk('测试推举', 'weight');
  T.state.logs.push({ date: '2026-04-01', day: 'A', startedAt: 2222, endedAt: 2223, durationSec: 1, condition: null, exercises: [
    { exerciseId: 'test_pr', note: null, sets: [tset({ weight: 60, reps: 5 })] }
  ] });
  T.state.program.A = [{ section: '', exerciseId: 'test_pr', repsRange: '', sets: [{ type: 'work', weight: 90, reps: 5, duration: null, rpe: null, rpeLabel: '', side: null }] }];
  delete T.state.drafts.A; T.state.sessions.A = null; T.state.ui.curPos.A = 0;
  T.state.settings.lastDay = 'A'; T.curPos = 0;
  clickExList(doneBtn(0, 0));   // 确认 90：破历史 60 → 🔥 点亮
  check('确认 90：徽章点亮', prSet().isPR === true && String(htmlTouchedHTML('ex-list')).includes('pr-badge'));
  clickExList(btnOf({ act: 'uselast', ex: '0', set: '0' }));   // 沿用上次 → 60，等于历史最好，应熄灭
  check('沿用上次降到历史最好：徽章熄灭', prSet().isPR === false && !String(htmlTouchedHTML('ex-list')).includes('pr-badge'));
  clickExList(btnOf({ act: 'uselast', ex: '0', set: '0' }));   // 再点一次仍是 60，保持熄灭
  check('重复沿用不产生假 PR', prSet().isPR === false && !String(htmlTouchedHTML('ex-list')).includes('pr-badge'));
  T.state.logs.pop(); delete T.state.exercises.test_pr; delete T.state.drafts.A; delete T.state.sessions.A;

  console.log('== 78. 全链路回归网：确认→结束→改一下→改数值→再结束→删除→撤销 ==');
  T.state.exercises.test_lc = { ...mk('测试链路', 'weight'), unit: 'kg' };
  // 先放一条历史最好 60：PR 徽章的定义是「打破已有最好成绩」，首次记录不点亮（设计如此）
  T.state.logs.push({ date: '2026-05-01', day: 'A', startedAt: 1700000780000, endedAt: 1700000790000, durationSec: 10, condition: null, exercises: [
    { exerciseId: 'test_lc', note: null, sets: [tset({ weight: 60, reps: 5 })] }
  ] });
  const lcBase = T.state.logs.length;   // 基线含刚放的历史最好 60
  T.state.program.A = [{ section: '', exerciseId: 'test_lc', repsRange: '', sets: [{ type: 'work', weight: 80, reps: 5, duration: null, rpe: null, rpeLabel: '', side: null }] }];
  delete T.state.drafts.A; delete T.state.sessions.A; T.state.settings.lastDay = 'A'; T.curPos = 0;
  T.switchView('today');
  clickExList(doneBtn(0, 0));   // 确认 80：无历史可比 → PR
  check('链路：确认点亮 PR', prSet().isPR === true);
  T.endSession();
  check('链路：结束写入一条日志', T.state.logs.length === lcBase + 1 && T.state.logs[T.state.logs.length - 1].exercises[0].sets[0].weight === 80);
  const lcEntry = T.state.logs[T.state.logs.length - 1];
  check('链路：小结显示破 PR', /破 PR <b>1<\/b>/.test(String(elsById.get('summary-body').innerHTML)));
  T.reeditSession();   // 小结「改一下」
  check('链路：编辑中原记录不在日志、originalEntry 在会话上',
    T.state.logs.length === lcBase && T.state.sessions.A && T.state.sessions.A.originalEntry === lcEntry);
  const inp78 = makeEl('fs-input-78');
  inp78.dataset = { ex: '0', set: '0', f: 'weight' };
  inp78.value = '75';
  handlers.get('ex-list|change')({ target: { closest: sel => sel === 'input' ? inp78 : null } });
  T.endSession(); T.closeSummary();
  check('链路：再结束仍只有一条（按时间戳去重）', T.state.logs.length === lcBase + 1);
  const lc2 = T.state.logs[T.state.logs.length - 1];
  check('链路：新值已保存且日期/时间戳保持原样',
    lc2.exercises[0].sets[0].weight === 75 && lc2.startedAt === lcEntry.startedAt &&
    lc2.endedAt === lcEntry.endedAt && lc2.durationSec === lcEntry.durationSec && lc2.date === lcEntry.date);
  check('链路：再结束 75 仍破历史最好 60，判 PR', lc2.exercises[0].sets[0].isPR === true);
  T.switchView('history'); T.render();
  clickEl('hist-list', btnOf({ act: 'dellog', ts: String(lc2.startedAt), i: '0' }));
  T.answerConfirm(true); await null;
  check('链路：删除后回到基线', T.state.logs.length === lcBase);
  clickEl('toast', btnOf({ act: 'undo' }));
  check('链路：撤销恢复的是改过的那版', T.state.logs.length === lcBase + 1 && T.state.logs[T.state.logs.length - 1].exercises[0].sets[0].weight === 75);
  T.state.logs = T.state.logs.filter(l => (l.startedAt ?? -1) !== (lcEntry.startedAt ?? -2) && (l.startedAt ?? -1) !== 1700000780000);
  delete T.state.exercises.test_lc; delete T.state.drafts.A; delete T.state.sessions.A;

  console.log('== 79. 刷新/杀进程后接上休息与秒表（v0.9.57）==');
  T.state.exercises.test_rt = { ...mk('测试平板', 'time'), unit: null };
  T.state.program.A = [{ section: '', exerciseId: 'test_rt', repsRange: '', sets: [{ type: 'work', weight: null, reps: null, duration: 30, rpe: null, rpeLabel: '', side: null }] }];
  delete T.state.drafts.A; delete T.state.sessions.A; T.state.settings.lastDay = 'A'; T.curPos = 0;
  T.switchView('today');
  clickExList(doneBtn(0, 0));   // 建立进行中的会话
  T.state.settings.restSec = 60;
  T.startRestTimer({ exIdx: 0, setIdx: 0 });
  check('休息已随 state 持久化（含归属日与组位置）',
    T.state.rest && T.state.rest.day === 'A' && T.state.rest.exIdx === 0 && T.state.rest.endsAt > Date.now());
  // 模拟刷新：模块变量丢失，只剩存储里的副本（把它改到已过点 90 秒，验证接上的是时间戳而不是重开）
  const persisted79 = JSON.parse(JSON.stringify(T.state.rest));
  persisted79.startsAt = Date.now() - 90000; persisted79.endsAt = persisted79.startsAt + 60000;
  T.resetRest();
  check('resetRest 同时清掉持久化副本', T.state.rest === null);
  T.state.rest = persisted79;
  T.resumeTimers();
  T.skipRest();
  const rtSet = T.state.sessions.A.items[0].sets[0];
  check('接上后跳过休息，restAfter 记的是真实经过的 ~90 秒', rtSet.restAfter >= 89 && rtSet.restAfter <= 91);
  check('结算后不留持久化副本', T.state.rest === null);
  // 秒表：100 秒前开始，接上后停表写入真实秒数
  T.state.timer = { day: 'A', exIdx: 0, setIdx: 0, startsAt: Date.now() - 100000 };
  T.resumeTimers();
  const st79 = T.stopTimer();
  check('接上后停表写入真实经过秒数', st79 && st79.elapsed >= 99 && rtSet.duration >= 99);
  check('停表后不留持久化副本', T.state.timer === null);
  // 归属日没有进行中记录：陈旧副本被丢弃
  T.state.rest = { startsAt: Date.now() - 10000, endsAt: Date.now() + 50000, day: 'B', exIdx: 0, setIdx: 0 };
  T.state.timer = { day: 'B', exIdx: 0, setIdx: 0, startsAt: Date.now() - 10000 };
  T.resumeTimers();
  check('归属日无进行中记录时丢弃陈旧副本', T.state.rest === null && T.state.timer === null && T.timerFor === null);
  // migrate：坏形状归 null
  const m79 = T.migrate({ version: 1, logs: [], rest: 'oops', timer: { startsAt: 'x' } });
  check('migrate 把坏 rest/timer 归 null', m79.rest === null && m79.timer === null);
  T.clearTimer(); T.resetRest();
  delete T.state.exercises.test_rt; delete T.state.drafts.A; delete T.state.sessions.A;

  console.log('== 80. 设置页「动作个人备注」（v0.9.58）==');
  T.state.exercises.test_pn = { name: '测试动作', muscles: '', mode: 'weight', unit: 'kg', tips: '', pitfalls: '', tempo: '', alternatives: '', personal: '原始备注' };
  T.switchView('settings');
  const sel80 = elsById.get('personal-ex');
  check('动作下拉包含新动作', sel80 && sel80.innerHTML.includes('test_pn'));
  handlers.get('personal-ex|change')({ target: { value: 'test_pn' } });
  const note80 = elsById.get('personal-note');
  check('选中动作后文本框显示已有备注', note80.value === '原始备注');
  note80.value = '弹响就换正握';
  handlers.get('personal-note|change')({ target: note80 });
  check('保存写入动作定义', T.state.exercises.test_pn.personal === '弹响就换正握');
  // 导入新计划：计划里没带 personal 字段时保留本地值（applyPlan 的合并规则）
  const imp80 = T.importPlan(JSON.stringify({
    exercises: { test_pn: { name: '测试动作', mode: 'weight' } },
    program: { A: [{ exerciseId: 'test_pn', sets: [{ type: 'work', weight: 10, reps: 10 }] }] }
  }));
  check('导入计划后个人备注保留', imp80.ok && T.state.exercises.test_pn.personal === '弹响就换正握');
  note80.value = '   ';
  handlers.get('personal-note|change')({ target: note80 });
  check('空白提交视为清除', T.state.exercises.test_pn.personal === '');
  delete T.state.exercises.test_pn; delete T.state.lastImport;

  console.log('== 81. migrate 缺 program/exercises 用种子补（v0.9.59）==');
  const m81 = T.migrate({ version: 1, program: null, exercises: 'oops' });
  check('缺 program 补内置计划', Array.isArray(m81.program.A) && m81.program.A.length > 0);
  check('缺 exercises 补内置动作库', typeof m81.exercises === 'object' && Object.keys(m81.exercises).length > 0);
  const m81b = T.migrate({ version: 1, program: { A: [], B: [] }, exercises: {} });
  check('合法的清空计划不被覆盖', m81b.program.A.length === 0 && Object.keys(m81b.exercises).length === 0);

  console.log('== 82. 全角数字/句点输入先转半角（v0.9.60）==');
  T.state.program.A = [{ section: '', exerciseId: 'test47', repsRange: '', sets: [{ type: 'work', weight: 10, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null }] }];
  delete T.state.drafts.A; delete T.state.sessions.A; T.state.settings.lastDay = 'A'; T.curPos = 0;
  T.render();
  const inp82 = makeEl('fs-input-82');
  inp82.dataset = { ex: '0', set: '0', f: 'weight' };
  const fire82 = v => { inp82.value = v; handlers.get('ex-list|change')({ target: { closest: sel => sel === 'input' ? inp82 : null } }); };
  fire82('12。5');
  check('「12。5」解析为 12.5', T.getItems('A')[0].sets[0].weight === 12.5);
  check('写回的是半角 12.5', String(inp82.value) === '12.5');
  fire82('１２３');
  check('全角数字「１２３」解析为 123', T.getItems('A')[0].sets[0].weight === 123);
  delete T.state.drafts.A;

  console.log('== 83. A/B 两日完整循环互不串（跨日回归网）==');
  T.state.logs = []; T.state.sessions = {}; delete T.state.drafts.A; delete T.state.drafts.B;
  T.state.condDraft.A = null; T.state.condDraft.B = null; T.state.ui.curPos = {};
  T.state.exercises.l83a = { name: 'A动作', mode: 'weight', unit: 'kg' };
  T.state.exercises.l83b = { name: 'B动作', mode: 'weight', unit: 'kg' };
  T.state.program.A = [{ section: '', exerciseId: 'l83a', repsRange: '', sets: [{ type: 'work', weight: 40, reps: 8 }] }];
  T.state.program.B = [{ section: '', exerciseId: 'l83b', repsRange: '', sets: [{ type: 'work', weight: 20, reps: 12 }] }];
  T.switchDay('A');
  const itA83 = T.getItems('A');
  itA83[0].sets[0] = { done: true, weight: 55, reps: 8, duration: null, rpe: 8, type: 'work' };
  T.state.sessions.A = { startedAt: 111000, items: itA83, condition: '佳' };
  T.endSession(); T.closeSummary();
  T.switchDay('B');
  const itB83 = T.getItems('B');
  itB83[0].sets[0] = { done: true, weight: 30, reps: 12, duration: null, rpe: 9, type: 'work' };
  T.state.sessions.B = { startedAt: 222000, items: itB83, condition: null };
  T.endSession(); T.closeSummary();
  check('两日各留一条日志，按 startedAt 排序', T.state.logs.length === 2 && T.state.logs[0].day === 'A' && T.state.logs[1].day === 'B');
  check('A 日志只含 A 动作', T.state.logs[0].exercises.length === 1 && T.state.logs[0].exercises[0].exerciseId === 'l83a');
  check('B 日志只含 B 动作', T.state.logs[1].exercises[0].exerciseId === 'l83b');
  const lvA83 = T.lastValues('l83a'), lvB83 = T.lastValues('l83b');
  check('lastValues 按动作隔离（A 55 / B 30）', lvA83.weight === 55 && lvB83.weight === 30);
  check('两日会话都已清空', !T.state.sessions.A && !T.state.sessions.B);
  delete T.state.exercises.l83a; delete T.state.exercises.l83b;

  console.log('== 84. 改一下→再结束后状态选择不残留（condDraft 泄漏回归）==');
  T.state.logs = []; T.state.sessions = {}; delete T.state.drafts.A;
  T.state.condDraft.A = null; T.state.condDraft.B = null;
  T.state.exercises.l84 = { name: '状态动作', mode: 'weight', unit: 'kg' };
  T.state.program.A = [{ section: '', exerciseId: 'l84', repsRange: '', sets: [{ type: 'work', weight: 50, reps: 8 }] }];
  T.switchDay('A');
  const it84 = T.getItems('A');
  it84[0].sets[0] = { done: true, weight: 60, reps: 8, duration: null, rpe: 8, type: 'work' };
  T.state.sessions.A = { startedAt: 333000, items: it84, condition: '佳' };
  T.endSession();
  check('小结打开时「改一下」把状态放回界面用于显示', (() => { T.reeditSession(); return T.state.condDraft.A === '佳'; })());
  T.endSession(); T.closeSummary();
  check('再结束一次后状态被清掉', T.state.condDraft.A === null);
  T.switchView('today');
  clickExList(doneBtn(0, 0));
  check('下一次开练不会把旧状态抄进新记录', T.state.sessions.A && T.state.sessions.A.condition === null);
  T.state.sessions.A = null; delete T.state.drafts.A; delete T.state.exercises.l84;

  console.log('== 85. 跳过此动作：落到下一个没做完的动作的第一组 ==');
  T.state.logs = []; T.state.sessions = {}; delete T.state.drafts.A;
  T.state.exercises.l85a = { name: '一', mode: 'weight', unit: 'kg' };
  T.state.exercises.l85b = { name: '二', mode: 'weight', unit: 'kg' };
  T.state.exercises.l85c = { name: '三', mode: 'weight', unit: 'kg' };
  const mk85 = id => ({ section: '', exerciseId: id, repsRange: '', sets: [
    { type: 'work', weight: 10, reps: 5 }, { type: 'work', weight: 10, reps: 5 }] });
  T.state.program.A = [mk85('l85a'), mk85('l85b'), mk85('l85c')];
  T.switchDay('A'); T.curPos = 0;
  clickExList(btnOf({ act: 'skipex' }));
  check('下一动作没开始也照样跳过去（落在它的第 1 组）', T.curPos === 2);
  const it85 = T.getItems('A');
  it85[1].sets[0].done = true;
  T.curPos = 0; clickExList(btnOf({ act: 'skipex' }));
  check('下一动作做了一半时仍落在它', T.curPos === 2);
  it85[1].sets[1].done = true;
  T.curPos = 0; clickExList(btnOf({ act: 'skipex' }));
  check('做完的动作被跳过，落到再下一个的第一组', T.curPos === 4);
  delete T.state.drafts.A; delete T.state.exercises.l85a; delete T.state.exercises.l85b; delete T.state.exercises.l85c;

  console.log('== 86. 秒表按归属日结算：草稿日也能接上，换日不写错家 ==');
  T.state.logs = []; T.state.sessions = {}; delete T.state.drafts.A; delete T.state.drafts.B;
  T.state.exercises.l86a = { name: '平板', mode: 'time', unit: null };
  T.state.exercises.l86b = { name: '拉伸', mode: 'time', unit: null };
  const mk86 = id => ({ section: '', exerciseId: id, repsRange: '', sets: [{ type: 'work', weight: null, reps: null, duration: null, rpe: null, rpeLabel: '', side: null }] });
  T.state.program.A = [mk86('l86a')]; T.state.program.B = [mk86('l86b')];
  T.state.settings.lastDay = 'A'; T.curPos = 0;
  T.switchView('today');
  const itA86 = T.getItems('A');   // 只建了草稿，没有确认任何一组
  itA86[0].sets[0].duration = null;
  T.state.timer = { day: 'A', exIdx: 0, setIdx: 0, startsAt: Date.now() - 40000 };
  T.resumeTimers();
  check('没确认任何一组的草稿日，秒表也能接上', !!T.timerFor && !!T.state.timer);
  T.resumeTimers();
  check('第二次刷新仍接得上（接上的副本必须继续可持久化）', !!T.timerFor && !!T.state.timer);
  // 休息也一样：接上后必须继续可持久化，否则第三次刷新就丢了
  T.state.rest = { startsAt: Date.now() - 20000, endsAt: Date.now() + 40000, day: 'A', exIdx: 0, setIdx: 0 };
  T.resumeTimers();
  check('接上的休息倒计时仍留在存储里', !!T.state.rest && T.state.rest.endsAt > Date.now());
  T.state.settings.lastDay = 'B';   // 正在看 B 日时停表：秒数要回到它发生的那一日
  const st86 = T.stopTimer();
  check('停表写回归属日 A，而不是正在看的 B', st86 && itA86[0].sets[0].duration >= 40 && T.getItems('B')[0].sets[0].duration === null);
  check('归属日不合法的陈旧副本被丢弃', (() => {
    T.state.timer = { day: 'C', exIdx: 0, setIdx: 0, startsAt: Date.now() };
    T.resumeTimers();
    return T.state.timer === null && !T.timerFor;
  })());
  // 表挂在 A 的草稿上、人正在看 B：导入会删掉 A 的草稿，表也要按归属日清掉
  T.state.settings.lastDay = 'B'; T.switchDay('B'); T.getItems('B');
  T.state.settings.lastDay = 'A'; T.startTimer(0, 0); T.state.settings.lastDay = 'B';
  T.importPlan(JSON.stringify({ day: 'A', exercises: { l86a: { name: '平板', mode: 'time' }, l86b: { name: '拉伸', mode: 'time' } },
    program: { A: [mk86('l86a')], B: [mk86('l86b')] } }));
  check('导入删掉表所属的草稿时按归属日清表（哪怕正在看别的日）', !T.timerFor && T.state.timer === null);
  T.clearTimer(); T.resetRest();
  delete T.state.drafts.A; delete T.state.drafts.B; delete T.state.exercises.l86a; delete T.state.exercises.l86b;

  /* ============================================================
   * 87. 手工编辑备份的日志加固：缺 sets 的动作条目丢弃、字符串数值归一化（v0.9.64）
   * ============================================================ */
  const l87 = { version: 1, logs: [{
    date: '2026-01-01', day: 'A', startedAt: 111000, condition: null,
    exercises: [
      { exerciseId: 'goblet_squat', sets: [{ done: true, weight: '12.5', reps: '10', type: 'work' }] },
      { exerciseId: 'rdl', sets: 'not-an-array' },
      { exerciseId: 'wall_angel', sets: [{ done: true, weight: 'abc', reps: 8 }] }
    ]
  }] };
  const m87 = T.migrate(JSON.parse(JSON.stringify(l87)));
  const ex87 = m87.logs[0].exercises;
  check('sets 不是数组的动作条目被丢弃', ex87.length === 2 && ex87.every(it => it.exerciseId !== 'rdl'));
  check('字符串形式的数值字段转成数字', ex87[0].sets[0].weight === 12.5 && ex87[0].sets[0].reps === 10);
  check('转不了的非数字串归 null（等同未填）', ex87[1].sets[0].weight === null);
  check('归一化后容量是实数而不是 NaN', T.sessionVolume(m87.logs[0]) === 125);
  const tr87 = T.buildTrends(m87.logs);
  check('趋势不被字符串重量污染', tr87.goblet_squat && tr87.goblet_squat.sessions[0].top.weight === 12.5);
  const m87b = T.migrate({ version: 1, logs: [], sessions: { A: { startedAt: 1, items: [{ exerciseId: 'goblet_squat', sets: [{ done: true, weight: '20', reps: '5' }] }] }, B: null } });
  check('进行时会话里的字符串数值同样处理', m87b.sessions.A.items[0].sets[0].weight === 20 && m87b.sessions.A.items[0].sets[0].reps === 5);

  /* ============================================================
   * 88. 导入把视图切去另一日时，组位置跟着当前日走（v0.9.65）
   * ============================================================ */
  console.log('== 88. 导入切视图时组位置跟着当前日走（v0.9.65）==');
  T.state.exercises.l88 = { name: '位置动作', mode: 'weight', unit: 'kg' };
  const sets88 = () => [{ weight: 10, reps: 8 }, { weight: 10, reps: 8 }, { weight: 10, reps: 8 }, { weight: 10, reps: 8 }];
  const plan88 = day => JSON.stringify({ day, exercises: { l88: { name: '位置动作', mode: 'weight', unit: 'kg' } },
    program: { A: [{ exerciseId: 'l88', sets: sets88() }], B: [{ exerciseId: 'l88', sets: sets88() }] } });
  T.importPlan(plan88('B'));
  T.switchDay('B');
  T.curPos = 3; T.render();
  check('B 日先停在第 4 组', T.curPos === 3 && T.state.ui.curPos.B === 3);
  T.importPlan(plan88('A'));
  check('导入切去 A 后位置归零，而不是悬着旧日的 3', T.curPos === 0 && T.state.settings.lastDay === 'A');
  check('B 的保存位置也被导入归零', T.state.ui.curPos.B === 0);
  delete T.state.exercises.l88; T.state.program.A = []; T.state.program.B = [];
  delete T.state.drafts.A; delete T.state.drafts.B; T.state.sessions = { A: null, B: null };

  /* ============================================================
   * 89. 手工编辑过的草稿：缺 sets 的条目筛掉、字符串数值归一化（v0.9.66）
   * ============================================================ */
  console.log('== 89. 手编草稿缺 sets 条目筛掉、字符串数值归一化（v0.9.66）==');
  T.state.exercises.l89 = { name: '草稿动作', mode: 'weight', unit: 'kg' };
  T.state.program.A = [
    { section: '', exerciseId: 'l89', repsRange: '', sets: [{ type: 'work', weight: 10, reps: 8 }] },
    { section: '', exerciseId: 'l89', repsRange: '', sets: [{ type: 'work', weight: 10, reps: 8 }] }
  ];
  T.state.settings.lastDay = 'A'; T.switchDay('A');
  const m89 = T.migrate({ version: 1, logs: [], drafts: { A: [
    { exerciseId: 'l89', sets: [{ done: false, weight: '17.5', reps: '6' }] },
    { exerciseId: 'l89', sets: 'oops' }
  ] } });
  check('缺 sets 的草稿条目被筛掉', m89.drafts.A.length === 1);
  check('草稿数值字段归一化成数字', m89.drafts.A[0].sets[0].weight === 17.5 && m89.drafts.A[0].sets[0].reps === 6);
  T.state.drafts.A = m89.drafts.A;
  const g89 = T.getItems('A');
  check('筛后与计划数量不符时 getItems 整份重建（自动修复不崩）', Array.isArray(g89) && g89.length === 2 && g89.every(it => Array.isArray(it.sets)));
  const m89b = T.migrate({ version: 1, logs: [], drafts: { A: [
    { exerciseId: 'l89', sets: [{ done: false, weight: '20', reps: '5' }] },
    { exerciseId: 'l89', sets: [{ done: false, weight: '20', reps: '5' }] }
  ] } });
  T.state.drafts.A = m89b.drafts.A;
  const g89b = T.getItems('A');
  check('数量相符时保留草稿并使用归一化后的数字', g89b === T.state.drafts.A && g89b[0].sets[0].weight === 20);
  delete T.state.exercises.l89; delete T.state.drafts.A; T.state.program.A = [];

  /* ============================================================
   * 90. 手编备份的进行中会话形状纠正（v0.9.67）
   * ============================================================ */
  console.log('== 90. 手编备份 sessions 形状纠正（v0.9.67）==');
  const m90 = T.migrate({ version: 1, logs: [], sessions: { A: '手滑写成了字符串', B: null } });
  check('sessions 被写成非对象时归 null', m90.sessions.A === null);
  const m90b = T.migrate({ version: 1, logs: [], sessions: { A: { startedAt: 5, items: '坏了' }, B: { startedAt: 6 } } });
  check('items 缺/坏时纠正为空数组而不是让页面崩', Array.isArray(m90b.sessions.A.items) && m90b.sessions.A.items.length === 0 && Array.isArray(m90b.sessions.B.items));
  const m90c = T.migrate({ version: 1, logs: [], sessions: { A: { startedAt: 7, items: [null, 'x', { exerciseId: 'goblet_squat', sets: [{ done: true, weight: '30', reps: '5' }] }] } } });
  check('items 里的非对象条目被筛掉', m90c.sessions.A.items.length === 1);
  check('会话里的字符串数值归一化', m90c.sessions.A.items[0].sets[0].weight === 30 && m90c.sessions.A.items[0].sets[0].reps === 5);

  /* ============================================================
   * 91. 导入/撤销导入清掉挂在被丢弃草稿上的休息计时（v0.9.68）
   * ============================================================ */
  console.log('== 91. 导入/撤销导入结束孤儿休息计时（v0.9.68）==');
  T.resetRest(); T.clearTimer();
  T.state.settings.restSec = 60;
  const p91 = { type: 'ai-plan', exercises: { e91: { name: '休息目标', mode: 'weight', unit: 'kg' } },
    program: { A: [{ exerciseId: 'e91', sets: [{ type: 'work', weight: 10, reps: 8 }] }] } };
  check('首次导入成功', T.importPlan(JSON.stringify(p91)).ok === true);
  T.state.settings.lastDay = 'A'; T.switchDay('A');
  T.getItems('A');   // 生成 A 日草稿：没有确认过组 → 无进行中记录
  T.startRestTimer({ exIdx: 0, setIdx: 0 });
  check('休息挂在纯草稿日（无进行中记录）', !!T.state.rest && T.state.rest.day === 'A');
  const p91b = JSON.parse(JSON.stringify(p91));
  p91b.program.A[0].sets = [{ type: 'work', weight: 12, reps: 8 }];
  T.importPlan(JSON.stringify(p91b));   // 替换 A 日计划：草稿被丢弃重建
  check('导入后孤儿休息被结束（不会把 restAfter 写进新计划的组）', T.state.rest === null && T.restEndsAt === null && T.restTotal === 0);
  // 撤销导入同样：休息归属 A（只有草稿），用户在看着 B —— 撤销也要结束它
  // （快照只有 doImport 会留，这里按 snapshotPlan 的形状手工构造）
  T.state.lastImport = { at: Date.now(), program: JSON.parse(JSON.stringify(T.state.program)), exercises: JSON.parse(JSON.stringify(T.state.exercises)) };
  T.getItems('A');
  T.startRestTimer({ exIdx: 0, setIdx: 0 });
  T.state.settings.lastDay = 'B';
  T.undoImport();
  check('撤销导入结束孤儿休息', T.state.rest === null && T.restEndsAt === null);
  // 归属日有进行中记录时：休息/秒表的目标还在，不该清
  T.state.settings.lastDay = 'A'; T.switchDay('A');
  clickExList(doneBtn(0, 0));
  T.answerConfirm(true);
  await null;
  check('确认一组后进行中记录与休息都在', !!T.state.sessions.A && !!T.state.rest);
  const p91c = JSON.parse(JSON.stringify(p91b));
  p91c.program.A[0].sets = [{ type: 'work', weight: 14, reps: 8 }];
  const r91c = T.importPlan(JSON.stringify(p91c));
  check('有进行中记录时导入被拒绝、休息原样保留', r91c.ok === false && !!T.state.rest);
  T.state.lastImport = { at: Date.now(), program: JSON.parse(JSON.stringify(T.state.program)), exercises: JSON.parse(JSON.stringify(T.state.exercises)) };
  T.startTimer(0, 0);
  T.state.settings.lastDay = 'B';   // 不 switchDay（换日本来就清表）：模拟表归属 A、视图在 B
  T.undoImport();
  check('撤销导入不误清归属日有进行中记录的秒表', !!T.timerFor && !!T.state.timer);
  T.clearTimer(); T.resetRest();
  T.state.sessions = { A: null, B: null };
  delete T.state.drafts.A; delete T.state.drafts.B;
  delete T.state.exercises.e91; T.state.program.A = [];

  /* ============================================================
   * 92. 放弃 A 日记录不误清归属 B 日的休息/秒表（v0.9.69）
   * ============================================================ */
  console.log('== 92. 放弃记录只清归属本日的休息/秒表（v0.9.69）==');
  T.resetRest(); T.clearTimer();
  T.state.settings.restSec = 60;
  T.state.exercises.e92 = { name: '放弃测试', mode: 'weight', unit: 'kg' };
  T.state.sessions = {
    A: { startedAt: 111000, items: [{ exerciseId: 'e92', sets: [{ done: true, weight: 20, reps: 5 }] }] },
    B: { startedAt: 222000, items: [{ exerciseId: 'e92', sets: [{ done: true, weight: 21, reps: 5 }] }] }
  };
  T.state.settings.lastDay = 'B';
  T.startRestTimer({ exIdx: 0, setIdx: 0 });   // 休息归属 B
  T.startTimer(0, 0);                          // 秒表归属 B
  check('B 日休息与秒表都在跑', !!T.state.rest && !!T.state.timer && !!T.timerFor);
  T.state.settings.lastDay = 'A';              // 视图切到 A（不经 switchDay：模拟恢复后的错位视图）
  T.discardSession(); T.answerConfirm(true); await null;
  check('A 日记录已放弃', T.state.sessions.A === null);
  check('归属 B 日的休息不被误清', !!T.state.rest && T.state.rest.day === 'B' && T.restEndsAt !== null);
  check('归属 B 日的秒表不被误清', !!T.timerFor && !!T.state.timer && T.state.timer.day === 'B');
  T.state.settings.lastDay = 'B';
  T.discardSession(); T.answerConfirm(true); await null;
  check('放弃归属日自己的记录时休息/秒表照常清掉', T.state.sessions.B === null && T.state.rest === null && T.restEndsAt === null && T.state.timer === null && T.timerFor === null);
  T.state.sessions = { A: null, B: null };
  delete T.state.exercises.e92;

  /* ============================================================
   * 93. 秒表归属另一日时，当前卡片不显示它的运行态（v0.9.70）
   * ============================================================ */
  console.log('== 93. 秒表跨日不误显运行态（v0.9.70）==');
  T.clearTimer(); T.resetRest();
  T.state.exercises.t93 = { name: '计时93', mode: 'time', unit: null };
  const plan93 = [{ exerciseId: 't93', sets: [{ duration: 30 }] }];
  T.state.program.A = JSON.parse(JSON.stringify(plan93));
  T.state.program.B = JSON.parse(JSON.stringify(plan93));
  delete T.state.drafts.A; delete T.state.drafts.B;
  T.state.settings.lastDay = 'A';
  T.startSessionIfNeeded('A');
  T.startTimer(0, 0);                          // 秒表归属 A
  advanceClock(45000);
  check('93 秒表已归属 A', !!T.timerFor && !!T.state.timer && T.state.timer.day === 'A');
  T.state.settings.lastDay = 'B';              // 视图切到 B（不经 switchDay：模拟恢复后的错位视图）
  T.curPos = 0;
  T.switchView('today'); T.render();
  const tc93 = htmlTouchedHTML('ex-list');
  check('B 卡片有计时按钮但不是运行态', /data-act="timer"/.test(tc93) && !/fs-timer running/.test(tc93) && !/>停止</.test(tc93));
  check('B 卡片时长输入框显示计划值而不是 A 的读数', /value="30"[^>]*aria-label="时长（秒）"/.test(tc93) && !/value="45"/.test(tc93));
  T.clearTimer();
  T.state.sessions = { A: null, B: null };
  T.state.program.A = []; T.state.program.B = [];
  delete T.state.exercises.t93;

  /* ============================================================
   * 94. 交互处理器也不把别日的表当成当前组的表（v0.9.71）
   * 渲染守卫（93）之后，按钮行为必须同口径：删组/确认不连带清 A 的表；
   * 在 B 上按「计时」是新起一张表（同时按单表规矩结算 A 的旧表）。
   * ============================================================ */
  console.log('== 94. 跨日错位下按钮不误碰别日的秒表（v0.9.71）==');
  T.clearTimer(); T.resetRest();
  T.state.exercises.t94 = { name: '计时94', mode: 'time', unit: null };
  const plan94 = [{ exerciseId: 't94', sets: [{ duration: 30 }, { duration: 30 }] }];
  T.state.program.A = JSON.parse(JSON.stringify(plan94));
  T.state.program.B = JSON.parse(JSON.stringify(plan94));
  delete T.state.drafts.A; delete T.state.drafts.B;
  T.state.settings.lastDay = 'A';
  T.startSessionIfNeeded('A');
  T.startTimer(0, 0);                          // 秒表归属 A
  advanceClock(20000);
  T.state.settings.lastDay = 'B';              // 错位视图：正在看 B，表挂在 A
  T.curPos = 0;
  T.switchView('today'); T.render();
  clickExList(btnOf({ act: 'delset', ex: 0 }));
  check('94 在 B 上删组不清 A 的表', !!T.timerFor && !!T.state.timer && T.state.timer.day === 'A');
  clickExList(btnOf({ act: 'confirm', ex: 0, set: 0 }));
  check('94 在 B 上确认不吞 A 的表', !!T.timerFor && T.state.timer.day === 'A');
  const itemsB94 = T.state.sessions.B && T.state.sessions.B.items;
  check('94 B 的组照常记上', !!itemsB94 && itemsB94[0].sets[0].done === true);
  check('94 A 的组时长仍是计划值', T.state.sessions.A.items[0].sets[0].duration === 30);
  clickExList(btnOf({ act: 'timer', ex: 0, set: 0 }));
  check('94 在 B 上按计时是新起一张表', !!T.timerFor && T.state.timer.day === 'B');
  check('94 旧表按归属日结算进 A', T.state.sessions.A.items[0].sets[0].duration === 20);
  T.clearTimer(); T.resetRest();
  T.state.sessions = { A: null, B: null };
  T.state.program.A = []; T.state.program.B = [];
  delete T.state.exercises.t94;

  /* ============================================================
   * 95. 清除全部数据后，卸载时的落盘不能把旧 state 写回去（v0.9.72）
   * 真实浏览器里 removeItem→reload 会先触发 pagehide/visibilitychange→flushSave；
   * 这里用 reload 桩里调 flushSave 来模拟那次回调。
   * ============================================================ */
  console.log('== 95. 清除全部数据不会被 flushSave 复活（v0.9.72）==');
  T.state.logs = [{ date: '2026-01-01', day: 'A', startedAt: 555, exercises: [] }];
  T.flushSave();
  check('95 先落盘一次', !!global.localStorage._d['ironlog.v1']);
  global.location = { reload(){ T.flushSave(); } };   // 模拟 reload 时卸载回调再落盘
  T.clearAll();
  T.answerConfirm(true); await null; await null; await null;   // 同 95：留底在两次确认之间
  T.answerConfirm(true); await null;
  await null; await null;
  check('95 清除后存储为空，卸载落盘没把它写回', global.localStorage._d['ironlog.v1'] === undefined);
  delete global.location;
  T.state.logs = [];

  /* ============================================================
   * 96. 历史「改一下」：分区名与编号按计划走，不按筛短后的 items（v0.9.73）
   * 记录时只保留做过的动作；从历史再编辑时 items 可能比 program 短。
   * ============================================================ */
  console.log('== 96. 历史改一下不串分区名/编号（v0.9.73）==');
  T.state.exercises.e96a = { name: 'A96', mode: 'weight', unit: 'kg' };
  T.state.exercises.e96b = { name: 'B96', mode: 'weight', unit: 'kg' };
  T.state.exercises.e96c = { name: 'C96', mode: 'weight', unit: 'kg' };
  T.state.program.A = [
    { exerciseId: 'e96a', section: '热身段', sets: [{ weight: 1, reps: 1 }] },
    { exerciseId: 'e96b', section: '主课段', sets: [{ weight: 2, reps: 2 }] },
    { exerciseId: 'e96c', section: '主课段', sets: [{ weight: 3, reps: 3 }] },
  ];
  T.state.sessions = { A: null, B: null };
  delete T.state.drafts.A;
  T.state.settings.lastDay = 'A';
  T.curPos = 0;
  T.switchView('today'); T.render();
  const h96n = htmlTouchedHTML('ex-list');
  check('96 正常视图：第 1 个动作 + 热身段', /fs-num">1\./.test(h96n) && /fs-section">热身段/.test(h96n));
  T.state.logs = [{ date: '2026-01-01', day: 'A', startedAt: 777, condition: null,
    exercises: [{ exerciseId: 'e96b', sets: [{ type: 'work', weight: 50, reps: 8, duration: null, rpe: null, side: null, done: true }] }] }];
  T.switchView('history'); T.render();
  clickEl('hist-list', btnOf({ act: 'reeditlog', ts: '777', i: '0' }));
  T.switchView('today'); T.curPos = 0; T.render();
  const h96 = htmlTouchedHTML('ex-list');
  check('96 再编辑卡片按计划编号（2.）', /fs-num">2\./.test(h96));
  check('96 再编辑分区名跟着计划（主课段）', /fs-section">主课段/.test(h96) && !/fs-section">热身段/.test(h96));
  check('96 名称是实际编辑的动作 B96', /B96/.test(h96));
  T.state.sessions = { A: null, B: null };
  T.state.logs = [];
  T.state.program.A = [];
  delete T.state.exercises.e96a; delete T.state.exercises.e96b; delete T.state.exercises.e96c;

  /* ============================================================
   * 97. 模式变更后不带入看不见的旧指标；趋势分组与画图同序（v0.9.74）
   * ============================================================ */
  console.log('== 97. 模式残留与趋势分组同序（v0.9.74）==');
  T.state.exercises.e97 = { name: 'E97', mode: 'weight', unit: 'kg' };
  T.state.logs = [{ date: '2026-01-01', day: 'A', startedAt: 888, condition: null,
    exercises: [{ exerciseId: 'e97', sets: [{ type: 'work', weight: 60, reps: 10, duration: 45, rpe: null, side: null, done: true }] }] }];
  T.state.program.A = [{ exerciseId: 'e97', sets: [{ weight: null, reps: null }] }];
  T.state.sessions = { A: null, B: null };
  delete T.state.drafts.A;
  const it97 = T.getItems('A');
  check('97 重量模式预填带 weight/reps', it97[0].sets[0].weight === 60 && it97[0].sets[0].reps === 10);
  check('97 重量模式预填不带旧 duration', it97[0].sets[0].duration === null);
  T.startSessionIfNeeded('A');
  const s97 = T.state.sessions.A.items[0].sets[0];
  s97.weight = null; s97.reps = null; s97.duration = null;
  T.curPos = 0;
  T.switchView('today'); T.render();
  clickExList(btnOf({ act: 'uselast', ex: 0, set: 0 }));
  check('97 沿用上次只填当前模式字段', s97.weight === 60 && s97.reps === 10 && s97.duration === null);
  T.state.exercises.e97.mode = 'time';
  T.state.sessions = { A: null, B: null };
  delete T.state.drafts.A;
  const it97t = T.getItems('A');
  check('97 计时模式预填只带 duration', it97t[0].sets[0].duration === 45 && it97t[0].sets[0].weight === null);
  check('97 trendKind 与 trendMetric 同序（weight 优先）', T.trendKind({ sessions: [{ top: { weight: 60, duration: 45, reps: 10 } }] }) === 'weight');
  T.state.logs = []; T.state.program.A = [];
  T.state.sessions = { A: null, B: null }; delete T.state.drafts.A;
  delete T.state.exercises.e97;

  /* ============================================================
   * 98. 目标标签保留计划里的次数区间（v0.9.75）
   * normalizeItem 把 reps:"8-12" 存成 item.repsRange，此前草稿不带，targetLabel 的区间分支是死代码。
   * ============================================================ */
  console.log('== 98. 目标标签保留 reps:"8-12"（v0.9.75）==');
  T.state.exercises.e98 = { name: 'E98', mode: 'weight', unit: 'kg' };
  T.state.logs = [];
  const mk98 = () => [{}, {}, {}].map(s => ({ type: 'work', weight: null, reps: null, duration: null, rpe: null, side: null }));
  T.state.program.A = [{ exerciseId: 'e98', repsRange: '8-12', sets: mk98() }];
  T.state.sessions = { A: null, B: null };
  delete T.state.drafts.A;
  const it98 = T.getItems('A');
  check('98 草稿带上次数区间', it98[0].repsRange === '8-12');
  check('98 目标标签显示 3 × 8-12', T.targetLabel(it98[0]) === '3 × 8-12');
  delete T.state.drafts.A;
  T.state.program.A = [{ exerciseId: 'e98', sets: mk98() }];
  check('98 无区间时仍是「3 组」', T.targetLabel(T.getItems('A')[0]) === '3 组');
  T.state.program.A = [];
  T.state.sessions = { A: null, B: null }; delete T.state.drafts.A;
  delete T.state.exercises.e98;

  /* ============================================================
   * 99. 回到前台不补响已过期的休息提示音（v0.9.76）
   * 后台标签的 setInterval 可能被整段挂起（iOS），回到前台时 restDone 还是 false，
   * 旧逻辑会立刻补响一声——隔了几小时回来突然响只会吓一跳。与 resumeTimers 同口径抑制。
   * ============================================================ */
  console.log('== 99. 后台挂起后回前台不补响旧休息（v0.9.76）==');
  T.clearTimer(); T.resetRest();
  T.state.settings.lastDay = 'A';
  T.state.settings.restSec = 60;
  T.state.exercises.e99 = { name: 'E99', mode: 'weight', unit: 'kg' };
  T.state.program.A = [{ exerciseId: 'e99', sets: [{ type: 'work', weight: 10, reps: 10, duration: null, rpe: null, side: null }] }];
  T.state.sessions = { A: null, B: null }; delete T.state.drafts.A;
  T.startSessionIfNeeded('A');
  T.startRestTimer({ exIdx: 0, setIdx: 0 });
  let vib99 = 0;
  const nav99prev = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global, 'navigator', { configurable: true, value: { vibrate(){ vib99++; return true; } } });
  advanceClock(61000);   // 模拟挂起：时钟走了，interval 没跑，restDone 仍是 false
  T.resumeClocks();
  check('99 回到前台不为已过期休息补响', vib99 === 0);
  check('99 置位后重复 tick 仍不响', (T.tickRest(), vib99 === 0));
  T.resetRest();
  T.startRestTimer({ exIdx: 0, setIdx: 0 });
  T.tickRest();
  check('99 未到点不响', vib99 === 0);
  advanceClock(61000);
  T.tickRest();
  check('99 正常到点仍会响一次', vib99 === 1);
  T.resetRest(); T.clearTimer();
  if(nav99prev) Object.defineProperty(global, 'navigator', nav99prev); else delete global.navigator;
  T.state.program.A = []; T.state.sessions = { A: null, B: null }; delete T.state.drafts.A;
  delete T.state.exercises.e99;

  /* ============================================================
   * 100. 天文数字组数封顶 / 负数归 null / 坏动作条目（v0.9.77）
   * normalizeItem 的 Array.from({length:n}) 对手编备份的 sets:1e9 会耗尽堆内存、2^32 直接 RangeError；
   * 经 load() 走会被 catch 吞掉——整个数据被静默重置成种子。
   * ============================================================ */
  console.log('== 100. sets 组数封顶与负数/坏条目加固（v0.9.77）==');
  check('100 sets:1e9 封顶 100 组（不 OOM）', T.normalizeItem({ exerciseId: 'e100', sets: 1000000000 }).sets.length === 100);
  check('100 sets:2^32 不再 RangeError', T.normalizeItem({ exerciseId: 'e100', sets: 4294967296 }).sets.length === 100);
  check('100 sets:Infinity 也封顶', T.normalizeItem({ exerciseId: 'e100', sets: Infinity }).sets.length === 100);
  check('100 sets:3 仍展开 3 组', T.normalizeItem({ exerciseId: 'e100', sets: 3 }).sets.length === 3);
  const m100 = T.migrate({ version: 1, logs: [],
    program: { A: [{ exerciseId: 'e100', sets: [{ weight: -5, reps: -2, duration: -1, rpe: -3, type: 'work' }] }], B: [] },
    exercises: { e100: null } });
  const s100 = m100.program.A[0].sets[0];
  check('100 负数归 null（不会以负贡献混进容量/趋势）', s100.weight === null && s100.reps === null && s100.duration === null && s100.rpe === null);
  check('100 null 动作条目补最小形状', m100.exercises.e100 && m100.exercises.e100.name === 'e100' && m100.exercises.e100.mode === 'weight');
  check('100 零值仍保留（0 不是负数）', (() => { const z = T.normalizeItem({ exerciseId: 'x', sets: [{ weight: 0, reps: 0 }] }).sets[0]; return z.weight === 0 && z.reps === 0; })());
  // 正常备份恢复不受影响
  const bk100 = T.buildBackup();
  check('100 正常备份仍可恢复', T.parseBackup(JSON.stringify(bk100)).ok === true && bk100.version === 1);

  /* ============================================================
   * 101. 普通提示不吞掉待撤销的「撤销」（v0.9.78）
   * toast() 无队列：旧逻辑里任何新提示都会覆盖 toastAction——
   * 删除记录后先来一个「已复制」，撤销按钮就悄悄没了，删除再也救不回来。
   * ============================================================ */
  console.log('== 101. 普通提示不吞掉待撤销（v0.9.78）==');
  let undo101 = 0;
  T.toast('已删除这次记录', () => { undo101++; });
  T.toast('已复制');
  check('101 撤销按钮仍在', /data-act="undo"/.test(htmlTouchedHTML('toast')));
  check('101 新提示更新了文案', String(htmlTouchedHTML('toast')).includes('已复制'));
  clickEl('toast', btnOf({ act: 'undo' }));
  check('101 撤销仍可点且生效', undo101 === 1);
  T.toast('只是一个提示');
  // 真实 DOM 里 textContent 赋值会替换全部子节点（按钮消失）；stub 不建模这一点，改从行为断言：无待撤销时点撤销不生效
  clickEl('toast', btnOf({ act: 'undo' }));
  check('101 无待撤销时普通提示不带按钮', undo101 === 1);
  let undo101b = 0, undo101c = 0;
  T.toast('删除A', () => { undo101b++; });
  T.toast('删除B', () => { undo101c++; });
  T.toast('已复制');
  clickEl('toast', btnOf({ act: 'undo' }));
  check('101 新动作替换旧动作（最后一个操作优先）', undo101c === 1 && undo101b === 0);
  T.toast('清场');

  /* ============================================================
   * 102. 代码块围栏容错扩展（v0.9.79）
   * 旧 stripFences 只认 ```json/```javascript：```js 的标签会被当成内容（误导性的「JSON 解析失败」）；
   * 两段代码块时首个 ``` 到末个 ``` 的懒惰匹配被头一段劫持，「取最后一块」的兜底不可达。
   * ============================================================ */
  console.log('== 102. 围栏容错：任意语言标签与多块取最后（v0.9.79）==');
  const j102 = '{"exercises":{"p102":{"name":"P102"}},"program":{"A":[{"exerciseId":"p102","sets":[{}]}]}}';
  check('102 ```js 围栏也能识别', T.parsePlanInput('```js\n' + j102 + '\n```').ok === true);
  check('102 ```text 围栏也能识别', T.parsePlanInput('```text\n' + j102 + '\n```').ok === true);
  check('102 普通 ```json 围栏回归', T.parsePlanInput('```json\n' + j102 + '\n```').ok === true);
  check('102 裸围栏回归', T.parsePlanInput('```\n' + j102 + '\n```').ok === true);
  const two102 = '先给一版旧方案：\n```json\n{"exercises":{"pold":{"name":"旧"}},"program":{"A":[{"exerciseId":"pold","sets":[{}]}]}}\n```\n然后是最终方案：\n```json\n' + j102 + '\n```';
  const r102 = T.parsePlanInput(two102);
  check('102 两段代码块取最后一版', r102.ok === true && !!r102.data.exercises.p102 && !r102.data.exercises.pold);
  check('102 无围栏的花括号跨度仍可用', T.parsePlanInput('最终方案 ' + j102 + ' （完）').ok === true);
  check('102 围栏未闭合也能取到内容', T.parsePlanInput('```json\n' + j102).ok === true);

  /* ============================================================
   * 103. 闭环回归：用户把自己的导出粘回导入
   * 应用卖点是 记录→导出→AI→导入；导出 JSON 本身必须能通过 validatePlan 原样导回，
   * 热身/侧别/次数区间/目标RPE/动作备注/个人备注都不能在回环中丢失。
   * ============================================================ */
  console.log('== 103. 导出→粘回导入闭环（字段不丢）==');
  T.state.program.A = [{ exerciseId: 'e103', section: '主课', note: '组间歇看心率', reps: '8-12', sets: [
    { type: 'warmup', weight: 20, reps: 10 },
    { weight: 30, reps: 10, rpe: 8, side: 'L' }
  ] }];
  T.state.exercises.e103 = { name: '动作103', muscles: '肩', mode: 'weight', unit: 'kg', tips: 't', pitfalls: 'p', tempo: '3-1-1', alternatives: 'a', personal: '我的备注' };
  delete T.state.drafts.A; delete T.state.sessions.A;
  delete T.state.drafts.B; delete T.state.sessions.B; // 导出含 B 日计划时，B 有进行中记录会被拒
  const exp103 = T.buildExport(4);
  const r103 = T.importPlan(JSON.stringify(exp103));
  if(!r103.ok) console.log('  DEBUG r103 =', String(r103.error).slice(0, 200));
  check('103 自己的导出粘回来能导入', r103.ok === true, r103.error);
  const s103 = T.state.program.A[0].sets;
  check('103 热身/侧别/目标RPE 原样保留',
    s103[0].type === 'warmup' && s103[1].rpe === 8 && s103[1].side === 'L');
  check('103 空日不写进导出（粘回不会被「program.B 是空数组」拒绝）', exp103.program.B === undefined);
  check('103 次数区间回环不丢（导出用 repsRange 拼写，导入要认）', T.state.program.A[0].repsRange === '8-12');
  const x103 = T.state.exercises.e103;
  check('103 动作库全字段回环（含个人备注与教学字段）',
    x103.personal === '我的备注' && x103.muscles === '肩' && x103.tempo === '3-1-1' && x103.alternatives === 'a');
  // 回环导入不应改变已有日志
  const logCount103 = T.state.logs.length;
  T.importPlan(JSON.stringify(T.buildExport(4)));
  check('103 重复回环不增删日志', T.state.logs.length === logCount103);
  // set 级 reps 字符串仍应被明确拒绝（区间的规范位置在 item 层）
  const bad103 = T.importPlan('{"exercises":{"e103":{"name":"动作103"}},"program":{"A":[{"exerciseId":"e103","sets":[{"reps":"8-12"}]}]}}');
  check('103 set 级字符串 reps 被明确拒绝', bad103.ok === false && /sets\[0\]\.reps 必须是数字或 null/.test(bad103.error));
  delete T.state.exercises.e103;

  /* ============================================================
   * 104. prompt 输出模板的自洽：AI 被要求照 PLAN_SCHEMA 输出，模板本身必须能通过自家校验器
   * 若有人改了模板字段（或改了 validatePlan），这条会在 CI 里先红，而不是等用户粘贴报错。
   * ============================================================ */
  console.log('== 104. PLAN_SCHEMA 能通过自家导入校验 ==');
  const bk104 = T.buildBackup();
  const aBefore104 = JSON.stringify(T.state.program.A);
  const bBefore104 = JSON.stringify(T.state.program.B);
  const r104 = T.importPlan(T.PLAN_SCHEMA);
  if(!r104.ok) console.log('  DEBUG r104 =', String(r104.error).slice(0, 200));
  check('104 输出模板本身可被导入', r104.ok === true, r104.error);
  check('104 模板只声明 A 日，不动 B 日', JSON.stringify(T.state.program.B) === bBefore104);
  T.restoreBackupText(JSON.stringify(bk104));
  T.answerConfirm(true);
  await null;
  check('104 测后状态完整还原（备份→恢复回环）',
    JSON.stringify(T.state.program.A) === aBefore104 && JSON.stringify(T.state.program.B) === bBefore104);

  /* ============================================================
   * 105. 休息归属一致性（审计 #4 缺陷 1、2，v0.9.82）
   * a) 休息条只画在归属日的卡片上——applyPlan/刷新可以带着视图切到另一日；
   * b) 历史「改一下」不再无差别 resetRest：另一日正在跑的休息由 switchDay
   *    按归属日结算成 restAfter，静默清掉会永久丢掉这段休息数据。
   * ============================================================ */
  console.log('== 105. 休息条只在归属日显示；改一下不误杀另一日的休息 ==');
  T.resetRest(); T.clearTimer();
  T.state.settings.restSec = 60;
  T.state.exercises.e105 = { name: '休息归属', mode: 'weight', unit: 'kg' };
  T.state.sessions = {
    A: { startedAt: 555000, items: [{ exerciseId: 'e105', sets: [{ done: true, weight: 30, reps: 5 }] }] },
    B: { startedAt: 666000, items: [{ exerciseId: 'e105', sets: [{ done: true, weight: 31, reps: 5 }] }] }
  };
  T.state.settings.lastDay = 'A';
  T.startRestTimer({ exIdx: 0, setIdx: 0 });   // 休息归属 A
  check('105 归属日卡片有休息条', T.fullScreenHTML('A').includes('fs-rest-bar'));
  check('105 另一日卡片不画 A 的倒计时', !T.fullScreenHTML('B').includes('fs-rest-bar'));
  T.resetRest();
  // b) 历史「改一下」：A 有进行中记录 + 正在休息，改一条 B 的旧记录
  const old105 = { date: '2026-09-01', day: 'B', startedAt: 777000, endedAt: 777500,
    exercises: [{ exerciseId: 'e105', sets: [{ done: true, weight: 5, reps: 5 }] }] };
  T.state.logs.push(old105);
  T.state.sessions = { A: { startedAt: 888000, items: [{ exerciseId: 'e105', sets: [{ done: true, weight: 30, reps: 5 }] }] }, B: null };
  T.state.settings.lastDay = 'A';
  T.startRestTimer({ exIdx: 0, setIdx: 0 });   // 归属 A（A 有进行中记录，合法）
  advanceClock(45000);
  clickEl('hist-list', btnOf({ act: 'reeditlog', ts: '777000', i: '0' }));
  check('105 改一下不丢另一日的休息：结算成 restAfter',
    T.state.sessions.A.items[0].sets[0].restAfter === 45);
  check('105 B 日正常进入编辑态', !!T.state.sessions.B && T.state.settings.lastDay === 'B');
  T.resetRest(); T.clearTimer();
  T.state.sessions = { A: null, B: null };
  T.state.logs = T.state.logs.filter(l => l.startedAt !== 777000);
  delete T.state.exercises.e105;

  /* ============================================================
   * 106. sessions 条目的 sets 形状纠正（审计 #4 缺陷 3，v0.9.83）
   * migrate 对 logs/drafts 都会剔除 sets 非数组的条目，唯独 sessions 只容忍不纠正；
   * renderToday 的 it.sets.length / flatPos 的 it.sets.forEach 直接崩。
   * ============================================================ */
  console.log('== 106. sessions 条目 sets 非数组：与日志侧同口径丢弃 ==');
  const bad106 = T.migrate({ version: 1, program: { A: [], B: [] }, exercises: {},
    sessions: { A: { startedAt: 1, items: [
      { exerciseId: 'x', sets: 'oops' },
      { exerciseId: 'y', sets: [{ done: true, weight: '20' }] }
    ] } } });
  check('106 坏 sets 的条目被丢弃、好条目保留且数字归一',
    bad106.sessions.A.items.length === 1 && bad106.sessions.A.items[0].exerciseId === 'y' &&
    bad106.sessions.A.items[0].sets[0].weight === 20);
  const bk106 = { version: 1, logs: [], program: { A: [], B: [] }, exercises: {},
    sessions: { A: { startedAt: 1, items: [{ exerciseId: 'x', sets: null }] }, B: null } };
  T.restoreBackupText(JSON.stringify(bk106)); T.answerConfirm(true); await null;
  check('106 恢复这种备份不炸：形状被纠正而不是应用失败',
    !!T.state.sessions.A && Array.isArray(T.state.sessions.A.items) && T.state.sessions.A.items.length === 0);

  /* ============================================================
   * 107. 撤销导入/再编辑/展开状态的一致性（审计 #4 缺陷 4、5、6，v0.9.84）
   * a) 有进行中记录时「撤销上次导入」应被拒绝（与导入同政策），不能把会话对着的计划换掉；
   * b) 历史「改一下」不覆盖用户今天在卡片上刚选的当日状态；
   * c) 换计划（导入/撤销/恢复）后「要点」展开状态清零，不跟到不相干的动作上。
   * ============================================================ */
  console.log('== 107. 撤销导入守卫 / 改一下不吞状态选择 / 换计划清展开 ==');
  T.resetRest(); T.clearTimer();
  const p107 = { exercises: { e107: { name: '撤销守卫', mode: 'weight', unit: 'kg' } },
    program: { B: [{ exerciseId: 'e107', sets: [{ weight: 10, reps: 5 }] }] } };
  check('107 只含 B 日的导入成功（A 有进行中记录不受影响）', T.importPlan(JSON.stringify(p107)).ok === true);
  T.state.sessions.A = { startedAt: 999000, items: [{ exerciseId: 'x107', sets: [{ done: true, weight: 1, reps: 1 }] }] };
  T.state.lastImport = { at: Date.now(), program: JSON.parse(JSON.stringify(T.state.program)), exercises: JSON.parse(JSON.stringify(T.state.exercises)) };
  const progSnap107 = JSON.stringify(T.state.program);
  T.undoImport();
  check('107 有进行中记录时撤销被拒绝（计划与快照都不动）',
    !!T.state.lastImport && JSON.stringify(T.state.program) === progSnap107);
  // c) 展开状态：先置一个展开标记，再换 A 日计划
  T.state.sessions.A = null;
  T.openNotes()['A:0'] = true;
  const pA107 = { exercises: { e107b: { name: '展开清零', mode: 'weight', unit: 'kg' } },
    program: { A: [{ exerciseId: 'e107b', sets: [{ weight: 5, reps: 5 }] }] } };
  check('107 A 日导入成功', T.importPlan(JSON.stringify(pA107)).ok === true);
  check('107 换计划后要点展开状态被清', !T.openNotes()['A:0']);
  // b) 改一下不吞 condDraft：用户先在 A 日卡片选了「差」，再去历史改一条 B 的旧记录
  T.state.sessions = { A: null, B: null };
  T.state.condDraft.A = '差';   // 就地改：模块持有 condDraft 的别名
  const old107 = { date: '2026-09-02', day: 'B', startedAt: 888001,
    exercises: [{ exerciseId: 'e107', sets: [{ done: true, weight: 10, reps: 5 }] }] };
  T.state.logs.push(old107);
  clickEl('hist-list', btnOf({ act: 'reeditlog', ts: '888001', i: String(T.state.logs.length - 1) }));
  check('107 改一下不覆盖用户刚选的当日状态', T.state.condDraft.A === '差');
  check('107 B 日正常进入编辑态', !!T.state.sessions.B);
  T.state.logs = T.state.logs.filter(l => l.startedAt !== 888001);
  T.state.sessions = { A: null, B: null };
  T.state.condDraft.A = null;
  delete T.state.exercises.e107; delete T.state.exercises.e107b;

  /* ============================================================
   * 108. 训练卡里的回车推进流（v0.9.85）
   * 重量框 Enter → 先提交再聚焦次数框；次数/时长框 Enter → 先提交再点完成。
   * 用 patchTarget 桩 document.querySelector：处理器按分支只查一种选择器，逐条断言。
   * ============================================================ */
  console.log('== 108. Enter：重量→次数跳转；次数→完成 ==');
  T.state.exercises.e108 = { name: '回车流', mode: 'weight', unit: 'kg' };
  T.state.program.A = [{ exerciseId: 'e108', sets: [{ weight: 5, reps: 5 }] }];
  T.state.program.B = [];
  T.state.settings.lastDay = 'A';
  delete T.state.drafts.A;
  const mkInp108 = f => ({
    dataset: { ex: '0', set: '0', f }, value: '',
    classList: { contains: () => false },
    closest(sel){ return /^input(\.fs-input)?$/.test(sel) ? this : null; },
    dispatchEvent(ev){ if(ev.type === 'change') handlers.get('ex-list|change')({ target: this }); },
    focus(){ this.focused = true; }
  });
  const key108 = inp => handlers.get('ex-list|keydown')({ key: 'Enter', target: inp, preventDefault(){} });
  const wInp108 = mkInp108('weight'); wInp108.value = '50';
  const rInp108 = mkInp108('reps');
  patchTarget = { matches: sel => sel.includes('data-f="reps"'), node: rInp108 };
  key108(wInp108);
  const it108 = T.state.drafts.A && T.state.drafts.A[0];
  check('108 重量框 Enter：先提交 50', !!it108 && it108.sets[0].weight === 50);
  check('108 重量框 Enter：聚焦次数框而不是完成', rInp108.focused === true && it108.sets[0].done !== true);
  let doneClicked108 = false;
  patchTarget = { matches: sel => sel.includes('fs-done'), node: { click(){ doneClicked108 = true; } } };
  const rInp2 = mkInp108('reps'); rInp2.value = '8';
  key108(rInp2);
  check('108 次数框 Enter：提交 8 并点完成',
    T.state.drafts.A[0].sets[0].reps === 8 && doneClicked108 === true);
  // 非 Enter 键与非输入框都不动作
  doneClicked108 = false;
  handlers.get('ex-list|keydown')({ key: 'a', target: mkInp108('reps'), preventDefault(){} });
  handlers.get('ex-list|keydown')({ key: 'Enter', target: { closest: () => null }, preventDefault(){} });
  check('108 其他按键/非训练输入框不触发', doneClicked108 === false);
  patchTarget = null;
  delete T.state.exercises.e108; delete T.state.drafts.A;

  /* ============================================================
   * 109. 清除全部数据前把备份尽力复制到剪贴板（v0.9.86，v0.9.95 挪到两次确认之间）
   * ok1 后先 copyText，最后一次确认如实说明有没有留成底。
   * 剪贴板不可用（无 writeText、execCommand 缺失）也不阻断清除。
   * ============================================================ */
  console.log('== 109. 清除前尝试留备份到剪贴板（v0.9.86/v0.9.95）==');
  T.state.logs = [{ date: '2026-01-02', day: 'A', startedAt: 991001, exercises: [] }];
  // §95 之后模块 clearingAll 已为 true（只有重新加载会复位），flushSave 是空转——直接种存储
  global.localStorage._d['ironlog.v1'] = 'seed109';
  const nav109prev = Object.getOwnPropertyDescriptor(global, 'navigator');
  let copied109 = '';
  Object.defineProperty(global, 'navigator', { configurable: true, value: {
    clipboard: { writeText(t){ copied109 = t; return Promise.resolve(); } }
  } });
  global.location = { reload(){} };
  T.clearAll();
  T.answerConfirm(true); await null; await null; await null;   // 留底走异步剪贴板：三拍后才到第二次确认
  check('109 最后确认如实说已留底', String(document.getElementById('confirm-desc').textContent).includes('已复制到剪贴板'));
  T.answerConfirm(true); await null;
  await null; await null;
  check('109 剪贴板收到完整备份', /"type":"ironlog-backup"/.test(copied109) && /991001/.test(copied109));
  check('109 清除照常执行', global.localStorage._d['ironlog.v1'] === undefined);
  // 无剪贴板时不阻断清除，且确认文案改口
  Object.defineProperty(global, 'navigator', { configurable: true, value: {} });
  global.localStorage._d['ironlog.v1'] = 'seed109b';
  T.clearAll();
  T.answerConfirm(true); await null; await null;   // 无剪贴板时回退是同步的，但仍隔一层 await copyText
  check('109 无剪贴板时确认改口留不了底', String(document.getElementById('confirm-desc').textContent).includes('留不了底'));
  T.answerConfirm(true); await null;
  await null;
  check('109 剪贴板不可用也能清除', global.localStorage._d['ironlog.v1'] === undefined);
  delete global.location;
  if(nav109prev) Object.defineProperty(global, 'navigator', nav109prev); else delete global.navigator;
  T.state.logs = [];

  /* ============================================================
   * 110. 手改备份里的荒谬设置值要封顶（v0.9.87）
   * restSec/warmupRestSec ≤1800、weightStep ≤100 —— 与设置页同口径；
   * 正常范围内的值原样保留。
   * ============================================================ */
  console.log('== 110. 设置值封顶（v0.9.87）==');
  const m110 = T.migrate({ version: 1, logs: [], settings: { restSec: 1e9, warmupRestSec: 99999, weightStep: 1e9 } });
  check('110 restSec 封顶 1800', m110.settings.restSec === 1800);
  check('110 warmupRestSec 封顶 1800', m110.settings.warmupRestSec === 1800);
  check('110 weightStep 封顶 100', m110.settings.weightStep === 100);
  const m110b = T.migrate({ version: 1, logs: [], settings: { restSec: 120, warmupRestSec: 0, weightStep: 5 } });
  check('110 正常值原样保留（0 仍是合法的关闭值）', m110b.settings.restSec === 120 && m110b.settings.warmupRestSec === 0 && m110b.settings.weightStep === 5);

  /* ============================================================
   * 111. trends.volume 与界面聚合同口径：lb 换算成 kg（v0.9.88）
   * 35lb×12 的绳 ≈191 kg·次，不是 420；kg 动作原样。
   * 数据说明要解释 volume/avgRpe/direction/top 选组口径。
   * ============================================================ */
  console.log('== 111. trends.volume 换算与数据说明覆盖（v0.9.88）==');
  T.state.exercises.e111 = { name: '弹力绳111', mode: 'band', unit: 'lb' };
  T.state.exercises.e111b = { name: '哑铃111', mode: 'weight', unit: 'kg' };
  const logs111 = [{ date: '2026-02-01', day: 'A', startedAt: 1, exercises: [
    { exerciseId: 'e111', sets: [{ weight: 35, reps: 12, done: true }] },
    { exerciseId: 'e111b', sets: [{ weight: 10, reps: 10, done: true }] },
  ] }];
  const tr111 = T.buildTrends(logs111);
  check('111 lb 容量换算成 kg·次', tr111.e111.sessions[0].volume === Math.round(35 * 0.45359237 * 12));
  check('111 kg 容量原样', tr111.e111b.sessions[0].volume === 100);
  T.state.logs = logs111;
  const p111 = T.buildPrompt(T.buildExport(1));
  check('111 数据说明解释 volume 口径', p111.includes('volume 是该次正式组的负荷合计') && p111.includes('lb 已统一换算为 kg'));
  check('111 数据说明解释 direction 与 top 选组', p111.includes('direction 是应用基于该动作近史的判定') && p111.includes('最大重量→否则最长时间→否则最多次数'));
  delete T.state.exercises.e111; delete T.state.exercises.e111b; T.state.logs = [];

  /* ============================================================
   * 112. 趋势指标口径统一（v0.9.89）
   * a) sessionKind 与 trendKind/trendMetric 同序（weight 先）——混合组不再被图内过滤剔除；
   * b) 单位大小写归一："LB" 参与换算与分组；
   * c) weight 类单位缺失时图例与标题一致念 kg。
   * ============================================================ */
  console.log('== 112. sessionKind 同序 / 单位归一 / 单位兜底（v0.9.89）==');
  check('112 sessionKind 混合组按 weight（与 trendKind 同序）',
    T.sessionKind({ top: { weight: 50, duration: 30 } }) === 'weight' &&
    T.sessionKind({ top: { weight: null, duration: 30 } }) === 'duration' &&
    T.sessionKind({ top: { weight: null, duration: null, reps: 8 } }) === 'reps');
  const log112 = (id, w) => [{ date: '2026-02-02', day: 'A', startedAt: 1, exercises: [
    { exerciseId: id, sets: [{ weight: w, reps: 10, done: true }] }] }];
  const two112 = (id, w) => [{ date: '2026-02-01', day: 'A', startedAt: 1, exercises: [
    { exerciseId: id, sets: [{ weight: w, reps: 10, done: true }] }] },
    { date: '2026-02-02', day: 'A', startedAt: 2, exercises: [
    { exerciseId: id, sets: [{ weight: w, reps: 10, done: true }] }] }];
  // 混合组：LB + kg → 全部换算成 kg 画
  T.state.exercises.e112a = { name: 'LB动作', mode: 'weight', unit: 'LB' };
  T.state.exercises.e112b = { name: 'kg动作', mode: 'weight', unit: 'kg' };
  T.state.logs = [
    { date: '2026-02-01', day: 'A', startedAt: 1, exercises: [
      { exerciseId: 'e112a', sets: [{ weight: 50, reps: 10, done: true }] },
      { exerciseId: 'e112b', sets: [{ weight: 100, reps: 10, done: true }] }] },
    { date: '2026-02-02', day: 'A', startedAt: 2, exercises: [
      { exerciseId: 'e112a', sets: [{ weight: 50, reps: 10, done: true }] },
      { exerciseId: 'e112b', sets: [{ weight: 100, reps: 10, done: true }] }] },
  ];
  const ch112 = T.buildTrendCharts(T.buildTrends(T.state.logs), 5);
  check('112 LB 参与换算画在 kg 轴', /重量（kg）/.test(ch112) && ch112.includes('22.68'));
  // 单一 LB 组：标题念 lb、不换算
  T.state.exercises.e112b.unit = 'lb';
  const ch112b = T.buildTrendCharts(T.buildTrends(T.state.logs), 5);
  check('112 单位一致保持原单位', /重量（lb）/.test(ch112b) && !ch112b.includes('22.7') && ch112b.includes('50 lb'));
  // weight 类 unit:null：图例与标题一致念 kg
  T.state.exercises.e112b.unit = null;
  const ch112c = T.buildTrendCharts(T.buildTrends(two112('e112b', 100)), 5);
  check('112 单位缺失图例念 kg（与标题一致）', /重量（kg）/.test(ch112c) && ch112c.includes('100 kg'));
  check('112 normUnit 归一大小写与空格', (() => { T.state.exercises.e112a.unit = ' Lb '; return T.normUnit('e112a') === 'lb'; })());
  delete T.state.exercises.e112a; delete T.state.exercises.e112b; T.state.logs = [];

  /* ============================================================
   * 113. SEED 种子计划自洽（v0.9.90）
   * 热身分区的组全部 type:'warmup'（休息预算走 warmupRestSec、不进趋势/PR/容量）；
   * 主项区仍保留 work 组；bird_dog 两日都不标 side（左右交替动作，标 L/R 反而误导）。
   * 用 migrate 缺 program 时的 SEED 深拷贝取原始数据。
   * ============================================================ */
  console.log('== 113. SEED 热身分区 type 与 side 一致性（v0.9.90）==');
  const m113 = T.migrate({ version: 1, logs: [] });
  const warmSecs = it => it.section === '1. 动态升温与激活' || it.section === '热身 8 分钟';
  const warmItems113 = [...m113.program.A, ...m113.program.B].filter(warmSecs);
  check('113 热身分区确实有内容可查', warmItems113.length >= 11);
  check('113 热身分区全部组 type=warmup', warmItems113.every(it => it.sets.every(s => s.type === 'warmup')));
  const mainItems113 = [...m113.program.A, ...m113.program.B].filter(it => !warmSecs(it));
  check('113 主项/辅助区仍有正式组（没有误伤）', mainItems113.every(it => it.sets.some(s => s.type === 'work')));
  const bd113 = [...m113.program.A, ...m113.program.B].filter(it => it.exerciseId === 'bird_dog');
  check('113 bird_dog 两日都不标 side', bd113.length === 2 && bd113.every(it => it.sets.every(s => s.side == null)));

  /* ============================================================
   * 114. 溢出与小数逗号（v0.9.91）
   * 粘贴超长数字/1e308 → round2 v*100 溢出 Infinity → 按非法值置 null
   * （否则输入框显示 Infinity、容量 ∞、假 PR、JSON.stringify 静默变 null）。
   * 欧系小数逗号「12,5」→12.5；千分位「1,500」不动（避免 1500 读成 1.5）。
   * ============================================================ */
  console.log('== 114. 数值溢出置 null + 小数逗号归一（v0.9.91）==');
  T.state.program.A = [{ section: '', exerciseId: 'test47', repsRange: '', sets: [{ type: 'work', weight: 10, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null }] }];
  delete T.state.drafts.A; delete T.state.sessions.A; T.state.settings.lastDay = 'A'; T.curPos = 0;
  T.render();
  const inp114 = makeEl('fs-input-114');
  inp114.dataset = { ex: '0', set: '0', f: 'weight' };
  const fire114 = v => { inp114.value = v; handlers.get('ex-list|change')({ target: { closest: sel => sel === 'input' ? inp114 : null } }); };
  const w114 = () => T.getItems('A')[0].sets[0].weight;
  fire114('1e308');
  check('114 1e308 溢出置 null', w114() === null);
  check('114 溢出后输入框清空', inp114.value === '');
  fire114('9'.repeat(300));
  check('114 300 位数字（有限但荒谬）置 null', w114() === null);
  fire114('99999');
  check('114 封顶内的大数保留', w114() === 99999);
  fire114('12,5');
  check('114 「12,5」解析为 12.5', w114() === 12.5);
  fire114('12，5');
  check('114 全角逗号「12，5」解析为 12.5', w114() === 12.5);
  fire114('1,500');
  check('114 千分位「1,500」不按小数处理', w114() === 1);
  fire114('12.5');
  check('114 正常小数不受影响', w114() === 12.5);
  delete T.state.drafts.A;

  /* ============================================================
   * 115. 步进精度 1.25 档 + 自由文本封顶（v0.9.92）
   * weightStep round1→round2：1.25 是现实微片档，不能被改成 1.3。
   * 备注/个人/休息说明/背景封顶：超长文本写爆 localStorage 配额会连累全部持久化。
   * ============================================================ */
  console.log('== 115. weightStep 保留 1.25 档 + 自由文本长度封顶（v0.9.92）==');
  const ws115 = makeEl('weight-step');
  ws115.value = '1.25'; handlers.get('weight-step|change')({ target: ws115 });
  check('115 weightStep 1.25 保留', T.state.settings.weightStep === 1.25);
  check('115 写回输入框一致', String(ws115.value) === '1.25');
  ws115.value = '1.234'; handlers.get('weight-step|change')({ target: ws115 });
  check('115 weightStep 归一到 0.01 精度', T.state.settings.weightStep === 1.23);
  ws115.value = '0.2'; handlers.get('weight-step|change')({ target: ws115 });
  check('115 低于 0.5 仍回默认 2.5', T.state.settings.weightStep === 2.5);
  T.state.settings.weightStep = 2.5;
  // 动作备注封顶 500
  T.state.program.A = [{ section: '', exerciseId: 'test47', repsRange: '', sets: [{ type: 'work', weight: 10, reps: 10 }] }];
  delete T.state.drafts.A; delete T.state.sessions.A; T.state.settings.lastDay = 'A'; T.curPos = 0;
  T.render();
  const note115 = makeEl('fs-exnote-115');
  note115.classList.add('fs-exnote');
  note115.dataset = { ex: '0' };
  note115.value = '备'.repeat(600);
  handlers.get('ex-list|change')({ target: { closest: sel => sel === 'input' ? note115 : null } });
  check('115 动作备注封顶 500 字', T.getItems('A')[0].note === '备'.repeat(500));
  // 背景/休息说明封顶
  handlers.get('profile-bg|change')({ target: { value: '背'.repeat(3000) } });
  check('115 背景封顶 2000 字', T.state.profile.background === '背'.repeat(2000));
  handlers.get('rest-note|change')({ target: { value: '休'.repeat(300) } });
  check('115 休息说明封顶 200 字', T.state.settings.restNote === '休'.repeat(200));
  T.state.profile.background = ''; T.state.settings.restNote = '';
  delete T.state.drafts.A;

  /* ============================================================
   * 116. 非法日历日期不念「周undefined」+ 导入校验补 mode/unit + schema 说明（v0.9.93）
   * fmtDate：格式对但日历不存在（2025-02-30）→ 只念日期本身。
   * validatePlan：写了 mode 必须是四种之一、unit 必须是字符串或 null（'LB' 这类历史写法放行）。
   * PLAN_SCHEMA：rpeLabel 进模板（否则 AI 导入后目标 RPE 说明静默丢失）；
   *   字段规则明说 program 至少一日（AI 判断无需调整时按旧指令输出空 program 必被拒）。
   * ============================================================ */
  console.log('== 116. 非法日历 + mode/unit 校验 + schema 完整性（v0.9.93）==');
  check('116 2025-02-30 不出现 周undefined', T.fmtDate('2025-02-30') === '2025-02-30');
  check('116 2025-13-01 不出现 周undefined', T.fmtDate('2025-13-01') === '2025-13-01');
  check('116 真实闰日正常带星期', /周./.test(T.fmtDate('2024-02-29')));
  check('116 缺 date 仍念未知日期', T.fmtDate('') === '未知日期');
  const ex116 = { e116: { name: '测试动作', mode: 'weight', unit: 'kg' } };
  const it116 = [{ section: '', exerciseId: 'e116', sets: [{ type: 'work', weight: 10, reps: 10, duration: null, rpe: 8, rpeLabel: '留 2 次', side: null }] }];
  const bad116m = T.importPlan(JSON.stringify({ type: 'ai-plan', exercises: { e116: { name: 'x', mode: 'body-weight' } }, program: { A: it116 } }));
  check('116 非法 mode 被拒', !bad116m.ok && /mode/.test(bad116m.error));
  const bad116u = T.importPlan(JSON.stringify({ type: 'ai-plan', exercises: { e116: { name: 'x', mode: 'weight', unit: 7 } }, program: { A: it116 } }));
  check('116 数字 unit 被拒', !bad116u.ok && /unit/.test(bad116u.error));
  const bad116e = T.importPlan(JSON.stringify({ type: 'ai-plan', exercises: { e116: '不是对象' }, program: { A: it116 } }));
  check('116 非对象 exercise 条目被拒', !bad116e.ok && /e116 必须是对象/.test(bad116e.error));
  const bad116p = T.importPlan(JSON.stringify({ type: 'ai-plan', exercises: ex116, program: {} }));
  check('116 空 program 仍被拒（与指令一致）', !bad116p.ok && /至少/.test(bad116p.error) === false && /必须包含 A 或 B/.test(bad116p.error));
  const ok116 = T.importPlan(JSON.stringify({ type: 'ai-plan', day: 'A', exercises: { e116: { name: '测试动作', mode: 'weight', unit: 'kg' } }, program: { A: it116 } }));
  check('116 合法导入通过', ok116.ok);
  check('116 rpeLabel 随导入保留', T.state.program.A[0].sets[0].rpeLabel === '留 2 次');
  check('116 schema 含 rpeLabel 与至少一日规则', T.PLAN_SCHEMA.includes('rpeLabel') && T.PLAN_SCHEMA.includes('至少要写一个日'));
  check('116 数据说明含 settings 口径', T.buildPrompt(T.buildExport(4)).includes('不是训练数据'));
  delete T.state.exercises.e116;

  /* ============================================================
   * 117. 模态键盘纪律 + 抽屉 Tab 序列（v0.9.94）
   * ESC 关闭最上层模态（确认=取消、小结=关闭）；模态打开时背景 inert；
   * Enter 推进流在模态打开时不触发（老浏览器双保险）；
   * 抽屉 aria-expanded 成对切换、关闭态 visibility:hidden 不进 Tab 序列。
   * ============================================================ */
  console.log('== 117. 模态/抽屉键盘纪律（v0.9.94）==');
  const drawerEl117 = document.getElementById('drawer');
  const hamEl117 = document.getElementById('hamburger-btn');
  const confirmOv117 = document.getElementById('confirm-overlay');
  const summaryOv117 = document.getElementById('summary-overlay');
  let res117 = null;
  T.askConfirm({ title: 't117' }).then(v => { res117 = v; });
  check('117 确认打开时背景 inert', confirmOv117.classList.contains('show') && drawerEl117.attrs.inert === '');
  docHandlers.get('keydown')({ key: 'Escape' });
  await null;
  check('117 ESC 关闭确认并按取消解决', !confirmOv117.classList.contains('show') && res117 === false && drawerEl117.attrs.inert === undefined);
  T.showSummary({ day: 'A', exercises: [], durationSec: 0 });
  check('117 小结打开时背景 inert', summaryOv117.classList.contains('show') && drawerEl117.attrs.inert === '');
  // Enter 推进流在模态打开时不触发
  let fired117 = 0;
  const inp117 = {
    dataset: { ex: '0', set: '0', f: 'weight' },
    classList: makeClassList(),
    closest: sel => /^input(\.fs-input)?$/.test(sel) ? inp117 : null,
    dispatchEvent(){ fired117++; handlers.get('ex-list|change')({ target: { closest: () => inp117 } }); return true; },
    focus(){},
  };
  handlers.get('ex-list|keydown')({ key: 'Enter', target: inp117, preventDefault(){} });
  check('117 小结开着时 Enter 不推进', fired117 === 0);
  docHandlers.get('keydown')({ key: 'Escape' });
  check('117 ESC 关闭小结', !summaryOv117.classList.contains('show') && drawerEl117.attrs.inert === undefined);
  handlers.get('ex-list|keydown')({ key: 'Enter', target: inp117, preventDefault(){} });
  check('117 关闭后 Enter 恢复可用', fired117 === 1);
  delete T.state.drafts.A;
  T.toggleDrawer();
  check('117 开抽屉 aria-expanded=true', hamEl117.attrs['aria-expanded'] === 'true' && drawerEl117.classList.contains('open'));
  T.closeDrawer();
  check('117 关抽屉 aria-expanded=false', hamEl117.attrs['aria-expanded'] === 'false' && !drawerEl117.classList.contains('open'));
  const css117 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
  check('117 抽屉关闭态 visibility:hidden（不进 Tab 序列）', /\.drawer\{[^}]*visibility:hidden/.test(css117) && /\.drawer\.open\{[^}]*visibility:visible/.test(css117));
  check('117 汉堡带 aria-expanded/aria-controls', html.includes('aria-expanded="false"') && html.includes('aria-controls="drawer"'));

  /* ============================================================
   * 118. copyText 回退复制入参本身；仅数据导出紧凑+文案分路；切视图回顶（v0.9.95）
   * 回退路径复制的是 #export-text 的内容——不先写入 t 就会复制出旧文本（clearAll 场景）。
   * 「仅复制数据」与 prompt 内嵌 JSON 同一紧凑序列化，字符数不翻倍；
   * 完成提示按分支分开：裸 JSON 没有输出模板，不能承诺「返回的 JSON 可直接导入」。
   * ============================================================ */
  console.log('== 118. 复制回退/导出文案分路/切视图回顶（v0.9.95）==');
  const nav118prev = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global, 'navigator', { configurable: true, value: {} });   // 无异步剪贴板 → 走回退
  let exec118 = 0;
  document.getElementById('export-text').value = '上一次的旧导出';
  global.document.execCommand = () => { exec118++; return true; };
  const ok118 = await T.copyText('hello118');
  check('118 回退复制前先写入入参文本', ok118 === true && exec118 === 1 && document.getElementById('export-text').value === 'hello118');
  delete global.document.execCommand;
  Object.defineProperty(global, 'navigator', nav118prev);
  // 仅数据导出：紧凑 JSON + 文案不承诺可导入
  T.state.logs = [{ date: '2026-01-03', day: 'A', startedAt: 995001, exercises: [{ exerciseId: 'goblet_squat', sets: [{ done: true, weight: 10, reps: 5 }] }] }];
  await T.doExportData();
  const exp118 = document.getElementById('export-text').value;
  check('118 数据分支紧凑序列化（不缩进翻倍）', JSON.parse(exp118) && !/\n\s+"/.test(exp118));
  check('118 数据分支文案不承诺直接导入', String(textOf('export-msg')).includes('纯数据快照') && !String(textOf('export-msg')).includes('返回的 JSON 可直接'));
  await T.doExport();
  check('118 含 prompt 分支文案不变', String(textOf('export-msg')).includes('返回的 JSON 可直接用「导入 AI 方案」导入'));
  // 切视图回顶
  let scrolled118 = false;
  const prevScroll118 = global.window.scrollTo;
  global.window.scrollTo = () => { scrolled118 = true; };
  T.switchView('history');
  check('118 切视图回到页首', scrolled118 === true);
  global.window.scrollTo = prevScroll118;
  T.switchView('today');
  check('118 导出框 placeholder 不再只说 JSON 快照', !html.includes('JSON 快照显示在这里'));
  T.state.logs = [];

  /* ============================================================
   * 119. 撤销导入不吞「导入之后」写的个人备注（审计 #8 发现1，v0.9.96）
   * 撤销按钮常驻：导入→写备注→撤销，整体回滚会无声吞掉用户刚写的备注。
   * 与 applyPlan 同政策：personal 以当前值为准；导入新增的动作不随撤销移出库。
   * ============================================================ */
  console.log('== 119. 撤销导入保留导入后写的个人备注（v0.9.96）==');
  T.resetRest(); T.clearTimer();
  T.state.sessions = { A: null, B: null };
  T.state.lastImport = null;
  // 快照：导入前的库与计划
  const snapEx119 = { e119: { name: '撤销前', mode: 'weight', unit: 'kg', personal: '旧备注' } };
  const snapProg119 = { A: [{ exerciseId: 'e119', sets: [{ weight: 5, reps: 5 }] }], B: [] };
  // 当前：导入后的库（e119 字段被 AI 改过 + 新增 eNew119），且用户导入后又改了备注
  T.state.exercises = { e119: { name: '导入改名', mode: 'weight', unit: 'kg', personal: '导入后新写的备注' },
                        eNew119: { name: '新增动作', mode: 'bodyweight', unit: null, personal: '新动作备注' } };
  T.state.program = { A: [{ exerciseId: 'eNew119', sets: [{ reps: 10 }] }], B: [] };
  T.state.drafts = T.state.drafts || {}; delete T.state.drafts.A; delete T.state.drafts.B;
  T.state.lastImport = { at: Date.now(), program: JSON.parse(JSON.stringify(snapProg119)), exercises: JSON.parse(JSON.stringify(snapEx119)) };
  T.undoImport();
  check('119 计划恢复为导入前', JSON.stringify(T.state.program.A) === JSON.stringify(snapProg119.A) && T.state.lastImport === null);
  check('119 动作字段按快照恢复但 personal 保留当前值',
    T.state.exercises.e119.name === '撤销前' && T.state.exercises.e119.personal === '导入后新写的备注');
  check('119 导入新增的动作不随撤销移出库（其备注也在）',
    !!T.state.exercises.eNew119 && T.state.exercises.eNew119.personal === '新动作备注');
  check('119 撤销后当前查看位置清零', T.state.ui.curPos.A === 0 && T.state.ui.curPos.B === 0);
  T.state.exercises = {}; T.state.program = { A: [], B: [] };

  /* ============================================================
   * 120. 趋势方向只在与当前类型同口径的记录上判定；单位同义词归一（审计 #8 发现2+3，v0.9.97）
   * a) time→weight 变更后的动作：秒与 kg 原始互比会得出假 down，只比当前类型的记录；
   * b) lbs/pounds 与 lb 同一归一：容量换算、混用组判定、图上换算三处口径一致。
   * ============================================================ */
  console.log('== 120. 趋势方向同类型判定 + 单位同义词归一（v0.9.97）==');
  T.state.exercises.e120 = { name: '改过类型的动作120', mode: 'weight', unit: 'kg' };
  const log120 = (n, dur, w) => ({ date: `2026-03-0${n}`, day: 'A', startedAt: n, exercises: [
    { exerciseId: 'e120', sets: [dur != null ? tset({ duration: dur }) : tset({ weight: w, reps: 8 })] }] });
  const logs120 = [log120(1, 30), log120(2, 60), log120(3, 90), log120(4, null, 20), log120(5, null, 25)];
  const tr120 = T.buildTrends(logs120);
  check('120 方向只按当前类型的记录判定（30→90 秒不再把 20→25kg 判成下降）', tr120.e120.direction === 'up');
  check('120 sessions 仍保留完整历史（导出不受过滤影响）', tr120.e120.sessions.length === 5);
  T.state.exercises.e120b = { name: 'lbs动作120', mode: 'weight', unit: 'lbs' };
  T.state.exercises.e120c = { name: 'kg动作120', mode: 'weight', unit: 'kg' };
  const logs120b = [{ date: '2026-03-10', day: 'A', startedAt: 9, exercises: [
    { exerciseId: 'e120b', sets: [{ weight: 35, reps: 10, done: true }] },
    { exerciseId: 'e120c', sets: [{ weight: 50, reps: 10, done: true }] }] },
    { date: '2026-03-12', day: 'A', startedAt: 10, exercises: [
    { exerciseId: 'e120b', sets: [{ weight: 35, reps: 10, done: true }] },
    { exerciseId: 'e120c', sets: [{ weight: 50, reps: 10, done: true }] }] }];
  const tr120b = T.buildTrends(logs120b);
  check('120 lbs 容量与 lb 一样换算成 kg·次', tr120b.e120b.sessions[0].volume === Math.round(35 * 0.45359237 * 10));
  check('120 normUnit 把 lbs/pounds 归一到 lb', T.normUnit('e120b') === 'lb');
  check('120 itemsVolume 对 lbs 与 lb 同口径换算', Math.abs(T.itemsVolume([{ exerciseId: 'e120b', sets: [{ done: true, weight: 35, reps: 10 }] }]) - 35 * 0.45359237 * 10) < 1e-6);
  const ch120 = T.buildTrendCharts(T.buildTrends(logs120b), 5);
  check('120 lbs+kg 混用组标题 kg 且 lbs 值换算后画轴（图例 15.88 而非 35）',
    ch120.includes('重量（kg）') && ch120.includes('15.88 kg') && !/>35 kg</.test(ch120));
  delete T.state.exercises.e120; delete T.state.exercises.e120b; delete T.state.exercises.e120c;
  T.state.logs = [];

  /* ============================================================
   * 121. 审计 #9：导入数值上限 / sets 封顶 / 草稿与计划对齐 / 尾逗号兜底 / 导入守卫与提示（v0.9.98）
   * F2 1e400→Infinity 当场拒收；F3 sets 数组封顶 100 + targetLabel 不展开；F4 同数不同 id 重建草稿；
   * F1 另一日导入不得改正在记录动作的类型/单位；F5 撤销丢弃草稿要说明；
   * F6 尾逗号只作兜底（不动字符串）；F7 解析失败中文文案；F8 步进框允许 1.25。
   * ============================================================ */
  console.log('== 121. 导入数值/结构上限 + 草稿对齐 + 导入撤销提示（v0.9.98）==');
  T.state.exercises = { e121: { name: '动作121', mode: 'weight', unit: 'kg' } };
  const plan121 = w => '{"exercises":{"e121":{"name":"动作121","mode":"weight","unit":"kg"}},"program":{"A":[{"exerciseId":"e121","sets":[{"weight":' + w + ',"reps":10}]}]}}';
  const r121a = T.importPlan(plan121('1e400'));
  check('121 导入 1e400（Infinity）被拒并说清原因', !r121a.ok && /有限数字/.test(r121a.error));
  check('121 导入超 1e6 数值被拒', !T.importPlan(plan121('2e6')).ok);
  const m121 = T.migrate({ version: 1, logs: [{ date: '2026-01-01', day: 'A', exercises: [
    { exerciseId: 'e121', sets: [{ weight: 1e400, reps: 5, done: true }] }] }] });
  check('121 手编备份里的 1e400 恢复时归 null（不再保存后静默消失）', m121.logs[0].exercises[0].sets[0].weight === null);
  const big121 = JSON.stringify({ exercises: { e121: { name: '动作121', mode: 'weight', unit: 'kg' } },
    program: { A: [{ exerciseId: 'e121', sets: Array.from({ length: 150 }, () => ({ reps: 8 })) }] } });
  const r121c = T.importPlan(big121);
  check('121 sets 数组同样封顶 100 组', r121c.ok && T.state.program.A[0].sets.length === 100);
  check('121 百组目标标签正常（reduce 极值，不再撞 Math.min 展开上限）', T.targetLabel(T.getItems('A')[0]) === '100 × 8');
  T.state.drafts.A = null;
  T.state.exercises.e121b = { name: '替换动作', mode: 'weight', unit: 'kg' };
  T.getItems('A');
  T.state.program.A = [{ exerciseId: 'e121b', sets: [{ reps: 8 }] }];
  check('121 同组数但换了动作 id：草稿按新计划重建（名实不错位）', T.getItems('A')[0].exerciseId === 'e121b');
  T.state.drafts.A = null;
  T.state.sessions.A = { startedAt: 1, items: [{ exerciseId: 'e121b', sets: [{ weight: 10, reps: 10, done: true }] }] };
  const planB121 = JSON.stringify({ exercises: { e121b: { name: '替换动作', mode: 'time', unit: null } },
    program: { B: [{ exerciseId: 'e121b', sets: [{ duration: 30 }] }] } });
  const r121d = T.importPlan(planB121);
  check('121 只含另一日的导入不能改掉正在记录动作的类型', !r121d.ok && /正在记录的动作会被这次导入改成类型/.test(r121d.error));
  const planU121 = JSON.stringify({ exercises: { e121b: { name: '替换动作', mode: 'weight', unit: 'lb' } },
    program: { B: [{ exerciseId: 'e121b', sets: [{ weight: 30 }] }] } });
  check('121 正在记录的动作换单位同样被拦', !T.importPlan(planU121).ok && /单位/.test(T.importPlan(planU121).error));
  T.state.sessions.A = null;
  const r121e = T.importPlan(planU121);
  // importPlan 本身不拍快照（只有界面 doImport 流程会），撤销测试需手工构造 lastImport
  T.state.lastImport = { at: Date.now(),
    program: { A: JSON.parse(JSON.stringify(T.state.program.A)), B: [] },
    exercises: JSON.parse(JSON.stringify(T.state.exercises)) };
  const draft121 = T.getItems('A');
  draft121[0].note = '刚写的备注';
  T.undoImport();
  check('121 撤销导入丢弃已填草稿时在提示里说明', String(elsById.get('toast').textContent).includes('已丢弃未确认草稿'));
  const keep121 = T.parsePlanInput('{"exercises":{"e121":{"name":"a, } b","mode":"weight"}},"program":{"A":[{"exerciseId":"e121","sets":[{"reps":8}]}]}}');
  check('121 合法 JSON 里字符串含 ", }" 原样保留（兜底正则不先动原文）', keep121.ok && keep121.data.exercises.e121.name === 'a, } b');
  const ok121 = T.parsePlanInput('{"exercises":{"e121":{"name":"a","mode":"weight"}},"program":{"A":[{"exerciseId":"e121","sets":[{"reps":8}], }],},}');
  check('121 尾逗号只在解析失败后作兜底', ok121.ok && ok121.data.program.A[0].exerciseId === 'e121');
  const bad121 = T.parsePlanInput('');
  check('121 空输入给可操作的中文说明', !bad121.ok && bad121.error.includes('请检查是否完整粘贴'));
  check('121 重量步进输入框允许 1.25 微片', /id="weight-step"[^>]*step="0\.25"/.test(html));
  T.state.sessions.A = null; T.state.sessions.B = null;
  T.state.drafts.A = null; T.state.drafts.B = null;
  T.state.lastImport = null; T.state.logs = []; T.state.program = { A: [], B: [] }; T.state.exercises = {};

  /* ============================================================
   * 122. 导入的动作定义文本按 UI 同口径封顶（审计 #10，v0.9.99）
   * maxlength 拦不住导入路径：AI 的超长 personal 会按「非空优先」盖过用户备注，
   * 超长 name/tips 撑爆布局并吃配额——applyPlan 必须自己收口。
   * ============================================================ */
  console.log('== 122. 导入动作定义文本封顶（v0.9.99）==');
  T.state.exercises = { e122: { name: '短名122', mode: 'weight', unit: 'kg', personal: '用户备注' } };
  const longPlan122 = JSON.stringify({ exercises: {
      e122: { name: '长'.repeat(200), mode: 'weight', unit: 'kg', tips: 'T'.repeat(5000), personal: 'P'.repeat(5000) },
      e122b: { name: '新动作122', mode: 'bodyweight', alternatives: 'A'.repeat(3000), tempo: 't'.repeat(2000) } },
    program: { A: [{ exerciseId: 'e122', sets: [{ reps: 8 }] }] } });
  const r122 = T.importPlan(longPlan122);
  check('122 超长文本的导入本身正常完成', r122.ok);
  check('122 超长名称截到 80 字', T.state.exercises.e122.name.length === 80);
  check('122 超长 tips 截到 1000 字', T.state.exercises.e122.tips.length === 1000);
  check('122 AI 超长个人备注按 UI 同口径 500 封顶（不再越过 maxlength 盖过用户备注）', T.state.exercises.e122.personal.length === 500);
  check('122 新动作的 alternatives/tempo 同样封顶', T.state.exercises.e122b.alternatives.length === 500 && T.state.exercises.e122b.tempo.length === 500);
  T.state.program = { A: [], B: [] }; T.state.exercises = {}; T.state.drafts.A = null; T.state.drafts.B = null;

  /* ============================================================
   * 123. 提示词告知 AI 文本字段会被截断（v0.9.100）
   * v0.9.99 的封顶会让超长内容截半丢意思——schema 要提前说清上限。
   * ============================================================ */
  console.log('== 123. 提示词含文本字段上限说明（v0.9.100）==');
  const prompt123 = T.buildPrompt({ recentLogs: [], trends: [], trendsSpan: 0, program: { A: [], B: [] }, exercises: {}, settings: { weightStep: 2.5, restSec: 90, warmupRestSec: 30, restNote: '' }, profile: {} });
  check('123 字段规则里写明文本上限与截断后果', prompt123.includes('被截断') && prompt123.includes('名称 80 字') && prompt123.includes('个人注意 500 字'));

  /* ============================================================
   * 124. __proto__ 作动作 id 被拒收（审计 #11，v0.9.101）
   * state.exercises['__proto__'] = {...} 写的是原型链：导入「成功」但动作
   * 静默消失、保存后也没了。fixture 必须手写字符串——对象字面量的 __proto__ 键同样走原型 setter。
   * ============================================================ */
  console.log('== 124. __proto__ 作 id 拒收（v0.9.101）==');
  T.state.program = { A: [], B: [] }; T.state.exercises = {}; T.state.drafts.A = null; T.state.drafts.B = null;
  const rp124a = T.importPlan('{"exercises":{"__proto__":{"name":"幽灵动作","mode":"weight"}},"program":{"A":[{"exerciseId":"__proto__","sets":[{"reps":8}]}]}}');
  check('124 exercises 里的 __proto__ 被拒且文案说明保留名', !rp124a.ok && rp124a.error.includes('保留名'));
  check('124 程序未被污染（计划与动作库都没进这个 id）', T.state.program.A.length === 0 && T.state.exercises.__proto__ === Object.prototype);
  const rp124b = T.importPlan('{"exercises":{"e124":{"name":"正常124","mode":"weight"}},"program":{"A":[{"exerciseId":"__proto__","sets":[{"reps":8}]}]}}');
  check('124 program 侧引用 __proto__ 同样被拒', !rp124b.ok && rp124b.error.includes('保留名'));
  T.state.program = { A: [], B: [] }; T.state.exercises = {}; T.state.drafts.A = null; T.state.drafts.B = null;

  /* ============================================================
   * 125. exerciseId 成员检查只认自有属性（v0.9.102）
   * 'toString'/'constructor' 走原型链也能取到值，「不在 exercises 中」会被继承属性蒙混过关。
   * ============================================================ */
  console.log('== 125. 成员检查用自有属性（v0.9.102）==');
  const r125a = T.importPlan('{"exercises":{"e125":{"name":"正常125","mode":"weight"}},"program":{"A":[{"exerciseId":"toString","sets":[{"reps":8}]}]}}');
  check('125 exercises 里没定义的 "toString" 不被继承属性放行', !r125a.ok && r125a.error.includes('不在 exercises 中'));
  const r125b = T.importPlan('{"exercises":{"toString":{"name":"特殊id125","mode":"bodyweight"}},"program":{"A":[{"exerciseId":"toString","sets":[{"reps":8}]}]}}');
  check('125 自己定义的 "toString" 作动作 id 正常可用', r125b.ok && T.state.exercises.toString.name === '特殊id125');
  T.state.program = { A: [], B: [] }; T.state.exercises = {}; T.state.drafts.A = null; T.state.drafts.B = null;

  /* ============================================================
   * 126. 多余的日当场拒绝（v0.9.103）
   * 应用只有 A/B 两日；program 里混进 C 日会被 ['A','B'] 循环静默丢掉，
   * 「导入成功」却什么都没变——必须拒绝并点名。
   * ============================================================ */
  console.log('== 126. 多余日被拒绝（v0.9.103）==');
  const r126a = T.importPlan('{"exercises":{"e126":{"name":"动作126","mode":"weight"}},"program":{"A":[{"exerciseId":"e126","sets":[{"reps":8}]}],"C":[{"exerciseId":"e126","sets":[{"reps":8}]}]}}');
  check('126 A+C 被拒且文案点名 C', !r126a.ok && r126a.error.includes('只能包含 A/B') && r126a.error.includes('"C"'));
  const r126b = T.importPlan('{"exercises":{"e126":{"name":"动作126","mode":"weight"}},"program":{"A":[{"exerciseId":"e126","sets":[{"reps":8}]}]}}');
  check('126 只写 A 的正常导入不受影响', r126b.ok);
  T.state.program = { A: [], B: [] }; T.state.exercises = {}; T.state.drafts.A = null; T.state.drafts.B = null;

  /* ============================================================
   * 127. section/rpeLabel/repsRange 截断封顶（v0.9.104）
   * PLAN_SCHEMA 向 AI 承诺「其余文本 1000 字会被截断」，但 item 级 section、
   * set 级 rpeLabel、item 级 repsRange 之前原样收下——超长撑爆布局、吃配额。
   * ============================================================ */
  console.log('== 127. 文本字段截断封顶（v0.9.104）==');
  const long127 = '长'.repeat(5000);
  const plan127 = JSON.stringify({ exercises: { e127: { name: '动作127', mode: 'weight' } }, program: { A: [{ section: long127, exerciseId: 'e127', reps: '8-'.repeat(60), sets: [{ type: 'work', reps: 8, rpe: 8, rpeLabel: long127 }] }] } });
  const r127 = T.importPlan(plan127);
  check('127 超长文本导入成功完成', r127.ok);
  const it127 = T.state.program.A[0];
  check('127 section 截到 1000 字', it127.section.length === 1000);
  check('127 rpeLabel 截到 1000 字', it127.sets[0].rpeLabel.length === 1000);
  check('127 repsRange 截到 40 字', (it127.repsRange || '').length === 40);
  T.state.program = { A: [], B: [] }; T.state.exercises = {}; T.state.drafts.A = null; T.state.drafts.B = null;

  /* ============================================================
   * 128. 保存失败提示给出可行出路（v0.9.105）
   * localStorage 满时之前只把英文 DOMException 弹出来，用户不知道能做什么。
   * 提示必须包含出路（历史页删除旧记录 / 设置页导出备份后清理），且恢复后写入照常。
   * ============================================================ */
  console.log('== 128. 保存失败提示（v0.9.105）==');
  T.clearingAll = false;                 // 见 __T 注释：clearAll 的 reload 桩不会重置守卫
  runTimers();                           // 让挂着的撤销按钮按 6 秒过期（真实流程如此），保存失败提示走纯文案路径
  const setItem128 = global.localStorage.setItem;
  global.localStorage.setItem = () => { throw new Error('配额已满'); };
  T.flushSave();
  const msg128 = textOf('toast') || '';
  check('128 保存失败会提示而不是静默', msg128.includes('保存失败'));
  check('128 提示给出可行出路（备份/删除/清理）', msg128.includes('备份') && msg128.includes('删除') && msg128.includes('清理'));
  global.localStorage.setItem = setItem128;
  global.localStorage._d = {};                 // 清空后必须能重新写入完整状态
  T.flushSave();
  check('128 存储恢复后写入照常', Object.keys(global.localStorage._d).length === 1);

  /* ============================================================
   * 129. 无空格长词必须换行而不是溢出（v0.9.106）
   * 下划线动作名（AI 方案常见）、URL 是不可断行的长词，出现在备注卡、
   * 导入差异、提示条、历史详情里会撑出卡片外。全局 overflow-wrap:break-word
   * 兜底；带省略号截断的 nowrap 元素（全屏标题/趋势图例）不受影响，须原样保留。
   * ============================================================ */
  console.log('== 129. 无空格长词折行兜底（v0.9.106）==');
  const css129 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
  check('129 body 有 overflow-wrap:break-word 兜底', /body\{[^}]*overflow-wrap:break-word/.test(css129));
  const fsNameRule = css129.match(/\.fs-name\{[^}]*\}/)[0];
  const lgNameRule = css129.match(/\.lg-name\{[^}]*\}/)[0];
  check('129 省略号截断元素保持原样（不被兜底破坏）',
    /white-space:nowrap/.test(fsNameRule) && /text-overflow:ellipsis/.test(fsNameRule) &&
    /white-space:nowrap/.test(lgNameRule) && /text-overflow:ellipsis/.test(lgNameRule));

  /* ============================================================
   * 130. 带客套话的粘贴也能导入（v0.9.107）
   * 从聊天窗口整段复制方案时常带着前后的说明文字（「这是你的计划：…」），
   * 之前整段 JSON.parse 直接失败。所有严格解析都失败后，再试最外层 {…} 片段。
   * 顺序不变：原样 → 去尾逗号 → {…} 片段 → 片段的去尾逗号；合法 JSON 里的
   * 字符串含「, }」仍必须原样保留（v0.9.98 的口径）。
   * ============================================================ */
  console.log('== 130. 客套话包裹的 JSON 导入（v0.9.107）==');
  const plan130 = '{"exercises":{"e130":{"name":"动作130","mode":"weight"}},"program":{"A":[{"exerciseId":"e130","sets":[{"reps":8}]}]}}';
  const r130a = T.importPlan('这是为你调整的计划：\n' + plan130 + '\n祝训练顺利，注意热身。');
  check('130 前后带说明文字能导入', r130a.ok);
  const r130b = T.importPlan('好的，方案如下：\n{"exercises":{"e130b":{"name":"动作130B","mode":"weight"}},"program":{"A":[{"exerciseId":"e130b","sets":[{"reps":8,}],}]}}\n加油！');
  check('130 客套话 + 尾逗号也能导入', r130b.ok);
  const r130c = T.importPlan('完全没有大括号的回答');
  check('130 无 JSON 时仍是中文报错', !r130c.ok && r130c.error.includes('JSON 解析失败'));
  const r130d = T.parsePlanInput('{"exercises":{"e130d":{"name":"名字, }含逗号","mode":"weight"}},"program":{"A":[{"exerciseId":"e130d","sets":[{"reps":8}]}]}}');
  check('130 合法 JSON 字符串里的「, }」原样保留', r130d.ok && r130d.data.exercises.e130d.name === '名字, }含逗号');
  T.state.program = { A: [], B: [] }; T.state.exercises = {}; T.state.drafts.A = null; T.state.drafts.B = null;

  /* ============================================================
   * 131. data-act 覆盖静态扫描（v0.9.107 测试加固）
   * 所有模板里发出的 data-act 必须被某个委托处理器接住：
   * 要么有 act === 'x' 字符串比较，要么出现在 closest/matches 选择器里
   * （dellog/undo 就是走选择器分支的）。反向也查：接了但没人发射=死代码。
   * 防止将来改按钮名时留下点了没反应的死按钮。
   * ============================================================ */
  console.log('== 131. data-act 发射/处理集合互相覆盖（静态）==');
  const emitActs131 = new Set();
  for(const m of (script + html).matchAll(/data-act="([a-z]+)"/g)) emitActs131.add(m[1]);
  const handled131 = new Set();
  for(const m of script.matchAll(/act === '([a-z]+)'/g)) handled131.add(m[1]);
  for(const m of script.matchAll(/(?:closest|matches)\('([^']*)'/g))
    for(const a of m[1].matchAll(/data-act="([a-z]+)"/g)) handled131.add(a[1]);
  const dead131 = [...emitActs131].filter(a => !handled131.has(a));
  const orphan131 = [...handled131].filter(a => !emitActs131.has(a));
  check('131 没有发了没人接的按钮（死按钮）', emitActs131.size >= 12 && dead131.length === 0);
  if(dead131.length) console.log('  未接住的 act: ' + dead131.join(','));
  check('131 没有接了没人发射的 act（死代码）', orphan131.length === 0);
  if(orphan131.length) console.log('  无人发射的 act: ' + orphan131.join(','));

  /* ============================================================
   * 132. 种子覆盖前留救援副本（v0.9.108）
   * load() 遇到解析失败或更高版本的数据会回退到种子——之前种子写入会
   * 把原内容直接覆盖掉，一次不可读=全丢。现在覆盖前先写到 LS_KEY+'.bak'。
   * ============================================================ */
  console.log('== 132. 坏数据/新版本数据被种子覆盖前留 .bak（v0.9.108）==');
  const lsKey132 = 'ironlog.v1';
  localStorage._d[lsKey132] = '{"version":1,"logs":[截断的坏 JSON';
  const d132a = T.load();
  check('132 坏数据仍得到可用的种子', d132a.version === 1 && Array.isArray(d132a.logs) && d132a.logs.length === 0);
  check('132 坏数据原文留了 .bak 副本', localStorage._d[lsKey132 + '.bak'] === '{"version":1,"logs":[截断的坏 JSON');
  localStorage._d[lsKey132] = JSON.stringify({ version: 2, logs: [{ fake: '更高版本写的' }] });
  const d132b = T.load();
  check('132 更高版本的数据不被旧版误读', d132b.version === 1 && d132b.logs.length === 0);
  check('132 新版本数据同样留了 .bak 副本', JSON.parse(localStorage._d[lsKey132 + '.bak']).version === 2);
  delete localStorage._d[lsKey132 + '.bak'];
  localStorage._d[lsKey132] = JSON.stringify({ version: 1, logs: [], program: { A: [], B: [] }, exercises: {} });
  T.load();
  check('132 正常数据不会生成 .bak', localStorage._d[lsKey132 + '.bak'] === undefined);
  localStorage._d[lsKey132] = JSON.stringify(T.state);

  /* ============================================================
   * 133. 长文本输入：UI maxlength 与代码封顶成对（测试加固，不升版本）
   * 只留一边都会出问题：只有代码封顶→框里显示超长、存的却是截断值；
   * 只有 maxlength→改代码上限时静默越界。两侧必须同时存在且数值一致。
   * ============================================================ */
  console.log('== 133. 备注类输入的 maxlength 与代码 slice 封顶成对（测试加固）==');
  const uiMax133 = id => { const m = html.match(new RegExp('id="' + id + '"[^>]*maxlength="(\\d+)"')); return m ? +m[1] : 0; };
  check('133 休息说明：maxlength=200 与代码封顶成对', uiMax133('rest-note') === 200 && /restNote = e\.target\.value\.trim\(\)\.slice\(0, 200\)/.test(script));
  check('133 背景说明：maxlength=2000 与代码封顶成对', uiMax133('profile-bg') === 2000 && /state\.profile\.background = e\.target\.value\.slice\(0, 2000\)/.test(script));
  check('133 个人备注：maxlength=500 与代码封顶成对', uiMax133('personal-note') === 500 && /personal = e\.target\.value\.trim\(\)\.slice\(0, 500\)/.test(script));
  check('133 动作备注：maxlength=500 与代码封顶成对', /class="fs-exnote" maxlength="500"/.test(script) && /item\.note = inp\.value\.trim\(\)\.slice\(0, 500\)/.test(script));

  /* ============================================================
   * 134. 重量步进下限 0.25 与输入框一致（v0.9.109）
   * v0.9.98 把输入框 min/step 放到 0.25，但 change 处理器下限还卡在 0.5：
   * 界面允许 0.25、代码静默改回 2.5——显示和数据打架。0.25kg 微片真实存在。
   * ============================================================ */
  console.log('== 134. 重量步进 0.25 不再被静默改回 2.5（v0.9.109）==');
  const t134 = { value: '0.25' };
  handlers.get('weight-step|change')({ target: t134 });
  check('134 0.25 步进被接受', T.state.settings.weightStep === 0.25);
  check('134 输入框写回 0.25', String(t134.value) === '0.25');
  const t134b = { value: '0.2' };
  handlers.get('weight-step|change')({ target: t134b });
  check('134 低于 0.25 仍纠正为默认 2.5', T.state.settings.weightStep === 2.5 && String(t134b.value) === '2.5');

  /* ============================================================
   * 135. ESC 关闭抽屉（v0.9.110）
   * 抽屉打开时焦点被主动送进抽屉，键盘用户理应用 ESC 退出；
   * 优先级：确认弹层 > 小结 > 抽屉。
   * ============================================================ */
  console.log('== 135. ESC 关闭抽屉，焦点回汉堡按钮（v0.9.110）==');
  T.toggleDrawer();
  const dr135 = document.getElementById('drawer');
  check('135 抽屉已打开', dr135.classList.contains('open'));
  check('135 打开时 aria-expanded=true', document.getElementById('hamburger-btn').getAttribute('aria-expanded') === 'true');
  docHandlers.get('keydown')({ key: 'Escape' });
  check('135 ESC 关闭抽屉', !dr135.classList.contains('open'));
  check('135 关闭后 aria-expanded=false', document.getElementById('hamburger-btn').getAttribute('aria-expanded') === 'false');
  check('135 遮罩同步移除', !document.getElementById('drawer-overlay').classList.contains('show'));
  // 优先级：小结弹层在上的时候，第一次 ESC 关小结，抽屉不动；第二次才关抽屉
  T.toggleDrawer();
  document.getElementById('summary-overlay').classList.add('show');
  docHandlers.get('keydown')({ key: 'Escape' });
  check('135 ESC 优先关小结，抽屉不动', !document.getElementById('summary-overlay').classList.contains('show') && dr135.classList.contains('open'));
  docHandlers.get('keydown')({ key: 'Escape' });
  check('135 第二次 ESC 才关抽屉', !dr135.classList.contains('open'));

  /* ============================================================
   * 136. 结果消息区是无障碍活动区域（v0.9.111）
   * 导出/导入/恢复的结果与错误只写进 .import-msg——没有 role=status，
   * 读屏器不会播报（同页 toast 早就是 role=status，这三处是漏网）。
   * ============================================================ */
  console.log('== 136. 导出/导入/恢复消息区 role=status（v0.9.111）==');
  for (const mid of ['export-msg', 'import-msg', 'restore-msg']) {
    const re = new RegExp(`id="${mid}"[^>]*role="status"`);
    check(`136 ${mid} 带 role="status"`, re.test(html));
  }
  check('136 提示条仍是 role=status（回归）', /id="toast"[^>]*role="status"/.test(html));

  /* ============================================================
   * 137. clearAll 连 .bak 救援副本一起清（v0.9.112）
   * 「此操作不可恢复」+ 腾配额是清除的语义；load() 写的 .bak
   * 若幸存，既留了不该留的底，又把配额占用留在清除之后。
   * ============================================================ */
  console.log('== 137. clearAll 清除 .bak 救援副本（v0.9.112）==');
  const prevNavDesc = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global, 'navigator', { configurable: true, value: {} }); // 无剪贴板：同步回退，节拍确定
  global.location = { reload(){} };
  global.localStorage._d['ironlog.v1'] = 'main137';
  global.localStorage._d['ironlog.v1.bak'] = 'rescue137';
  T.clearingAll = false;
  T.clearAll();
  T.answerConfirm(true); await null; await null;
  T.answerConfirm(true); await null;
  await null;
  check('137 主键被清', global.localStorage._d['ironlog.v1'] === undefined);
  check('137 .bak 一并被清', global.localStorage._d['ironlog.v1.bak'] === undefined);
  delete global.location;
  if(prevNavDesc) Object.defineProperty(global, 'navigator', prevNavDesc); else delete global.navigator;
  T.clearingAll = false;

  /* ============================================================
   * 138. uselast 无历史时说明原因，而不是静默无反应（v0.9.113）
   * 「沿用上次」在没历史（或历史里没有当前模式字段）时原本什么都不发生，
   * 用户只会以为按钮坏了。
   * ============================================================ */
  console.log('== 138. uselast 无历史给出说明（v0.9.113）==');
  T.state.exercises.e138 = mk('测试无历史', 'weight');
  T.state.program.A = [{ section: '', exerciseId: 'e138', repsRange: '', sets: [{ type: 'work', weight: null, reps: null, duration: null, rpe: null, rpeLabel: '', side: null }] }];
  delete T.state.drafts.A; T.state.sessions.A = null;
  T.state.settings.lastDay = 'A'; T.curPos = 0;
  T.render();
  clickExList(btnOf({ act: 'uselast', ex: '0', set: '0' }));
  const d138 = T.getItems('A')[0].sets[0];   // 草稿就是 state.drafts[day] 数组本身（bindDrafts）
  check('138 无历史不填任何数字', d138.weight == null && d138.reps == null);
  check('138 无历史时说明原因', String(document.getElementById('toast').textContent).includes('没有可沿用的上次记录'));
  // 有历史时照常填数、不出提示（成功路径回归）
  T.state.logs.push({ date: '2026-06-01', day: 'A', startedAt: 1700001380000, endedAt: 1700001390000, durationSec: 10, condition: null, exercises: [
    { exerciseId: 'e138', note: null, sets: [tset({ weight: 42.5, reps: 8 })] }
  ] });
  T.render();
  document.getElementById('toast').textContent = '';   // 清掉上一条提示残留：验证成功路径不再写 toast
  clickExList(btnOf({ act: 'uselast', ex: '0', set: '0' }));
  check('138 有历史照常沿用', d138.weight === 42.5 && d138.reps === 8);
  check('138 成功路径不出提示', !String(document.getElementById('toast').textContent).includes('没有可沿用的上次记录'));
  T.state.logs.pop(); delete T.state.exercises.e138; delete T.state.drafts.A; T.state.sessions.A = null; T.state.program.A = [];

  // §139（v0.9.114）：个人备注是多行 textarea、AI 要点常带换行——
  // 训练卡展示块 .ex-notes .note 必须 white-space:pre-line，否则换行被折叠成一行。
  {
    const css139 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const noteRule = css139.match(/\.ex-notes \.note\{[^}]*\}/);
    check('139 .note 展示规则存在', !!noteRule);
    check('139 .note 保留换行', !!noteRule && /white-space:\s*pre-line/.test(noteRule[0]));
    check('139 不误伤单行截断规则', /\.fs-name\{[^}]*text-overflow:ellipsis/.test(css139) && /\.lg-name\{[^}]*text-overflow:ellipsis/.test(css139));
  }

  // §140（v0.9.115）：.bak 救援副本必须可见——备份卡片给出恢复/删除入口。
  // 此前它是静默的：移动端没有 devtools，用户既不知道它在，也没有途径找回。
  {
    const bakKey = 'ironlog.v1.bak';
    localStorage.removeItem(bakKey);
    T.renderBakRow();
    check('140 无副本时行隐藏', document.getElementById('bak-row').style.display === 'none');
    localStorage.setItem(bakKey, '{oops');
    T.renderBakRow();
    check('140 有副本时行显示', document.getElementById('bak-row').style.display === '');
    const hint = String(document.getElementById('bak-hint').textContent);
    check('140 说明来源与大小', hint.includes('损坏') && hint.includes(String('{oops'.length)));
    await T.restoreBak();   // 解析失败：不弹确认、不改数据
    check('140 坏副本恢复失败', String(document.getElementById('restore-msg').textContent).includes('恢复失败'));
    check('140 失败保留副本', localStorage.getItem(bakKey) === '{oops');
    // 有效副本：确认后恢复 → 数据被应用、副本被删除、行隐藏
    const b = JSON.parse(JSON.stringify(T.buildBackup())); // 备份对象的数据在 b.state 下，不在顶层
    b.state.logs = (b.state.logs || []).concat([{ date: '2024-01-01', day: 'A', startedAt: 0, endedAt: 0, durationSec: 60, condition: null,
      exercises: [{ exerciseId: 'goblet_squat', note: '', sets: [{ type: 'work', weight: 1, reps: 1, duration: null, rpe: null, done: true }] }] }]);
    localStorage.setItem(bakKey, JSON.stringify(b));
    const count0 = T.state.logs.length;
    const p140 = T.restoreBak(); T.answerConfirm(true); await p140;
    check('140 恢复被应用', T.state.logs.length === count0 + 1);
    check('140 成功后删除副本', localStorage.getItem(bakKey) === null);
    check('140 成功后行隐藏', document.getElementById('bak-row').style.display === 'none');
    // 删除：取消保留、确认删除
    localStorage.setItem(bakKey, '{oops');
    let d140 = T.dropBak(); T.answerConfirm(false); await d140;
    check('140 取消删除保留副本', localStorage.getItem(bakKey) === '{oops');
    d140 = T.dropBak(); T.answerConfirm(true); await d140;
    check('140 确认删除副本', localStorage.getItem(bakKey) === null);
  }

  // §141：导入确认弹窗的 desc 是多行的 planDiffText——它渲染在 .summary-card p 里，
  // 该规则必须保留换行（pre-line），否则「按这份方案更新计划？」的 diff 挤成一行。
  {
    const css141 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const pRule = css141.match(/\.summary-card p\{[^}]*\}/);
    check('141 确认弹窗描述保留换行', !!pRule && /white-space:\s*pre-line/.test(pRule[0]));
    const confirmBlock = html.match(/id="confirm-overlay"[\s\S]*?<\/div>\s*<\/div>/);
    check('141 确认描述确实在 summary-card 的 p 里', !!confirmBlock && /class="summary-card"/.test(confirmBlock[0]) && /<p id="confirm-desc">/.test(confirmBlock[0]));
  }

  // §142：结束训练时没有任何一组被确认过——不产生记录、给出提示、会话保留可继续。
  {
    T.state.exercises.e142 = { name: '测试动作', mode: 'weight', unit: 'kg' };
    T.state.program.A = [{ exerciseId: 'e142', section: '', sets: [{ type: 'work', reps: 5, weight: 10 }] }];
    T.state.drafts.A = null;
    T.startSessionIfNeeded('A');
    const n142 = T.state.logs.length;
    document.getElementById('toast').textContent = '';
    T.endSession();
    check('142 零完成不新增记录', T.state.logs.length === n142);
    check('142 提示还没有确认', String(document.getElementById('toast').textContent).includes('还没有确认任何一组'));
    check('142 会话仍在可继续', !!T.state.sessions.A);
    T.state.sessions.A = null; delete T.state.exercises.e142; T.state.program.A = [];
  }

  // §143：index.html 里所有 onclick="fn(...)" 内联处理器必须对应 app.js 里真实存在的函数。
  // §131 只覆盖 data-act 委托；内联 onclick 拼错/改名会静默失效（点击无反应），这里补静态扫描。
  {
    const handlers143 = new Set();
    const re143 = /onclick="([a-zA-Z_$][\w$]*)\s*\(/g;
    let m143; while((m143 = re143.exec(html))) handlers143.add(m143[1]);
    check('143 内联处理器扫描到足够多', handlers143.size >= 10);
    for(const fn of handlers143) check(`143 ${fn} 在 app.js 里有定义`, new RegExp('function ' + fn + '\\s*\\(').test(script));
  }

  // §144：sw.js 的更新机制必须保留——skipWaiting/clients.claim 让新版本在常驻打开的 PWA 里尽快生效，
  // activate 清旧缓存防止存储膨胀，导航网络失败回退缓存的 index.html 保证离线可开。
  {
    const sw144 = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
    check('144 sw 安装即跳过等待', /self\.skipWaiting\(\)/.test(sw144));
    check('144 sw 激活即接管客户端', /self\.clients\.claim\(\)/.test(sw144));
    check('144 sw 激活时清旧缓存', /caches\.keys\(\)/.test(sw144) && /caches\.delete\(/.test(sw144));
    check('144 导航失败回退缓存首页', /req\.mode === 'navigate'/.test(sw144) && /caches\.match\('\.\/index\.html'\)/.test(sw144));
  }

  // §145：JS 被禁用时页面不能是无声的空白——必须有 noscript 说明。
  check('145 有 noscript 提示', /<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/.test(html));

  // §146：无障碍关联必须落在真实存在的 id 上——aria-controls 与 label for 拼错时
  // 屏幕阅读器静默失去关联（id 一致性扫描只覆盖 getElementById，这两类属性不在其中）。
  {
    const ids146 = new Set();
    let m146; const reId146 = /\bid="([^"]+)"/g;
    while((m146 = reId146.exec(html))) ids146.add(m146[1]);
    let acCount = 0, forCount = 0;
    const reAc146 = /aria-controls="([^"]+)"/g;
    while((m146 = reAc146.exec(html))) { acCount++; check(`146 aria-controls #${m146[1]} 存在`, ids146.has(m146[1])); }
    const reFor146 = /<label[^>]*\bfor="([^"]+)"/g;
    while((m146 = reFor146.exec(html))) { forCount++; check(`146 label for #${m146[1]} 存在`, ids146.has(m146[1])); }
    check('146 两类关联都扫描到', acCount >= 4 && forCount >= 3);
  }

  // §147：个人备注选择器不认不存在的 id——下拉里选了个已被删掉的 id 时，
  // renderPersonalPicker 必须回退到第一个真实动作（js/app.js:2373），
  // 保存路径也不能为幽灵 id 创建动作条目（:2380 守卫）。
  {
    const sel147 = document.getElementById('personal-ex');
    const note147 = document.getElementById('personal-note');
    // 自带夹具：末尾作用域里全局 exercises 已被各段增删，这里放两个确定存在的动作（含中文名验证排序）
    T.state.exercises.real147b = { name: '乙动作', mode: 'weight', unit: 'kg' };
    T.state.exercises.real147a = { name: '甲动作', mode: 'weight', unit: 'kg', personal: '旧备忘' };
    sel147.value = 'ghost147';
    handlers.get('personal-ex|change')({ target: sel147 });
    const selId147 = (String(sel147.innerHTML).match(/value="([^"]+)" selected/) || [])[1];
    check('147 幽灵 id 回退为第一个真实动作（按名称 zh 排序）', selId147 === 'real147a');
    check('147 备注框显示回退动作的备注', note147.value === '旧备忘');
    note147.value = '§147 备忘';
    handlers.get('personal-note|change')({ target: note147 });
    check('147 保存落在回退动作上', T.state.exercises.real147a.personal === '§147 备忘');
    check('147 不为幽灵 id 创建条目', T.state.exercises.ghost147 === undefined);
    delete T.state.exercises.real147a; delete T.state.exercises.real147b;
  }

  // §148：训练卡字段名一致性——模板里发出的 data-f 只能是 change/step/RPE 处理器
  // 认识的四个字段（weight/reps/duration/rpe）。拼错的 data-f 会静默丢写入：
  // change 委托 else 分支按 reps 处理，拼错名会写进错误字段或写不进去。
  {
    const fields148 = new Set();
    let m148;
    const reLit148 = /data-f="([a-z]+)"/g;
    while((m148 = reLit148.exec(script))) fields148.add(m148[1]);
    const reDyn148 = /\b(?:d|step)\('([a-z]+)'/g;
    while((m148 = reDyn148.exec(script))) fields148.add(m148[1]);
    const legal148 = new Set(['weight', 'reps', 'duration', 'rpe']);
    check('148 data-f 只出现合法字段', [...fields148].every(f => legal148.has(f)));
    check('148 四个字段都在模板中出现过', ['weight', 'reps', 'duration', 'rpe'].every(f => fields148.has(f)));
    check('148 change 委托显式处理 weight 与 duration',
      script.includes("dataset.f === 'weight'") && script.includes("dataset.f === 'duration'"));
  }

  // §149：系统「减弱动态效果」贯通 CSS 与 JS——CSS 有 reduced-motion 兜底；
  // JS 所有回顶走 scrollToTop()，matchMedia 命中时 behavior:'auto'，否则保持 'smooth'。
  {
    const css149 = require('fs').readFileSync('css/style.css', 'utf8');
    check('149 CSS 有 reduced-motion 兜底', css149.includes('prefers-reduced-motion:reduce'));
    check('149 平滑滚动只存在于 scrollToTop 一处',
      (script.match(/behavior:/g) || []).length === 1 && script.includes("behavior: rm ? 'auto' : 'smooth'"));
    check('149 回顶调用全部走 scrollToTop', (script.match(/scrollToTop\(\)/g) || []).length >= 7);
    const prevScroll149 = global.window.scrollTo, prevMM149 = global.window.matchMedia;
    let opts149 = null;
    global.window.scrollTo = o => { opts149 = o; };
    global.window.matchMedia = () => ({ matches: true });
    T.switchView('history');
    check('149 减弱动态时瞬时回顶', opts149 && opts149.top === 0 && opts149.behavior === 'auto');
    delete global.window.matchMedia;
    opts149 = null;
    T.switchView('today');
    check('149 默认仍平滑回顶', opts149 && opts149.behavior === 'smooth');
    global.window.scrollTo = prevScroll149;
    if(prevMM149) global.window.matchMedia = prevMM149;
  }

  // §150：深色主题声明完整——:root 必须有 color-scheme:dark（原生控件跟随主题），
  // 且 theme-color 与 --bg 一致（状态栏融合，两处改了其一必须同步另一处）。
  {
    const css150 = require('fs').readFileSync('css/style.css', 'utf8');
    check('150 :root 声明 color-scheme:dark', /:root\{[^}]*color-scheme:\s*dark/.test(css150));
    const bg150 = (css150.match(/--bg:\s*(#[0-9a-fA-F]{6})/) || [])[1];
    const tc150 = (html.match(/name="theme-color" content="([^"]+)"/) || [])[1];
    check('150 theme-color 与 --bg 一致', !!bg150 && !!tc150 && tc150.toLowerCase() === bg150.toLowerCase());
  }

  // §151：文件恢复选完必须清空 file input 的 value——否则「再选同一个文件」
  // （比如改好坏备份后重选）不会触发 change，按钮看起来失灵。
  {
    const el151 = document.getElementById('restore-file');
    const msg151 = document.getElementById('restore-msg');
    const h151 = handlers.get('restore-file|change');
    check('151 restore-file 有 change 处理器', typeof h151 === 'function');
    el151.value = 'C:\\fakepath\\backup.json';
    el151.files = [{ text: async () => '{ not json' }];
    h151({ target: el151 });
    await null; await null;
    check('151 选完即清空 value（允许连续选同一文件）', el151.value === '');
    check('151 非法 JSON 给出结构化错误', /^恢复失败/.test(String(msg151.textContent || '')));
  }

  // §152：设置页每个输入都必须在渲染时被回填（renderSettings/renderPersonalPicker）。
  // 新增设置只加 HTML 不加回填，备份恢复后输入框会显示旧值——静默的假象 bug。
  {
    const sIdx152 = html.indexOf('id="view-settings"');
    const inputs152 = [];
    const reIn152 = /<(?:input|textarea|select)[^>]*\bid="([^"]+)"/g;
    let m152;
    while((m152 = reIn152.exec(html.slice(sIdx152)))) inputs152.push(m152[1]);
    const syncStart = script.indexOf('function renderSettings');
    const syncSrc = script.slice(syncStart, script.indexOf('/* 首屏'));
    check('152 找到设置渲染区', syncStart > 0 && inputs152.length >= 5);
    for(const id of inputs152){
      check(`152 设置输入 #${id} 在渲染时被回填`, syncSrc.includes(`$('${id}')`));
    }
  }

  // §153：insertLog 必须保持 startedAt 升序——PR 判定、趋势、历史渲染都建立在
  // 「logs 按时间有序」上；补录旧日期若乱序插入，后续比较与排序全都会错位。
  {
    const logs153 = T.state.logs;
    const saved153 = logs153.slice();
    T.insertLog({ startedAt: 1000, day: 'A', date: '2020-01-01', duration: 1, exercises: [] });
    T.insertLog({ startedAt: 9e12, day: 'A', date: '2099-01-01', duration: 1, exercises: [] });
    T.insertLog({ startedAt: 5000, day: 'A', date: '2020-01-01', duration: 1, exercises: [] });
    let asc153 = logs153.length === saved153.length + 3;
    for(let i = 1; i < logs153.length && asc153; i++){
      if((logs153[i].startedAt ?? 0) < (logs153[i - 1].startedAt ?? 0)) asc153 = false;
    }
    check('153 乱序插入后仍整体升序且齐全', asc153);
    logs153.length = 0; saved153.forEach(e => logs153.push(e));   // 精确还原
    check('153 还原后与原来一致', logs153.length === saved153.length && logs153.every((e, i) => e === saved153[i]));
  }

  // §154：topSet 是趋势/导出里「最好一组」的唯一口径：重量优先、同重量比次数；
  // 无重量看时长（计时动作）；都没有看次数；空数组安全返回 {reps:null}。
  {
    const t154 = T.topSet([{weight:100,reps:5},{weight:100,reps:8},{weight:90,reps:12}]);
    check('154 重量优先，同重量比次数', t154.weight === 100 && t154.reps === 8);
    const d154 = T.topSet([{weight:null,duration:30},{weight:null,duration:45},{weight:null,duration:20}]);
    check('154 无重量回落时长', d154.duration === 45);
    const r154 = T.topSet([{weight:null,reps:6},{weight:null,reps:9}]);
    check('154 无重量无时长回落次数', r154.reps === 9);
    const e154 = T.topSet([]);
    check('154 空集合安全返回', e154 && e154.reps === null);
  }

  console.log('== 155. ± 步进上限与手输同规矩（1e6）（v0.9.120）==');
  T.state.exercises.test155 = { ...mk('测试深蹲155', 'weight'), unit: 'kg' };
  T.state.program.A = [{ section: '', exerciseId: 'test155', repsRange: '', sets: [{ type: 'work', weight: 999999, reps: 10, duration: 999999, rpe: null, rpeLabel: '', side: null }] }];
  delete T.state.drafts.A; delete T.state.sessions.A; T.state.settings.lastDay = 'A'; T.curPos = 0;
  T.state.settings.weightStep = 2.5;
  T.render();
  clickExList(btnOf({ act: 'step', ex: 0, set: 0, f: 'weight', dir: 1 }));
  check('重量步进越界钳到 1e6（不会存出 migrate 会清成 null 的值）', T.getItems('A')[0].sets[0].weight === 1e6);
  clickExList(btnOf({ act: 'step', ex: 0, set: 0, f: 'duration', dir: 1 }));
  check('时长步进越界钳到 1e6', T.getItems('A')[0].sets[0].duration === 1e6);
  delete T.state.exercises.test155; delete T.state.drafts.A; delete T.state.sessions.A;

  console.log('== 156. 休息时长设置输入的钳位与写回（测试加固，无应用改动）==');
  // rest-sec/warmup-rest-sec 的 change 处理器此前只被 migrate 侧（§110）覆盖，
  // 设置页这条「纠正后写回输入框」的同款路径（js/app.js:2402-2415）没有直接测过。
  {
    const hRs = handlers.get('rest-sec|change');
    const hWr = handlers.get('warmup-rest-sec|change');
    const r0 = T.state.settings.restSec, w0 = T.state.settings.warmupRestSec;
    const t156 = { value: '5000' }; hRs({ target: t156 });
    check('156 休息秒数封顶 1800 并写回输入框', T.state.settings.restSec === 1800 && t156.value === 1800);
    const t156b = { value: 'abc' }; hRs({ target: t156b });
    check('156 非法休息秒数回默认 90', T.state.settings.restSec === 90 && t156b.value === 90);
    const t156c = { value: '0' }; hRs({ target: t156c });
    check('156 0 是合法的关闭值，不被纠正为默认', T.state.settings.restSec === 0 && t156c.value === 0);
    const t156d = { value: '-5' }; hWr({ target: t156d });
    check('156 负热身休息回默认 30', T.state.settings.warmupRestSec === 30 && t156d.value === 30);
    T.state.settings.restSec = r0; T.state.settings.warmupRestSec = w0;
  }

  console.log('== 157. 弹层卡片限高内滚，长 desc 不顶走按钮（v0.9.121）==');
  // 导入确认会把整份方案差异列在 desc 里，22 个动作的方案能把「取消/导入」按钮顶出屏幕外。
  {
    const css157 = require('fs').readFileSync('css/style.css', 'utf8');
    const card157 = css157.match(/\.summary-card\{[^}]*\}/);
    check('157 .summary-card 有 max-height 与 overflow-y:auto', !!card157 && card157[0].includes('max-height:calc(100dvh - 48px)') && card157[0].includes('overflow-y:auto'));
  }

  console.log('== 158. 同方案重复导入的差异说明不为空、不误报增删（测试加固，无应用改动）==');
  // 用户把 AI 原样返回的方案再贴一遍：desc 必须仍给出「N → N 个动作」的如实计数（确认框不会空白），
  // 且不得出现「移除/新增/目标改为」的假改动。
  {
    const ex158 = { test158a: { name: '动作甲', mode: 'weight', unit: 'kg' }, test158b: { name: '动作乙', mode: 'bodyweight' } };
    const it158 = [{ section: '', exerciseId: 'test158a', repsRange: '8-12', sets: [{ type: 'work', weight: 50, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null }] },
      { section: '', exerciseId: 'test158b', repsRange: '', sets: [{ type: 'work', weight: null, reps: 15, duration: null, rpe: null, rpeLabel: '', side: null }] }];
    const saveP = T.state.program, saveE = T.state.exercises;
    T.state.program = { A: JSON.parse(JSON.stringify(it158)), B: [] };
    T.state.exercises = JSON.parse(JSON.stringify(ex158));
    const diff158 = T.planDiffText({ program: { A: JSON.parse(JSON.stringify(it158)) }, exercises: ex158 });
    check('158 同方案仍给出如实计数行', diff158.includes('A 日 2 → 2 个动作') && diff158.includes('动作库共 2 项'));
    check('158 不出现假增删', !diff158.includes('移除') && !diff158.includes('新增') && !diff158.includes('目标改为'));
    T.state.program = saveP; T.state.exercises = saveE;
  }

  console.log('== 159. 移动端输入静态守卫（测试加固，无应用改动）==');
  // ± 按钮防双击缩放、viewport 保留捏合缩放、数字输入唤起正确的手机键盘——都是移动端体验的地基。
  {
    const css159 = require('fs').readFileSync('css/style.css', 'utf8');
    check('159 按钮有 touch-action:manipulation（禁双击缩放）', /button\{[^}]*touch-action:manipulation/.test(css159));
    check('159 viewport 不禁用捏合缩放', !/user-scalable=no|maximum-scale/.test(html));
    check('159 数字输入带 inputmode（decimal/numeric）', /inputmode="decimal"/.test(script) && /inputmode="numeric"/.test(script));
  }

  console.log('== 160. ± 步进用 round2 消浮点误差（测试加固，无应用改动）==');
  // 步进 1.23 连点三次：裸加法是 3.6899999999999995，会被写进输入框和存档。
  {
    T.state.exercises.test160 = { ...mk('测试卧推160', 'weight'), unit: 'kg' };
    T.state.program.A = [{ section: '', exerciseId: 'test160', repsRange: '', sets: [{ type: 'work', weight: 0, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null }] }];
    delete T.state.drafts.A; delete T.state.sessions.A; T.state.settings.lastDay = 'A'; T.curPos = 0;
    T.state.settings.weightStep = 1.23;
    T.render();
    for(let i = 0; i < 3; i++) clickExList(btnOf({ act: 'step', ex: 0, set: 0, f: 'weight', dir: 1 }));
    check('160 连点步进不积累浮点误差（1.23×3 = 3.69）', T.getItems('A')[0].sets[0].weight === 3.69);
    T.state.settings.weightStep = 2.5;
    delete T.state.exercises.test160; delete T.state.drafts.A; delete T.state.sessions.A;
  }

  console.log('== 161. export-n 条数与非法值回退（测试加固，无应用改动）==');
  // 导出条数来自 #export-n（js/app.js:2237 parseInt||4），此前从未被行为测试覆盖。
  // 注意：末尾作用域的 navigator 已被后续剪贴板测试换过多次（没有 clipboard），必须自带桩并成对还原。
  {
    const saveLogs = T.state.logs;
    const nav161prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { clipboard: { writeText: async t => { globalThis.copied = t; } } } });
    globalThis.copied = null;
    T.state.logs = Array.from({ length: 6 }, (_, i) => ({ date: '2024-01-0' + (i + 1), day: 'A', startedAt: 1700000000000 + i * 86400000, duration: 60, volume: 0, setsDone: 1, restTotalSec: null, exercises: [], condition: null, note: '' }));
    const sel161 = document.getElementById('export-n');
    sel161.value = '2';
    await T.runExport(false);
    check('161 export-n=2 只导出 2 条日志', globalThis.copied && JSON.parse(globalThis.copied).recentLogs.length === 2);
    sel161.value = 'oops';
    await T.runExport(false);
    check('161 非法条数回退 4', globalThis.copied && JSON.parse(globalThis.copied).recentLogs.length === 4);
    check('161 导出提示如实报告条数', String(document.getElementById('export-msg').textContent).includes('最近 4 次日志'));
    T.state.logs = saveLogs;
    if(nav161prev) Object.defineProperty(globalThis, 'navigator', nav161prev); else delete globalThis.navigator;
  }

  console.log('== 162. SHELL 里没有幽灵路径（测试加固，无应用改动）==');
  // sw.js install 用 caches.addAll(SHELL)：任何一条 404 都会让 install 直接失败、新版本永远装不上。
  // 已有断言保证 SHELL ⊇ 页面/manifest 引用，这里反向钉 SHELL ⊆ 磁盘上真实存在的文件。
  {
    const sw162 = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
    const entries = [...sw162.matchAll(/'(\.\/[^']*)'/g)].map(m => m[1]);
    check('162 能解析出 SHELL 清单', entries.length >= 9);
    check('162 SHELL 每一条都存在于磁盘', entries.every(p => {
      const rel = p === './' ? '.' : p.slice(2);
      return fs.existsSync(path.join(__dirname, rel));
    }));
    check('162 离线回退依赖的 ./index.html 在 SHELL 里', entries.includes('./index.html'));
  }
  console.log('== 163. 剪贴板不可用时导出文本仍完整可见（测试加固，无应用改动）==');
  // copyText 的两级回退（js/app.js:2154-2170）：clipboard API → execCommand → 手动全选。
  // 不变量：无论复制成败，#export-text 必须完整包含待复制文本，且提示引导手动复制。
  {
    const saveLogs163 = T.state.logs;
    const nav163prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { } }); // 无 clipboard，execCommand 也未定义
    T.state.logs = [{ date: '2024-02-01', day: 'A', startedAt: 1706745600000, duration: 60, volume: 100, setsDone: 1, restTotalSec: null, exercises: [], condition: null, note: '' }];
    document.getElementById('export-n').value = '4';
    await T.runExport(false);
    const ta163 = document.getElementById('export-text');
    let parsed163 = null;
    try{ parsed163 = JSON.parse(ta163.value); }catch(e){}
    check('163 复制失败时 textarea 仍完整包含导出 JSON', parsed163 && parsed163.recentLogs.length === 1);
    check('163 复制失败提示引导手动全选', String(document.getElementById('export-msg').textContent).includes('手动全选'));
    T.state.logs = saveLogs163;
    if(nav163prev) Object.defineProperty(globalThis, 'navigator', nav163prev); else delete globalThis.navigator;
  }
  console.log('== 164. 启动屏/状态栏/浏览器壳颜色一致（测试加固，无应用改动）==');
  // §150 钉过 meta theme-color == --bg；这里补齐 manifest 的两个颜色字段：
  // background_color 决定 PWA 启动屏底色，theme_color 决定状态栏——改一处忘另一处会闪色差。
  {
    const man164 = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.webmanifest'), 'utf8'));
    const css164 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const bg164 = (css164.match(/--bg:\s*(#[0-9a-fA-F]{6})/) || [])[1];
    check('164 manifest background_color 与 --bg 一致', !!bg164 && String(man164.background_color).toLowerCase() === bg164.toLowerCase());
    check('164 manifest theme_color 与 --bg 一致', !!bg164 && String(man164.theme_color).toLowerCase() === bg164.toLowerCase());
  }
  console.log('== 165. 训练背景未填写时提示词要求 AI 先问（测试加固，无应用改动）==');
  // buildPrompt 对空背景输出「（未填写背景，请先问我）」（js/app.js:2214）——
  // 这是让 AI 先问身高体重/器械范围而不是瞎猜的关键指令，此前没有防线。
  {
    const saveBg165 = T.state.profile.background;
    T.state.profile.background = '';
    check('165 背景为空时提示词明说未填写、请先问', T.buildPrompt(T.buildExport(4)).includes('未填写背景，请先问我'));
    T.state.profile.background = '体态问题：圆肩';
    check('165 背景已填写时原文进入提示词', T.buildPrompt(T.buildExport(4)).includes('体态问题：圆肩'));
    T.state.profile.background = saveBg165;
  }
  console.log('== 166. SW 更新路径三要素齐备（测试加固，无应用改动）==');
  // activate 必须删除非当前版本的旧缓存：caches.match 按创建顺序取首个命中，
  // 旧缓存若不清理，离线回退可能返回最老那份 index.html，且存储随版本无限膨胀。
  // skipWaiting + clients.claim 保证新版本不必「重启两次」才接管。
  {
    const sw166 = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
    check('166 activate 删除非当前版本的旧缓存', /keys\.filter\(k => k !== CACHE\)/.test(sw166) && /caches\.delete\(k\)/.test(sw166));
    check('166 install 有 skipWaiting、activate 有 claim', /skipWaiting\(\)/.test(sw166) && /clients\.claim\(\)/.test(sw166));
  }
  console.log('== 167. 导入空名称不抹掉旧名，无名新动作以 id 显示（测试加固，无应用改动）==');
  // applyPlan:1875 的兜底链是 ex.name || old.name || id——AI 写了 name:"" 时
  // 简单合并会把用户认识的动作名清空；这条回退此前只有实现、没有防线。
  {
    const exA167 = { name: '高脚杯深蹲', mode: 'weight', unit: 'kg', tips: '', personal: '膝盖注意' };
    T.state.exercises = { goblet_squat: JSON.parse(JSON.stringify(exA167)) };
    T.state.program = { A: [{ exerciseId: 'goblet_squat', sets: [{ reps: 5, weight: 10 }] }], B: [] };
    T.state.sessions = { A: null, B: null };
    const p167 = {
      exercises: { goblet_squat: { name: '', tips: '新提示' }, ghost_ex167: { mode: 'bodyweight' } },
      program: { A: [{ exerciseId: 'goblet_squat', sets: [{ reps: 5, weight: 10 }] }, { exerciseId: 'ghost_ex167', sets: [{ reps: 8 }] }] }
    };
    const r167 = T.importPlan(JSON.stringify(p167));
    check('167 空名称保留旧名', r167.ok && T.state.exercises.goblet_squat.name === '高脚杯深蹲');
    check('167 合并语义其余字段照常生效', T.state.exercises.goblet_squat.tips === '新提示' && T.state.exercises.goblet_squat.personal === '膝盖注意');
    check('167 无名称的新动作以 id 兜底', T.state.exercises.ghost_ex167.name === 'ghost_ex167');
  }
  console.log('== 168. 抽屉内容超高时可滚动（v0.9.122）==');
  {
    const css168 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const drawer = (css168.match(/\.drawer\{([^}]*)\}/) || ['', ''])[1];
    check('168 .drawer 声明了 overflow-y:auto', /overflow-y:auto/.test(drawer));
  }
  console.log('== 169. 提示条只在带按钮时接收点击（测试加固，无应用改动）==');
  // CSS：.toast 默认 pointer-events:none、.toast.with-act 才 auto（css/style.css:316/321）；
  // JS 侧 add/remove('with-act') 与之配对（js/app.js:405/415/422/425）。
  // 若失配：普通提示会挡住屏幕底部中央的按钮（那里正是 ± 步进区），或撤销按钮点不动。
  {
    const css169 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    check('169 .toast 默认 pointer-events:none', /\.toast\{[^}]*pointer-events:none/.test(css169));
    check('169 .toast.with-act 恢复 pointer-events:auto', /\.toast\.with-act\{pointer-events:auto\}/.test(css169));
    const t169 = document.getElementById('toast');
    T.toast('带撤销169', () => {});
    check('169 带操作的提示有 with-act 与撤销按钮', t169.classList.contains('with-act') && /data-act="undo"/.test(t169.innerHTML));
    advanceClock(7000); runTimers();
    check('169 过期后 with-act/show 一并清掉', !t169.classList.contains('with-act') && !t169.classList.contains('show'));
    T.toast('普通提示169');
    check('169 普通提示不带 with-act、只写文案', !t169.classList.contains('with-act') && t169.textContent === '普通提示169');
  }
  console.log('== 170. 趋势图全平值/零值不产生 NaN（测试加固，无应用改动）==');
  // yRange=(yMax-yMin)||1、yMax=(hi*1.06)||1 两个兜底此前只靠人工推演：
  // 两次同重量（lo=hi）与全零值是最容易翻车的两个输入，钉住。
  {
    T.state.exercises = {}; T.state.program = { A: [], B: [] };
    T.state.exercises.e170 = { name: '平线动作170', mode: 'weight', unit: 'kg' };
    const log170 = n => ({ date: `2026-04-0${n}`, day: 'A', startedAt: n, exercises: [
      { exerciseId: 'e170', sets: [{ weight: 60, reps: 8, done: true }] }] });
    const ch170 = T.buildTrendCharts(T.buildTrends([log170(1), log170(2)]), 5);
    check('170 两次同重量：图里没有任何 NaN', !/NaN/.test(ch170));
    check('170 平线仍画出两点折线与末点圆', /<polyline points="[\d., -]+"/.test(ch170) && /<circle cx=/.test(ch170));
    T.state.exercises.e170z = { name: '零值动作170', mode: 'weight', unit: 'kg' };
    const log170z = n => ({ date: `2026-04-0${n}`, day: 'A', startedAt: n, exercises: [
      { exerciseId: 'e170z', sets: [{ weight: 0, reps: 5, done: true }] }] });
    const chz = T.buildTrendCharts(T.buildTrends([log170z(1), log170z(2)]), 5);
    check('170 全零值也不产生 NaN', !/NaN/.test(chz));
  }
  console.log('== 171. 每个自由文本输入框的 maxlength 与 JS 封顶成对（测试加固，无应用改动）==');
  // 只改一边会悄悄丢字：maxlength 拦不住导入，JS slice 又会让输入框里的超长内容失焦即蒸发。
  // 四处配对：restNote 200 / profile 2000 / personal 500 / 动作备注 500。
  {
    const html171 = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const app171 = fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf8');
    check('171 rest-note 输入框 maxlength=200 与 slice(0,200) 成对',
      /id="rest-note"[^>]*maxlength="200"/.test(html171) && /settings\.restNote = e\.target\.value\.trim\(\)\.slice\(0, 200\)/.test(app171));
    check('171 profile-bg maxlength=2000 与 slice(0,2000) 成对',
      /id="profile-bg"[^>]*maxlength="2000"/.test(html171) && /profile\.background = e\.target\.value\.slice\(0, 2000\)/.test(app171));
    check('171 personal-note maxlength=500 与 slice(0,500) 成对',
      /id="personal-note"[^>]*maxlength="500"/.test(html171) && /exercises\[personalExId\]\.personal = e\.target\.value\.trim\(\)\.slice\(0, 500\)/.test(app171));
    check('171 fs-exnote maxlength=500 与 slice(0,500) 成对',
      /class="fs-exnote" maxlength="500"/.test(app171) && /item\.note = inp\.value\.trim\(\)\.slice\(0, 500\)/.test(app171));
  }
  console.log('== 172. 测试小节编号严格递增（测试自检，无应用改动）==');
  // 编号重复/回绕会让「§N」引用失去指向（历史上真出现过写错的提交信息）。
  // 允许跳号（历史小节删除过），不允许重复或倒退。
  {
    const self172 = fs.readFileSync(__filename, 'utf8');
    const nums = [...self172.matchAll(/console\.log\(['"`]== (\d+)\./g)].map(m => Number(m[1]));
    check('172 小节编号无重复且严格递增', nums.length > 100 && nums.every((n, i) => i === 0 || n > nums[i - 1]));
    check('172 最后一个编号就是本节', nums[nums.length - 1] === 200);
  }
  console.log('== 173. 空日志时导出提示如实说「暂无训练日志」（测试加固，无应用改动）==');
  // runExport js/app.js:2237-2239：recentLogs 为空时不得虚报「最近 N 次日志」。此前从未钉过。
  // 剪贴板桩自带并成对还原（§161 教训），先置 copied=null。
  {
    const saveLogs173 = T.state.logs;
    const saveProg173 = T.state.program, saveEx173 = T.state.exercises;
    T.state.program = { A: [{ section: '', exerciseId: 'e173', sets: [{ type: 'work', weight: 10, reps: 8, duration: null, rpe: null, rpeLabel: '', side: null }] }], B: [] };
    T.state.exercises = { e173: { name: '导出动作173', mode: 'weight', unit: 'kg' } };
    const nav173prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { clipboard: { writeText: async t => { globalThis.copied = t; } } } });
    globalThis.copied = null;
    T.state.logs = [];
    document.getElementById('export-n').value = '4';
    await T.runExport(false);
    const msg173 = String(document.getElementById('export-msg').textContent);
    check('173 空日志提示「暂无训练日志」而不是虚报条数', msg173.includes('暂无训练日志') && !/最近 \d+ 次/.test(msg173));
    const data173 = JSON.parse(globalThis.copied);
    check('173 导出文本仍含当前计划与动作库', data173.program.A.length === 1 && data173.exercises.e173.name === '导出动作173');
    check('173 空的 B 日不写进导出（粘回导入时不会被自己的空日拒掉）', !('B' in data173.program));
    T.state.logs = saveLogs173; T.state.program = saveProg173; T.state.exercises = saveEx173;
    if(nav173prev) Object.defineProperty(globalThis, 'navigator', nav173prev); else delete globalThis.navigator;
  }
  console.log('== 174. 抽屉打开时 main 进 inert，汉堡保持可用（v0.9.124）==');
  {
    const drawer174 = document.getElementById('drawer');
    const main174 = makeEl('main174'), header174 = makeEl('header174');
    let sel174 = null;
    patchTarget = { matches(sel){ sel174 = sel; return sel === 'main' || sel === 'header'; }, get node(){ return sel174 === 'main' ? main174 : header174; } };
    T.toggleDrawer();
    check('174 抽屉打开：main 进 inert，抽屉自身不进', main174.attrs.inert === '' && drawer174.attrs.inert === undefined);
    check('174 header（汉堡）不进 inert——还能点它关抽屉', header174.attrs.inert === undefined);
    T.askConfirm('确认吗？'); // 确认框压在抽屉上：背景全部 inert
    check('174 确认框压在抽屉上：main 与抽屉都 inert', drawer174.attrs.inert === '' && main174.attrs.inert === '');
    const esc174 = docHandlers.get('keydown');
    esc174({ key: 'Escape' }); // 关确认，抽屉还开着
    check('174 ESC 关确认后抽屉仍开：main 保持 inert、抽屉可交互', main174.attrs.inert === '' && drawer174.attrs.inert === undefined);
    esc174({ key: 'Escape' }); // 再按关抽屉
    check('174 ESC 关抽屉：全部解除', main174.attrs.inert === undefined && drawer174.attrs.inert === undefined && header174.attrs.inert === undefined);
    patchTarget = null;
  }
  console.log('== 175. 模态打开焦点进对话框，关闭归还触发者（v0.9.125）==');
  {
    const opener175 = makeEl('opener175');
    opener175.focus = function(){ this.focused = (this.focused || 0) + 1; };
    const ok175 = document.getElementById('confirm-ok-btn');
    let okFocus175 = 0; ok175.focus = () => { okFocus175++; };
    const prevActive175 = document.activeElement;
    document.activeElement = opener175;
    T.askConfirm('删掉它？');
    check('175 确认框打开：焦点移到确定按钮', okFocus175 === 1);
    T.answerConfirm(true);
    check('175 确认框关闭：焦点归还触发者', opener175.focused === 1);
    const sc175 = document.getElementById('summary-close');
    let scFocus175 = 0; sc175.focus = () => { scFocus175++; };
    document.activeElement = opener175; opener175.focused = 0;
    T.showSummary({ day: 'A', exercises: [], durationSec: 60, condition: null });
    check('175 小结打开：焦点移到「好的」按钮', scFocus175 === 1);
    T.closeSummary();
    check('175 小结关闭：焦点归还触发者', opener175.focused === 1);
    document.activeElement = prevActive175;
  }
  console.log('== 176. 点抽屉外任意处即关抽屉（v0.9.126）==');
  {
    const drawer176 = document.getElementById('drawer');
    T.toggleDrawer();
    check('176 前置：抽屉已开', drawer176.classList.contains('open'));
    const clickH176 = docHandlers.get('click');
    check('176 文档级 click 监听已注册', typeof clickH176 === 'function');
    // 点抽屉外的空白（main inert 后点击穿透到 body）→ 关抽屉
    clickH176({ target: { closest: () => null } });
    check('176 点抽屉外：关闭', !drawer176.classList.contains('open'));
    T.toggleDrawer();
    // 点抽屉内部（菜单项在 .drawer 里）→ 不误关，由各自的 onclick 处理
    clickH176({ target: { closest: sel => sel === '.drawer' ? {} : null } });
    check('176 点抽屉内部：不误关', drawer176.classList.contains('open'));
    // 点 header（汉堡）→ toggleDrawer 自己处理，这里不重复处理
    clickH176({ target: { closest: sel => sel === 'header' ? {} : null } });
    check('176 点 header：不重复处理', drawer176.classList.contains('open'));
    T.closeDrawer();
    clickH176({ target: { closest: () => null } });
    check('176 抽屉未开时点击无操作', !drawer176.classList.contains('open'));
  }
  console.log('== 177. RPE 步进器：从计划目标起步，钳位 1–10（测试加固，无应用改动）==');
  // js/app.js:1105-1107：base = set.rpe ?? set.targetRpe ?? (inc?7.5:8.5)；inc 钳 10、dec 钳 1。
  // 下限 1 是拉伸/呼吸（目标 RPE 2–4）能记真实强度的关键，此前从未钉过。
  {
    const saveProg177 = T.state.program, saveEx177 = T.state.exercises, saveDay177 = T.state.settings.lastDay;
    T.state.settings.lastDay = 'A';
    T.state.logs = [];
    T.state.program = { A: [{ section: '', exerciseId: 'e177', sets: [{ type: 'work', weight: 10, reps: 8, duration: null, rpe: 6, rpeLabel: '', side: null }] }], B: [] };
    T.state.exercises = Object.assign({}, T.state.exercises, { e177: { name: 'RPE 动作177', mode: 'weight', unit: 'kg' } });
    const bR177 = act => clickExList(btnOf({ act, f: 'rpe', ex: '0', set: '0' }));
    bR177('dec');
    check('177 没记过 RPE 时从计划里的 targetRpe 起步（6 → 5.5）', T.getItems('A')[0].sets[0].rpe === 5.5);
    for(let i = 0; i < 20; i++) bR177('dec');
    check('177 下限钳在 1：拉伸/呼吸这类低强度也能记', T.getItems('A')[0].sets[0].rpe === 1);
    for(let i = 0; i < 30; i++) bR177('inc');
    check('177 上限钳在 10', T.getItems('A')[0].sets[0].rpe === 10);
    T.state.program = saveProg177; T.state.exercises = saveEx177; T.state.settings.lastDay = saveDay177;
    delete T.state.exercises.e177;
  }
  console.log('== 178. 数字键盘 Enter 提示与回车推进流一致（v0.9.127）==');
  // 回车推进流 js/app.js:1166-1181：重量框 Enter→次数框，次数/时长框 Enter→完成这一组。
  // 键盘上的键名必须与这个行为一致：重量 enterkeyhint="next"，次数/时长 enterkeyhint="done"。
  {
    check('178 重量框：inputmode=decimal 且 enterkeyhint=next', script.includes('inputmode="decimal" enterkeyhint="next"'));
    check('178 次数/时长框共 3 处 enterkeyhint=done（Enter=完成这一组）', (script.match(/enterkeyhint="done"/g) || []).length === 3);
    check('178 不引入其它 enterkeyhint 值', (script.match(/enterkeyhint="([a-z]+)"/g) || []).every(s => s === 'enterkeyhint="next"' || s === 'enterkeyhint="done"'));
    check('178 每个动态输入仍带 inputmode', (script.match(/class="fs-input"[^>]*inputmode=/g) || []).length === 4);
  }
  console.log('== 179. 导入确认文案如实说明个人备注的合并规则（v0.9.128）==');
  // applyPlan js/app.js:1901 是「非空优先」：计划带了 personal 会替换本地（§122 钉过 500 封顶路径）；
  // 但确认框曾写「个人注意不会被覆盖」——与行为相反，用户点确认时会被误导。
  {
    const saveEx179 = T.state.exercises, saveProg179 = T.state.program, saveSess179 = T.state.sessions;
    T.state.exercises = { e179: { name: '动作179', mode: 'weight', unit: 'kg', personal: '用户备注' } };
    T.state.program = { A: [], B: [] };
    T.state.sessions = { A: null, B: null };
    const plan179 = {
      exercises: { e179: { name: '动作179', mode: 'weight', unit: 'kg', personal: '计划里的新备注' } },
      program: { A: [{ exerciseId: 'e179', sets: [{ reps: 8, weight: 10 }] }] }
    };
    const diff179 = T.planDiffText({ program: plan179.program, exercises: plan179.exercises });
    check('179 确认文案说明「写了会替换、留空保留本地」，不再虚假承诺不覆盖', diff179.includes('写了会替换') && diff179.includes('留空则保留本地') && !diff179.includes('不会被覆盖'));
    const r179 = T.importPlan(JSON.stringify(plan179));
    check('179 行为与文案一致：计划 personal 非空时替换本地', r179.ok && T.state.exercises.e179.personal === '计划里的新备注');
    T.state.exercises.e179.personal = '本地备注';
    const r179b = T.importPlan(JSON.stringify({ exercises: { e179: { name: '动作179', mode: 'weight', unit: 'kg' } }, program: { A: [{ exerciseId: 'e179', sets: [{ reps: 8, weight: 10 }] }] } }));
    check('179 计划不带 personal 时保留本地值', r179b.ok && T.state.exercises.e179.personal === '本地备注');
    T.state.exercises = saveEx179; T.state.program = saveProg179; T.state.sessions = saveSess179;
    delete T.state.exercises.e179;
  }
  console.log('== 180. 连续两次确认（clearAll 模式）焦点链不断（v0.9.125 回归）==');
  // clearAll js/app.js:2448-2456 是两次「打开→关闭」的 askConfirm：第二次的焦点来源
  // 必须是第一次归还后的原触发者，modalOpener 不能断链。
  {
    const opener180 = makeEl('opener180');
    opener180.focus = function(){ this.focused = (this.focused || 0) + 1; };
    const ok180 = document.getElementById('confirm-ok-btn');
    let n180 = 0; ok180.focus = () => { n180++; };
    const prev180 = document.activeElement;
    document.activeElement = opener180;
    const p1 = T.askConfirm('第一步');
    T.answerConfirm(true); await p1;
    check('180 第一次确认关闭：焦点归还触发者', opener180.focused === 1);
    document.activeElement = opener180; // 真实浏览器里焦点就在归还后的按钮上
    const p2 = T.askConfirm('再次确认');
    check('180 第二次确认打开：焦点进确定按钮', n180 === 2);
    T.answerConfirm(true); await p2;
    check('180 第二次确认关闭：焦点仍归还最初的触发者，链不断', opener180.focused === 2);
    document.activeElement = prev180;
  }
  console.log('== 181. 抽屉滚动不带动背景；遮罩点击关闭的真实机制（v0.9.129）==');
  {
    const css181 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const drawer181 = (css181.match(/\.drawer\{([^}]*)\}/) || ['', ''])[1];
    check('181 .drawer 滚动到尽头不带动背景页面', /overscroll-behavior:contain/.test(drawer181));
    // 抽屉遮罩的关闭机制是 index.html 的内联 onclick——不是文档级监听（v0.9.126 只是兜底）。
    check('181 遮罩存在且点击即 closeDrawer', /class="drawer-overlay"[^>]*onclick="closeDrawer\(\)"/.test(html));
    check('181 遮罩默认不接收点击（关闭状态不挡页面）', /\.drawer-overlay\{[^}]*pointer-events:none/.test(css181) && /\.drawer-overlay\.show\{[^}]*pointer-events:auto/.test(css181));
  }
  console.log('== 182. ± 步进下限：时长钳 0、次数钳 1（测试加固，无应用改动）==');
  // js/app.js:1044-1048：时长 ±5 秒、次数 ±1，下限分别是 0 和 1，上限与手输同规矩 1e6。
  // 时长为负会让小结与趋势的合计出错；次数 0 组没有训练意义（手输 0 是另一条已钉路径）。
  {
    const saveProg182 = T.state.program, saveEx182 = T.state.exercises, saveDay182 = T.state.settings.lastDay;
    T.state.settings.lastDay = 'A';
    T.state.logs = []; delete T.state.drafts.A;
    T.state.program = { A: [
      { section: '', exerciseId: 'e182t', sets: [{ type: 'work', weight: null, reps: null, duration: 0, rpe: null, rpeLabel: '', side: null }] },
      { section: '', exerciseId: 'e182b', sets: [{ type: 'work', weight: null, reps: 1, duration: null, rpe: null, rpeLabel: '', side: null }] }
    ], B: [] };
    T.state.exercises = Object.assign({}, T.state.exercises, {
      e182t: { name: '平板支撑182', mode: 'time', unit: null },
      e182b: { name: '俯卧撑182', mode: 'bodyweight', unit: null }
    });
    const it182a = T.getItems('A')[0];
    clickExList(btnOf({ act: 'step', ex: '0', set: '0', f: 'duration', dir: '-1' }));
    check('182 时长下限钳在 0（不会变负数把合计和显示搞坏）', it182a.sets[0].duration === 0);
    clickExList(btnOf({ act: 'step', ex: '0', set: '0', f: 'duration', dir: '1' }));
    check('182 时长步进 +5 秒', it182a.sets[0].duration === 5);
    const it182b = T.getItems('A')[1];
    clickExList(btnOf({ act: 'step', ex: '1', set: '0', f: 'reps', dir: '-1' }));
    check('182 次数下限钳在 1', it182b.sets[0].reps === 1);
    T.state.program = saveProg182; T.state.exercises = saveEx182; T.state.settings.lastDay = saveDay182;
    delete T.state.exercises.e182t; delete T.state.exercises.e182b;
  }
  console.log('== 183. 输入控件都有可读名字（v0.9.130）==');
  // 读屏软件念不出没有可访问名的输入框：placeholder 不是规范意义上的名字，卡片标题也不会自动关联。
  // 通用扫描 index.html 每一个可见的 input/textarea：要么有 label for= 指向它，要么自带 aria-label。
  // 隐藏的文件选择器（restore-file）由按钮触发，不参与读屏遍历，跳过。
  {
    const html183 = fs.readFileSync('index.html', 'utf8');
    const named183 = new Set([...html183.matchAll(/<label[^>]*for="([^"]+)"/g)].map(m => m[1]));
    const unnamed183 = [];
    for(const m of html183.matchAll(/<(input|textarea)\b[^>]*>/g)){
      const tag = m[0];
      if(/type="hidden"|type="file"| hidden>/.test(tag)) continue;
      const idm = tag.match(/id="([^"]+)"/);
      const hasName = /aria-label=/.test(tag) || (idm && named183.has(idm[1]));
      if(!hasName) unnamed183.push(idm ? idm[1] : tag.slice(1, 40));
    }
    check('183 index.html 每个可见输入控件都有 label 或 aria-label' + (unnamed183.length ? '（缺：' + unnamed183.join(', ') + '）' : ''), unnamed183.length === 0);
    check('183 全屏卡片生成的动作备注输入也有 aria-label', /class="fs-exnote"[^>]*aria-label=/.test(script));
  }
  console.log('== 184. 切后台/关页面都会强制落盘（测试加固，无应用改动）==');
  // js/app.js:336-340：visibilitychange 的 hidden 分支和 pagehide 都调 flushSave。
  // iOS 上 pagehide 常常不触发，hidden 分支才是移动端不丢数据的主路径；此前只钉了 visible 分支（§27），
  // pagehide 注册被 window 桩吞掉——删掉任何一条都不会有测试红。
  {
    const onPagehide = windowHandlers.get('pagehide');
    check('184 注册了 window pagehide 处理', typeof onPagehide === 'function');
    const onVis184 = docHandlers.get('visibilitychange');
    const saveClear184 = T.clearingAll, saveStep184 = T.state.settings.weightStep, saveVis184 = global.document.visibilityState;
    T.clearingAll = false;   // §95 之后清除守卫为 true，save 是空转；这里要的是真实落盘路径
    const read184 = () => (JSON.parse(global.localStorage._d['ironlog.v1'] || '{}').settings || {}).weightStep;
    T.state.settings.weightStep = 7;
    T.saveSoon();
    check('184 防抖未到期时不落盘', read184() !== 7);
    global.document.visibilityState = 'hidden';
    onVis184();
    check('184 切到后台立即强制落盘（iOS 上这是主要路径）', read184() === 7);
    T.state.settings.weightStep = 8;
    T.saveSoon();
    onPagehide();
    check('184 页面卸载（pagehide）也立即强制落盘', read184() === 8);
    global.document.visibilityState = saveVis184;
    T.state.settings.weightStep = saveStep184;
    T.clearingAll = saveClear184;
    runTimers();
  }
  console.log('== 185. 点抽屉外关闭的兜底监听（测试加固，无行为改动）==');
  // js/app.js:484-489：遮罩 .drawer-overlay 的 onclick 是主路径（§181 已钉），
  // 文档级监听是遮罩失效时的兜底——此前没有任何测试直接调用过它。
  {
    const drawerEl185 = document.getElementById('drawer');
    const onClickDoc185 = docHandlers.get('click');
    check('185 注册了文档级 click 兜底', typeof onClickDoc185 === 'function');
    drawerEl185.classList.add('open');
    onClickDoc185({ target: { closest: () => null } });   // 抽屉与 header 之外
    check('185 点抽屉外会关闭抽屉', !drawerEl185.classList.contains('open'));
    drawerEl185.classList.add('open');
    onClickDoc185({ target: { closest: sel => sel === '.drawer' ? drawerEl185 : null } });
    check('185 点抽屉内不会关闭抽屉', drawerEl185.classList.contains('open'));
    onClickDoc185({ target: null });                       // 无 closest 的异常目标也按外部处理
    check('185 异常目标按外部处理并关闭', !drawerEl185.classList.contains('open'));
    drawerEl185.classList.remove('open');
  }
  console.log('== 186. Android 返回键关闭菜单而不是退出应用（v0.9.131）==');
  // js/app.js:531-547：开抽屉压一条历史；popstate 关抽屉；主动关闭同步回退一条，避免历史栈残留。
  {
    const onPop186 = windowHandlers.get('popstate');
    check('186 注册了 popstate 处理', typeof onPop186 === 'function');
    const h186 = window.history, depth0 = h186.stack.length;
    T.toggleDrawer();                                       // 打开
    check('186 打开抽屉压入一条历史', h186.stack.length === depth0 + 1 && !!(h186.state && h186.state.ironlogDrawer === true));
    T.toggleDrawer();                                       // 汉堡键主动关闭 → 同步回退
    check('186 主动关闭不留重复历史（再按返回不会白按一次）', h186.stack.length === depth0);
    T.toggleDrawer();                                       // 再开
    h186.back();                                            // 模拟按返回键（浏览器语义：先出栈再触发 popstate）
    check('186 返回键关闭抽屉', !document.getElementById('drawer').classList.contains('open'));
    check('186 返回键后历史栈不多弹也不少弹', h186.stack.length === depth0);
    h186.back();                                            // 再按一次：抽屉已关，无副作用（真实场景=退出应用）
    const expect186 = Math.max(1, depth0 - 1);              // 栈底时 back 无操作（浏览器语义=离开页面）
    check('186 第二次返回无副作用', h186.stack.length === expect186 && !document.getElementById('drawer').classList.contains('open'));
    document.getElementById('drawer').classList.remove('open');
    h186.stack.length = depth0;                             // 还原栈深，不影响后续节
  }
  console.log('== 187. id 唯一且 $() 引用的 id 全部存在（测试加固，无应用改动）==');
  // 重复 id 会让 getElementById 拿到错误的节点（$() 全部按 id 找元素）；拼错的 id 引用只会静默失败。
  {
    const seen187 = new Map();
    for(const m of html.matchAll(/id="([^"]+)"/g)) seen187.set(m[1], (seen187.get(m[1]) || 0) + 1);
    const dup187 = [...seen187].filter(([, n]) => n > 1).map(([id]) => id);
    check('187 index.html 没有重复 id' + (dup187.length ? '（重复：' + dup187.join(', ') + '）' : ''), dup187.length === 0);
    const defined187 = new Set();
    for(const m of (html + script).matchAll(/id="([A-Za-z0-9-]+)"/g)) defined187.add(m[1]);
    const missing187 = [];
    for(const m of script.matchAll(/\$\('([^']+)'\)/g)) if(!defined187.has(m[1])) missing187.push(m[1]);
    check('187 每个 $() 引用的 id 都在页面或生成的模板里存在' + (missing187.length ? '（缺：' + missing187.join(', ') + '）' : ''), missing187.length === 0 && defined187.size >= 40);
  }
  console.log('== 188. 用到的每个类名都在 CSS 里有定义（测试加固，无应用改动）==');
  // 拼错的类名不会报错，只会静默失去样式（比如 sumary-card 少个 m，卡片直接裸奔）。
  // 静态 class="..." 与 classList 切换的类名都扫；含 ${} 模板表达式的属性跳过（那些由各自的行为测试覆盖）。
  {
    const css188 = require('fs').readFileSync('css/style.css', 'utf8');
    const tokens = new Set();
    for(const m of (html + script).matchAll(/class="([^"]*)"/g)){
      if(m[1].includes('${')) continue;   // 含模板表达式的属性跳过（那些由各自的行为测试覆盖）
      for(const t of m[1].split(/\s+/)) if(/^[a-z][a-z0-9-]*$/.test(t)) tokens.add(t);
    }
    for(const m of script.matchAll(/classList\.(?:add|remove|toggle|contains)\('([a-z][a-z0-9-]*)'/g)) tokens.add(m[1]);
    const undef188 = [...tokens].filter(t => !new RegExp('\\.' + t + '(?![-\\w])').test(css188));
    check('188 每个用到的类名都有样式定义' + (undef188.length ? '（未定义：' + undef188.join(', ') + '）' : ''), undef188.length === 0 && tokens.size >= 80);
  }
  console.log('== 189. 抽屉开关时焦点进关闭按钮、归还汉堡键（测试加固，无应用改动）==');
  // js/app.js:520/:529：键盘/读屏用户开抽屉后落在第一个可操作项，关抽屉后回到触发它的汉堡键；
  // 确认框/小结的焦点归还已钉（§175/§180），抽屉这条此前没钉。
  {
    const ham189 = document.getElementById('hamburger-btn');
    let closeFocus189 = 0, hamFocus189 = 0;
    const closeStub189 = makeEl('drawer-close');
    closeStub189.focus = () => { closeFocus189++; };
    ham189.focus = () => { hamFocus189++; };
    patchTarget = { matches: sel => sel === '.drawer-close', node: closeStub189 };
    T.toggleDrawer();                                        // 开
    check('189 开抽屉后焦点进入抽屉内第一个可操作项', closeFocus189 === 1);
    T.closeDrawer();                                         // 经遮罩/ESC/菜单项关闭（汉堡键关闭时焦点本就在汉堡上，无需归还）
    check('189 关抽屉后焦点归还汉堡键', hamFocus189 === 1);
    patchTarget = null;
    ham189.focus = () => {};                               // 还原桩的 no-op focus，不影响后续节
    document.getElementById('drawer').classList.remove('open');
  }
  console.log('== 190. 畸形存档读入后规范化，且再存再读到达不动点（测试加固，无应用改动）==');
  // migrate（js/app.js:150-264）是数据面的最后防线：手工编辑/截断/旧版备份都要落到同一个合法形状。
  // 此前各字段分别钉过，但没有一条「整个存档 = 固定点」的性质测试：规范化若不收敛（存一次读一次变一次），
  // 用户每次刷新都会被改数据，没有任何单测会红。load() 只返回迁移结果不改内存，正好做纯函数往返。
  {
    const key190 = 'ironlog.v1';
    const origStore190 = global.localStorage._d[key190];
    global.localStorage._d[key190] = JSON.stringify({
      version: 1,
      settings: { restSec: -5, warmupRestSec: 99999, lastDay: 'Z', weightStep: 'x' },
      profile: '直接在备份里写的字符串背景',
      program: { A: [{ section: 's', exerciseId: 'e190', sets: [{ type: 'weird', weight: 'abc', reps: NaN, duration: -5, rpe: 99, rpeLabel: 'l'.repeat(2000), side: null }] }], B: [] },
      exercises: { e190: '不是对象' },
      logs: [null, 'x', { date: 'd', exercises: 'notarray' }, { date: '2024-01-02', exercises: [null, { sets: 'x' }, { sets: [{ weight: '100', reps: '8' }] }] }],
      drafts: { A: [null, { sets: 'x' }, { sets: [{ weight: '50.5', reps: 'x' }] }] },
      sessions: { A: null, B: null },
      rest: { endsAt: -1 }, timer: { startsAt: 0 }, ui: null
    });
    const d190 = T.load();
    const s190 = d190.settings;
    check('190 非法设置回默认或钳进范围（休息 90/热身 1800/步进 2.5/日期 A）', s190.restSec === 90 && s190.warmupRestSec === 1800 && s190.weightStep === 2.5 && s190.lastDay === 'A');
    check('190 字符串 profile 保住内容并纠正形状', d190.profile && typeof d190.profile === 'object' && d190.profile.background === '直接在备份里写的字符串背景');
    check('190 日志只留合法条目且字符串数值归一化', d190.logs.length === 1 && d190.logs[0].exercises.length === 1 && d190.logs[0].exercises[0].sets[0].weight === 100 && d190.logs[0].exercises[0].sets[0].reps === 8);
    check('190 非对象的动作条目被规范化而不是留毒', d190.exercises.e190 && typeof d190.exercises.e190 === 'object' && d190.exercises.e190.name === 'e190');
    check('190 坏的 rest/timer 计时器被丢弃', d190.rest === null && d190.timer === null);
    const fixed190 = JSON.stringify(d190);
    global.localStorage._d[key190] = fixed190;             // 与 save() 写入的内容等价
    const d2 = T.load();
    check('190 再存再读完全一致（规范化是幂等的，不会每次刷新改一次数据）', JSON.stringify(d2) === fixed190);
    if(origStore190 !== undefined) global.localStorage._d[key190] = origStore190;
  }
  console.log('== 191. SEED 计划引用的动作全部存在，无孤儿无重复（测试加固，无应用改动）==');
  // 计划条目指向不存在的动作时界面会退化成显示 id；动作库里留着 A/B 日都用不到的孤儿会污染动作选择器。
  // SEED 是出厂数据，改种子（换动作/改 id）时最容易碰断这条。
  {
    const seed191 = script.slice(script.indexOf('const SEED'), script.indexOf('/* ---------------- 迁移'));
    const defIds191 = [...seed191.matchAll(/^\s{4}([a-z_]+):\s*\{ name:/gm)].map(m => m[1]);
    const refIds191 = [...seed191.matchAll(/exerciseId:\s*'([a-z_]+)'/g)].map(m => m[1]);
    const defSet191 = new Set(defIds191);
    const miss191 = [...new Set(refIds191)].filter(r => !defSet191.has(r));
    const orphan191 = [...defSet191].filter(d => !refIds191.includes(d));
    const dup191 = defIds191.filter((x, i) => defIds191.indexOf(x) !== i);
    check('191 计划引用的每个动作都在动作库里' + (miss191.length ? '（缺：' + miss191.join(', ') + '）' : ''), miss191.length === 0 && defSet191.size >= 20);
    check('191 动作库没有 A/B 日都用不到的孤儿' + (orphan191.length ? '（孤儿：' + orphan191.join(', ') + '）' : ''), orphan191.length === 0);
    check('191 动作库没有重复 id' + (dup191.length ? '（重复：' + dup191.join(', ') + '）' : ''), dup191.length === 0);
  }
  console.log('== 192. B 日夹具是承重资产：自洽 + 完整导入路径（测试加固，无应用改动）==');
  // fixtures/plan-B.json 来自用户真实的 B 日打卡实录，但此前没有任何测试引用它：
  // 夹具哪天被改坏（id 打错、结构漂移）只有人读文件才会发现。先钉夹具自洽，
  // 再走完整导入路径（applyPlan 未导出，importPlan 是唯一入口）证明它真的能导入并落到 B 日。
  {
    const pbText192 = fs.readFileSync(path.join(__dirname, 'fixtures/plan-B.json'), 'utf8');
    const pb192 = JSON.parse(pbText192);
    const refs192 = [];
    for(const day of Object.keys(pb192.program)) for(const e of pb192.program[day]) refs192.push(e.exerciseId);
    const defs192 = new Set(Object.keys(pb192.exercises));
    const miss192 = refs192.filter(r => !defs192.has(r));
    check('192 B 日夹具计划引用的动作都在夹具定义里' + (miss192.length ? '（缺：' + miss192.join(', ') + '）' : ''), miss192.length === 0 && defs192.size >= 10);
    check('192 B 日夹具 day 字段是 B', pb192.day === 'B');
    const snapProg192 = JSON.parse(JSON.stringify(T.state.program));
    const snapEx192 = JSON.parse(JSON.stringify(T.state.exercises));
    const snapImp192 = T.state.lastImport;
    const snapSess192 = JSON.parse(JSON.stringify(T.state.sessions));
    const r192 = T.importPlan(pbText192);
    check('192 B 日夹具能通过完整导入路径' + (r192 && r192.error ? '（' + r192.error + '）' : ''), r192 && r192.ok === true);
    check('192 导入后 B 日计划非空且每个条目的动作都有定义', T.state.program.B.length > 0 && T.state.program.B.every(e => T.state.exercises[e.exerciseId]));
    T.state.program = snapProg192;
    T.state.exercises = snapEx192;
    T.state.lastImport = snapImp192;
    T.state.sessions = snapSess192;
  }
  console.log('== 193. 产品闭环冒烟：导入→记录→导出→导入新方案→再记录→备份还原（测试加固，无应用改动）==');
  // 产品承诺的闭环是「记录→导出→AI 分析→导入方案→执行」。各环节各自有钉，
  // 但没有任何一条测试按真实顺序把整条链串起来——跨环节的接口漂移（快照格式 vs 导出解析、
  // 导入后草稿失效、备份还原丢日志）只有串起来才会撞红。这里按用户视角跑一遍全程。
  {
    const snap193 = {
      program: JSON.parse(JSON.stringify(T.state.program)),
      ex: JSON.parse(JSON.stringify(T.state.exercises)),
      settings: JSON.parse(JSON.stringify(T.state.settings)),
      logs: T.state.logs, sessions: JSON.parse(JSON.stringify(T.state.sessions)),
      lastImport: T.state.lastImport,
    };
    T.state.settings.lastDay = 'A';
    T.state.sessions = { A: null, B: null };
    T.clearDraft('A'); T.clearDraft('B');
    const plan193 = (w) => JSON.stringify({
      type: 'ai-plan',
      exercises: { sq193: { name: '高脚杯深蹲193', mode: 'weight', unit: 'kg' } },
      program: { A: [{ exerciseId: 'sq193', sets: [{ type: 'work', weight: w, reps: 5, duration: null, rpe: null }] }] },
    });
    const base193 = T.state.logs.length;
    const r1a = T.importPlan(plan193(50));
    check('193 闭环第1步：AI 方案导入成功' + (r1a && r1a.error ? '（' + r1a.error + '）' : ''), r1a && r1a.ok === true);
    T.startSessionIfNeeded('A');
    const sess193 = T.state.sessions.A;
    check('193 开始训练会按新计划物化进行中的记录', !!sess193 && sess193.items.length === 1 && sess193.items[0].exerciseId === 'sq193');
    if(sess193){
      sess193.items[0].sets[0].done = true;
      sess193.items[0].sets[0].weight = 50;
      sess193.items[0].sets[0].reps = 5;
    }
    T.endSession();
    check('193 结束训练后日志 +1 且进行中记录清空', T.state.logs.length === base193 + 1 && T.state.sessions.A === null);
    const ex193 = T.buildExport(3);
    const mine193 = (ex193.recentLogs || []).filter(l => (l.exercises || []).some(e => e.exerciseId === 'sq193'));
    check('193 导出对象包含刚记录的那次训练（重量 50）',
      mine193.length >= 1 && mine193.some(l => l.exercises.some(e => e.sets.some(s => s.weight === 50 && s.done === true))));
    const r2a = T.importPlan(plan193(55));
    check('193 闭环第3步：进阶方案（55kg）导入成功' + (r2a && r2a.error ? '（' + r2a.error + '）' : ''), r2a && r2a.ok === true);
    const items193 = T.getItems('A');
    check('193 新计划成为下一堂训练的目标（预填 55）', items193.length === 1 && items193[0].sets[0].weight === 55);
    advanceClock(60000);   // 两次训练真实相隔几十分钟：startedAt 相同毫秒会被 insertLog 按 startedAt 去重（测试节奏太快的假象）
    T.startSessionIfNeeded('A');
    if(T.state.sessions.A){
      T.state.sessions.A.items[0].sets[0].done = true;
      T.state.sessions.A.items[0].sets[0].weight = 55;
      T.state.sessions.A.items[0].sets[0].reps = 5;
    }
    T.endSession();
    check('193 按新方案再记录一次，历史累计 +2', T.state.logs.length === base193 + 2);
    const bak193 = JSON.stringify(T.buildBackup());
    // restoreBackupText 是「解析→弹确认→应用」：先起 Promise，再用 answerConfirm 按下确认，最后取布尔结果。
    const rbP193 = T.restoreBackupText(bak193);
    await T.answerConfirm(true);
    const rb193 = await rbP193;
    check('193 备份→还原成功且不丢日志/方案',
      rb193 === true && T.state.logs.length === base193 + 2 && T.state.program.A[0].sets[0].weight === 55);
    T.state.program = snap193.program;
    T.state.exercises = snap193.ex;
    T.state.settings = snap193.settings;
    T.state.logs = snap193.logs;
    T.state.sessions = snap193.sessions;
    T.state.lastImport = snap193.lastImport;
    T.clearDraft('A'); T.clearDraft('B');
  }
  console.log('== 194. sw.js 必须能通过语法编译并注册三个生命周期监听（测试加固，无应用改动）==');
  // 此前 sw.js 只被当作文本检查：语法错误会一路通过测试和 CI，只在真机注册 SW 时才炸。
  // app.js 走 eval 天然做语法检查；index.html 由 §10 保证没有内联脚本，所以缺口只在 sw.js。
  {
    const vm194 = require('vm');
    let compileErr194 = null;
    try { new vm194.Script(sw, { filename: 'sw.js' }); }
    catch (e) { compileErr194 = e.message; }
    check('194 sw.js 语法可编译' + (compileErr194 ? '（' + compileErr194 + '）' : ''), compileErr194 === null);
    // 再实际执行一遍顶层：用最小 self 桩接住生命周期注册（不调用处理器，不碰 caches/clients）。
    const swEvents194 = {};
    const sandbox194 = { self: { addEventListener: (t, fn) => { swEvents194[t] = fn; } } };
    sandbox194.self.globalThis = sandbox194.self;
    let runErr194 = null;
    try { vm194.runInNewContext(sw, sandbox194, { filename: 'sw.js' }); }
    catch (e) { runErr194 = e.message; }
    check('194 sw.js 顶层可执行' + (runErr194 ? '（' + runErr194 + '）' : ''), runErr194 === null);
    check('194 install/activate/fetch 监听在运行时确实注册',
      ['install', 'activate', 'fetch'].every(k => typeof swEvents194[k] === 'function'));
  }
  console.log('== 195. sw.js fetch 策略的行为级钉测（测试加固，无应用改动）==');
  // §16/§162 只正则钉过缓存策略；这里真调 fetch 处理器，钉住实际行为：
  // 非 GET / 非同域直接放行；导航网络优先且 404 不写缓存；导航离线回退命中缓存；
  // 资源命中缓存直接回缓存（网络只作后台更新）；资源未命中走网络且非 200 不写缓存。
  {
    const vm195 = require('vm');   // §194 的 vm194 是块级作用域，这里要自己 require
    const mkRes195 = (status, body) => ({ ok: status === 200, status, body, clone() { return this; } });
    const store195 = new Map([['https://example.test/css/style.css', mkRes195(200, 'CACHED')]]);
    const cache195 = {
      match: r => Promise.resolve(store195.get(typeof r === 'string' ? r : r.url)),
      put: (r, res) => { store195.set(typeof r === 'string' ? r : r.url, res); },
    };
    let net195 = [];
    let fetchMode195 = '404';   // 控制沙箱 fetch：'404' 返回 404，'fail' 直接 reject
    const self195 = {
      location: { origin: 'https://example.test' },
      addEventListener: () => {},
      skipWaiting: () => {}, clients: { claim: () => {} },
    };
    const sandbox195 = {
      self: self195,
      caches: { open: () => Promise.resolve(cache195), keys: () => Promise.resolve([]), match: r => cache195.match(r) },
      URL,
      fetch: r => {
        const u = typeof r === 'string' ? r : r.url;
        net195.push(u);
        if (fetchMode195 === 'fail') return Promise.reject(new Error('offline'));
        return Promise.resolve(mkRes195(404, 'NOTFOUND'));
      },
    };
    sandbox195.self.globalThis = sandbox195.self;
    const swEvents195 = {};
    self195.addEventListener = (t, fn) => { swEvents195[t] = fn; };
    vm195.runInNewContext(sw, sandbox195, { filename: 'sw.js' });
    const callFetch195 = async (req) => {
      let out = 'NO_RESPOND';
      swEvents195.fetch({ request: req, respondWith: p => { out = p; } });
      if (out === 'NO_RESPOND') return { handled: false };
      try { return { handled: true, res: await out }; }
      catch (e) { return { handled: true, res: undefined }; }
    };
    const r1 = await callFetch195({ method: 'POST', url: 'https://example.test/save' });
    const r2 = await callFetch195({ method: 'GET', url: 'https://other.example/x.css' });
    check('195 非 GET 与非同域请求直接放行（不接管、不联网）',
      !r1.handled && !r2.handled && net195.length === 0);
    const r3 = await callFetch195({ method: 'GET', mode: 'navigate', url: 'https://example.test/' });
    check('195 导航走网络，404 原样返回且不写进离线回退',
      r3.handled && r3.res && r3.res.status === 404 && !store195.has('./index.html'));
    store195.set('./index.html', mkRes195(200, 'INDEX'));
    fetchMode195 = 'fail';
    const r4 = await callFetch195({ method: 'GET', mode: 'navigate', url: 'https://example.test/' });
    fetchMode195 = '404';
    check('195 导航离线失败回退到缓存的 index.html', r4.handled && r4.res && r4.res.body === 'INDEX');
    const r5 = await callFetch195({ method: 'GET', url: 'https://example.test/css/style.css' });
    check('195 资源命中缓存直接回缓存副本（网络仅作后台更新）',
      r5.handled && r5.res && r5.res.body === 'CACHED');
    const r6 = await callFetch195({ method: 'GET', url: 'https://example.test/icon.svg' });
    check('195 资源未命中走网络，非 200 不写入缓存',
      r6.handled && r6.res && r6.res.status === 404 && !store195.has('https://example.test/icon.svg'));
  }
  console.log('== 196. CSS 自定义属性：用到的每个 var(--x) 都有定义（测试加固，无应用改动）==');
  // 拼错一个 var(--x) 是静默失效：样式无声无息地不生效，肉眼很难发现。与 §188 类名扫描同类。
  {
    const css196 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const defs196 = new Set([...css196.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
    const uses196 = new Set([...(css196 + html + script).matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]));
    check('196 变量定义扫描非空（防恒真）', defs196.size >= 8 && uses196.size >= 8);
    const undef196 = [...uses196].filter(u => !defs196.has(u));
    check('196 所有 var() 引用的变量都在 style.css 定义' + (undef196.length ? '（未定义：' + undef196.join(', ') + '）' : ''), undef196.length === 0);
  }
  console.log('== 197. ± 按住连发：长按自动步进、抬手吞掉同手势的 click（v0.9.132）==');
  // js/app.js pointerdown 连发链：400ms 后起步，间隔 200→100ms 递减；抬手/取消即停（代次守卫 + clearTimeout）。
  // 测试桩的 setTimeout 只排队不看延迟（runTimers 每次执行当前已排队的一轮），所以这里钉的是连发链的
  // 结构行为：一次 runTimers = 一步；抬手后排着的旧步被代次守卫作废。轻点路径必须与旧版一致。
  {
    const saveProg197 = T.state.program, saveEx197 = T.state.exercises, saveDay197 = T.state.settings.lastDay;
    T.state.settings.lastDay = 'A';
    T.state.logs = []; delete T.state.drafts.A;
    T.state.program = { A: [
      { section: '', exerciseId: 'e197b', sets: [{ type: 'work', weight: null, reps: 5, duration: null, rpe: null, rpeLabel: '', side: null }] }
    ], B: [] };
    T.state.exercises = Object.assign({}, T.state.exercises, { e197b: { name: '俯卧撑197', mode: 'bodyweight', unit: null } });
    const it197 = T.getItems('A')[0];
    const pdH197 = handlers.get('ex-list|pointerdown');
    const puH197 = handlers.get('ex-list|pointerup');
    check('197 连发的 pointerdown/up/cancel 监听都已注册', !!pdH197 && !!puH197 && !!handlers.get('ex-list|pointercancel'));
    const btn197 = { dataset: { act: 'step', ex: '0', set: '0', f: 'reps', dir: '1' } };
    const pd197 = () => ({ isPrimary: true, target: { closest: sel => /fs-step/.test(sel) ? btn197 : null } });
    pdH197(pd197());
    runTimers();
    check('197 连发第一步自动步进', it197.sets[0].reps === 6);
    runTimers(); runTimers();
    check('197 连发链持续步进（每轮一步）', it197.sets[0].reps === 8);
    puH197({});
    runTimers(); runTimers();
    check('197 抬手后排队中的旧步被代次守卫作废（即停）', it197.sets[0].reps === 8);
    clickExList(btnOf({ act: 'step', ex: '0', set: '0', f: 'reps', dir: '1' }));
    check('197 抬手后跟随的 click 被吞掉（同手势不多走一步）', it197.sets[0].reps === 8);
    pdH197(pd197()); puH197({}); runTimers();
    clickExList(btnOf({ act: 'step', ex: '0', set: '0', f: 'reps', dir: '1' }));
    check('197 轻点行为不变：只走 click 的一步', it197.sets[0].reps === 9);
    pdH197({ isPrimary: true, target: { closest: () => null } });
    runTimers();
    check('197 非步进按钮长按不步进', it197.sets[0].reps === 9);
    pdH197({ isPrimary: false, target: { closest: () => btn197 } });
    runTimers();
    check('197 多指触摸的次级指针不触发连发', it197.sets[0].reps === 9);
    // RPE 按钮同样连发（inc：默认从 7.5 起步，+0.5/步）
    const btnR197 = { dataset: { act: 'inc', ex: '0', set: '0', f: 'rpe' } };
    pdH197({ isPrimary: true, target: { closest: sel => /rpe-btn/.test(sel) ? btnR197 : null } });
    runTimers(); runTimers();
    puH197({});
    check('197 RPE 按钮长按连发（7.5 起两次 +0.5）', it197.sets[0].rpe === 8.5);
    clickExList(btnOf({ act: 'inc', ex: '0', set: '0', f: 'rpe' }));
    check('197 连发手势收尾：跟随的 click 被吞，不留下未消费的计数', it197.sets[0].rpe === 8.5);
    T.state.program = saveProg197; T.state.exercises = saveEx197; T.state.settings.lastDay = saveDay197;
    delete T.state.exercises.e197b;
  }
  console.log('== 198. 完成按钮语义色：未完成中性描边+文字、完成绿实底，红色留给破坏性操作（v0.9.133）==');
  {
    const css198 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const undone198 = (css198.match(/\.fs-done\.undone\{([^}]*)\}/) || ['', ''])[1];
    const done198 = (css198.match(/\.fs-done\.done\{([^}]*)\}/) || ['', ''])[1];
    check('198 未完成按钮不用红色（红色只留给破坏性操作）', !!undone198 && !/var\(--red\)/.test(undone198));
    check('198 完成态是绿色实底', !!done198 && /background:var\(--green\)/.test(done198));
    const saveProg198 = T.state.program, saveEx198 = T.state.exercises, saveDay198 = T.state.settings.lastDay, savePos198 = T.curPos, saveSess198 = T.state.sessions;
    T.state.settings.lastDay = 'A'; T.curPos = 0;
    T.state.sessions = {};
    T.state.logs = []; delete T.state.drafts.A;
    T.state.program = { A: [
      { section: '', exerciseId: 'e198b', sets: [
        { type: 'work', weight: null, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null },
        { type: 'work', weight: null, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null }
      ] }
    ], B: [] };
    T.state.exercises = Object.assign({}, T.state.exercises, { e198b: { name: '俯卧撑198', mode: 'bodyweight', unit: null } });
    const card198 = T.fullScreenHTML('A');
    check('198 未完成按钮：中性类 + 文字「✓ 完成这组」', /class="fs-done undone"[^>]*>✓ 完成这组<\/button>/.test(card198));
    check('198 卡片上不再出现 ✗ 符号', !card198.includes('✗'));
    check('198 aria-pressed 语义不变（未完成 false）', /aria-pressed="false"/.test(card198));
    clickExList(btnOf({ act: 'confirm', ex: '0', set: '0' }));
    const card198b = T.fullScreenHTML('A');
    check('198 确认后：绿实底类 + 文字「✓ 已完成」', /class="fs-done done"[^>]*>✓ 已完成<\/button>/.test(card198b));
    check('198 确认后 aria-pressed true', /aria-pressed="true"/.test(card198b));
    T.state.program = saveProg198; T.state.exercises = saveEx198; T.state.settings.lastDay = saveDay198; T.curPos = savePos198;
    T.state.sessions = saveSess198;
    delete T.state.exercises.e198b;
  }
  console.log('== 199. 组进度细条：替代小圆环、绿色无红、纯装饰 aria-hidden（v0.9.134）==');
  {
    const css199 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    check('199 细条样式已定义且绿色填充', /\.fs-setbar\{[^}]*height:2px/.test(css199) && /\.fs-setbar-fill\{[^}]*background:var\(--green\)/.test(css199));
    check('199 旧小圆环在样式与应用里都已移除', !/fs-dot/.test(css199) && !/fs-dot/.test(script));
    const saveProg199 = T.state.program, saveEx199 = T.state.exercises, saveDay199 = T.state.settings.lastDay, savePos199 = T.curPos, saveSess199 = T.state.sessions;
    T.state.settings.lastDay = 'A'; T.curPos = 0;
    T.state.sessions = {};   // 198 节的确认把草稿升格成了进行中记录——不清掉 getItems 会返回旧动作的 items
    T.state.logs = []; delete T.state.drafts.A;
    T.state.program = { A: [
      { section: '', exerciseId: 'e199b', sets: [
        { type: 'work', weight: null, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null },
        { type: 'work', weight: null, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null }
      ] }
    ], B: [] };
    T.state.exercises = Object.assign({}, T.state.exercises, { e199b: { name: '俯卧撑199', mode: 'bodyweight', unit: null } });
    const card199a = T.fullScreenHTML('A');
    check('199 未开始：进度条 0% 且 aria-hidden（纯装饰，读屏只听「第 N/M 组」文字）',
      /class="fs-setbar" aria-hidden="true"><div class="fs-setbar-fill" style="width:0%"/.test(card199a));
    clickExList(btnOf({ act: 'confirm', ex: '0', set: '0' }));
    const card199b = T.fullScreenHTML('A');
    check('199 确认 1/2 组：进度条 50%', card199b.includes('style="width:50%"'));
    T.state.program = saveProg199; T.state.exercises = saveEx199; T.state.settings.lastDay = saveDay199; T.curPos = savePos199;
    T.state.sessions = saveSess199;
    delete T.state.exercises.e199b;
  }
  console.log('== 200. 要点折叠行：整行触达 ≥44px、chevron 指示展开/收起（v0.9.135）==');
  {
    const css200 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const sum200 = (css200.match(/\.ex-notes summary\{([^}]*)\}/) || ['', ''])[1];
    check('200 整行 flex 布局且触达 ≥44px', /min-height:44px/.test(sum200) && /display:flex/.test(sum200));
    check('200 隐藏系统默认三角（两套引擎都隐藏）', /list-style:none/.test(sum200) && /::-webkit-details-marker\{display:none\}/.test(css200));
    check('200 自定义 chevron 且展开时旋转 90°', /\.ex-notes summary::before\{content:'▸'/.test(css200) && /\.ex-notes\[open\] summary::before\{transform:rotate\(90deg\)/.test(css200));
    check('200 原生 details 语义与按动作记忆展开态不变', /details class="ex-notes" data-notes=/.test(script) && /openNotes\[day \+ ':' \+ d\.dataset\.notes\]/.test(script));
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  __finished = true;
  process.exit(fail ? 1 : 0);
})();