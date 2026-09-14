# 更新记录

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.6.1]

### 新增
- README 徽章（CI / License）与本页变更记录
- CI 在 PR 上运行测试（build/deploy 跳过，不占 Pages 环境）
- 破坏性操作改用应用内确认弹层（`role="alertdialog"`），替换原生 `confirm()`

### 变更
- `plan-A.json` 移到 `fixtures/`，明确其测试夹具身份

## [0.6.0]

### 变更
- 按标准规范拆分：`index.html` 只留结构，样式移到 `css/style.css`，逻辑移到 `js/app.js`（零构建，仍是直接外链）
- 测试直接读 `js/app.js`，不再从 HTML 正则抽取脚本
- 趋势方向新增 `plateau`：需首尾与后半段均值同向才判 `up`/`down`，会话数 ≥ 6 时再校验近 3 次均值
- 移除 `maximum-scale=1`，恢复双指缩放（WCAG 1.4.4）
- 破坏性操作改用应用内确认弹层，替换原生 `confirm()`
- `plan-A.json` 移到 `fixtures/`

### 新增
- 趋势回看最近 12 次训练（导出原始日志仍只带所选 N 次），新增 `trendsSpan` 字段
- 无障碍：`tablist` / `tabpanel` / `aria-selected` / `aria-pressed` / `role="status"` 实时区域 / `role="dialog"` 弹层
- CI 在 PR 上运行测试（不部署 Pages）
- README 徽章与本页变更记录

### 修复
- `lastValues` 预填跳过热身组，取最重的已完成正式组（原先会预填出热身重量）
- `sw.js` 预缓存清单补齐 `icon.svg`

## [0.5.0]

### 新增
- 组间休息倒计时：确认一组后自动开始，进度条 + ±15s + 跳过 + 结束提示音；基于时间戳，切后台回来仍准确
- PWA：`manifest.webmanifest` + `icon.svg` + `sw.js`，可安装、离线可用
- CI 用 `APP_VERSION` 自动改写 `sw.js` 缓存版本串

### 变更
- 增量渲染：步进/输入只重建受影响的那一组，保留其余行输入焦点
- 保存防抖 250ms，并在 `visibilitychange` / `pagehide` 前强制落盘

## [0.4.1]

### 安全
- 所有来自 localStorage / AI 导入的文本在拼进 `innerHTML` 前统一转义，修复 XSS

### 变更
- 版本号收敛为单一来源 `APP_VERSION`
- 测试桩加固：脚本抽取失败即退出，并校验代码引用的元素 id 真实存在

## [0.4.0]

### 新增
- v2 单文件重写，核心闭环「记录 → 导出给 AI → 导入方案 → 执行」
- 今日训练页、localStorage 自动保存、导出分析 prompt、导入 AI 方案（容错 + 逐字段校验）

## [0.1.0 – 1.3.1]

v1（IronPrompt Pro，Vue 版）。已归档，见 git 历史与 `archive/`。