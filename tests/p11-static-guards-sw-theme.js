// Iron Log 逻辑测试 · 第 11 段（共 13 段）：§155–§172 步进上限 / 休息时长钳位 / 弹层限高 / 重复导入差异 / 移动端输入静态守卫 / round2 / export-n / SHELL 幽灵路径 / 剪贴板不可用 / 主题色一致 / 背景未填先问 / SW 更新路径 / 空名称 / 抽屉滚动 / 提示条 / 趋势零值 / maxlength 成对 / 小节编号自检
// 本段由一次性脚本从 test-ironlog.js 机械拆出：断言与夹具逐字未改，只加了下面的壳。
// 跑法：npm test（= node tests/run.js）。各段共用同一个 app 实例、状态连续流动，必须按序跑，不能单独跑某一段。
const H = require('./harness.js');

module.exports = async function () {
const { fs, path, T, check, html, script, PT, makeClassList, makeEl, clickExList, btnOf, clickEl, doneBtn, navBtn, doneBtnFromDOM, htmlTouchedHTML, textOf, runTimers, advanceClock, touchedIds, missingIds, elsById, handlers, docHandlers, windowHandlers, timers, historyStub } = H;
const __dirname = H.ROOT;
const { manifest, sw, p, card, mk } = H.C;   // 上段产生的共享变量
  console.log('== 155. ± 步进上限与手输同规矩（1e6）（v0.9.120）==');
  T.state.exercises.test155 = { ...mk('测试深蹲155', 'weight'), unit: 'kg' };
  T.state.program.A = [{ section: '', exerciseId: 'test155', repsRange: '', sets: [{ type: 'work', weight: 999999, reps: 10, duration: 999999, rpe: null, rpeLabel: '', side: null }] }];
  delete T.state.drafts.A; delete T.state.sessions.A; T.state.settings.lastDay = 'A'; T.curPos = 0;
  T.state.settings.weightStep = 2.5;
  T.render();
  clickExList(btnOf({ act: 'step', ex: 0, set: 0, f: 'weight', dir: 1 }));
  check('重量步进越界钳到 1e6（不会存出 migrate 会清成 null 的值）', T.getItems('A')[0].sets[0].weight === 1e6);
  clickExList(btnOf({ act: 'step', ex: 0, set: 0, f: 'duration', dir: 1 }));
  check('时长步进越界钳到 1e6', T.getItems('A')[0].sets[0].duration === 1e6);
  delete T.state.exercises.test155; delete T.state.drafts.A; delete T.state.sessions.A;

  console.log('== 156. 休息时长设置输入的钳位与写回（测试加固，无应用改动）==');
  // rest-sec/warmup-rest-sec 的 change 处理器此前只被 migrate 侧（§110）覆盖，
  // 设置页这条「纠正后写回输入框」的同款路径（js/app.js:2402-2415）没有直接测过。
  {
    const hRs = handlers.get('rest-sec|change');
    const hWr = handlers.get('warmup-rest-sec|change');
    const r0 = T.state.settings.restSec, w0 = T.state.settings.warmupRestSec;
    const t156 = { value: '5000' }; hRs({ target: t156 });
    check('156 休息秒数封顶 1800 并写回输入框', T.state.settings.restSec === 1800 && t156.value === 1800);
    const t156b = { value: 'abc' }; hRs({ target: t156b });
    check('156 非法休息秒数回默认 90', T.state.settings.restSec === 90 && t156b.value === 90);
    const t156c = { value: '0' }; hRs({ target: t156c });
    check('156 0 是合法的关闭值，不被纠正为默认', T.state.settings.restSec === 0 && t156c.value === 0);
    const t156d = { value: '-5' }; hWr({ target: t156d });
    check('156 负热身休息回默认 30', T.state.settings.warmupRestSec === 30 && t156d.value === 30);
    T.state.settings.restSec = r0; T.state.settings.warmupRestSec = w0;
  }

  console.log('== 157. 弹层卡片限高内滚，长 desc 不顶走按钮（v0.9.121）==');
  // 导入确认会把整份方案差异列在 desc 里，22 个动作的方案能把「取消/导入」按钮顶出屏幕外。
  {
    const css157 = require('fs').readFileSync('css/style.css', 'utf8');
    const card157 = css157.match(/\.summary-card\{[^}]*\}/);
    check('157 .summary-card 有 max-height 与 overflow-y:auto', !!card157 && card157[0].includes('max-height:calc(100dvh - 48px)') && card157[0].includes('overflow-y:auto'));
  }

  console.log('== 158. 同方案重复导入的差异说明不为空、不误报增删（测试加固，无应用改动）==');
  // 用户把 AI 原样返回的方案再贴一遍：desc 必须仍给出「N → N 个动作」的如实计数（确认框不会空白），
  // 且不得出现「移除/新增/目标改为」的假改动。
  {
    const ex158 = { test158a: { name: '动作甲', mode: 'weight', unit: 'kg' }, test158b: { name: '动作乙', mode: 'bodyweight' } };
    const it158 = [{ section: '', exerciseId: 'test158a', repsRange: '8-12', sets: [{ type: 'work', weight: 50, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null }] },
      { section: '', exerciseId: 'test158b', repsRange: '', sets: [{ type: 'work', weight: null, reps: 15, duration: null, rpe: null, rpeLabel: '', side: null }] }];
    const saveP = T.state.program, saveE = T.state.exercises;
    T.state.program = { A: JSON.parse(JSON.stringify(it158)), B: [] };
    T.state.exercises = JSON.parse(JSON.stringify(ex158));
    const diff158 = T.planDiffText({ program: { A: JSON.parse(JSON.stringify(it158)) }, exercises: ex158 });
    check('158 同方案仍给出如实计数行', diff158.includes('A 日 2 → 2 个动作') && diff158.includes('动作库共 2 项'));
    check('158 不出现假增删', !diff158.includes('移除') && !diff158.includes('新增') && !diff158.includes('目标改为'));
    T.state.program = saveP; T.state.exercises = saveE;
  }

  console.log('== 159. 移动端输入静态守卫（测试加固，无应用改动）==');
  // ± 按钮防双击缩放、viewport 保留捏合缩放、数字输入唤起正确的手机键盘——都是移动端体验的地基。
  {
    const css159 = require('fs').readFileSync('css/style.css', 'utf8');
    check('159 按钮有 touch-action:manipulation（禁双击缩放）', /button\{[^}]*touch-action:manipulation/.test(css159));
    check('159 viewport 不禁用捏合缩放', !/user-scalable=no|maximum-scale/.test(html));
    check('159 数字输入带 inputmode（decimal/numeric）', /inputmode="decimal"/.test(script) && /inputmode="numeric"/.test(script));
  }

  console.log('== 160. ± 步进用 round2 消浮点误差（测试加固，无应用改动）==');
  // 步进 1.23 连点三次：裸加法是 3.6899999999999995，会被写进输入框和存档。
  {
    T.state.exercises.test160 = { ...mk('测试卧推160', 'weight'), unit: 'kg' };
    T.state.program.A = [{ section: '', exerciseId: 'test160', repsRange: '', sets: [{ type: 'work', weight: 0, reps: 10, duration: null, rpe: null, rpeLabel: '', side: null }] }];
    delete T.state.drafts.A; delete T.state.sessions.A; T.state.settings.lastDay = 'A'; T.curPos = 0;
    T.state.settings.weightStep = 1.23;
    T.render();
    for(let i = 0; i < 3; i++) clickExList(btnOf({ act: 'step', ex: 0, set: 0, f: 'weight', dir: 1 }));
    check('160 连点步进不积累浮点误差（1.23×3 = 3.69）', T.getItems('A')[0].sets[0].weight === 3.69);
    T.state.settings.weightStep = 2.5;
    delete T.state.exercises.test160; delete T.state.drafts.A; delete T.state.sessions.A;
  }

  console.log('== 161. export-n 条数与非法值回退（测试加固，无应用改动）==');
  // 导出条数来自 #export-n（js/app.js:2237 parseInt||4），此前从未被行为测试覆盖。
  // 注意：末尾作用域的 navigator 已被后续剪贴板测试换过多次（没有 clipboard），必须自带桩并成对还原。
  {
    const saveLogs = T.state.logs;
    const nav161prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { clipboard: { writeText: async t => { globalThis.copied = t; } } } });
    globalThis.copied = null;
    T.state.logs = Array.from({ length: 6 }, (_, i) => ({ date: '2024-01-0' + (i + 1), day: 'A', startedAt: 1700000000000 + i * 86400000, duration: 60, volume: 0, setsDone: 1, restTotalSec: null, exercises: [], condition: null, note: '' }));
    const sel161 = document.getElementById('export-n');
    sel161.value = '2';
    await T.runExport(false);
    check('161 export-n=2 只导出 2 条日志', globalThis.copied && JSON.parse(globalThis.copied).recentLogs.length === 2);
    sel161.value = 'oops';
    await T.runExport(false);
    check('161 非法条数回退 4', globalThis.copied && JSON.parse(globalThis.copied).recentLogs.length === 4);
    check('161 导出提示如实报告条数', String(document.getElementById('export-msg').textContent).includes('最近 4 次日志'));
    T.state.logs = saveLogs;
    if(nav161prev) Object.defineProperty(globalThis, 'navigator', nav161prev); else delete globalThis.navigator;
  }

  console.log('== 162. SHELL 里没有幽灵路径（测试加固，无应用改动）==');
  // sw.js install 用 caches.addAll(SHELL)：任何一条 404 都会让 install 直接失败、新版本永远装不上。
  // 已有断言保证 SHELL ⊇ 页面/manifest 引用，这里反向钉 SHELL ⊆ 磁盘上真实存在的文件。
  {
    const sw162 = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
    const entries = [...sw162.matchAll(/'(\.\/[^']*)'/g)].map(m => m[1]);
    check('162 能解析出 SHELL 清单', entries.length >= 9);
    check('162 SHELL 每一条都存在于磁盘', entries.every(p => {
      const rel = p === './' ? '.' : p.slice(2);
      return fs.existsSync(path.join(__dirname, rel));
    }));
    check('162 离线回退依赖的 ./index.html 在 SHELL 里', entries.includes('./index.html'));
  }
  console.log('== 163. 剪贴板不可用时导出文本仍完整可见（测试加固，无应用改动）==');
  // copyText 的两级回退（js/app.js:2154-2170）：clipboard API → execCommand → 手动全选。
  // 不变量：无论复制成败，#export-text 必须完整包含待复制文本，且提示引导手动复制。
  {
    const saveLogs163 = T.state.logs;
    const nav163prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { } }); // 无 clipboard，execCommand 也未定义
    T.state.logs = [{ date: '2024-02-01', day: 'A', startedAt: 1706745600000, duration: 60, volume: 100, setsDone: 1, restTotalSec: null, exercises: [], condition: null, note: '' }];
    document.getElementById('export-n').value = '4';
    await T.runExport(false);
    const ta163 = document.getElementById('export-text');
    let parsed163 = null;
    try{ parsed163 = JSON.parse(ta163.value); }catch(e){}
    check('163 复制失败时 textarea 仍完整包含导出 JSON', parsed163 && parsed163.recentLogs.length === 1);
    check('163 复制失败提示引导手动全选', String(document.getElementById('export-msg').textContent).includes('手动全选'));
    T.state.logs = saveLogs163;
    if(nav163prev) Object.defineProperty(globalThis, 'navigator', nav163prev); else delete globalThis.navigator;
  }
  console.log('== 164. 启动屏/状态栏/浏览器壳颜色一致（测试加固，无应用改动）==');
  // §150 钉过 meta theme-color == --bg；这里补齐 manifest 的两个颜色字段：
  // background_color 决定 PWA 启动屏底色，theme_color 决定状态栏——改一处忘另一处会闪色差。
  {
    const man164 = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.webmanifest'), 'utf8'));
    const css164 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const bg164 = (css164.match(/--bg:\s*(#[0-9a-fA-F]{6})/) || [])[1];
    check('164 manifest background_color 与 --bg 一致', !!bg164 && String(man164.background_color).toLowerCase() === bg164.toLowerCase());
    check('164 manifest theme_color 与 --bg 一致', !!bg164 && String(man164.theme_color).toLowerCase() === bg164.toLowerCase());
  }
  console.log('== 165. 训练背景未填写时提示词要求 AI 先问（测试加固，无应用改动）==');
  // buildPrompt 对空背景输出「（未填写背景，请先问我）」（js/app.js:2214）——
  // 这是让 AI 先问身高体重/器械范围而不是瞎猜的关键指令，此前没有防线。
  {
    const saveBg165 = T.state.profile.background;
    T.state.profile.background = '';
    check('165 背景为空时提示词明说未填写、请先问', T.buildPrompt(T.buildExport(4)).includes('未填写背景，请先问我'));
    T.state.profile.background = '体态问题：圆肩';
    check('165 背景已填写时原文进入提示词', T.buildPrompt(T.buildExport(4)).includes('体态问题：圆肩'));
    T.state.profile.background = saveBg165;
  }
  console.log('== 166. SW 更新路径三要素齐备（测试加固，无应用改动）==');
  // activate 必须删除非当前版本的旧缓存：caches.match 按创建顺序取首个命中，
  // 旧缓存若不清理，离线回退可能返回最老那份 index.html，且存储随版本无限膨胀。
  // skipWaiting + clients.claim 保证新版本不必「重启两次」才接管。
  {
    const sw166 = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
    check('166 activate 删除非当前版本的旧缓存', /keys\.filter\(k => k !== CACHE\)/.test(sw166) && /caches\.delete\(k\)/.test(sw166));
    check('166 install 有 skipWaiting、activate 有 claim', /skipWaiting\(\)/.test(sw166) && /clients\.claim\(\)/.test(sw166));
  }
  console.log('== 167. 导入空名称不抹掉旧名，无名新动作以 id 显示（测试加固，无应用改动）==');
  // applyPlan:1875 的兜底链是 ex.name || old.name || id——AI 写了 name:"" 时
  // 简单合并会把用户认识的动作名清空；这条回退此前只有实现、没有防线。
  {
    const exA167 = { name: '高脚杯深蹲', mode: 'weight', unit: 'kg', tips: '', personal: '膝盖注意' };
    T.state.exercises = { goblet_squat: JSON.parse(JSON.stringify(exA167)) };
    T.state.program = { A: [{ exerciseId: 'goblet_squat', sets: [{ reps: 5, weight: 10 }] }], B: [] };
    T.state.sessions = { A: null, B: null };
    const p167 = {
      exercises: { goblet_squat: { name: '', tips: '新提示' }, ghost_ex167: { mode: 'bodyweight' } },
      program: { A: [{ exerciseId: 'goblet_squat', sets: [{ reps: 5, weight: 10 }] }, { exerciseId: 'ghost_ex167', sets: [{ reps: 8 }] }] }
    };
    const r167 = T.importPlan(JSON.stringify(p167));
    check('167 空名称保留旧名', r167.ok && T.state.exercises.goblet_squat.name === '高脚杯深蹲');
    check('167 合并语义其余字段照常生效', T.state.exercises.goblet_squat.tips === '新提示' && T.state.exercises.goblet_squat.personal === '膝盖注意');
    check('167 无名称的新动作以 id 兜底', T.state.exercises.ghost_ex167.name === 'ghost_ex167');
  }
  console.log('== 168. 抽屉内容超高时可滚动（v0.9.122）==');
  {
    const css168 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    const drawer = (css168.match(/\.drawer\{([^}]*)\}/) || ['', ''])[1];
    check('168 .drawer 声明了 overflow-y:auto', /overflow-y:auto/.test(drawer));
  }
  console.log('== 169. 提示条只在带按钮时接收点击（测试加固，无应用改动）==');
  // CSS：.toast 默认 pointer-events:none、.toast.with-act 才 auto（css/style.css:316/321）；
  // JS 侧 add/remove('with-act') 与之配对（js/app.js:405/415/422/425）。
  // 若失配：普通提示会挡住屏幕底部中央的按钮（那里正是 ± 步进区），或撤销按钮点不动。
  {
    const css169 = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
    check('169 .toast 默认 pointer-events:none', /\.toast\{[^}]*pointer-events:none/.test(css169));
    check('169 .toast.with-act 恢复 pointer-events:auto', /\.toast\.with-act\{pointer-events:auto\}/.test(css169));
    const t169 = document.getElementById('toast');
    T.toast('带撤销169', () => {});
    check('169 带操作的提示有 with-act 与撤销按钮', t169.classList.contains('with-act') && /data-act="undo"/.test(t169.innerHTML));
    advanceClock(7000); runTimers();
    check('169 过期后 with-act/show 一并清掉', !t169.classList.contains('with-act') && !t169.classList.contains('show'));
    T.toast('普通提示169');
    check('169 普通提示不带 with-act、只写文案', !t169.classList.contains('with-act') && t169.textContent === '普通提示169');
  }
  console.log('== 170. 趋势图全平值/零值不产生 NaN（测试加固，无应用改动）==');
  // yRange=(yMax-yMin)||1、yMax=(hi*1.06)||1 两个兜底此前只靠人工推演：
  // 两次同重量（lo=hi）与全零值是最容易翻车的两个输入，钉住。
  {
    T.state.exercises = {}; T.state.program = { A: [], B: [] };
    T.state.exercises.e170 = { name: '平线动作170', mode: 'weight', unit: 'kg' };
    const log170 = n => ({ date: `2026-04-0${n}`, day: 'A', startedAt: n, exercises: [
      { exerciseId: 'e170', sets: [{ weight: 60, reps: 8, done: true }] }] });
    const ch170 = T.buildTrendCharts(T.buildTrends([log170(1), log170(2)]), 5);
    check('170 两次同重量：图里没有任何 NaN', !/NaN/.test(ch170));
    check('170 平线仍画出两点折线与末点圆', /<polyline points="[\d., -]+"/.test(ch170) && /<circle cx=/.test(ch170));
    T.state.exercises.e170z = { name: '零值动作170', mode: 'weight', unit: 'kg' };
    const log170z = n => ({ date: `2026-04-0${n}`, day: 'A', startedAt: n, exercises: [
      { exerciseId: 'e170z', sets: [{ weight: 0, reps: 5, done: true }] }] });
    const chz = T.buildTrendCharts(T.buildTrends([log170z(1), log170z(2)]), 5);
    check('170 全零值也不产生 NaN', !/NaN/.test(chz));
  }
  console.log('== 171. 每个自由文本输入框的 maxlength 与 JS 封顶成对（测试加固，无应用改动）==');
  // 只改一边会悄悄丢字：maxlength 拦不住导入，JS slice 又会让输入框里的超长内容失焦即蒸发。
  // 四处配对：restNote 200 / profile 2000 / personal 500 / 动作备注 500。
  {
    const html171 = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const app171 = fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf8');
    check('171 rest-note 输入框 maxlength=200 与 slice(0,200) 成对',
      /id="rest-note"[^>]*maxlength="200"/.test(html171) && /settings\.restNote = e\.target\.value\.trim\(\)\.slice\(0, 200\)/.test(app171));
    check('171 profile-bg maxlength=2000 与 slice(0,2000) 成对',
      /id="profile-bg"[^>]*maxlength="2000"/.test(html171) && /profile\.background = e\.target\.value\.slice\(0, 2000\)/.test(app171));
    check('171 personal-note maxlength=500 与 slice(0,500) 成对',
      /id="personal-note"[^>]*maxlength="500"/.test(html171) && /exercises\[personalExId\]\.personal = e\.target\.value\.trim\(\)\.slice\(0, 500\)/.test(app171));
    check('171 fs-exnote maxlength=500 与 slice(0,500) 成对',
      /class="fs-exnote" maxlength="500"/.test(app171) && /item\.note = inp\.value\.trim\(\)\.slice\(0, 500\)/.test(app171));
  }
  console.log('== 172. 测试小节编号严格递增（测试自检，无应用改动）==');
  // 编号重复/回绕会让「§N」引用失去指向（历史上真出现过写错的提交信息）。
  // 允许跳号（历史小节删除过），不允许重复或倒退。
  {
    const self172 = fs.readdirSync(path.join(__dirname, 'tests')).filter(f => /^p\d\d-.+\.js$/.test(f)).sort()
      .map(f => fs.readFileSync(path.join(__dirname, 'tests', f), 'utf8')).join('\n');
    const nums = [...self172.matchAll(/console\.log\(['"`]== (\d+)\./g)].map(m => Number(m[1]));
    check('172 小节编号无重复且严格递增', nums.length > 100 && nums.every((n, i) => i === 0 || n > nums[i - 1]));
    check('172 最后一个编号就是本节', nums[nums.length - 1] === 205);
  }
};
