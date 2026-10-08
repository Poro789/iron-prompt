// Iron Log 逻辑测试 · 第 12 段（共 13 段）：§173–§190 空日志导出 / inert / 焦点进对话框 / 点外关闭 / RPE 步进 / 数字键盘 Enter / 导入文案如实 / 连续两次确认焦点链 / 抽屉滚动不带动背景 / 步进下限 / 控件名字 / 后台落盘 / 兜底监听 / Android 返回键 / id 唯一 / 类名有定义 / 抽屉焦点 / 畸形存档到达不动点
// 本段由一次性脚本从 test-ironlog.js 机械拆出：断言与夹具逐字未改，只加了下面的壳。
// 跑法：npm test（= node tests/run.js）。各段共用同一个 app 实例、状态连续流动，必须按序跑，不能单独跑某一段。
const H = require('./harness.js');

module.exports = async function () {
const { fs, path, T, check, html, script, PT, makeClassList, makeEl, clickExList, btnOf, clickEl, doneBtn, navBtn, doneBtnFromDOM, htmlTouchedHTML, textOf, runTimers, advanceClock, touchedIds, missingIds, elsById, handlers, docHandlers, windowHandlers, timers, historyStub } = H;
const __dirname = H.ROOT;
const { card } = H.C;   // 上段产生的共享变量
  console.log('== 173. 空日志时导出提示如实说「暂无训练日志」（测试加固，无应用改动）==');
  // runExport js/app.js:2237-2239：recentLogs 为空时不得虚报「最近 N 次日志」。此前从未钉过。
  // 剪贴板桩自带并成对还原（§161 教训），先置 copied=null。
  {
    const saveLogs173 = T.state.logs;
    const saveProg173 = T.state.program, saveEx173 = T.state.exercises;
    T.state.program = { A: [{ section: '', exerciseId: 'e173', sets: [{ type: 'work', weight: 10, reps: 8, duration: null, rpe: null, rpeLabel: '', side: null }] }], B: [] };
    T.state.exercises = { e173: { name: '导出动作173', mode: 'weight', unit: 'kg' } };
    const nav173prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { clipboard: { writeText: async t => { globalThis.copied = t; } } } });
    globalThis.copied = null;
    T.state.logs = [];
    document.getElementById('export-n').value = '4';
    await T.runExport(false);
    const msg173 = String(document.getElementById('export-msg').textContent);
    check('173 空日志提示「暂无训练日志」而不是虚报条数', msg173.includes('暂无训练日志') && !/最近 \d+ 次/.test(msg173));
    const data173 = JSON.parse(globalThis.copied);
    check('173 导出文本仍含当前计划与动作库', data173.program.A.length === 1 && data173.exercises.e173.name === '导出动作173');
    check('173 空的 B 日不写进导出（粘回导入时不会被自己的空日拒掉）', !('B' in data173.program));
    T.state.logs = saveLogs173; T.state.program = saveProg173; T.state.exercises = saveEx173;
    if(nav173prev) Object.defineProperty(globalThis, 'navigator', nav173prev); else delete globalThis.navigator;
  }
  console.log('== 174. 抽屉打开时 main 进 inert，汉堡保持可用（v0.9.124）==');
  {
    const drawer174 = document.getElementById('drawer');
    const main174 = makeEl('main174'), header174 = makeEl('header174');
    let sel174 = null;
    PT.value = { matches(sel){ sel174 = sel; return sel === 'main' || sel === 'header'; }, get node(){ return sel174 === 'main' ? main174 : header174; } };
    T.toggleDrawer();
    check('174 抽屉打开：main 进 inert，抽屉自身不进', main174.attrs.inert === '' && drawer174.attrs.inert === undefined);
    check('174 header（汉堡）不进 inert——还能点它关抽屉', header174.attrs.inert === undefined);
    T.askConfirm('确认吗？'); // 确认框压在抽屉上：背景全部 inert
    check('174 确认框压在抽屉上：main 与抽屉都 inert', drawer174.attrs.inert === '' && main174.attrs.inert === '');
    const esc174 = docHandlers.get('keydown');
    esc174({ key: 'Escape' }); // 关确认，抽屉还开着
    check('174 ESC 关确认后抽屉仍开：main 保持 inert、抽屉可交互', main174.attrs.inert === '' && drawer174.attrs.inert === undefined);
    esc174({ key: 'Escape' }); // 再按关抽屉
    check('174 ESC 关抽屉：全部解除', main174.attrs.inert === undefined && drawer174.attrs.inert === undefined && header174.attrs.inert === undefined);
    PT.value = null;
  }
  console.log('== 175. 模态打开焦点进对话框，关闭归还触发者（v0.9.125）==');
  {
    const opener175 = makeEl('opener175');
    opener175.focus = function(){ this.focused = (this.focused || 0) + 1; };
    const ok175 = document.getElementById('confirm-ok-btn');
    let okFocus175 = 0; ok175.focus = () => { okFocus175++; };
    const prevActive175 = document.activeElement;
    document.activeElement = opener175;
    T.askConfirm('删掉它？');
    check('175 确认框打开：焦点移到确定按钮', okFocus175 === 1);
    T.answerConfirm(true);
    check('175 确认框关闭：焦点归还触发者', opener175.focused === 1);
    const sc175 = document.getElementById('summary-close');
    let scFocus175 = 0; sc175.focus = () => { scFocus175++; };
    document.activeElement = opener175; opener175.focused = 0;
    T.showSummary({ day: 'A', exercises: [], durationSec: 60, condition: null });
    check('175 小结打开：焦点移到「好的」按钮', scFocus175 === 1);
    T.closeSummary();
    check('175 小结关闭：焦点归还触发者', opener175.focused === 1);
    document.activeElement = prevActive175;
  }
  console.log('== 176. 点抽屉外任意处即关抽屉（v0.9.126）==');
  {
    const drawer176 = document.getElementById('drawer');
    T.toggleDrawer();
    check('176 前置：抽屉已开', drawer176.classList.contains('open'));
    const clickH176 = docHandlers.get('click');
    check('176 文档级 click 监听已注册', typeof clickH176 === 'function');
    // 点抽屉外的空白（main inert 后点击穿透到 body）→ 关抽屉
    clickH176({ target: { closest: () => null } });
    check('176 点抽屉外：关闭', !drawer176.classList.contains('open'));
    T.toggleDrawer();
    // 点抽屉内部（菜单项在 .drawer 里）→ 不误关，由各自的 onclick 处理
    clickH176({ target: { closest: sel => sel === '.drawer' ? {} : null } });
    check('176 点抽屉内部：不误关', drawer176.classList.contains('open'));
    // 点 header（汉堡）→ toggleDrawer 自己处理，这里不重复处理
    clickH176({ target: { closest: sel => sel === 'header' ? {} : null } });
    check('176 点 header：不重复处理', drawer176.classList.contains('open'));
    T.closeDrawer();
    clickH176({ target: { closest: () => null } });
    check('176 抽屉未开时点击无操作', !drawer176.classList.contains('open'));
  }
  console.log('== 177. RPE 步进器：从计划目标起步，钳位 1–10（测试加固，无应用改动）==');
  // js/app.js:1105-1107：base = set.rpe ?? set.targetRpe ?? (inc?7.5:8.5)；inc 钳 10、dec 钳 1。
  // 下限 1 是拉伸/呼吸（目标 RPE 2–4）能记真实强度的关键，此前从未钉过。
  {
    const saveProg177 = T.state.program, saveEx177 = T.state.exercises, saveDay177 = T.state.settings.lastDay;
    T.state.settings.lastDay = 'A';
    T.state.logs = [];
    T.state.program = { A: [{ section: '', exerciseId: 'e177', sets: [{ type: 'work', weight: 10, reps: 8, duration: null, rpe: 6, rpeLabel: '', side: null }] }], B: [] };
    T.state.exercises = Object.assign({}, T.state.exercises, { e177: { name: 'RPE 动作177', mode: 'weight', unit: 'kg' } });
    const bR177 = act => clickExList(btnOf({ act, f: 'rpe', ex: '0', set: '0' }));
    bR177('dec');
    check('177 没记过 RPE 时从计划里的 targetRpe 起步（6 → 5.5）', T.getItems('A')[0].sets[0].rpe === 5.5);
    for(let i = 0; i < 20; i++) bR177('dec');
    check('177 下限钳在 1：拉伸/呼吸这类低强度也能记', T.getItems('A')[0].sets[0].rpe === 1);
    for(let i = 0; i < 30; i++) bR177('inc');
    check('177 上限钳在 10', T.getItems('A')[0].sets[0].rpe === 10);
    T.state.program = saveProg177; T.state.exercises = saveEx177; T.state.settings.lastDay = saveDay177;
    delete T.state.exercises.e177;
  }
  console.log('== 178. 数字键盘 Enter 提示与回车推进流一致（v0.9.127）==');
  // 回车推进流 js/app.js:1166-1181：重量框 Enter→次数框，次数/时长框 Enter→完成这一组。
  // 键盘上的键名必须与这个行为一致：重量 enterkeyhint="next"，次数/时长 enterkeyhint="done"。
  {
    check('178 重量框：inputmode=decimal 且 enterkeyhint=next', script.includes('inputmode="decimal" enterkeyhint="next"'));
    check('178 次数/时长框共 3 处 enterkeyhint=done（Enter=完成这一组）', (script.match(/enterkeyhint="done"/g) || []).length === 3);
    check('178 不引入其它 enterkeyhint 值', (script.match(/enterkeyhint="([a-z]+)"/g) || []).every(s => s === 'enterkeyhint="next"' || s === 'enterkeyhint="done"'));
    check('178 每个动态输入仍带 inputmode', (script.match(/class="fs-input"[^>]*inputmode=/g) || []).length === 4);
  }
  console.log('== 179. 导入确认文案如实说明个人备注的合并规则（v0.9.128）==');
  // applyPlan js/app.js:1901 是「非空优先」：计划带了 personal 会替换本地（§122 钉过 500 封顶路径）；
  // 但确认框曾写「个人注意不会被覆盖」——与行为相反，用户点确认时会被误导。
  {
    const saveEx179 = T.state.exercises, saveProg179 = T.state.program, saveSess179 = T.state.sessions;
    T.state.exercises = { e179: { name: '动作179', mode: 'weight', unit: 'kg', personal: '用户备注' } };
    T.state.program = { A: [], B: [] };
    T.state.sessions = { A: null, B: null };
    const plan179 = {
      exercises: { e179: { name: '动作179', mode: 'weight', unit: 'kg', personal: '计划里的新备注' } },
      program: { A: [{ exerciseId: 'e179', sets: [{ reps: 8, weight: 10 }] }] }
    };
    const diff179 = T.planDiffText({ program: plan179.program, exercises: plan179.exercises });
    check('179 确认文案说明「写了会替换、留空保留本地」，不再虚假承诺不覆盖', diff179.includes('写了会替换') && diff179.includes('留空则保留本地') && !diff179.includes('不会被覆盖'));
    const r179 = T.importPlan(JSON.stringify(plan179));
    check('179 行为与文案一致：计划 personal 非空时替换本地', r179.ok && T.state.exercises.e179.personal === '计划里的新备注');
    T.state.exercises.e179.personal = '本地备注';
    const r179b = T.importPlan(JSON.stringify({ exercises: { e179: { name: '动作179', mode: 'weight', unit: 'kg' } }, program: { A: [{ exerciseId: 'e179', sets: [{ reps: 8, weight: 10 }] }] } }));
    check('179 计划不带 personal 时保留本地值', r179b.ok && T.state.exercises.e179.personal === '本地备注');
    T.state.exercises = saveEx179; T.state.program = saveProg179; T.state.sessions = saveSess179;
    delete T.state.exercises.e179;
  }
  console.log('== 180. 连续两次确认（clearAll 模式）焦点链不断（v0.9.125 回归）==');
  // clearAll js/app.js:2448-2456 是两次「打开→关闭」的 askConfirm：第二次的焦点来源
  // 必须是第一次归还后的原触发者，modalOpener 不能断链。
  {
    const opener180 = makeEl('opener180');
    opener180.focus = function(){ this.focused = (this.focused || 0) + 1; };
    const ok180 = document.getElementById('confirm-ok-btn');
    let n180 = 0; ok180.focus = () => { n180++; };
    const prev180 = document.activeElement;
    document.activeElement = opener180;
    const p1 = T.askConfirm('第一步');
    T.answerConfirm(true); await p1;
    check('180 第一次确认关闭：焦点归还触发者', opener180.focused === 1);
    document.activeElement = opener180; // 真实浏览器里焦点就在归还后的按钮上
    const p2 = T.askConfirm('再次确认');
    check('180 第二次确认打开：焦点进确定按钮', n180 === 2);
    T.answerConfirm(true); await p2;
    check('180 第二次确认关闭：焦点仍归还最初的触发者，链不断', opener180.focused === 2);
    document.activeElement = prev180;
  }
  console.log('== 181. 抽屉滚动不带动背景；遮罩点击关闭的真实机制（v0.9.129）==');
  {
    const css181 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const drawer181 = (css181.match(/\.drawer\{([^}]*)\}/) || ['', ''])[1];
    check('181 .drawer 滚动到尽头不带动背景页面', /overscroll-behavior:contain/.test(drawer181));
    // 抽屉遮罩的关闭机制是 index.html 的内联 onclick——不是文档级监听（v0.9.126 只是兜底）。
    check('181 遮罩存在且点击即 closeDrawer', /class="drawer-overlay"[^>]*onclick="closeDrawer\(\)"/.test(html));
    check('181 遮罩默认不接收点击（关闭状态不挡页面）', /\.drawer-overlay\{[^}]*pointer-events:none/.test(css181) && /\.drawer-overlay\.show\{[^}]*pointer-events:auto/.test(css181));
  }
  console.log('== 182. ± 步进下限：时长钳 0、次数钳 1（测试加固，无应用改动）==');
  // js/app.js:1044-1048：时长 ±5 秒、次数 ±1，下限分别是 0 和 1，上限与手输同规矩 1e6。
  // 时长为负会让小结与趋势的合计出错；次数 0 组没有训练意义（手输 0 是另一条已钉路径）。
  {
    const saveProg182 = T.state.program, saveEx182 = T.state.exercises, saveDay182 = T.state.settings.lastDay;
    T.state.settings.lastDay = 'A';
    T.state.logs = []; delete T.state.drafts.A;
    T.state.program = { A: [
      { section: '', exerciseId: 'e182t', sets: [{ type: 'work', weight: null, reps: null, duration: 0, rpe: null, rpeLabel: '', side: null }] },
      { section: '', exerciseId: 'e182b', sets: [{ type: 'work', weight: null, reps: 1, duration: null, rpe: null, rpeLabel: '', side: null }] }
    ], B: [] };
    T.state.exercises = Object.assign({}, T.state.exercises, {
      e182t: { name: '平板支撑182', mode: 'time', unit: null },
      e182b: { name: '俯卧撑182', mode: 'bodyweight', unit: null }
    });
    const it182a = T.getItems('A')[0];
    clickExList(btnOf({ act: 'step', ex: '0', set: '0', f: 'duration', dir: '-1' }));
    check('182 时长下限钳在 0（不会变负数把合计和显示搞坏）', it182a.sets[0].duration === 0);
    clickExList(btnOf({ act: 'step', ex: '0', set: '0', f: 'duration', dir: '1' }));
    check('182 时长步进 +5 秒', it182a.sets[0].duration === 5);
    const it182b = T.getItems('A')[1];
    clickExList(btnOf({ act: 'step', ex: '1', set: '0', f: 'reps', dir: '-1' }));
    check('182 次数下限钳在 1', it182b.sets[0].reps === 1);
    T.state.program = saveProg182; T.state.exercises = saveEx182; T.state.settings.lastDay = saveDay182;
    delete T.state.exercises.e182t; delete T.state.exercises.e182b;
  }
  console.log('== 183. 输入控件都有可读名字（v0.9.130）==');
  // 读屏软件念不出没有可访问名的输入框：placeholder 不是规范意义上的名字，卡片标题也不会自动关联。
  // 通用扫描 index.html 每一个可见的 input/textarea：要么有 label for= 指向它，要么自带 aria-label。
  // 隐藏的文件选择器（restore-file）由按钮触发，不参与读屏遍历，跳过。
  {
    const html183 = fs.readFileSync('index.html', 'utf8');
    const named183 = new Set([...html183.matchAll(/<label[^>]*for="([^"]+)"/g)].map(m => m[1]));
    const unnamed183 = [];
    for(const m of html183.matchAll(/<(input|textarea)\b[^>]*>/g)){
      const tag = m[0];
      if(/type="hidden"|type="file"| hidden>/.test(tag)) continue;
      const idm = tag.match(/id="([^"]+)"/);
      const hasName = /aria-label=/.test(tag) || (idm && named183.has(idm[1]));
      if(!hasName) unnamed183.push(idm ? idm[1] : tag.slice(1, 40));
    }
    check('183 index.html 每个可见输入控件都有 label 或 aria-label' + (unnamed183.length ? '（缺：' + unnamed183.join(', ') + '）' : ''), unnamed183.length === 0);
    check('183 全屏卡片生成的动作备注输入也有 aria-label', /class="fs-exnote"[^>]*aria-label=/.test(script));
  }
  console.log('== 184. 切后台/关页面都会强制落盘（测试加固，无应用改动）==');
  // js/app.js:336-340：visibilitychange 的 hidden 分支和 pagehide 都调 flushSave。
  // iOS 上 pagehide 常常不触发，hidden 分支才是移动端不丢数据的主路径；此前只钉了 visible 分支（§27），
  // pagehide 注册被 window 桩吞掉——删掉任何一条都不会有测试红。
  {
    const onPagehide = windowHandlers.get('pagehide');
    check('184 注册了 window pagehide 处理', typeof onPagehide === 'function');
    const onVis184 = docHandlers.get('visibilitychange');
    const saveClear184 = T.clearingAll, saveStep184 = T.state.settings.weightStep, saveVis184 = global.document.visibilityState;
    T.clearingAll = false;   // §95 之后清除守卫为 true，save 是空转；这里要的是真实落盘路径
    const read184 = () => (JSON.parse(global.localStorage._d['ironlog.v1'] || '{}').settings || {}).weightStep;
    T.state.settings.weightStep = 7;
    T.saveSoon();
    check('184 防抖未到期时不落盘', read184() !== 7);
    global.document.visibilityState = 'hidden';
    onVis184();
    check('184 切到后台立即强制落盘（iOS 上这是主要路径）', read184() === 7);
    T.state.settings.weightStep = 8;
    T.saveSoon();
    onPagehide();
    check('184 页面卸载（pagehide）也立即强制落盘', read184() === 8);
    global.document.visibilityState = saveVis184;
    T.state.settings.weightStep = saveStep184;
    T.clearingAll = saveClear184;
    runTimers();
  }
  console.log('== 185. 点抽屉外关闭的兜底监听（测试加固，无行为改动）==');
  // js/app.js:484-489：遮罩 .drawer-overlay 的 onclick 是主路径（§181 已钉），
  // 文档级监听是遮罩失效时的兜底——此前没有任何测试直接调用过它。
  {
    const drawerEl185 = document.getElementById('drawer');
    const onClickDoc185 = docHandlers.get('click');
    check('185 注册了文档级 click 兜底', typeof onClickDoc185 === 'function');
    drawerEl185.classList.add('open');
    onClickDoc185({ target: { closest: () => null } });   // 抽屉与 header 之外
    check('185 点抽屉外会关闭抽屉', !drawerEl185.classList.contains('open'));
    drawerEl185.classList.add('open');
    onClickDoc185({ target: { closest: sel => sel === '.drawer' ? drawerEl185 : null } });
    check('185 点抽屉内不会关闭抽屉', drawerEl185.classList.contains('open'));
    onClickDoc185({ target: null });                       // 无 closest 的异常目标也按外部处理
    check('185 异常目标按外部处理并关闭', !drawerEl185.classList.contains('open'));
    drawerEl185.classList.remove('open');
  }
  console.log('== 186. Android 返回键关闭菜单而不是退出应用（v0.9.131）==');
  // js/app.js:531-547：开抽屉压一条历史；popstate 关抽屉；主动关闭同步回退一条，避免历史栈残留。
  {
    const onPop186 = windowHandlers.get('popstate');
    check('186 注册了 popstate 处理', typeof onPop186 === 'function');
    const h186 = window.history, depth0 = h186.stack.length;
    T.toggleDrawer();                                       // 打开
    check('186 打开抽屉压入一条历史', h186.stack.length === depth0 + 1 && !!(h186.state && h186.state.ironlogDrawer === true));
    T.toggleDrawer();                                       // 汉堡键主动关闭 → 同步回退
    check('186 主动关闭不留重复历史（再按返回不会白按一次）', h186.stack.length === depth0);
    T.toggleDrawer();                                       // 再开
    h186.back();                                            // 模拟按返回键（浏览器语义：先出栈再触发 popstate）
    check('186 返回键关闭抽屉', !document.getElementById('drawer').classList.contains('open'));
    check('186 返回键后历史栈不多弹也不少弹', h186.stack.length === depth0);
    h186.back();                                            // 再按一次：抽屉已关，无副作用（真实场景=退出应用）
    const expect186 = Math.max(1, depth0 - 1);              // 栈底时 back 无操作（浏览器语义=离开页面）
    check('186 第二次返回无副作用', h186.stack.length === expect186 && !document.getElementById('drawer').classList.contains('open'));
    document.getElementById('drawer').classList.remove('open');
    h186.stack.length = depth0;                             // 还原栈深，不影响后续节
  }
  console.log('== 187. id 唯一且 $() 引用的 id 全部存在（测试加固，无应用改动）==');
  // 重复 id 会让 getElementById 拿到错误的节点（$() 全部按 id 找元素）；拼错的 id 引用只会静默失败。
  {
    const seen187 = new Map();
    for(const m of html.matchAll(/id="([^"]+)"/g)) seen187.set(m[1], (seen187.get(m[1]) || 0) + 1);
    const dup187 = [...seen187].filter(([, n]) => n > 1).map(([id]) => id);
    check('187 index.html 没有重复 id' + (dup187.length ? '（重复：' + dup187.join(', ') + '）' : ''), dup187.length === 0);
    const defined187 = new Set();
    for(const m of (html + script).matchAll(/id="([A-Za-z0-9-]+)"/g)) defined187.add(m[1]);
    const missing187 = [];
    for(const m of script.matchAll(/\$\('([^']+)'\)/g)) if(!defined187.has(m[1])) missing187.push(m[1]);
    check('187 每个 $() 引用的 id 都在页面或生成的模板里存在' + (missing187.length ? '（缺：' + missing187.join(', ') + '）' : ''), missing187.length === 0 && defined187.size >= 40);
  }
  console.log('== 188. 用到的每个类名都在 CSS 里有定义（测试加固，无应用改动）==');
  // 拼错的类名不会报错，只会静默失去样式（比如 sumary-card 少个 m，卡片直接裸奔）。
  // 静态 class="..." 与 classList 切换的类名都扫；含 ${} 模板表达式的属性跳过（那些由各自的行为测试覆盖）。
  {
    const css188 = require('fs').readFileSync('css/style.css', 'utf8');
    const tokens = new Set();
    for(const m of (html + script).matchAll(/class="([^"]*)"/g)){
      if(m[1].includes('${')) continue;   // 含模板表达式的属性跳过（那些由各自的行为测试覆盖）
      for(const t of m[1].split(/\s+/)) if(/^[a-z][a-z0-9-]*$/.test(t)) tokens.add(t);
    }
    for(const m of script.matchAll(/classList\.(?:add|remove|toggle|contains)\('([a-z][a-z0-9-]*)'/g)) tokens.add(m[1]);
    const undef188 = [...tokens].filter(t => !new RegExp('\\.' + t + '(?![-\\w])').test(css188));
    check('188 每个用到的类名都有样式定义' + (undef188.length ? '（未定义：' + undef188.join(', ') + '）' : ''), undef188.length === 0 && tokens.size >= 80);
  }
  console.log('== 189. 抽屉开关时焦点进关闭按钮、归还汉堡键（测试加固，无应用改动）==');
  // js/app.js:520/:529：键盘/读屏用户开抽屉后落在第一个可操作项，关抽屉后回到触发它的汉堡键；
  // 确认框/小结的焦点归还已钉（§175/§180），抽屉这条此前没钉。
  {
    const ham189 = document.getElementById('hamburger-btn');
    let closeFocus189 = 0, hamFocus189 = 0;
    const closeStub189 = makeEl('drawer-close');
    closeStub189.focus = () => { closeFocus189++; };
    ham189.focus = () => { hamFocus189++; };
    PT.value = { matches: sel => sel === '.drawer-close', node: closeStub189 };
    T.toggleDrawer();                                        // 开
    check('189 开抽屉后焦点进入抽屉内第一个可操作项', closeFocus189 === 1);
    T.closeDrawer();                                         // 经遮罩/ESC/菜单项关闭（汉堡键关闭时焦点本就在汉堡上，无需归还）
    check('189 关抽屉后焦点归还汉堡键', hamFocus189 === 1);
    PT.value = null;
    ham189.focus = () => {};                               // 还原桩的 no-op focus，不影响后续节
    document.getElementById('drawer').classList.remove('open');
  }
  console.log('== 190. 畸形存档读入后规范化，且再存再读到达不动点（测试加固，无应用改动）==');
  // migrate（js/app.js:150-264）是数据面的最后防线：手工编辑/截断/旧版备份都要落到同一个合法形状。
  // 此前各字段分别钉过，但没有一条「整个存档 = 固定点」的性质测试：规范化若不收敛（存一次读一次变一次），
  // 用户每次刷新都会被改数据，没有任何单测会红。load() 只返回迁移结果不改内存，正好做纯函数往返。
  {
    const key190 = 'ironlog.v1';
    const origStore190 = global.localStorage._d[key190];
    global.localStorage._d[key190] = JSON.stringify({
      version: 1,
      settings: { restSec: -5, warmupRestSec: 99999, lastDay: 'Z', weightStep: 'x' },
      profile: '直接在备份里写的字符串背景',
      program: { A: [{ section: 's', exerciseId: 'e190', sets: [{ type: 'weird', weight: 'abc', reps: NaN, duration: -5, rpe: 99, rpeLabel: 'l'.repeat(2000), side: null }] }], B: [] },
      exercises: { e190: '不是对象' },
      logs: [null, 'x', { date: 'd', exercises: 'notarray' }, { date: '2024-01-02', exercises: [null, { sets: 'x' }, { sets: [{ weight: '100', reps: '8' }] }] }],
      drafts: { A: [null, { sets: 'x' }, { sets: [{ weight: '50.5', reps: 'x' }] }] },
      sessions: { A: null, B: null },
      rest: { endsAt: -1 }, timer: { startsAt: 0 }, ui: null
    });
    const d190 = T.load();
    const s190 = d190.settings;
    check('190 非法设置回默认或钳进范围（休息 90/热身 1800/步进 2.5/日期 A）', s190.restSec === 90 && s190.warmupRestSec === 1800 && s190.weightStep === 2.5 && s190.lastDay === 'A');
    check('190 字符串 profile 保住内容并纠正形状', d190.profile && typeof d190.profile === 'object' && d190.profile.background === '直接在备份里写的字符串背景');
    check('190 日志只留合法条目且字符串数值归一化', d190.logs.length === 1 && d190.logs[0].exercises.length === 1 && d190.logs[0].exercises[0].sets[0].weight === 100 && d190.logs[0].exercises[0].sets[0].reps === 8);
    check('190 非对象的动作条目被规范化而不是留毒', d190.exercises.e190 && typeof d190.exercises.e190 === 'object' && d190.exercises.e190.name === 'e190');
    check('190 坏的 rest/timer 计时器被丢弃', d190.rest === null && d190.timer === null);
    const fixed190 = JSON.stringify(d190);
    global.localStorage._d[key190] = fixed190;             // 与 save() 写入的内容等价
    const d2 = T.load();
    check('190 再存再读完全一致（规范化是幂等的，不会每次刷新改一次数据）', JSON.stringify(d2) === fixed190);
    if(origStore190 !== undefined) global.localStorage._d[key190] = origStore190;
  }
};
