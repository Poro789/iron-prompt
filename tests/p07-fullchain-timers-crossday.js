// Iron Log 逻辑测试 · 第 7 段（共 13 段）：§78–§94 全链路回归网 / 刷新后接续 / 动作个人备注 / 种子补齐 / 全角转半角 / A-B 循环 / condDraft 泄漏 / 跳过动作 / 秒表归属 / 导入切视图 / 手编草稿 / sessions 形状 / 孤儿休息 / 放弃记录 / 跨日显示与误碰
// 本段由一次性脚本从 test-ironlog.js 机械拆出：断言与夹具逐字未改，只加了下面的壳。
// 跑法：npm test（= node tests/run.js）。各段共用同一个 app 实例、状态连续流动，必须按序跑，不能单独跑某一段。
const H = require('./harness.js');

module.exports = async function () {
const { fs, path, T, check, html, script, PT, makeClassList, makeEl, clickExList, btnOf, clickEl, doneBtn, navBtn, doneBtnFromDOM, htmlTouchedHTML, textOf, runTimers, advanceClock, touchedIds, missingIds, elsById, handlers, docHandlers, windowHandlers, timers, historyStub } = H;
const __dirname = H.ROOT;
const { items, mk, tset, prSet } = H.C;   // 上段产生的共享变量
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
};
