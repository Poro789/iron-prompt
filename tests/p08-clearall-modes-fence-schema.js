// Iron Log 逻辑测试 · 第 8 段（共 13 段）：§95–§112 清除全部不被复活 / 历史分区名 / 模式残留 / 目标标签 / 后台不补响 / 组数封顶 / 提示不吞撤销 / 围栏容错 / 导出→导入闭环 / PLAN_SCHEMA / 休息条归属 / sets 非数组 / 撤销守卫 / Enter 推进 / 清除前留备份 / 设置封顶 / trends 换算 / sessionKind
// 本段由一次性脚本从 test-ironlog.js 机械拆出：断言与夹具逐字未改，只加了下面的壳。
// 跑法：npm test（= node tests/run.js）。各段共用同一个 app 实例、状态连续流动，必须按序跑，不能单独跑某一段。
const H = require('./harness.js');

module.exports = async function () {
const { fs, path, T, check, html, script, PT, makeClassList, makeEl, clickExList, btnOf, clickEl, doneBtn, navBtn, doneBtnFromDOM, htmlTouchedHTML, textOf, runTimers, advanceClock, touchedIds, missingIds, elsById, handlers, docHandlers, windowHandlers, timers, historyStub } = H;
const __dirname = H.ROOT;
const { items, prompt, p } = H.C;   // 上段产生的共享变量
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
  check('96 正常视图：标题无编号前缀 + 热身段（v0.9.140 去号）', !/fs-num/.test(h96n) && /fs-section">热身段/.test(h96n));
  T.state.logs = [{ date: '2026-01-01', day: 'A', startedAt: 777, condition: null,
    exercises: [{ exerciseId: 'e96b', sets: [{ type: 'work', weight: 50, reps: 8, duration: null, rpe: null, side: null, done: true }] }] }];
  T.switchView('history'); T.render();
  clickEl('hist-list', btnOf({ act: 'reeditlog', ts: '777', i: '0' }));
  T.switchView('today'); T.curPos = 0; T.render();
  const h96 = htmlTouchedHTML('ex-list');
  check('96 再编辑卡片标题无编号（编号已去掉，分区仍按计划）', !/fs-num/.test(h96));
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
   * 用 PT.value 桩 document.querySelector：处理器按分支只查一种选择器，逐条断言。
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
  PT.value = { matches: sel => sel.includes('data-f="reps"'), node: rInp108 };
  key108(wInp108);
  const it108 = T.state.drafts.A && T.state.drafts.A[0];
  check('108 重量框 Enter：先提交 50', !!it108 && it108.sets[0].weight === 50);
  check('108 重量框 Enter：聚焦次数框而不是完成', rInp108.focused === true && it108.sets[0].done !== true);
  let doneClicked108 = false;
  PT.value = { matches: sel => sel.includes('fs-done'), node: { click(){ doneClicked108 = true; } } };
  const rInp2 = mkInp108('reps'); rInp2.value = '8';
  key108(rInp2);
  check('108 次数框 Enter：提交 8 并点完成',
    T.state.drafts.A[0].sets[0].reps === 8 && doneClicked108 === true);
  // 非 Enter 键与非输入框都不动作
  doneClicked108 = false;
  handlers.get('ex-list|keydown')({ key: 'a', target: mkInp108('reps'), preventDefault(){} });
  handlers.get('ex-list|keydown')({ key: 'Enter', target: { closest: () => null }, preventDefault(){} });
  check('108 其他按键/非训练输入框不触发', doneClicked108 === false);
  PT.value = null;
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
};
