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
function makeClassList(){
  const s = new Set();
  return { toggle(c){ s.has(c) ? s.delete(c) : s.add(c); }, add(c){ s.add(c); }, remove(c){ s.delete(c); }, contains(c){ return s.has(c); } };
}
function makeEl(id){
  return {
    id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{},
    classList: makeClassList(),
    attrs: {}, setAttribute(k, v){ this.attrs[k] = v; },
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
  doImport, undoImport, planDiffText, parsePlanInput, planSessionConflict,
  startSessionIfNeeded, endSession, switchDay, switchView, targetLabel,
  reeditSession, closeSummary, showSummary, discardSession, get lastEnded(){ return lastEnded; },
  buildExport, buildTrends, topSet, doExport, doExportData, buildPrompt, cycleCondition,
  sessionVolume, sessionAvgRest, itemsVolume,
  buildBackup, parseBackup, restoreBackupText,
  buildTrendCharts, trendKind, programOrder,
  startTimer, stopTimer, clearTimer, timerElapsedSec, get timerFor(){ return timerFor; },
  esc, APP_VERSION, TREND_WINDOW, toast, render, saveSoon, flushSave,
  get openNotes(){ return openNotes; },
  startRestTimer, tickRest, finishRest, skipRest, resetRest, askConfirm, answerConfirm,
  toggleDrawer, closeDrawer,
  cycleDone, setDoneState, nextPos, prevPos, get curPos(){ return curPos; },
  set curPos(v){ curPos = v; },
  localDateStr, trimSet, migrate, bindDrafts, clampPos,
  beep, unlockAudio, refreshPR,
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
  check('README 结构清单与实际文件一致', ['index.html','css/style.css','js/app.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','apple-touch-icon.png','sw.js','fixtures/plan-A.json']
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
  check('动作库也换回来了', !T.state.exercises.new_ex33);
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
  T.undoImport();           // 没有快照时只提示；先制造一次带快照的导入
  check('没有快照时撤销不动数据', T.state.lastImport === null);
  const snapPlan = JSON.parse(planText);
  snapPlan.exercises.marker36 = { name: '标记动作', mode: 'weight' };
  T.importPlan(JSON.stringify(snapPlan));   // 这次会留快照
  check('导入前秒表又被清空', T.timerFor === null);
  T.undoImport();
  check('撤销后计划换回原样且无秒表残留',
    !T.state.program.A.some(i => i.exerciseId === 'marker36') && T.timerFor === null);
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

  console.log('== 38. 组点：未确认的组保持中性，不再全红（二态遗留，v0.9.14）==');
  T.importPlan(planText);   // 37 节把状态换成了空计划的极简备份，先恢复真实计划
  Object.keys(T.draft).forEach(k => delete T.draft[k]);
  T.resetRest(); T.clearTimer();
  T.switchView('today'); T.switchDay('A');
  const h38a = T.fullScreenHTML('A');
  check('未开始的卡片上没有红点', !/fs-dot[^"]* no/.test(h38a));
  check('当前组仍有 cur 标记', /fs-dot cur|cur[^"]*"/.test(h38a));
  T.cycleDone('A', 0, 0);
  const h38b = T.fullScreenHTML('A');
  check('确认过的组出现 ok 绿点', (h38b.match(/fs-dot[^"]*\bok\b/g) || []).length === 1);
  check('其余组仍为中性', !/fs-dot[^"]* no/.test(h38b));
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
  check('步进提示不写死 kg 单位', String(elsById.get('toast').textContent) === '重量步进：2.5');
  check('设置页标签不再声称步进是 kg', !html.includes('重量步进（kg）'));
  T.state.logs.pop(); delete T.state.exercises.test_hint;

  console.log('== 50. 卡片不渲染源码注释（v0.9.27）==');
  T.switchView('today'); T.render();
  const card50 = String(htmlTouchedHTML('ex-list'));
  check('卡片里有正常的组点结构', card50.includes('fs-dots'));
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
  fire47('62.49');
  check('超精度：写回纠正后的值', s47().weight === 62.5 && String(inp47.value) === '62.5');
  fire47('-3');
  check('负数：纠正为 0 并写回', s47().weight === 0 && String(inp47.value) === '0');
  fire47('70');
  check('正常输入不被多改', s47().weight === 70 && String(inp47.value) === '70');
  inp47.dataset.f = 'reps';
  fire47('x2');
  check('次数字段同样清空乱字符', s47().reps === null && inp47.value === '');
  delete T.state.exercises.test47; delete T.state.drafts.A; delete T.state.sessions.A;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();