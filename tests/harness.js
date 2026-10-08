// Iron Log 逻辑测试：用 DOM 桩在 node 中执行 js/app.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
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
const PT = { value: null };   // 跨段共享：测试段用 H.PT.value = … 注入         // 增量渲染测试注入的 .sets 容器：{ matches, node }
global.document = {
  visibilityState: 'visible',
  addEventListener(type, fn){ docHandlers.set(type, fn); },
  createElement(){ const e = makeEl('tmp'); e.children = [makeEl('a'), makeEl('b')]; return e; },
  querySelector(sel){ return PT.value && PT.value.matches(sel) ? PT.value.node : null; },
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
  // §143/§206：点击动作表。页面里的按钮只写 data-action="名字"，测试要能核对名字是否真在表里。
  get ACTIONS(){ return ACTIONS; },
  // §131/§207：训练卡片按钮的 act 表（exClick 的三层派发）。测试要能核对
  // 「页面发射的 act」与「表里接住的 act」互相覆盖，且三层之间没有重名（重名=前一层永远挡住后一层）。
  get EX_NAV_ACTS(){ return EX_NAV_ACTS; },
  get EX_ITEM_ACTS(){ return EX_ITEM_ACTS; },
  get EX_SET_ACTS(){ return EX_SET_ACTS; },
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

// ---- 以下是拆分为 tests/pXX-*.js 后新增的导出（原骨架部分逐字未改） ----
// C：跨段共享变量。原单文件里所有小节同处一个闭包，个别变量确实被后面的小节复用；
// 拆开后用 C 显式承接，求值时机与原来一致（在声明它的那一段里写入）。
const C = {};
module.exports = {
  fs, path, ROOT, C, PT, html, script, check,
  get T(){ return globalThis.__T; },
  get pass(){ return pass; }, get fail(){ return fail; },
  finish(){ console.log(`\n${pass} passed, ${fail} failed`); __finished = true; process.exit(fail ? 1 : 0); },
  makeClassList, makeEl, clickExList, btnOf, clickEl, doneBtn, navBtn, doneBtnFromDOM,
  htmlTouchedHTML, textOf, runTimers, advanceClock,
  touchedIds, missingIds, elsById, handlers, docHandlers, windowHandlers, timers, historyStub, DELEGATED,
};
