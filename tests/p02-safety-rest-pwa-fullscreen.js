// Iron Log 逻辑测试 · 第 2 段（共 13 段）：§10–§17 转义与 XSS / 休息计时 / 防抖保存 / PWA 资源 / 全屏交互 / 趋势窗口
// 本段由一次性脚本从 test-ironlog.js 机械拆出：断言与夹具逐字未改，只加了下面的壳。
// 跑法：npm test（= node tests/run.js）。各段共用同一个 app 实例、状态连续流动，必须按序跑，不能单独跑某一段。
const H = require('./harness.js');

module.exports = async function () {
const { fs, path, T, check, html, script, PT, makeClassList, makeEl, clickExList, btnOf, clickEl, doneBtn, navBtn, doneBtnFromDOM, htmlTouchedHTML, textOf, runTimers, advanceClock, touchedIds, missingIds, elsById, handlers, docHandlers, windowHandlers, timers, historyStub } = H;
const __dirname = H.ROOT;
const { planText, r, items, gt, prompt } = H.C;   // 上段产生的共享变量
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async t => { globalThis.copied = t; } } },
    configurable: true
  });
  await T.doExport();
  check('doExport 复制 prompt（含数据）', globalThis.copied && globalThis.copied.startsWith('你是我的力量训练数据分析助手') && globalThis.copied.includes('ironlog-export'));
  await T.doExportData();
  check('doExportData 复制纯数据', globalThis.copied && JSON.parse(globalThis.copied).type === 'ironlog-export');

  console.log('== 10. P0 安全与健壮性 ==');
  check('esc 转义 & < > " \'',
    T.esc(`<a href="x">&'</>`) === '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/&gt;');
  check('esc 处理非字符串输入', T.esc(12.5) === '12.5' && T.esc(null) === 'null');

  // AI 返回的方案里带 HTML 时，渲染必须转义（否则在本地源里执行任意 JS）
  const xssPlan = JSON.stringify({
    type: 'ai-plan',
    exercises: { xss_ex: { name: '<img src=x onerror=alert(1)>', muscles: '<script>s</script>',
                           tips: '<b>t</b>', personal: '"q"' } },
    program: { B: [{ section: '<i>sec</i>', exerciseId: 'xss_ex',
                     sets: [{ type: 'work', weight: 10, reps: 8 }] }] }
  });
  check('XSS 方案导入成功', T.importPlan(xssPlan).ok === true);
  T.switchDay('B');
  const rendered = T.fullScreenHTML('B');
  check('渲染无裸 <img onerror', !/<img src=x onerror=/.test(rendered));
  check('渲染保留转义实体', /&lt;img src=x onerror=alert\(1\)&gt;/.test(rendered));
  T.openNotes['B:0'] = true;   // 展开要点详情，验证 tips 转义
  check('要点已转义', /<b>要点<\/b>&lt;b&gt;t&lt;\/b&gt;/.test(T.fullScreenHTML('B')));
  T.openNotes['B:0'] = false;
  // 恢复 A 日计划（XSS 测试覆盖了 B 日，A 日可能在前面的测试中被改过）
  T.importPlan(planText);
  T.switchDay('A');
  T.curPos = 0;
  

  // 版本号单一来源
  check('APP_VERSION 为 x.y.z', /^\d+\.\d+\.\d+$/.test(T.APP_VERSION));
  // 版本只能有 APP_VERSION 定义处 + sw.js 缓存戳两处；渲染位必须是 id 占位，不得写死
  check('页头/关于卡片无硬编码版本', !/<span class="ver">[^<]/.test(html) && !/Iron Log v\d/.test(html));
  check('版本号仅出现在定义处与 sw.js', (html.match(/v?\b\d+\.\d+\.\d+/g) || []).length <= 2);
  check('sw.js 版本串与 APP_VERSION 一致',
    fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8').includes("ironlog-v" + T.APP_VERSION));

  // 代码引用的每个元素 id 都必须真实存在于 index.html（防止改名后静默失效）
  check('getElementById 未命中缺失 id' + (missingIds.length ? '：' + [...new Set(missingIds)].join(', ') : ''),
    missingIds.length === 0);
  check('被访问的元素 id 数量合理（共 ' + touchedIds.size + ' 个）', touchedIds.size > 5);
  // 强制走一遍三个视图 + toast，让所有 id 都被访问到，扩大缺失 id 的覆盖面
  ['today','history','settings'].forEach(v => { T.switchView(v); T.render(); });
  T.toast('x');
  check('三视图 + toast 渲染后仍无缺失 id' + (missingIds.length ? '：' + [...new Set(missingIds)].join(', ') : ''),
    missingIds.length === 0);
  check('id 覆盖面扩大到 ' + touchedIds.size + ' 个', touchedIds.size > 20);

  console.log('== 11. P1 组间休息计时（v0.9：超时继续 + 自动记录） ==');
  check('migrate 补齐 restSec 默认值', T.state.settings.restSec === 90);
  T.resetRest();
  check('restSec=0 时不启动', (() => { T.state.settings.restSec = 0; T.startRestTimer(); return T.restEndsAt === null; })());
  T.state.settings.restSec = 90;
  T.startRestTimer();
  check('启动后 restTotal=90', T.restEndsAt !== null && T.restTotal === 90);
  check('restStartsAt 已设置', T.restStartsAt !== null);
  T.finishRest();
  check('finishRest 清空计时', T.restEndsAt === null && T.restStartsAt === null);
  T.startRestTimer();
  T.restEndsAt = Date.now() - 1000;   // 拨到已过期（超时）
  T.tickRest();
  check('超时后标记 done（不自动跳转）', T.restDone === true && T.restEndsAt !== null);
  T.finishRest();
  check('finishRest 后清空', T.restEndsAt === null);
  T.resetRest();
  check('resetRest 清空', T.restEndsAt === null);
  check('导出 settings 含 restSec', T.buildExport(2).settings.restSec === 90);

  console.log('== 12. P1 防抖保存 ==');
  const before = JSON.parse(global.localStorage._d['ironlog.v1']).settings.weightStep;
  T.state.settings.weightStep = 1.25;
  T.saveSoon();
  check('saveSoon 未立即落盘', JSON.parse(global.localStorage._d['ironlog.v1']).settings.weightStep === before);
  runTimers();
  check('定时器触发后落盘', JSON.parse(global.localStorage._d['ironlog.v1']).settings.weightStep === 1.25);
  T.state.settings.weightStep = 5;
  T.saveSoon();
  T.flushSave();
  check('flushSave 立即落盘', JSON.parse(global.localStorage._d['ironlog.v1']).settings.weightStep === 5);
  T.state.settings.weightStep = before;
  T.flushSave();

  console.log('== 13. P1 PWA 资源 ==');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.webmanifest'), 'utf8'));
  check('manifest 合法且 start_url=./', manifest.start_url === './' && manifest.display === 'standalone');
  check('manifest 声明语言（安装提示与无障碍按语言处理）', manifest.lang === 'zh-CN' && manifest.dir === 'ltr');
  check('manifest 有图标', Array.isArray(manifest.icons) && manifest.icons.length > 0);
  check('manifest 提供 192/512 PNG 与 maskable（只有 SVG 时 Android 安装不显示图标）',
    manifest.icons.some(i => i.sizes === '192x192' && i.type === 'image/png')
    && manifest.icons.some(i => i.sizes === '512x512' && i.type === 'image/png')
    && manifest.icons.some(i => i.purpose === 'maskable'));
  check('iOS 主屏图标指向 PNG（apple-touch-icon 不认 SVG）', /rel="apple-touch-icon" href="apple-touch-icon\.png"/.test(html));
  check('图标 PNG 文件存在且是真 PNG', ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']
    .every(f => fs.existsSync(path.join(__dirname, f))
      && fs.readFileSync(path.join(__dirname, f)).slice(0, 8).toString('hex') === '89504e470d0a1a0a'));
  check('index.html 引用 manifest', html.includes('rel="manifest"'));
  check('app.js 注册 service worker', script.includes("register('sw.js')"));
  const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
  check('sw.js 版本串与 APP_VERSION 一致', sw.includes("ironlog-v" + T.APP_VERSION));
  check('sw.js 预缓存 css/js', sw.includes('./css/style.css') && sw.includes('./js/app.js'));
  check('sw.js 的 SHELL 覆盖 index.html 引用的全部本地资源', (() => {
    const shell = (sw.match(/SHELL = \[([^\]]*)\]/) || ['', ''])[1];
    const refs = [...html.matchAll(/(?:href|src)="(?!http|data:)([^"]+)"/g)].map(x => x[1]);
    return refs.length > 0 && refs.every(r => shell.includes('./' + r));
  })());
  check('sw.js 的 SHELL 也覆盖 manifest 声明的全部图标', (() => {
    const shell = (sw.match(/SHELL = \[([^\]]*)\]/) || ['', ''])[1];
    const icons = (JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.webmanifest'), 'utf8')).icons || []).map(i => i.src);
    return icons.length > 0 && icons.every(r => shell.includes('./' + r));
  })());
  check('sw.js 有 install/activate/fetch', ['install','activate','fetch'].every(k => sw.includes("'" + k + "'")));
  check('sw.js 只缓存成功响应（404 不会污染离线回退）', /if\(res\.ok\)/.test(sw) && /res\.status === 200/.test(sw));
  const ciPrepare = fs.readFileSync(path.join(__dirname, '.github/workflows/deploy.yml'), 'utf8');
  check('deploy.yml 发布 css/js 与全部 PWA 资源（新增静态文件必须同步加 cp）',
    ['index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'sw.js']
      .every(f => new RegExp('cp [^\\n]*?\\b' + f.replace('.', '\\.') + '\\b').test(ciPrepare))
    && /cp css\/style.css dist\/css\//.test(ciPrepare)
    && /cp js\/app.js dist\/js\//.test(ciPrepare));

  console.log('== 14. P1 全屏交互（二态 / 导航 / 备注） ==');
  T.resetRest();
  T.switchDay('A');
  T.switchView('today');
  T.render();
  const it14 = T.getItems('A');
  const s14 = it14[0].sets[0];
  // 重置 done 为 false（前面测试可能改过）
  s14.done = false;
  // 二态循环：false → true → false
  check('初始为未完成（false）', s14.done === false);
  T.cycleDone('A', 0, 0);
  check('第一次点击 → 完成', s14.done === true);
  T.cycleDone('A', 0, 0);
  check('第二次点击 → 未完成', s14.done === false);
  // 组导航
  const pos0 = T.curPos;
  T.nextPos('A');
  check('nextPos 前进', T.curPos === pos0 + 1);
  T.prevPos('A');
  check('prevPos 回退', T.curPos === pos0);
  // 动作级备注
  it14[0].note = '今天状态一般';
  check('动作级备注可存', it14[0].note === '今天状态一般');

  console.log('== 14b. 快速点击与休息归属（v0.9.1） ==');
  T.resetRest();
  T.switchDay('A'); T.switchView('today');
  T.state.logs = [];                     // 清空日志，避免前序用例完成组干扰渲染位置
  T.state.sessions.A = null;
  T.render();
  T.getItems('A')[0].sets[0].done = false;
  T.curPos = 0;
  T.render();
  const it14b = T.getItems('A');
  clickExList(doneBtnFromDOM(0, 0));
  check('点击完成按钮 → 当前组完成', it14b[0].sets[0].done === true);
  check('点击后未跳到下一组', T.curPos === 0);
  check('休息归属指向被确认的组', T.restForPos && T.restForPos.exIdx === 0 && T.restForPos.setIdx === 0);
  it14b[0].sets[0].done = true;
  clickExList(doneBtnFromDOM(0, 0));
  check('紧接的第二次点击不被吞（故意的快速撤销立即生效）', it14b[0].sets[0].done === false);
  clickExList(doneBtnFromDOM(0, 0));
  check('再次点击重新完成该组', it14b[0].sets[0].done === true);
  T.resetRest();

  console.log('== 14c. 跳过休息与手动切组（v0.9.1 修复） ==');
  T.resetRest();
  T.switchDay('A'); T.switchView('today');
  T.state.settings.restSec = 90;         // 前面的用例可能改过休息时长，确保计时开启
  T.state.logs = [];                     // 清空日志，避免前序用例注入的完成组干扰
  T.state.sessions.A = null;             // 结束进行中的会话
  T.clearDraft('A');                     // 清空 A 日草稿（内存态）
  T.render();
  const it14c = T.getItems('A');
  it14c[0].sets[0].done = false;
  advanceClock(1000);                    // 让上一轮的计时状态过期
  T.curPos = 0;
  clickExList(doneBtnFromDOM(0, 0));     // 确认第 1 组 → 自动开始休息，停在第 1 组
  check('确认组后休息计时启动', T.restEndsAt !== null);
  check('确认组后停留在该组等待休息', T.curPos === 0);
  clickExList(navBtn('next'));           // 用户手动切到下一组
  check('手动切组前进', T.curPos === 1);
  T.skipRest();                          // 再点休息条「跳过」→ 再前进一组（跳过=开始下一组）
  check('已手动切组后跳过 → 再前进一组', T.curPos === 2);
  T.resetRest();
  T.state.sessions.A.items.forEach(it => it.sets.forEach(s => { s.done = false; }));
  T.curPos = 0;
  T.render();
  const it14c2 = T.getItems('A');
  advanceClock(1000);
  it14c2[0].sets[0].done = false;        // 上一轮点击把该组标记为完成，先复位
  T.curPos = 0;
  clickExList(doneBtnFromDOM(0, 0));
  check('确认组休息已启动', T.restEndsAt !== null);
  T.skipRest();                          // 仍停在确认组时点跳过 → 前进一组
  check('仍停在确认组时跳过 → 前进一组', T.curPos === 1);
  T.resetRest();

  console.log('== 14d. 热身组独立休息时长（v0.9.1 新增） ==');
  T.resetRest();
  T.state.settings.restSec = 90;
  T.state.settings.warmupRestSec = 30;
  // 找到含热身组的动作（goblet_squat：warmup,work,work），直接走函数层
  const warmIdx = T.state.program.A.findIndex(it => it.sets.some(s => s.type === 'warmup'));
  check('设置已写入（warm=' + T.state.settings.warmupRestSec + ' work=' + T.state.settings.restSec + '）', T.state.settings.warmupRestSec === 30 && T.state.settings.restSec === 90);
  T.state.sessions.A = { startedAt: 0, items: T.getItems('A'), condition: null };
  check('热身组类型确为 warmup（type=' + T.state.sessions.A.items[warmIdx].sets[0].type + '）', T.state.sessions.A.items[warmIdx].sets[0].type === 'warmup');
  T.state.sessions.A.items[warmIdx].sets[0].done = false;
  T.state.sessions.A.items[warmIdx].sets[1].done = false;
  T.cycleDone('A', warmIdx, 0);          // 确认热身组
  check('热身组休息时长 = warmupRestSec（starts=' + T.restStartsAt + ' ends=' + T.restEndsAt + '）', T.restEndsAt - T.restStartsAt === 30000);
  T.resetRest();
  T.cycleDone('A', warmIdx, 1);          // 确认正式组
  check('正式组休息时长 = restSec（90s）', T.restEndsAt - T.restStartsAt === 90000);
  // 诊断：startRestTimer 在调用方未传位置时会回退到 flatPos(curPos)，
// 这里显式传入热身组位置，观察它是否按 warmupRestSec 启动
  T.resetRest();
  T.startRestTimer({ exIdx: warmIdx, setIdx: 0 });
  check('显式传热身组位置 → 30s（ends-starts=' + (T.restEndsAt - T.restStartsAt) + '）', T.restEndsAt - T.restStartsAt === 30000);
  T.resetRest();
  T.startRestTimer({ exIdx: warmIdx, setIdx: 1 });
  check('显式传正式组位置 → 90s', T.restEndsAt - T.restStartsAt === 90000);
  T.resetRest();
  check('tablist + 三个 tab 角色', (html.match(/role="tab"/g) || []).length === 3 && html.includes('role="tablist"'));
  check('tab 有 aria-controls/aria-selected', (html.match(/aria-controls="view-/g) || []).length === 3
    && (html.match(/aria-selected=/g) || []).length >= 3);
  check('三个视图都是 tabpanel', (html.match(/role="tabpanel"/g) || []).length === 3);
  check('日期按钮有 aria-pressed', html.includes('id="day-btn-A" aria-pressed="true"') && html.includes('id="day-btn-B" aria-pressed="false"'));
  check('toast 是 status 实时区域', html.includes('id="toast" role="status" aria-live="polite"'));
  check('总结弹层是 dialog', html.includes('role="dialog"') && html.includes('aria-modal="true"'));
  T.resetRest(); // 清除 section 14 遗留的休息计时
  T.switchDay('A');                      // 后续用例切到 B 日，这里显式切回 A
  T.curPos = 0;  // 复位组位置，使渲染与断言针对同一组
  const fsA = T.fullScreenHTML('A');
  const dotsCur = T.posLabel('A', T.flatPos('A')[T.curPos]).item;
  check('全屏卡片渲染（一次一组）', fsA.includes('fs-card'));
  check('二态完成按钮存在', /fs-done/.test(fsA));
  check('组导航按钮存在', /data-act="prev"/.test(fsA) && /data-act="next"/.test(fsA));
  check('无步进按钮（除 RPE）', !/step-btn/.test(fsA));
  check('完成按钮带 aria-pressed', /aria-pressed="(true|false)"/.test(fsA));
  check('日进度条不在卡片里（v0.9.137 移入页头）', !/fs-progress/.test(fsA));
  // 组进度细条（v0.9.134 替代小圆环）：宽度 = 渲染动作的已完成组数/总组数。
  const renderEx = +fsA.match(/class="fs-done[^"]*" data-ex="(\d+)"/)[1];
  const barM = fsA.match(/class="fs-setbar"[^>]*>\s*<div class="fs-setbar-fill" style="width:(\d+)%"/);
  const dotsItem = T.getItems('A')[renderEx];
  const doneCnt = dotsItem.sets.filter(st => st.done === true).length;
  check('组进度细条存在（' + dotsItem.exerciseId + '）', !!barM);
  check('细条宽度与已完成组数一致（' + doneCnt + '/' + dotsItem.sets.length + '）',
    barM && +barM[1] === Math.round(doneCnt / dotsItem.sets.length * 100));
  T.switchDay('A');
  check('休息窄条不替换内容', !/fs-rest-bar/.test(fsA)); // 无休息时不显示
  T.switchDay('B');
  check('未禁用双指缩放（WCAG 1.4.4）', !/maximum-scale/.test(html));
  T.switchView('history');
  check('切视图同步 aria-selected', elsById.get('tab-history').attrs['aria-selected'] === 'true'
    && elsById.get('tab-today').attrs['aria-selected'] === 'false');
  T.switchDay('B');
  check('切日同步 aria-pressed', elsById.get('day-btn-B').attrs['aria-pressed'] === 'true'
    && elsById.get('day-btn-A').attrs['aria-pressed'] === 'false');

  console.log('== 16. P2 拆分与趋势窗口 ==');
  check('index.html 无内联脚本/样式', !/<script>/.test(html) && !/<style>/.test(html));
  check('index.html 引用外链资源', html.includes('href="css/style.css"') && html.includes('src="js/app.js"'));
  check('app.js 用 defer 加载', html.includes('<script src="js/app.js" defer>'));
  check('TREND_WINDOW 常量存在', T.TREND_WINDOW === 12);
  check('导出含 trendsSpan', typeof T.buildExport(2).trendsSpan === 'number');

  // 趋势窗口 > 导出窗口：n=2 时仍能看到完整历史的方向；「涨上去后停滞」不再误判为 up
  const mkTrendLog = (date, w) => ({
    date, day: 'A', startedAt: 0, endedAt: 0, durationSec: 3000,
    exercises: [{ exerciseId: 'goblet_squat', sets: [{ weight: w, reps: 8, duration: null, rpe: 8, done: true }] }]
  });
  T.state.logs.length = 0;
  [10, 12.5, 15, 15, 15, 15].forEach((w, i) => T.state.logs.push(mkTrendLog(`2026-03-0${i + 1}`, w)));
  const wide = T.buildExport(2);
  check('n=2 时 recentLogs 仍只有 2 条', wide.recentLogs.length === 2);
  check('趋势回看全部 6 次', wide.trendsSpan === 6 && wide.trends.goblet_squat.sessions.length === 6);
  T.state.logs.length = 0;
  [10, 12.5, 15, 17.5, 20, 22.5].forEach((w, i) => T.state.logs.push(mkTrendLog(`2026-03-0${i + 1}`, w)));
  check('持续上涨判定 up', T.buildExport(2).trends.goblet_squat.direction === 'up');
  T.state.logs.length = 0;
  [15, 15, 15, 15, 15, 15].forEach((w, i) => T.state.logs.push(mkTrendLog(`2026-04-0${i + 1}`, w)));
  check('完全停滞判定 plateau', T.buildExport(2).trends.goblet_squat.direction === 'plateau');
  T.state.logs.length = 0;
  [15, 15, 15, 14, 13, 12].forEach((w, i) => T.state.logs.push(mkTrendLog(`2026-05-0${i + 1}`, w)));
  check('持续下降判定 down', T.buildExport(2).trends.goblet_squat.direction === 'down');

  console.log('== 17. P2 lastValues 跳过热身组 ==');
  T.state.logs.length = 0;
  T.state.logs.push({
    date: '2026-06-01', day: 'A', startedAt: 0, endedAt: 0, durationSec: 3000,
    exercises: [{ exerciseId: 'goblet_squat', sets: [
      { weight: 5.35, reps: 10, duration: null, rpe: null, done: true, type: 'warmup' },
      { weight: 15, reps: 8, duration: null, rpe: 8, done: true, type: 'work' },
      { weight: 12.5, reps: 8, duration: null, rpe: 8, done: true, type: 'work' },
      { weight: 99, reps: 1, duration: null, rpe: null, done: false, type: 'work' }
    ] }]
  });
  const lv = T.lastValues('goblet_squat');
  check('取正式组最重值而非热身组', lv.weight === 15 && lv.reps === 8);
  check('忽略未完成组', lv.weight !== 99);

H.C.before = before;   // 原单文件同处一个闭包，后面的段会复用这个值
H.C.manifest = manifest;   // 原单文件同处一个闭包，后面的段会复用这个值
H.C.sw = sw;   // 原单文件同处一个闭包，后面的段会复用这个值
};
