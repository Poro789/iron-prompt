// Iron Log 逻辑测试 · 第 9 段（共 13 段）：§113–§126 SEED 热身一致性 / 溢出置 null / weightStep 档位与文本封顶 / 非法日历与 schema / 键盘纪律 / 复制回退 / 撤销导入保留备注 / 趋势方向同类型 / 导入上限与草稿对齐 / 动作文本封顶 / prompt 上限说明 / __proto__ / 自有属性 / 多余日
// 本段由一次性脚本从 test-ironlog.js 机械拆出：断言与夹具逐字未改，只加了下面的壳。
// 跑法：npm test（= node tests/run.js）。各段共用同一个 app 实例、状态连续流动，必须按序跑，不能单独跑某一段。
const H = require('./harness.js');

module.exports = async function () {
const { fs, path, T, check, html, script, PT, makeClassList, makeEl, clickExList, btnOf, clickEl, doneBtn, navBtn, doneBtnFromDOM, htmlTouchedHTML, textOf, runTimers, advanceClock, touchedIds, missingIds, elsById, handlers, docHandlers, windowHandlers, timers, historyStub } = H;
const __dirname = H.ROOT;
const { items, prompt, tset } = H.C;   // 上段产生的共享变量
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
};
