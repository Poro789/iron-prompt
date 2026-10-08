// Iron Log 逻辑测试 · 第 5 段（共 13 段）：§41–§59 lastValues 取最好组 / 已确认组改数后 PR 重算 / 音频解锁 / aria-label / 卡片重画 / 趋势单位 / 小结破 PR / 文案诚实 / ≥16px / 两段式回复导入 / 单侧标注 / 段落名 / prompt 说明 / lb→kg / 平均休息
// 本段由一次性脚本从 test-ironlog.js 机械拆出：断言与夹具逐字未改，只加了下面的壳。
// 跑法：npm test（= node tests/run.js）。各段共用同一个 app 实例、状态连续流动，必须按序跑，不能单独跑某一段。
const H = require('./harness.js');

module.exports = async function () {
const { fs, path, T, check, html, script, PT, makeClassList, makeEl, clickExList, btnOf, clickEl, doneBtn, navBtn, doneBtnFromDOM, htmlTouchedHTML, textOf, runTimers, advanceClock, touchedIds, missingIds, elsById, handlers, docHandlers, windowHandlers, timers, historyStub } = H;
const __dirname = H.ROOT;
const { items, prompt } = H.C;   // 上段产生的共享变量
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

H.C.mk = mk;   // 原单文件同处一个闭包，后面的段会复用这个值
H.C.tset = tset;   // 原单文件同处一个闭包，后面的段会复用这个值
H.C.prSet = prSet;   // 原单文件同处一个闭包，后面的段会复用这个值
};
