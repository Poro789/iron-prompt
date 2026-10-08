# 给 AI 的项目说明（Iron Log）

纯前端力量训练记录 PWA，部署在 GitHub Pages。
本仓库的判断标准只有两条：**① 本地 AI 能安全改好它（改完能自己发现改坏了）；② Pages 免费、快速发布。**
「零构建 / 零依赖」和「体积不超过 1GB」这两条限制已于 2026-10-08 移除——不追求仓库形态像不像常见的工程，也不按"纯前端"教条做决定。要引入框架或第三方库，先说清它替这个项目省下哪段手写代码；说不清就不引。

## 改完之后必须跑（本地闸门，全绿才算改完）

```bash
npm run typecheck        # tsc --noEmit：JSDoc 类型闸门，不产出文件
npm test                 # 逻辑测试：tests/run.js 按序执行 tests/p01…p13-*.js（自建 DOM 桩直接加载 js/app.js）
node tools/visual-check.js 390   # 改样式/布局时跑：无头浏览器审计水平溢出，退出码 1 = 有溢出
```

三条都通过再报告"改好了"。测试失败要贴出失败行，不要口头保证。

## 版本与部署（只有一个版本源）

- `js/app.js:138` 的 `APP_VERSION` 是唯一来源（页头徽章、「关于」卡片都从它渲染）。改版本只改这里，并同步 `package.json` 的 `version`。
- `sw.js:5` 的 `CACHE` 版本串由 CI 用 `APP_VERSION` 自动改写（见 `.github/workflows/deploy.yml` 的 "Stamp service worker version"）。**不要手改**；测试会校验两者一致。
- 推送 `main` → CI 依次跑 `npm ci` → typecheck → 测试 → 复制静态文件上 Pages。PR 只跑测试，不部署。

## 不能破坏的约定（违反了会被测试或 CI 拦下）

- `index.html` 不得内联 `<script>` / `<style>`；样式在 `css/style.css`，逻辑在 `js/app.js`。
- **`js/app.js` 必须保持单个经典脚本**（不能用 `import`/`export`）。测试是用 `(0, eval)(源码)` 加载它的（`tests/harness.js:171`），改成 ES 模块会让整套测试失效。要拆文件，先改测试的加载方式，再拆。
- 测试通过 `globalThis.__T`（`tests/harness.js:132-169`）访问 app 内部函数。新增/改名内部函数时，同步维护这个桥接。
- 测试分段是**顺序执行、共享同一个 app 实例**的：`tests/run.js` 按文件名顺序跑，段与段之间状态连续（后面很多段依赖前面导入的计划与日志）。所以不能只跑某一段，也不能打乱顺序；跨段复用的变量走 `H.C`（在出生段末尾发布、使用段开头取用）。
- 外部数据（localStorage、AI 导入的 JSON、DOM 取值）进来是 `any`，必须经 `migrate()` / `normalizeItem()` / `normalizeSet()` / `coerceSetNums()` 归一化后才进 `state`（parse, don't validate）。
- 数据四层不混存：`logs` / `exercises` / `program` / `sessions`（另有 `drafts`/`rest`/`timer`）。**改数据结构时先改 `js/app.js:13-135` 的 JSDoc typedef**，让 tsc 把所有串线的地方找出来。
- 类型闸门已开满（`tsconfig.json` 里不再有 `noImplicitAny: false`，v0.9.144 起）：新写的函数与回调必须自带 JSDoc 参数类型，别把开关改回去。数据形状一律用顶部 typedef；DOM 事件对象按仓库约定标 `any`（不建模 DOM 类型，见 `js/app.js:449` 的注释）。A/B 两日的循环一律用 `DAYS` 常量（`js/app.js:140`），不要写 `['A','B']` 字面量——那会把 `day` 摊成 `string`，`state.sessions[day]` 一类下标就落到类型之外。
- 导出给 AI 的 prompt 与 `PLAN_SCHEMA` 是单一来源（`js/app.js:2482`，由 `buildPrompt()` 插值）。不要在别处复制 schema 文本——两处不一致会让"导出的东西导不回来"。
- 导入 AI 方案时必须保留 `exercises[].personal`（用户手写的个人注意）。这条有测试守着。
- 移动端优先：可点元素触达高度 ≥44px；390px 视口不得出现水平溢出。这两类问题**逻辑测试测不出来**，历史上真出过三次（v0.9.134/135/136）。改布局后跑 `visual-check`。

## 不要读、不要改

- `archive/` —— v1（IronPrompt Pro）的完整归档，已在 `.gitignore` 里，不入库。旧版代码在 git 历史里（至 v1.3.1）。
- `.visual/` —— `tools/visual-check.js` 生成的截图产物，不入库。
- `node_modules/` —— 只有 typescript（类型检查用）。

## 测试的写法

逻辑测试按主题分在 `tests/p01…p13-*.js`，小节编号全局递增（`== 104. …`）；`tests/p11-*.js` 里的 §172 会检查编号不重复、不倒退。加新用例：在**主题相符那一段的末尾**追加，用比现有最大编号更大的新编号，并在注释里写清**为什么**要测（防的是哪一次真实回归），断言用 `check('中文描述', 条件)`。不要重排已有用例，也不要往 `tests/harness.js` 里加断言（它只放桩与桥接）。新用例若要用别的段产生的变量，走 `H.C`。

## 已知技术债（有意分批处理，不是遗漏）

- ~~`noImplicitAny: false` 的历史豁免~~ 已于 v0.9.144 关闭（316 处隐式 any 全部补上标注）。别把它重新打开。
- `js/app.js` 里的 `exClick()`（`js/app.js:1174`，约 350 行）是一个大事件处理器，拆成命名小函数前不动其它结构。
- `index.html` 里还有 23 处内联 `onclick="fn(...)"`：tsc 看不见它们，改函数名会静默失效。§143（`tests/p10-*.js`）静态校验这些名字在 `js/app.js` 里真实存在，但**不校验参数**。把它们收进 JS 委托是待办（P2 后半）。
- 数据只存本机 localStorage，换设备靠手动备份导出。这是产品层面的风险，不是代码问题。
