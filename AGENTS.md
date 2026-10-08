# 给 AI 的项目说明（Iron Log）

纯前端力量训练记录 PWA，部署在 GitHub Pages。
本仓库的判断标准只有两条：**① 本地 AI 能安全改好它（改完能自己发现改坏了）；② Pages 免费、快速发布。**
「零构建 / 零依赖」和「体积不超过 1GB」这两条限制已于 2026-10-08 移除——不追求仓库形态像不像常见的工程，也不按"纯前端"教条做决定。要引入框架或第三方库，先说清它替这个项目省下哪段手写代码；说不清就不引。

## 改完之后必须跑（本地闸门，全绿才算改完）

```bash
npm run typecheck        # tsc --noEmit：JSDoc 类型闸门，不产出文件
node test-ironlog.js     # 逻辑测试（= npm test）：自建 DOM 桩直接加载 js/app.js
node tools/visual-check.js 390   # 改样式/布局时跑：无头浏览器审计水平溢出，退出码 1 = 有溢出
```

三条都通过再报告"改好了"。测试失败要贴出失败行，不要口头保证。

## 版本与部署（只有一个版本源）

- `js/app.js:115` 的 `APP_VERSION` 是唯一来源（页头徽章、「关于」卡片都从它渲染）。改版本只改这里，并同步 `package.json` 的 `version`。
- `sw.js:5` 的 `CACHE` 版本串由 CI 用 `APP_VERSION` 自动改写（见 `.github/workflows/deploy.yml` 的 "Stamp service worker version"）。**不要手改**；测试会校验两者一致。
- 推送 `main` → CI 依次跑 `npm ci` → typecheck → 测试 → 复制静态文件上 Pages。PR 只跑测试，不部署。

## 不能破坏的约定（违反了会被测试或 CI 拦下）

- `index.html` 不得内联 `<script>` / `<style>`；样式在 `css/style.css`，逻辑在 `js/app.js`。
- **`js/app.js` 必须保持单个经典脚本**（不能用 `import`/`export`）。测试是用 `(0, eval)(源码)` 加载它的（`test-ironlog.js:170`），改成 ES 模块会让整套测试失效。要拆文件，先改测试的加载方式，再拆。
- 测试通过 `globalThis.__T`（`test-ironlog.js:132-169`）访问 app 内部函数。新增/改名内部函数时，同步维护这个桥接。
- 外部数据（localStorage、AI 导入的 JSON、DOM 取值）进来是 `any`，必须经 `migrate()` / `normalizeItem()` / `normalizeSet()` / `coerceSetNums()` 归一化后才进 `state`（parse, don't validate）。
- 数据四层不混存：`logs` / `exercises` / `program` / `sessions`（另有 `drafts`/`rest`/`timer`）。**改数据结构时先改 `js/app.js:13-113` 的 JSDoc typedef**，让 tsc 把所有串线的地方找出来。
- 导出给 AI 的 prompt 与 `PLAN_SCHEMA` 是单一来源（`js/app.js:2385`，由 `buildPrompt()` 插值）。不要在别处复制 schema 文本——两处不一致会让"导出的东西导不回来"。
- 导入 AI 方案时必须保留 `exercises[].personal`（用户手写的个人注意）。这条有测试守着。
- 移动端优先：可点元素触达高度 ≥44px；390px 视口不得出现水平溢出。这两类问题**逻辑测试测不出来**，历史上真出过三次（v0.9.134/135/136）。改布局后跑 `visual-check`。

## 不要读、不要改

- `archive/` —— v1（IronPrompt Pro）的完整归档，已在 `.gitignore` 里，不入库。旧版代码在 git 历史里（至 v1.3.1）。
- `.visual/` —— `tools/visual-check.js` 生成的截图产物，不入库。
- `node_modules/` —— 只有 typescript（类型检查用）。

## 测试的写法

`test-ironlog.js` 按编号分段（`== 104. …`）。加新用例：追加到文件末尾，带新编号，并在注释里写清**为什么**要测（防的是哪一次真实回归），断言用 `check('中文描述', 条件)`。不要重排已有用例。

## 已知技术债（有意分批处理，不是遗漏）

- `tsconfig.json` 的 `noImplicitAny: false` 是历史豁免（存量约 368 处隐式 any）。计划是分批补标注后关掉它——关掉之后改函数签名、改字段名会在编辑时被接住，而不是靠运行时或测试跑过才发现。
- `js/app.js` 里的 `exClick()`（`js/app.js:1111`，351 行）是一个大事件处理器，拆成命名小函数前不动其它结构。
- 数据只存本机 localStorage，换设备靠手动备份导出。这是产品层面的风险，不是代码问题。
