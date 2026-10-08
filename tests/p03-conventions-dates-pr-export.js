// Iron Log 逻辑测试 · 第 3 段（共 13 段）：§18–§29 工程约定 / 确认弹层 / 日志日期 / 浏览位置 / PR 落盘 / 导出瘦身 / ± 步进 / 全量备份 / 趋势可读性 / 前台纠正 / 秒表
// 本段由一次性脚本从 test-ironlog.js 机械拆出：断言与夹具逐字未改，只加了下面的壳。
// 跑法：npm test（= node tests/run.js）。各段共用同一个 app 实例、状态连续流动，必须按序跑，不能单独跑某一段。
const H = require('./harness.js');

module.exports = async function () {
const { fs, path, T, check, html, script, PT, makeClassList, makeEl, clickExList, btnOf, clickEl, doneBtn, navBtn, doneBtnFromDOM, htmlTouchedHTML, textOf, runTimers, advanceClock, touchedIds, missingIds, elsById, handlers, docHandlers, windowHandlers, timers, historyStub } = H;
const __dirname = H.ROOT;
const { plank, items, prompt, manifest, sw } = H.C;   // 上段产生的共享变量
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

H.C.p = p;   // 原单文件同处一个闭包，后面的段会复用这个值
H.C.card = card;   // 原单文件同处一个闭包，后面的段会复用这个值
};
