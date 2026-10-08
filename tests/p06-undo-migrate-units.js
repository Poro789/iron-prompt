// Iron Log 逻辑测试 · 第 6 段（共 13 段）：§60–§77 6 秒撤销 / 删未确认组 / 旧记录改一下 / 进度头部口径 / 日期用时 / 写回输入框 / 有序插回 / migrate 坏条目 / 趋势同指标 / NaN 兜底 / 字符串 profile / 休息说明 / 0.05 精度 / 沿用上次重算
// 本段由一次性脚本从 test-ironlog.js 机械拆出：断言与夹具逐字未改，只加了下面的壳。
// 跑法：npm test（= node tests/run.js）。各段共用同一个 app 实例、状态连续流动，必须按序跑，不能单独跑某一段。
const H = require('./harness.js');

module.exports = async function () {
const { fs, path, T, check, html, script, PT, makeClassList, makeEl, clickExList, btnOf, clickEl, doneBtn, navBtn, doneBtnFromDOM, htmlTouchedHTML, textOf, runTimers, advanceClock, touchedIds, missingIds, elsById, handlers, docHandlers, windowHandlers, timers, historyStub } = H;
const __dirname = H.ROOT;
const { items, prompt, mk, tset, prSet } = H.C;   // 上段产生的共享变量
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

};
