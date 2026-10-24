# 给 AI 的项目说明（Iron Log）

纯前端力量训练记录 PWA，部署在 GitHub Pages。
本仓库的判断标准只有两条：**① 本地 AI 能安全改好它（改完能自己发现改坏了）；② Pages 免费、快速发布。**
「零构建 / 零依赖」和「体积不超过 1GB」这两条限制已于 2026-10-08 移除——不追求仓库形态像不像常见的工程，也不按"纯前端"教条做决定。要引入框架或第三方库，先说清它替这个项目省下哪段手写代码；说不清就不引。

## 改完之后必须跑（本地闸门，全绿才算改完）

```bash
npm run typecheck        # tsc --noEmit：JSDoc 类型闸门，不产出文件
npm test                 # 逻辑测试：tests/run.js 按序执行 tests/p01…p13-*.js（自建 DOM 桩直接加载 js/app.js）
node tools/visual-check.js 390   # 真实浏览器闸门：A 水平溢出 + B 可点目标 ≥44px + C 真实 click（data-action 与卡片上的 data-act）+ D 文本对比度（正文 4.5:1、大字 3:1）与键盘焦点可见；每个状态与两个模态都在深色/浅色下各跑一遍
```

三条都通过再报告"改好了"。测试失败要贴出失败行，不要口头保证。
`visual-check` 的退出码：**0** 全过；**1** 任一检查失败（逐条列出状态与元素，截图在 `.visual/`）；**2** 浏览器或 CDP 不可用——那是工具没跑成，不能算通过。它找的是本机 Edge/Chrome，找不到时设 `CHROME_PATH`（CI 用 ubuntu 镜像自带的 Chrome，无需设）。改布局、改控件、改点击接线都要跑它。

## 版本与部署（只有一个版本源）

- `js/app.js:145` 的 `APP_VERSION` 是唯一来源（页头徽章、「关于」卡片都从它渲染）。改版本要同步四处：`package.json` 的 `version`、`index.html` 里对 `css/style.css` 与 `js/app.js` 的 `?v=`、`sw.js` 的 `CACHE` 与 `SHELL` 里的 `?v=`。测试会校验它们一致（§13、§209）。
- CI 的 "Stamp asset versions"（`.github/workflows/deploy.yml`）用 `APP_VERSION` 改写 `dist/sw.js` 的 `CACHE` 与 `dist/index.html`/`dist/sw.js` 里的 `?v=`——发出去的产物不可能错版，但仓库里漏改会被测试拦下，别指望 CI 兜。`?v=` 防的是这个真实故障：`sw.js` 让导航走网络、资源走缓存，部署后第一次打开可能是「新 index.html + 旧 app.js」，那次访问点什么都没反应，而 §143 的静态对齐测不到它。所以 `index.html` 里的资源引用**必须带 `?v=`**，并与 `sw.js` 的 `SHELL` 逐字一致（缓存键含查询串，两边不一致预缓存就命不中，离线打不开外壳）。
- 推送 `main` → CI（Node 22，`visual-check` 要用 Node 的全局 `WebSocket`/`fetch`，别退回 20）依次跑 `npm ci` → typecheck → 测试 → **真实浏览器闸门** → 复制静态文件上 Pages。PR 跑前三项加浏览器闸门，不部署；浏览器闸门失败时会把 `.visual/` 截图作为 artifact 留下。

## 不能破坏的约定（违反了会被测试或 CI 拦下）

- `index.html` 不得内联 `<script>` / `<style>`；样式在 `css/style.css`，逻辑在 `js/app.js`。
- **不得写内联 `on*="fn()"` 处理器**（v0.9.145 起）。可点的动作一律写 `data-action="名字"`，并在 `js/app.js:646` 的 `ACTIONS` 表里登记——表里每一项都是真引用，改名/改签名/少传参数会被 tsc 接住；内联字符串在类型检查之外，改名只会静默失效（点了没反应）。派发靠 `js/app.js:670` 那个**唯一**的 document 级 click 监听（它同时负责动作派发与抽屉兜底，别再加第二个）。带参数的动作从 `data-*` 取值后先收窄类型再用。守这条的是 §143（名字双向对齐：页面上有的必须在表里、表里有的必须在页面上）与 §206（向真实注册的监听器派发一次点击，验派发真的通）。
- **训练卡片上的按钮走另一条链**：`data-act="名字"` + `js/app.js:1257` 的 `exClick`。v0.9.147 起 `exClick` 只做派发，处理器按「需要多少上下文」分三张表登记：`EX_NAV_ACTS`（`:1285`，只要 day）、`EX_ITEM_ACTS`（`:1288`，要 item）、`EX_SET_ACTS`（`:1291`，要某一组）。加新按钮 = 写一个具名处理器 + 在对应那张表里加一行；**不要在 `exClick` 里加 `if(act === …)`**，也不要让同一个 act 出现在两张表里（前一层会永久挡住后一层，§207 拦这个）。层与层之间的「拿不到 item/set 就静默返回」是原语义，别删。守这条的是 §131（页面发射的 act 与三张表互相覆盖）、§207（不重名 + 三层各真跑一遍）、以及 `visual-check` 的 C 项（真浏览器里点「+」「加一组」「完成这组」并核对结果）。
- **`js/app.js` 必须保持单个经典脚本**（不能用 `import`/`export`）。测试是用 `(0, eval)(源码)` 加载它的（`tests/harness.js:180`），改成 ES 模块会让整套测试失效。要拆文件，先改测试的加载方式，再拆。
- 测试通过 `globalThis.__T`（`tests/harness.js:133-179`）访问 app 内部函数。新增/改名内部函数时，同步维护这个桥接。
- 测试分段是**顺序执行、共享同一个 app 实例**的：`tests/run.js` 按文件名顺序跑，段与段之间状态连续（后面很多段依赖前面导入的计划与日志）。所以不能只跑某一段，也不能打乱顺序；跨段复用的变量走 `H.C`（在出生段末尾发布、使用段开头取用）。
- 外部数据（localStorage、AI 导入的 JSON、DOM 取值）进来是 `any`，必须经 `migrate()` / `normalizeItem()` / `normalizeSet()` / `coerceSetNums()` 归一化后才进 `state`（parse, don't validate）。
- 数据四层不混存：`logs` / `exercises` / `program` / `sessions`（另有 `drafts`/`rest`/`timer`）。**改数据结构时先改 `js/app.js:13-142` 的 JSDoc typedef**，让 tsc 把所有串线的地方找出来。
- 类型闸门已开满（`tsconfig.json` 里不再有 `noImplicitAny: false`，v0.9.144 起）：新写的函数与回调必须自带 JSDoc 参数类型，别把开关改回去。数据形状一律用顶部 typedef；DOM 事件对象按仓库约定标 `any`（不建模 DOM 类型，见 `js/app.js:487` 的注释）。A/B 两日的循环一律用 `DAYS` 常量（`js/app.js:147`），不要写 `['A','B']` 字面量——那会把 `day` 摊成 `string`，`state.sessions[day]` 一类下标就落到类型之外。
- 导出给 AI 的 prompt 与 `PLAN_SCHEMA` 是单一来源（`js/app.js:2592`，由 `buildPrompt()` 插值）。不要在别处复制 schema 文本——两处不一致会让"导出的东西导不回来"。
- 导入 AI 方案时必须保留 `exercises[].personal`（用户手写的个人注意）。这条有测试守着。
- 移动端优先：可点元素触达高度 ≥44px；390px 视口不得出现水平溢出。这两类问题**逻辑测试测不出来**，历史上真出过三次（v0.9.134/135/136）。v0.9.146 起由 `visual-check` 的 A/B 项逐状态审计并进 CI；触达下限写在 `css/style.css:21` 的基础规则上（`button,input,select,textarea,summary{min-height:44px}`），图标按钮另设 44×44（`.hamburger`、`.drawer-close`）——**别再往单个控件上补 `min-height`**，那会让规则两处不一致。
- **白字实底按钮一律用 `-fill` 那一档**（v0.9.151）：`--accent-fill`/`--green-fill`/`--red-fill` 是专门给「白字压色块」用的深色档（白字压它们 4.88/5.34/5.30:1）。`--accent`/`--green`/`--red` 只作文字色、边框、进度条——白字压它们只有 3.22/2.51/3.82:1，而把它们整体调暗会拉低「色作文字」那几处的对比度。占位符同理：颜色只在 `css/style.css` 的基础规则 `input::placeholder,textarea::placeholder` 上写一次，别往单个控件补（和 44px 那条同一个做法）。守这条的是 §210（静态：`-fill` 档对白色必须 ≥4.5:1、不允许「同块白字 + 非 -fill 语义色背景」、placeholder 规则只能有一条）与 `visual-check` 的 D 项（真实浏览器按状态算，含点过「完成这组」之后的卡片）。
- **两套调色板：深色写在 `:root`，浅色写在紧跟其后的 `@media (prefers-color-scheme: light){ :root{…} }` 里**（v0.9.152）。浅色只覆写变量，不改选择器、不加 class、不碰结构——这样两套主题版式必然一致，浅色能保持深色闸门已经挣到的合规。规矩：**任何颜色都从变量取**，规则里不许写死十六进制（`#fff` 除外）；趋势折线的颜色在 CSS 的 `--trend-1…5` 里，`js/app.js` 只发序号（`TREND_VARS`），SVG 里写 `style="stroke:var(--trend-N)"` 或 `currentColor`（表现属性不能用 `var()`）；坐标轴文字靠 `.trend-chart svg{color:var(--muted)}` 给色。带 `media` 的 `theme-color` 必须两条各配那一套的 `--bg`，且不能留下不带 `media` 的那条（它会盖住前两条）。守这条的是 §211（浅色块存在且覆盖深色每一个颜色变量、两套正文 ≥7:1、两套语义色与 `-fill` 达标、趋势色 ≥3:1、调色板外无写死色）、§150（两套 `color-scheme` + 两条 `theme-color`）、§164（manifest 仍钉深色 `--bg`——规范里没有按主题的配色，这不是 bug）。
- **`visual-check` 的 D 项**（v0.9.150 起）：**文本对比度**——在页面里沿祖先链合成真实背景，按 WCAG 相对亮度算，正文 ≥4.5:1、大字 ≥3:1，含 `::placeholder`；**键盘焦点可见**——真按 Tab 走焦点，读 computed `outline`/`box-shadow`（防的是以后有人为了好看写 `outline:none`）。要审的视图清单从页面的 `.view` 里读，不写死名字：之前写死过 `'trends'`，而 `switchView` 只认三个（`js/app.js:692`），那一轮把三个视图的 `active` 全摘掉、只审了个头，却照样全绿。阈值写在 `tools/visual-check.js` 的 `D_TEXT`/`D_LARGE` 上，一处定义。v0.9.152 起每个状态的 A/B/D 都在 **dark/light 两套**下各量一次（`setTheme()` 用 `Emulation.setEmulatedMedia`），截图各留一张；开头有一条 **F 项**钉「浅色主题真的生效」（`matchMedia` 命中且 `--bg` 跟着换）——没有它，媒体条件写错时浅色那一轮量的还是深色却照样全绿。数据桩是**两天**日志：只造一天时历史页永远显示「再练两次」，趋势图的网格、刻度、折线永远不会被审到。**两个模态（训练小结、确认框）各开一轮审计**（v0.9.152，E 项）：按状态审计看不到「只有点过才出现」的界面，上一版修的 `.confirm-ok`、`.summary-card button` 就是因为从没被渲染过而只能靠机制推断。

## 不要读、不要改

- `archive/` —— v1（IronPrompt Pro）的完整归档，已在 `.gitignore` 里，不入库。旧版代码在 git 历史里（至 v1.3.1）。
- `.visual/` —— `tools/visual-check.js` 生成的截图产物，不入库。
- `node_modules/` —— 只有 typescript（类型检查用）。

## 测试的写法

逻辑测试按主题分在 `tests/p01…p13-*.js`，小节编号全局递增（`== 104. …`）；`tests/p11-*.js` 里的 §172 会检查编号不重复、不倒退，并核对「已知最大编号」（它硬编码在 `tests/p11-*.js:250`，加新小节时改这一行）。加新用例：用比现有最大编号更大的新编号——因为编号必须全局递增，**新小节实际只能加在最后一段 `tests/p13-*.js` 的末尾**（往中间段插会让 §172 的递增检查失败；想插在中间只能填历史留下的跳号空档，例如 §139–§154 不存在）。注释里写清**为什么**要测（防的是哪一次真实回归），断言用 `check('中文描述', 条件)`。不要重排已有用例，也不要往 `tests/harness.js` 里加断言（它只放桩与桥接）。新用例若要用别的段产生的变量，走 `H.C`。

## 设计词汇（改结构时用这套词，别换说法）

借自 mattpocock 的 `codebase-design` 词表，落到本仓库的对应物。之所以要统一用词：同一个东西在几段说明里叫不同名字，tsc 找不到串线，人也就找不到。禁用 `component` / `service` / `boundary` / `API`（已被用滥，含义不唯一）。

- **module**：任何有接口和实现的东西，不分大小（一个函数、一张表、一段渲染都算）。
- **interface**：调用方要用对就必须知道的一切——签名之外还有不变量、顺序约束、错误模式、需要的配置。只说"签名"太窄。
- **depth**：接口小、里面装的行为多 = **deep**（好）；接口几乎和实现一样复杂 = **shallow**（坏，是我们要消掉的）。
- **seam**（Michael Feathers）：不用改动这个位置就能换掉行为的地方。seam 放哪儿本身是一个独立决策，和 seam 后面装什么是两件事。本仓库现有的 seam：`js/app.js:646` 的 `ACTIONS` 表、`js/app.js:1285/1288/1291` 三张 act 表（页面发射的动作 ↔ 处理器之间），以及 `tests/harness.js:133-179` 的 `globalThis.__T`（测试 ↔ 内部函数之间）。
- **adapter**：填某个槽的具体实现，说的是角色不是内容（一个小的 Postgres 仓储和一个大的内存假实现都可以是很小的 adapter）。
- **leverage / locality**：深度换来的两样东西——调用方每一单位接口学到更多能力；改动、缺陷、验证集中在一处而不是散在调用点。

判断一次重构值不值，就问它有没有把某个 interface 变窄、或把某个 seam 挪到更该挪的地方。只把代码从一处搬到另一处不算。

## 已知技术债（有意分批处理，不是遗漏）

- ~~`noImplicitAny: false` 的历史豁免~~ 已于 v0.9.144 关闭（316 处隐式 any 全部补上标注）。别把它重新打开。
- ~~`index.html` 里 23 处内联 `onclick`~~ 已于 v0.9.145 收进 `ACTIONS` 表 + 单一 document 级委托（含渲染出来的两个）。做法与守它的测试见上文「不能破坏的约定」。
- ~~`js/app.js` 里 `exClick()` 那条 172 行的 `if(act===…)` 链~~ 已于 v0.9.147 拆成三张 act 表 + 具名处理器（导航 / 动作项 / 单组），并抽出 `navDone`、`setOffsetBefore`、`timerOn` 三个共用小函数（原先「秒表归属哪一日」在三处各写一遍）。做法与守它的测试见上文「不能破坏的约定」。
- ~~`tools/visual-check.js` 只审计布局、不进 CI~~ 已于 v0.9.146 升级：A 溢出 + B 触达 ≥44px + C 真实 click 链路，支持 Linux Chrome / `CHROME_PATH`，已作为 CI 步骤（失败留 `.visual/` artifact）。它第一次跑就把当时**并不合规**的现实抓了出来：11 类控件的触达高度只有 27–40px（汉堡 40×40、`.cond-btn` 27、各处按钮 36–40），已按基础规则补齐。
- ~~白字压语义色的实心按钮全都不够对比度~~ 已于 v0.9.151 修（D 项第一次跑抓出来的，和上面那条同一类：闸门第一次跑抓到的是当时**并不合规**的现实）。实测：白字压 `--accent` 3.22:1、压 `--green` 2.51:1、压 `--red` 3.82:1，中招的包括最常点的「结束训练」和「完成这组」；另外五处输入框的占位符走浏览器默认灰，3.46:1。修法是加 `--accent-fill`/`--green-fill`/`--red-fill` 一档 + 一条 placeholder 基础规则，做法与守它的测试见上文「不能破坏的约定」。
- 数据只存本机 localStorage，换设备靠手动备份导出。这是产品层面的风险，不是代码问题。v0.9.148 起加了一层兜底：超过 14 天没导出就在今日页提醒（`backupDue()` 一个口径，横幅与设置页那行共用；可推迟 7 天）。口径是纯函数、不读时钟，所以能按天测——改这个口径或让 `doBackup` 忘记记 `settings.lastBackupAt`，§208 与 `visual-check` 的 C 项会红。**真同步（跨设备）有意推后**（2026-10-24 决定，理由与两条路的取舍写在 `TODO-优化.md` 的 P2-6 节）：先做「把导出/导入做扎实」——CSV 导出、导入失败定位到坏在哪条（导入前列出会改什么是已有的）；Gist 那类跨设备同步要引入账号与合并策略，等使用场景明确了再动。
