// Iron Log 逻辑测试 · 第 10 段（共 13 段）：§127–§154 文本截断 / 保存失败提示 / 长词折行 / 客套话包裹 / data-act 集合 / .bak 救援 / maxlength 成对 / 0.25 档 / ESC 关抽屉 / role=status / clearAll 清 .bak / uselast 无历史
// 本段由一次性脚本从 test-ironlog.js 机械拆出：断言与夹具逐字未改，只加了下面的壳。
// 跑法：npm test（= node tests/run.js）。各段共用同一个 app 实例、状态连续流动，必须按序跑，不能单独跑某一段。
const H = require('./harness.js');

module.exports = async function () {
const { fs, path, T, check, html, script, PT, makeClassList, makeEl, clickExList, btnOf, clickEl, doneBtn, navBtn, doneBtnFromDOM, htmlTouchedHTML, textOf, runTimers, advanceClock, touchedIds, missingIds, elsById, handlers, docHandlers, windowHandlers, timers, historyStub } = H;
const __dirname = H.ROOT;
const { sw, p, card, mk, tset } = H.C;   // 上段产生的共享变量
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

  // §143：页面上所有可点动作都写进 app.js 的 ACTIONS 表，HTML 与渲染里只留 data-action="名字"。
  // §131 只覆盖 data-act 委托。v0.9.144 之前这里是内联 onclick="fn()"：改名会静默失效（点了没反应），
  // 那时只能静态扫名字是否存在。换成表以后 tsc 已经接住改名与参数，这里补剩下的两半：
  // 页面上出现的每个名字都在表里（否则点了无反应），表里没有用不到的条目（否则"删了功能忘了删名"看不出来）。
  {
    const names143 = new Set();
    const re143 = /data-action="([a-zA-Z][\w]*)"/g;
    let m143;
    while((m143 = re143.exec(html))) names143.add(m143[1]);
    // 应用自己拼出来的按钮（组间休息的「跳过」、状态切换）同样走这张表
    while((m143 = re143.exec(script))) names143.add(m143[1]);
    check('143 页面动作扫描到足够多', names143.size >= 15);
    check('143 index.html 不再有内联 on* 处理器', !/ on[a-z]+="/.test(html));
    const table143 = T.ACTIONS;
    check('143 ACTIONS 表已导出到测试桥', !!table143);
    for(const n of names143) check(`143 ${n} 已登记在 ACTIONS 表里`, typeof table143[n] === 'function');
    for(const n of Object.keys(table143)) check(`143 表里的 ${n} 在页面上确有按钮`, names143.has(n));
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

};
