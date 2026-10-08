# 给 AI 的项目说明（Iron Log）

纯前端力量训练记录 PWA，部署在 GitHub Pages。
本仓库的判断标准只有两条：**① 本地 AI 能安全改好它（改完能自己发现改坏了）；② Pages 免费、快速发布。**
「零构建 / 零依赖」和「体积不超过 1GB」这两条限制已于 2026-10-08 移除——不追求仓库形态像不像常见的工程，也不按"纯前端"教条做决定。要引入框架或第三方库，先说清它替这个项目省下哪段手写代码；说不清就不引。

## 改完之后必须跑（本地闸门，全绿才算改完）

```bash
npm run typecheck        # tsc --noEmit：JSDoc 类型闸门，不产出文件
npm test                 # 逻辑测试：tests/run.js 按序执行 tests/p01…p13-*.js（自建 DOM 桩直接加载 js/app.js）
node tools/visual-check.js 390   # 真实浏览器闸门：A 水平溢出 + B 可点目标 ≥44px + C 真实 click（data-action 与卡片上的 data-act）
```

三条都通过再报告"改好了"。测试失败要贴出失败行，不要口头保证。
`visual-check` 的退出码：**0** 全过；**1** 任一检查失败（逐条列出状态与元素，截图在 `.visual/`）；**2** 浏览器或 CDP 不可用——那是工具没跑成，不能算通过。它找的是本机 Edge/Chrome，找不到时设 `CHROME_PATH`（CI 用 ubuntu 镜像自带的 Chrome，无需设）。改布局、改控件、改点击接线都要跑它。

## 版本与部署（只有一个版本源）

- `js/app.js:145` 的 `APP_VERSION` 是唯一来源（页头徽章、「关于」卡片都从它渲染）。改版本只改这里，并同步 `package.json` 的 `version`。
- `sw.js:5` 的 `CACHE` 版本串由 CI 用 `APP_VERSION` 自动改写（见 `.github/workflows/deploy.yml` 的 "Stamp service worker version"）。**不要手改**；测试会校验两者一致。
- 推送 `main` → CI（Node 22，`visual-check` 要用 Node 的全局 `WebSocket`/`fetch`，别退回 20）依次跑 `npm ci` → typecheck → 测试 → **真实浏览器闸门** → 复制静态文件上 Pages。PR 跑前三项加浏览器闸门，不部署；浏览器闸门失败时会把 `.visual/` 截图作为 artifact 留下。

## 不能破坏的约定（违反了会被测试或 CI 拦下）

- `index.html` 不得内联 `<script>` / `<style>`；样式在 `css/style.css`，逻辑在 `js/app.js`。
- **不得写内联 `on*="fn()"` 处理器**（v0.9.145 起）。可点的动作一律写 `data-action="名字"`，并在 `js/app.js:642` 的 `ACTIONS` 表里登记——表里每一项都是真引用，改名/改签名/少传参数会被 tsc 接住；内联字符串在类型检查之外，改名只会静默失效（点了没反应）。派发靠 `js/app.js:663` 那个**唯一**的 document 级 click 监听（它同时负责动作派发与抽屉兜底，别再加第二个）。带参数的动作从 `data-*` 取值后先收窄类型再用。守这条的是 §143（名字双向对齐：页面上有的必须在表里、表里有的必须在页面上）与 §206（向真实注册的监听器派发一次点击，验派发真的通）。
- **训练卡片上的按钮走另一条链**：`data-act="名字"` + `js/app.js:1249` 的 `exClick`。v0.9.147 起 `exClick` 只做派发，处理器按「需要多少上下文」分三张表登记：`EX_NAV_ACTS`（`:1277`，只要 day）、`EX_ITEM_ACTS`（`:1280`，要 item）、`EX_SET_ACTS`（`:1283`，要某一组）。加新按钮 = 写一个具名处理器 + 在对应那张表里加一行；**不要在 `exClick` 里加 `if(act === …)`**，也不要让同一个 act 出现在两张表里（前一层会永久挡住后一层，§207 拦这个）。层与层之间的「拿不到 item/set 就静默返回」是原语义，别删。守这条的是 §131（页面发射的 act 与三张表互相覆盖）、§207（不重名 + 三层各真跑一遍）、以及 `visual-check` 的 C 项（真浏览器里点「+」「加一组」「完成这组」并核对结果）。
- **`js/app.js` 必须保持单个经典脚本**（不能用 `import`/`export`）。测试是用 `(0, eval)(源码)` 加载它的（`tests/harness.js:178`），改成 ES 模块会让整套测试失效。要拆文件，先改测试的加载方式，再拆。
- 测试通过 `globalThis.__T`（`tests/harness.js:133-177`）访问 app 内部函数。新增/改名内部函数时，同步维护这个桥接。
- 测试分段是**顺序执行、共享同一个 app 实例**的：`tests/run.js` 按文件名顺序跑，段与段之间状态连续（后面很多段依赖前面导入的计划与日志）。所以不能只跑某一段，也不能打乱顺序；跨段复用的变量走 `H.C`（在出生段末尾发布、使用段开头取用）。
- 外部数据（localStorage、AI 导入的 JSON、DOM 取值）进来是 `any`，必须经 `migrate()` / `normalizeItem()` / `normalizeSet()` / `coerceSetNums()` 归一化后才进 `state`（parse, don't validate）。
- 数据四层不混存：`logs` / `exercises` / `program` / `sessions`（另有 `drafts`/`rest`/`timer`）。**改数据结构时先改 `js/app.js:13-142` 的 JSDoc typedef**，让 tsc 把所有串线的地方找出来。
- 类型闸门已开满（`tsconfig.json` 里不再有 `noImplicitAny: false`，v0.9.144 起）：新写的函数与回调必须自带 JSDoc 参数类型，别把开关改回去。数据形状一律用顶部 typedef；DOM 事件对象按仓库约定标 `any`（不建模 DOM 类型，见 `js/app.js:449` 的注释）。A/B 两日的循环一律用 `DAYS` 常量（`js/app.js:147`），不要写 `['A','B']` 字面量——那会把 `day` 摊成 `string`，`state.sessions[day]` 一类下标就落到类型之外。
- 导出给 AI 的 prompt 与 `PLAN_SCHEMA` 是单一来源（`js/app.js:2584`，由 `buildPrompt()` 插值）。不要在别处复制 schema 文本——两处不一致会让"导出的东西导不回来"。
- 导入 AI 方案时必须保留 `exercises[].personal`（用户手写的个人注意）。这条有测试守着。
- 移动端优先：可点元素触达高度 ≥44px；390px 视口不得出现水平溢出。这两类问题**逻辑测试测不出来**，历史上真出过三次（v0.9.134/135/136）。v0.9.146 起由 `visual-check` 的 A/B 项逐状态审计并进 CI；触达下限写在 `css/style.css:21` 的基础规则上（`button,input,select,textarea,summary{min-height:44px}`），图标按钮另设 44×44（`.hamburger`、`.drawer-close`）——**别再往单个控件上补 `min-height`**，那会让规则两处不一致。

## 不要读、不要改

- `archive/` —— v1（IronPrompt Pro）的完整归档，已在 `.gitignore` 里，不入库。旧版代码在 git 历史里（至 v1.3.1）。
- `.visual/` —— `tools/visual-check.js` 生成的截图产物，不入库。
- `node_modules/` —— 只有 typescript（类型检查用）。

## 测试的写法

逻辑测试按主题分在 `tests/p01…p13-*.js`，小节编号全局递增（`== 104. …`）；`tests/p11-*.js` 里的 §172 会检查编号不重复、不倒退，并核对「已知最大编号」（它硬编码在 `tests/p11-*.js:249`，加新小节时改这一行）。加新用例：用比现有最大编号更大的新编号——因为编号必须全局递增，**新小节实际只能加在最后一段 `tests/p13-*.js` 的末尾**（往中间段插会让 §172 的递增检查失败；想插在中间只能填历史留下的跳号空档，例如 §139–§154 不存在）。注释里写清**为什么**要测（防的是哪一次真实回归），断言用 `check('中文描述', 条件)`。不要重排已有用例，也不要往 `tests/harness.js` 里加断言（它只放桩与桥接）。新用例若要用别的段产生的变量，走 `H.C`。

## 已知技术债（有意分批处理，不是遗漏）

- ~~`noImplicitAny: false` 的历史豁免~~ 已于 v0.9.144 关闭（316 处隐式 any 全部补上标注）。别把它重新打开。
- ~~`index.html` 里 23 处内联 `onclick`~~ 已于 v0.9.145 收进 `ACTIONS` 表 + 单一 document 级委托（含渲染出来的两个）。做法与守它的测试见上文「不能破坏的约定」。
- ~~`js/app.js` 里 `exClick()` 那条 172 行的 `if(act===…)` 链~~ 已于 v0.9.147 拆成三张 act 表 + 具名处理器（导航 / 动作项 / 单组），并抽出 `navDone`、`setOffsetBefore`、`timerOn` 三个共用小函数（原先「秒表归属哪一日」在三处各写一遍）。做法与守它的测试见上文「不能破坏的约定」。
- ~~`tools/visual-check.js` 只审计布局、不进 CI~~ 已于 v0.9.146 升级：A 溢出 + B 触达 ≥44px + C 真实 click 链路，支持 Linux Chrome / `CHROME_PATH`，已作为 CI 步骤（失败留 `.visual/` artifact）。它第一次跑就把当时**并不合规**的现实抓了出来：11 类控件的触达高度只有 27–40px（汉堡 40×40、`.cond-btn` 27、各处按钮 36–40），已按基础规则补齐。
- 数据只存本机 localStorage，换设备靠手动备份导出。这是产品层面的风险，不是代码问题。
