// Iron Log 逻辑测试 · 第 4 段（共 13 段）：§30–§40 「上次」一行 / 改一下 / 删除整次记录 / 导入 diff 与反悔 / 休息归属 / PR 判定 / 秒表丢失 / migrate 补默认 / 组进度条 / 趋势只算正式组 / 历史详情 / 设置页
// 本段由一次性脚本从 test-ironlog.js 机械拆出：断言与夹具逐字未改，只加了下面的壳。
// 跑法：npm test（= node tests/run.js）。各段共用同一个 app 实例、状态连续流动，必须按序跑，不能单独跑某一段。
const H = require('./harness.js');

module.exports = async function () {
const { fs, path, T, check, html, script, PT, makeClassList, makeEl, clickExList, btnOf, clickEl, doneBtn, navBtn, doneBtnFromDOM, htmlTouchedHTML, textOf, runTimers, advanceClock, touchedIds, missingIds, elsById, handlers, docHandlers, windowHandlers, timers, historyStub } = H;
const __dirname = H.ROOT;
const { planText, goblet, items, p } = H.C;   // 上段产生的共享变量
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

};
