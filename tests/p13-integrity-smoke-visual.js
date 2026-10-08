// Iron Log 逻辑测试 · 第 13 段（共 13 段）：§191–§205 SEED 动作无孤儿 / plan-B 夹具 / 产品闭环冒烟 / sw.js 可编译与生命周期 / fetch 策略钉测 / CSS 变量有定义 / ± 长按连发 / 完成按钮语义色 / 组进度细条 / 折叠行 ≥44px / 卡片底部可换行 / 页头进度线 / 下一动作预览 / RPE 占位 / 标题去编号 / §206 data-action 点击派发 / §207 exClick 三层 act 表 / §208 备份提醒
// 本段由一次性脚本从 test-ironlog.js 机械拆出：断言与夹具逐字未改，只加了下面的壳。
// 跑法：npm test（= node tests/run.js）。各段共用同一个 app 实例、状态连续流动，必须按序跑，不能单独跑某一段。
const H = require('./harness.js');

module.exports = async function () {
const { fs, path, T, check, html, script, PT, makeClassList, makeEl, clickExList, btnOf, clickEl, doneBtn, navBtn, doneBtnFromDOM, htmlTouchedHTML, textOf, runTimers, advanceClock, touchedIds, missingIds, elsById, handlers, docHandlers, windowHandlers, timers, historyStub } = H;
const __dirname = H.ROOT;
const { r, items, before, sw, p } = H.C;   // 上段产生的共享变量
  console.log('== 191. SEED 计划引用的动作全部存在，无孤儿无重复（测试加固，无应用改动）==');
  // 计划条目指向不存在的动作时界面会退化成显示 id；动作库里留着 A/B 日都用不到的孤儿会污染动作选择器。
  // SEED 是出厂数据，改种子（换动作/改 id）时最容易碰断这条。
  {
    const seed191 = script.slice(script.indexOf('const SEED'), script.indexOf('/* ---------------- 迁移'));
    const defIds191 = [...seed191.matchAll(/^\s{4}([a-z_]+):\s*\{ name:/gm)].map(m => m[1]);
    const refIds191 = [...seed191.matchAll(/exerciseId:\s*'([a-z_]+)'/g)].map(m => m[1]);
    const defSet191 = new Set(defIds191);
    const miss191 = [...new Set(refIds191)].filter(r => !defSet191.has(r));
    const orphan191 = [...defSet191].filter(d => !refIds191.includes(d));
    const dup191 = defIds191.filter((x, i) => defIds191.indexOf(x) !== i);
    check('191 计划引用的每个动作都在动作库里' + (miss191.length ? '（缺：' + miss191.join(', ') + '）' : ''), miss191.length === 0 && defSet191.size >= 20);
    check('191 动作库没有 A/B 日都用不到的孤儿' + (orphan191.length ? '（孤儿：' + orphan191.join(', ') + '）' : ''), orphan191.length === 0);
    check('191 动作库没有重复 id' + (dup191.length ? '（重复：' + dup191.join(', ') + '）' : ''), dup191.length === 0);
  }
  console.log('== 192. B 日夹具是承重资产：自洽 + 完整导入路径（测试加固，无应用改动）==');
  // fixtures/plan-B.json 来自用户真实的 B 日打卡实录，但此前没有任何测试引用它：
  // 夹具哪天被改坏（id 打错、结构漂移）只有人读文件才会发现。先钉夹具自洽，
  // 再走完整导入路径（applyPlan 未导出，importPlan 是唯一入口）证明它真的能导入并落到 B 日。
  {
    const pbText192 = fs.readFileSync(path.join(__dirname, 'fixtures/plan-B.json'), 'utf8');
    const pb192 = JSON.parse(pbText192);
    const refs192 = [];
    for(const day of Object.keys(pb192.program)) for(const e of pb192.program[day]) refs192.push(e.exerciseId);
    const defs192 = new Set(Object.keys(pb192.exercises));
    const miss192 = refs192.filter(r => !defs192.has(r));
    check('192 B 日夹具计划引用的动作都在夹具定义里' + (miss192.length ? '（缺：' + miss192.join(', ') + '）' : ''), miss192.length === 0 && defs192.size >= 10);
    check('192 B 日夹具 day 字段是 B', pb192.day === 'B');
    const snapProg192 = JSON.parse(JSON.stringify(T.state.program));
    const snapEx192 = JSON.parse(JSON.stringify(T.state.exercises));
    const snapImp192 = T.state.lastImport;
    const snapSess192 = JSON.parse(JSON.stringify(T.state.sessions));
    const r192 = T.importPlan(pbText192);
    check('192 B 日夹具能通过完整导入路径' + (r192 && r192.error ? '（' + r192.error + '）' : ''), r192 && r192.ok === true);
    check('192 导入后 B 日计划非空且每个条目的动作都有定义', T.state.program.B.length > 0 && T.state.program.B.every(e => T.state.exercises[e.exerciseId]));
    T.state.program = snapProg192;
    T.state.exercises = snapEx192;
    T.state.lastImport = snapImp192;
    T.state.sessions = snapSess192;
  }
  console.log('== 193. 产品闭环冒烟：导入→记录→导出→导入新方案→再记录→备份还原（测试加固，无应用改动）==');
  // 产品承诺的闭环是「记录→导出→AI 分析→导入方案→执行」。各环节各自有钉，
  // 但没有任何一条测试按真实顺序把整条链串起来——跨环节的接口漂移（快照格式 vs 导出解析、
  // 导入后草稿失效、备份还原丢日志）只有串起来才会撞红。这里按用户视角跑一遍全程。
  {
    const snap193 = {
      program: JSON.parse(JSON.stringify(T.state.program)),
      ex: JSON.parse(JSON.stringify(T.state.exercises)),
      settings: JSON.parse(JSON.stringify(T.state.settings)),
      logs: T.state.logs, sessions: JSON.parse(JSON.stringify(T.state.sessions)),
      lastImport: T.state.lastImport,
    };
    T.state.settings.lastDay = 'A';
    T.state.sessions = { A: null, B: null };
    T.clearDraft('A'); T.clearDraft('B');
    const plan193 = (w) => JSON.stringify({
      type: 'ai-plan',
      exercises: { sq193: { name: '高脚杯深蹲193', mode: 'weight', unit: 'kg' } },
      program: { A: [{ exerciseId: 'sq193', sets: [{ type: 'work', weight: w, reps: 5, duration: null, rpe: null }] }] },
    });
    const base193 = T.state.logs.length;
    const r1a = T.importPlan(plan193(50));
    check('193 闭环第1步：AI 方案导入成功' + (r1a && r1a.error ? '（' + r1a.error + '）' : ''), r1a && r1a.ok === true);
    T.startSessionIfNeeded('A');
    const sess193 = T.state.sessions.A;
    check('193 开始训练会按新计划物化进行中的记录', !!sess193 && sess193.items.length === 1 && sess193.items[0].exerciseId === 'sq193');
    if(sess193){
      sess193.items[0].sets[0].done = true;
      sess193.items[0].sets[0].weight = 50;
      sess193.items[0].sets[0].reps = 5;
    }
    T.endSession();
    check('193 结束训练后日志 +1 且进行中记录清空', T.state.logs.length === base193 + 1 && T.state.sessions.A === null);
    const ex193 = T.buildExport(3);
    const mine193 = (ex193.recentLogs || []).filter(l => (l.exercises || []).some(e => e.exerciseId === 'sq193'));
    check('193 导出对象包含刚记录的那次训练（重量 50）',
      mine193.length >= 1 && mine193.some(l => l.exercises.some(e => e.sets.some(s => s.weight === 50 && s.done === true))));
    const r2a = T.importPlan(plan193(55));
    check('193 闭环第3步：进阶方案（55kg）导入成功' + (r2a && r2a.error ? '（' + r2a.error + '）' : ''), r2a && r2a.ok === true);
    const items193 = T.getItems('A');
    check('193 新计划成为下一堂训练的目标（预填 55）', items193.length === 1 && items193[0].sets[0].weight === 55);
    advanceClock(60000);   // 两次训练真实相隔几十分钟：startedAt 相同毫秒会被 insertLog 按 startedAt 去重（测试节奏太快的假象）
    T.startSessionIfNeeded('A');
    if(T.state.sessions.A){
      T.state.sessions.A.items[0].sets[0].done = true;
      T.state.sessions.A.items[0].sets[0].weight = 55;
      T.state.sessions.A.items[0].sets[0].reps = 5;
    }
    T.endSession();
    check('193 按新方案再记录一次，历史累计 +2', T.state.logs.length === base193 + 2);
    const bak193 = JSON.stringify(T.buildBackup());
    // restoreBackupText 是「解析→弹确认→应用」：先起 Promise，再用 answerConfirm 按下确认，最后取布尔结果。
    const rbP193 = T.restoreBackupText(bak193);
    await T.answerConfirm(true);
    const rb193 = await rbP193;
    check('193 备份→还原成功且不丢日志/方案',
      rb193 === true && T.state.logs.length === base193 + 2 && T.state.program.A[0].sets[0].weight === 55);
    T.state.program = snap193.program;
    T.state.exercises = snap193.ex;
    T.state.settings = snap193.settings;
    T.state.logs = snap193.logs;
    T.state.sessions = snap193.sessions;
    T.state.lastImport = snap193.lastImport;
    T.clearDraft('A'); T.clearDraft('B');
  }
  console.log('== 194. sw.js 必须能通过语法编译并注册三个生命周期监听（测试加固，无应用改动）==');
  // 此前 sw.js 只被当作文本检查：语法错误会一路通过测试和 CI，只在真机注册 SW 时才炸。
  // app.js 走 eval 天然做语法检查；index.html 由 §10 保证没有内联脚本，所以缺口只在 sw.js。
  {
    const vm194 = require('vm');
    let compileErr194 = null;
    try { new vm194.Script(sw, { filename: 'sw.js' }); }
    catch (e) { compileErr194 = e.message; }
    check('194 sw.js 语法可编译' + (compileErr194 ? '（' + compileErr194 + '）' : ''), compileErr194 === null);
    // 再实际执行一遍顶层：用最小 self 桩接住生命周期注册（不调用处理器，不碰 caches/clients）。
    const swEvents194 = {};
    const sandbox194 = { self: { addEventListener: (t, fn) => { swEvents194[t] = fn; } } };
    sandbox194.self.globalThis = sandbox194.self;
    let runErr194 = null;
    try { vm194.runInNewContext(sw, sandbox194, { filename: 'sw.js' }); }
    catch (e) { runErr194 = e.message; }
    check('194 sw.js 顶层可执行' + (runErr194 ? '（' + runErr194 + '）' : ''), runErr194 === null);
    check('194 install/activate/fetch 监听在运行时确实注册',
      ['install', 'activate', 'fetch'].every(k => typeof swEvents194[k] === 'function'));
  }
  console.log('== 195. sw.js fetch 策略的行为级钉测（测试加固，无应用改动）==');
  // §16/§162 只正则钉过缓存策略；这里真调 fetch 处理器，钉住实际行为：
  // 非 GET / 非同域直接放行；导航网络优先且 404 不写缓存；导航离线回退命中缓存；
  // 资源命中缓存直接回缓存（网络只作后台更新）；资源未命中走网络且非 200 不写缓存。
  {
    const vm195 = require('vm');   // §194 的 vm194 是块级作用域，这里要自己 require
    const mkRes195 = (status, body) => ({ ok: status === 200, status, body, clone() { return this; } });
    const store195 = new Map([['https://example.test/css/style.css', mkRes195(200, 'CACHED')]]);
    const cache195 = {
      match: r => Promise.resolve(store195.get(typeof r === 'string' ? r : r.url)),
      put: (r, res) => { store195.set(typeof r === 'string' ? r : r.url, res); },
    };
    let net195 = [];
    let fetchMode195 = '404';   // 控制沙箱 fetch：'404' 返回 404，'fail' 直接 reject
    const self195 = {
      location: { origin: 'https://example.test' },
      addEventListener: () => {},
      skipWaiting: () => {}, clients: { claim: () => {} },
    };
    const sandbox195 = {
      self: self195,
      caches: { open: () => Promise.resolve(cache195), keys: () => Promise.resolve([]), match: r => cache195.match(r) },
      URL,
      fetch: r => {
        const u = typeof r === 'string' ? r : r.url;
        net195.push(u);
        if (fetchMode195 === 'fail') return Promise.reject(new Error('offline'));
        return Promise.resolve(mkRes195(404, 'NOTFOUND'));
      },
    };
    sandbox195.self.globalThis = sandbox195.self;
    const swEvents195 = {};
    self195.addEventListener = (t, fn) => { swEvents195[t] = fn; };
    vm195.runInNewContext(sw, sandbox195, { filename: 'sw.js' });
    const callFetch195 = async (req) => {
      let out = 'NO_RESPOND';
      swEvents195.fetch({ request: req, respondWith: p => { out = p; } });
      if (out === 'NO_RESPOND') return { handled: false };
      try { return { handled: true, res: await out }; }
      catch (e) { return { handled: true, res: undefined }; }
    };
    const r1 = await callFetch195({ method: 'POST', url: 'https://example.test/save' });
    const r2 = await callFetch195({ method: 'GET', url: 'https://other.example/x.css' });
    check('195 非 GET 与非同域请求直接放行（不接管、不联网）',
      !r1.handled && !r2.handled && net195.length === 0);
    const r3 = await callFetch195({ method: 'GET', mode: 'navigate', url: 'https://example.test/' });
    check('195 导航走网络，404 原样返回且不写进离线回退',
      r3.handled && r3.res && r3.res.status === 404 && !store195.has('./index.html'));
    store195.set('./index.html', mkRes195(200, 'INDEX'));
    fetchMode195 = 'fail';
    const r4 = await callFetch195({ method: 'GET', mode: 'navigate', url: 'https://example.test/' });
    fetchMode195 = '404';
    check('195 导航离线失败回退到缓存的 index.html', r4.handled && r4.res && r4.res.body === 'INDEX');
    const r5 = await callFetch195({ method: 'GET', url: 'https://example.test/css/style.css' });
    check('195 资源命中缓存直接回缓存副本（网络仅作后台更新）',
      r5.handled && r5.res && r5.res.body === 'CACHED');
    const r6 = await callFetch195({ method: 'GET', url: 'https://example.test/icon.svg' });
    check('195 资源未命中走网络，非 200 不写入缓存',
      r6.handled && r6.res && r6.res.status === 404 && !store195.has('https://example.test/icon.svg'));
  }
  console.log('== 196. CSS 自定义属性：用到的每个 var(--x) 都有定义（测试加固，无应用改动）==');
  // 拼错一个 var(--x) 是静默失效：样式无声无息地不生效，肉眼很难发现。与 §188 类名扫描同类。
  {
    const css196 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const defs196 = new Set([...css196.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
    const uses196 = new Set([...(css196 + html + script).matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]));
    check('196 变量定义扫描非空（防恒真）', defs196.size >= 8 && uses196.size >= 8);
    const undef196 = [...uses196].filter(u => !defs196.has(u));
    check('196 所有 var() 引用的变量都在 style.css 定义' + (undef196.length ? '（未定义：' + undef196.join(', ') + '）' : ''), undef196.length === 0);
  }
  console.log('== 197. ± 按住连发：长按自动步进、抬手吞掉同手势的 click（v0.9.132）==');
  // js/app.js pointerdown 连发链：400ms 后起步，间隔 200→100ms 递减；抬手/取消即停（代次守卫 + clearTimeout）。
  // 测试桩的 setTimeout 只排队不看延迟（runTimers 每次执行当前已排队的一轮），所以这里钉的是连发链的
  // 结构行为：一次 runTimers = 一步；抬手后排着的旧步被代次守卫作废。轻点路径必须与旧版一致。
  {
    const saveProg197 = T.state.program, saveEx197 = T.state.exercises, saveDay197 = T.state.settings.lastDay;
    T.state.settings.lastDay = 'A';
    T.state.logs = []; delete T.state.drafts.A;
    T.state.program = { A: [
      { section: '', exerciseId: 'e197b', sets: [{ type: 'work', weight: null, reps: 5, duration: null, rpe: null, rpeLabel: '', side: null }] }
    ], B: [] };
    T.state.exercises = Object.assign({}, T.state.exercises, { e197b: { name: '俯卧撑197', mode: 'bodyweight', unit: null } });
    const it197 = T.getItems('A')[0];
    const pdH197 = handlers.get('ex-list|pointerdown');
    const puH197 = handlers.get('ex-list|pointerup');
    check('197 连发的 pointerdown/up/cancel 监听都已注册', !!pdH197 && !!puH197 && !!handlers.get('ex-list|pointercancel'));
    const btn197 = { dataset: { act: 'step', ex: '0', set: '0', f: 'reps', dir: '1' } };
    const pd197 = () => ({ isPrimary: true, target: { closest: sel => /fs-step/.test(sel) ? btn197 : null } });
    pdH197(pd197());
    runTimers();
    check('197 连发第一步自动步进', it197.sets[0].reps === 6);
    runTimers(); runTimers();
    check('197 连发链持续步进（每轮一步）', it197.sets[0].reps === 8);
    puH197({});
    runTimers(); runTimers();
    check('197 抬手后排队中的旧步被代次守卫作废（即停）', it197.sets[0].reps === 8);
    clickExList(btnOf({ act: 'step', ex: '0', set: '0', f: 'reps', dir: '1' }));
    check('197 抬手后跟随的 click 被吞掉（同手势不多走一步）', it197.sets[0].reps === 8);
    pdH197(pd197()); puH197({}); runTimers();
    clickExList(btnOf({ act: 'step', ex: '0', set: '0', f: 'reps', dir: '1' }));
    check('197 轻点行为不变：只走 click 的一步', it197.sets[0].reps === 9);
    pdH197({ isPrimary: true, target: { closest: () => null } });
    runTimers();
    check('197 非步进按钮长按不步进', it197.sets[0].reps === 9);
    pdH197({ isPrimary: false, target: { closest: () => btn197 } });
    runTimers();
    check('197 多指触摸的次级指针不触发连发', it197.sets[0].reps === 9);
    // RPE 按钮同样连发（inc：默认从 7.5 起步，+0.5/步）
    const btnR197 = { dataset: { act: 'inc', ex: '0', set: '0', f: 'rpe' } };
    pdH197({ isPrimary: true, target: { closest: sel => /rpe-btn/.test(sel) ? btnR197 : null } });
    runTimers(); runTimers();
    puH197({});
    check('197 RPE 按钮长按连发（7.5 起两次 +0.5）', it197.sets[0].rpe === 8.5);
    clickExList(btnOf({ act: 'inc', ex: '0', set: '0', f: 'rpe' }));
    check('197 连发手势收尾：跟随的 click 被吞，不留下未消费的计数', it197.sets[0].rpe === 8.5);
    T.state.program = saveProg197; T.state.exercises = saveEx197; T.state.settings.lastDay = saveDay197;
    delete T.state.exercises.e197b;
  }
  console.log('== 198. 完成按钮语义色：未完成中性描边+文字、完成绿实底，红色留给破坏性操作（v0.9.133）==');
  {
    const css198 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const undone198 = (css198.match(/\.fs-done\.undone\{([^}]*)\}/) || ['', ''])[1];
    const done198 = (css198.match(/\.fs-done\.done\{([^}]*)\}/) || ['', ''])[1];
    check('198 未完成按钮不用红色（红色只留给破坏性操作）', !!undone198 && !/var\(--red\)/.test(undone198));
    check('198 完成态是绿色实底', !!done198 && /background:var\(--green\)/.test(done198));
    const saveProg198 = T.state.program, saveEx198 = T.state.exercises, saveDay198 = T.state.settings.lastDay, savePos198 = T.curPos, saveSess198 = T.state.sessions;
    T.state.settings.lastDay = 'A'; T.curPos = 0;
    T.state.sessions = {};
    T.state.logs = []; delete T.state.drafts.A;
    T.state.program = { A: [
      { section: '', exerciseId: 'e198b', sets: [
        { type: 'work', weight: null, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null },
        { type: 'work', weight: null, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null }
      ] }
    ], B: [] };
    T.state.exercises = Object.assign({}, T.state.exercises, { e198b: { name: '俯卧撑198', mode: 'bodyweight', unit: null } });
    const card198 = T.fullScreenHTML('A');
    check('198 未完成按钮：中性类 + 文字「✓ 完成这组」', /class="fs-done undone"[^>]*>✓ 完成这组<\/button>/.test(card198));
    check('198 卡片上不再出现 ✗ 符号', !card198.includes('✗'));
    check('198 aria-pressed 语义不变（未完成 false）', /aria-pressed="false"/.test(card198));
    clickExList(btnOf({ act: 'confirm', ex: '0', set: '0' }));
    const card198b = T.fullScreenHTML('A');
    check('198 确认后：绿实底类 + 文字「✓ 已完成」', /class="fs-done done"[^>]*>✓ 已完成<\/button>/.test(card198b));
    check('198 确认后 aria-pressed true', /aria-pressed="true"/.test(card198b));
    T.state.program = saveProg198; T.state.exercises = saveEx198; T.state.settings.lastDay = saveDay198; T.curPos = savePos198;
    T.state.sessions = saveSess198;
    delete T.state.exercises.e198b;
  }
  console.log('== 199. 组进度细条：替代小圆环、绿色无红、纯装饰 aria-hidden（v0.9.134）==');
  {
    const css199 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    check('199 细条样式已定义且绿色填充', /\.fs-setbar\{[^}]*height:2px/.test(css199) && /\.fs-setbar-fill\{[^}]*background:var\(--green\)/.test(css199));
    check('199 旧小圆环在样式与应用里都已移除', !/fs-dot/.test(css199) && !/fs-dot/.test(script));
    const saveProg199 = T.state.program, saveEx199 = T.state.exercises, saveDay199 = T.state.settings.lastDay, savePos199 = T.curPos, saveSess199 = T.state.sessions;
    T.state.settings.lastDay = 'A'; T.curPos = 0;
    T.state.sessions = {};   // 198 节的确认把草稿升格成了进行中记录——不清掉 getItems 会返回旧动作的 items
    T.state.logs = []; delete T.state.drafts.A;
    T.state.program = { A: [
      { section: '', exerciseId: 'e199b', sets: [
        { type: 'work', weight: null, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null },
        { type: 'work', weight: null, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null }
      ] }
    ], B: [] };
    T.state.exercises = Object.assign({}, T.state.exercises, { e199b: { name: '俯卧撑199', mode: 'bodyweight', unit: null } });
    const card199a = T.fullScreenHTML('A');
    check('199 未开始：进度条 0% 且 aria-hidden（纯装饰，读屏只听「第 N/M 组」文字）',
      /class="fs-setbar" aria-hidden="true"><div class="fs-setbar-fill" style="width:0%"/.test(card199a));
    clickExList(btnOf({ act: 'confirm', ex: '0', set: '0' }));
    const card199b = T.fullScreenHTML('A');
    check('199 确认 1/2 组：进度条 50%', card199b.includes('style="width:50%"'));
    T.state.program = saveProg199; T.state.exercises = saveEx199; T.state.settings.lastDay = saveDay199; T.curPos = savePos199;
    T.state.sessions = saveSess199;
    delete T.state.exercises.e199b;
  }
  console.log('== 200. 要点折叠行：整行触达 ≥44px、chevron 指示展开/收起（v0.9.135）==');
  {
    const css200 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const sum200 = (css200.match(/\.ex-notes summary\{([^}]*)\}/) || ['', ''])[1];
    check('200 整行 flex 布局且触达 ≥44px', /min-height:44px/.test(sum200) && /display:flex/.test(sum200));
    check('200 隐藏系统默认三角（两套引擎都隐藏）', /list-style:none/.test(sum200) && /::-webkit-details-marker\{display:none\}/.test(css200));
    check('200 自定义 chevron 且展开时旋转 90°', /\.ex-notes summary::before\{content:'▸'/.test(css200) && /\.ex-notes\[open\] summary::before\{transform:rotate\(90deg\)/.test(css200));
    check('200 原生 details 语义与按动作记忆展开态不变', /details class="ex-notes" data-notes=/.test(script) && /openNotes\[day \+ ':' \+ d\.dataset\.notes\]/.test(script));
  }
  console.log('== 201. 卡片底部行可换行：备注框不再把 390px 视口撑到 478（v0.9.136 修复）==');
  // 多组动作时 .fs-foot 里有 加一组 + 删最后一组 + 备注输入 三件；input 的固有最小宽让整行 478px，
  // 备注框被裁在屏幕外（CDP 390px 审计实测 viewport 被内容撑开到 478）。
  {
    const css201 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const foot201 = (css201.match(/\.fs-foot\{([^}]*)\}/) || ['', ''])[1];
    const note201 = (css201.match(/\.fs-exnote\{([^}]*)\}/) || ['', ''])[1];
    check('201 底部行允许换行', /flex-wrap:wrap/.test(foot201));
    check('201 备注框可收缩（min-width:0 + 有基准的 flex）', /min-width:0/.test(note201) && /flex:1 1 /.test(note201));
  }
  console.log('== 202. 页头常驻日进度线：卡片顶的进度条滚出屏幕，页头不会（v0.9.137）==');
  {
    const html202 = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const css202 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const app202 = fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf8');
    const head202 = (html202.match(/<header>[\s\S]*?<\/header>/) || [''])[0];
    check('202 进度线在 sticky 页头内', /class="daybar"/.test(head202) && /id="daybar-fill"/.test(head202));
    check('202 进度线 aria-hidden（数字已在状态行）', /class="daybar"[^>]*aria-hidden="true"/.test(head202));
    check('202 填充用绿色', /\.daybar-fill\{[^}]*var\(--green\)/.test(css202));
    check('202 卡片顶旧条已删除', !/fs-progress/.test(css202) && !/fs-progress/.test(app202));

    const sess202 = T.state.sessions.A, draft202 = T.state.drafts.A, prog202 = T.state.program.A;
    T.state.sessions.A = { startedAt: Date.now(), items: [
      { exerciseId: 'goblet_squat', note: '', sets: [{ weight: 10, reps: 10, done: true }, { weight: 10, reps: 10, done: false }] },
      { exerciseId: 'wall_angel', note: '', sets: [{ reps: 10, done: false }] }
    ], condition: null };
    T.switchDay('A'); T.switchView('today'); T.render();
    check('202 页头条宽度 = 1/3 完成', document.getElementById('daybar-fill').style.width === '33%');
    check('202 有组时条显示', document.getElementById('daybar').style.display === '');
    T.state.sessions.A = sess202; T.state.drafts.A = draft202;
    T.state.program.A = [];
    T.render();
    check('202 没有组时条隐藏', document.getElementById('daybar').style.display === 'none');
    T.state.program.A = prog202;
    T.render();
  }
  console.log('== 203. 下一动作预览行：点它直接跳到下一个动作的第一组（v0.9.138）==');
  {
    // 自带夹具：不依赖全局 program/exercises 的内容（前面有些节替换或删除过它们）
    const sess203 = T.state.sessions.A, draft203 = T.state.drafts.A;
    const mkEx203 = nm => ({ name: nm, mode: 'weight', unit: 'kg', tips: '', pitfalls: '', tempo: '', alternatives: '', personal: '' });
    T.state.exercises.ex203a = mkEx203('测试动作A203');
    T.state.exercises.ex203b = mkEx203('测试动作B203');
    const prog203 = T.state.program.A;
    T.state.program.A = [
      { exerciseId: 'ex203a', sets: [{ reps: 10, weight: 5 }] },
      { exerciseId: 'ex203b', sets: [{ reps: 10, weight: 10 }, { reps: 10, weight: 10 }] }
    ];
    T.state.sessions.A = { startedAt: Date.now(), condition: null, items: [
      { exerciseId: 'ex203a', note: '', sets: [{ weight: 5, reps: 10, done: false }] },
      { exerciseId: 'ex203b', note: '', sets: [{ weight: 10, reps: 10, done: false }, { weight: 10, reps: 10, done: false }] }
    ] };
    T.switchDay('A'); T.curPos = 0;
    const card203 = T.fullScreenHTML('A');
    check('203 卡片底部有下一动作行（名称+安排）', /class="fs-next"/.test(card203) && card203.includes('测试动作B203'));
    check('203 下一动作行带 nextex 动作', /data-act="nextex"/.test(card203));
    clickExList(btnOf({ act: 'nextex' }));
    const pos203 = T.flatPos('A')[T.curPos];
    check('203 点击后跳到下一个动作的第一组', pos203.exIdx === 1 && pos203.setIdx === 0 && T.curPos === 1);
    // 最后一个动作：没有下一行
    T.curPos = 1;
    check('203 最后一个动作不显示下一行', !/fs-next/.test(T.fullScreenHTML('A')));
    T.curPos = 0;
    T.state.sessions.A = sess203; T.state.drafts.A = draft203; T.state.program.A = prog203;
    delete T.state.exercises.ex203a; delete T.state.exercises.ex203b;
  }
  console.log('== 204. RPE 数值块：未填时把目标值作为占位显示，不再是一个孤零零的 –（v0.9.139）==');
  {
    const css204 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    check('204 占位弱化样式已定义', /\.rpe-val\.ghost\{/.test(css204));
    const sess204 = T.state.sessions.A, draft204 = T.state.drafts.A;
    const prog204 = T.state.program.A;
    T.state.exercises.ex204 = { name: '测试动作204', mode: 'weight', unit: 'kg', tips: '', pitfalls: '', tempo: '', alternatives: '', personal: '' };
    T.state.program.A = [{ exerciseId: 'ex204', sets: [{ weight: 10, reps: 10 }] }];
    T.state.sessions.A = { startedAt: Date.now(), condition: null, items: [
      { exerciseId: 'ex204', note: '', sets: [{ weight: 10, reps: 10, done: false, rpe: null, targetRpe: 8, targetRpeLabel: '留一次余力' }] }
    ] };
    T.switchDay('A'); T.curPos = 0;
    let card204 = T.fullScreenHTML('A');
    check('204 未填时显示目标占位且带 ghost 类', /class="rpe-val ghost">8</.test(card204));
    check('204 占位显示时不重复「目标 8」文字', !/目标 8/.test(card204));
    check('204 目标说明文字保留', card204.includes('留一次余力'));
    clickExList(btnOf({ act: 'inc', ex: 0, set: 0, f: 'rpe' }));
    check('204 点 + 记入 目标+0.5', T.state.sessions.A.items[0].sets[0].rpe === 8.5);
    card204 = T.fullScreenHTML('A');
    check('204 已记值：显示实际值无 ghost 类', /class="rpe-val">8\.5</.test(card204));
    check('204 已记值：「目标 8」对照回来', /目标 8/.test(card204));
    T.state.sessions.A = sess204; T.state.drafts.A = draft204; T.state.program.A = prog204;
    delete T.state.exercises.ex204;
  }
  console.log('== 205. 动作标题去掉「N.」编号前缀：与分区行编号是两套，容易误读（v0.9.140）==');
  {
    const css205 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const app205 = fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf8');
    check('205 fs-num 已从脚本与样式中移除', !/fs-num/.test(app205) && !/\.fs-num/.test(css205));
    const sess205 = T.state.sessions.A, draft205 = T.state.drafts.A;
    const prog205 = T.state.program.A;
    T.state.exercises.ex205 = { name: '测试动作205', mode: 'weight', unit: 'kg', tips: '', pitfalls: '', tempo: '', alternatives: '', personal: '' };
    T.state.program.A = [{ exerciseId: 'ex205', section: '2. 主课段', sets: [{ weight: 10, reps: 10 }] }];
    T.state.sessions.A = { startedAt: Date.now(), condition: null, items: [
      { exerciseId: 'ex205', note: '', sets: [{ weight: 10, reps: 10, done: false }] }
    ] };
    T.switchDay('A'); T.curPos = 0;
    const card205 = T.fullScreenHTML('A');
    check('205 标题只有名称，没有编号前缀', /class="fs-name">测试动作205</.test(card205));
    check('205 分区行照常显示', /fs-section">2\. 主课段/.test(card205));
    T.state.sessions.A = sess205; T.state.drafts.A = draft205; T.state.program.A = prog205;
    delete T.state.exercises.ex205;
  }
  console.log('== 206. data-action 委托：点击真的走 ACTIONS（v0.9.145）==');
  // v0.9.145 把 index.html 的 23 处内联 onclick 收进 app.js 的 ACTIONS 表 + 唯一的 document click 委托。
  // §143 钉「名字在表里」、§181 钉「元素上挂着名字」，两者都测不到派发链路本身。
  // 这里向真实注册的监听器派发一次点击：以后「点了没反应」在逻辑测试里就会现形，而不是只有真浏览器手点才发现。
  {
    const clickDoc206 = docHandlers.get('click');
    check('206 文档级 click 监听只有一个（动作派发与抽屉兜底共用）', typeof clickDoc206 === 'function');
    // 模拟真实冒泡：closest('[data-action]') 命中带 dataset.action 的按钮，其余选择器按调用方给的位置回答
    const clickAction206 = (action, where) => clickDoc206({
      target: { closest: sel => sel === '[data-action]' ? { dataset: { action } } : (where === sel ? {} : null) }
    });
    const p206a = T.askConfirm('确认206');
    clickAction206('confirmYes');
    check('206 点 confirmYes 让确认返回 true', (await p206a) === true);
    const p206b = T.askConfirm('确认206b');
    clickAction206('confirmNo');
    check('206 点 confirmNo 让确认返回 false', (await p206b) === false);
    // 抽屉内的复合动作（切日 + 关抽屉）：兜底对 .drawer 内的点击会直接返回，
    // 所以「抽屉关了」只能来自表里的动作，不是兜底顺手关的。
    const day206 = T.state.settings.lastDay, pos206 = T.curPos;
    const drawer206 = document.getElementById('drawer');
    T.toggleDrawer();
    clickAction206('pickDayB', '.drawer');
    check('206 抽屉里点日期按钮：切到 B 日', T.state.settings.lastDay === 'B');
    check('206 同一个动作接着关掉抽屉', !drawer206.classList.contains('open'));
    T.state.settings.lastDay = day206; T.curPos = pos206; T.render();
    let threw206 = false;
    try{ clickAction206('no_such_action'); }catch(e){ threw206 = true; }
    check('206 未登记的动作不抛异常（表里没有就什么都不做）', !threw206);
  }

  /* ============================================================
   * 207. exClick 的三层 act 表（v0.9.147 拆分）
   * v0.9.147 把 exClick 里 172 行的 if(act===…) 链拆成 EX_NAV_ACTS / EX_ITEM_ACTS /
   * EX_SET_ACTS 三张表 + 具名处理器。拆完有两个只有新结构才会有的坑：
   * ① 同一个 act 出现在两张表里时，前一层会永久挡住后一层——§131 看不出，因为名字确实
   *    「被接住了」，但点了没反应；
   * ② 逐层守卫（拿不到 item/set 就静默返回）原本是那串 if 的语义，漏掉就会在越界组上崩。
   * ============================================================ */
  console.log('== 207. exClick 三层 act 表：不重名、缺上下文时静默返回（v0.9.147）==');
  {
    const keys207 = { nav: Object.keys(T.EX_NAV_ACTS), item: Object.keys(T.EX_ITEM_ACTS), set: Object.keys(T.EX_SET_ACTS) };
    const dup207 = keys207.nav.filter(k => keys207.item.includes(k) || keys207.set.includes(k))
      .concat(keys207.item.filter(k => keys207.set.includes(k)));
    check('207 三张 act 表之间没有重名（重名=前一层永久挡住后一层）', dup207.length === 0);
    const notFn207 = [];
    for(const m of [T.EX_NAV_ACTS, T.EX_ITEM_ACTS, T.EX_SET_ACTS])
      for(const k of Object.keys(m)) if(typeof m[k] !== 'function') notFn207.push(k);
    check('207 表里每一项都是函数', notFn207.length === 0);

    let threw207 = null;
    const tap207 = ds => { try{ clickExList(btnOf(ds)); }catch(err){ threw207 = String(err && err.message); } };
    tap207({ act: 'no_such_act', ex: '0', set: '0' });
    check('207 未登记的 act 不抛异常', threw207 === null);
    tap207({ act: 'confirm', ex: '0', set: '999' });
    check('207 data-set 越界时静默返回（原 if(!set) return 的语义）', threw207 === null);
    tap207({ act: 'addset', ex: '0' });
    check('207 动作级 act 不因缺 data-set 而崩', threw207 === null);

    // 非空跑一遍：表里的处理器必须真能被派发到（否则整张表都是死表，§131 却看不出来）。
    // 到本节末尾时 program 已被前面的小节清空（实测 items=0），所以这里自带一个最小计划。
    const day207 = T.state.settings.lastDay;
    const prog207 = JSON.parse(JSON.stringify(T.state.program));
    T.state.drafts[day207] = null; T.state.sessions[day207] = null;
    T.state.program[day207] = [
      { exerciseId: 'e207', sets: [{ type: 'work', weight: 10, reps: 8, rpe: null }, { type: 'work', weight: 10, reps: 8, rpe: null }] },
      { exerciseId: 'e207', sets: [{ type: 'work', weight: 12, reps: 5, rpe: null }] }
    ];
    const item207 = T.getItems(day207)[0];
    const reps207 = item207 && item207.sets[0] ? Number(item207.sets[0].reps) || 0 : null;
    tap207({ act: 'step', ex: '0', set: '0', f: 'reps', dir: '1' });
    check('207 组级 step 能走通（reps +1）',
      threw207 === null && reps207 !== null && item207.sets[0].reps === reps207 + 1);
    const n207 = item207.sets.length;
    tap207({ act: 'addset', ex: '0' });
    check('207 addset 真补了一组，并沿用最后一组的重量',
      threw207 === null && item207.sets.length === n207 + 1 && item207.sets[n207].weight === 10);
    tap207({ act: 'delset', ex: '0' });
    check('207 delset 真删掉刚补的那组', threw207 === null && item207.sets.length === n207);
    const pos207 = T.curPos;
    tap207({ act: 'next' });
    check('207 导航层仍能走通（next 让位置前进一格）', threw207 === null && T.curPos === pos207 + 1);
    T.state.program = prog207; T.curPos = pos207; T.render();
  }

  /* ============================================================
   * 208. 备份提醒（v0.9.148，P6）
   * 数据只存在本机 localStorage，换设备的唯一路径是手动导出。风险不是代码坏，而是
   * 「换了手机才想起没备份」——那时历史已经没了。这一节钉三件容易改错的事：
   * ① 提醒口径（backupDue）是纯函数：天数边界、推迟期内不催、从没导出过必须催；
   * ② 横幅的显示/隐藏跟着口径走（不是只在某一次渲染里顺手写死）；
   * ③ 真跑一次 doBackup 会把时间记下来——不记的话提醒会永远出现，等于没有。
   * ============================================================ */
  console.log('== 208. 备份提醒：天数口径 + 横幅随状态 + 导出真的被记账（v0.9.148）==');
  {
    const DAY208 = 864e5;
    const s208 = T.state.settings;
    const saved208 = { lastBackupAt: s208.lastBackupAt, backupSnoozeUntil: s208.backupSnoozeUntil };
    const now208 = Date.now();

    s208.lastBackupAt = 0; s208.backupSnoozeUntil = 0;
    check('208 从没导出过备份 → 该提醒', T.backupDue(now208) === true);
    s208.lastBackupAt = now208 - 13 * DAY208;
    check('208 13 天前导出过 → 不提醒', T.backupDue(now208) === false);
    s208.lastBackupAt = now208 - 15 * DAY208;
    check('208 超过 14 天 → 提醒', T.backupDue(now208) === true);
    s208.backupSnoozeUntil = now208 + DAY208;
    check('208 推迟期内不催（即使从没导出过）', T.backupDue(now208) === false);
    s208.backupSnoozeUntil = now208 - 1;
    check('208 推迟到期后恢复提醒', T.backupDue(now208) === true);
    // 手改过的备份把时间戳写成字符串：migrate 必须归 0，否则减法出 NaN、比较恒 false，提醒永远不出现
    const mig208 = T.migrate({ settings: { lastBackupAt: '昨天', backupSnoozeUntil: -5 } });
    check('208 migrate 把非数字/负数的备份时间戳归 0', mig208.settings.lastBackupAt === 0 && mig208.settings.backupSnoozeUntil === 0);

    s208.lastBackupAt = 0; s208.backupSnoozeUntil = 0;
    T.renderBackupNag();
    check('208 该提醒时横幅可见，文案说明这台设备没备份过',
      elsById.get('backup-nag').style.display === '' && /还没有导出过备份/.test(textOf('backup-nag-text') || ''));
    check('208 备份卡片里那行也说明没导出过', /还没有导出过备份文件/.test(textOf('backup-last') || ''));
    s208.lastBackupAt = now208 - 3 * DAY208;
    T.renderBackupNag();
    check('208 不该提醒时横幅隐藏', elsById.get('backup-nag').style.display === 'none');
    check('208 备份卡片显示上次导出时间', /上次导出备份：\d{4}-\d{2}-\d{2}（3 天前）/.test(textOf('backup-last') || ''));

    // 真跑一次导出：提醒必须被记账，否则它会永远挂着
    s208.lastBackupAt = 0; s208.backupSnoozeUntil = 0;
    T.doBackup();
    check('208 导出后 lastBackupAt 被写入', typeof s208.lastBackupAt === 'number' && s208.lastBackupAt >= now208);
    check('208 导出后横幅收起', elsById.get('backup-nag').style.display === 'none');
    // 一键推迟：7 天后才再提醒
    s208.lastBackupAt = 0;
    T.snoozeBackup();
    check('208 「7 天后再提醒」把下次提醒推到 7 天后',
      s208.backupSnoozeUntil >= now208 + 7 * DAY208 - 5000 && elsById.get('backup-nag').style.display === 'none');
    check('208 推迟到期后横幅会重新出现', T.backupDue(now208 + 8 * DAY208) === true);

    s208.lastBackupAt = saved208.lastBackupAt; s208.backupSnoozeUntil = saved208.backupSnoozeUntil;
    T.renderBackupNag();
  }
};
