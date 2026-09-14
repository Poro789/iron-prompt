# Iron Log

> 力量训练记录 · 单文件纯前端 · 移动端优先 · 零后端

**在线访问：** [https://poro789.github.io/iron-prompt](https://poro789.github.io/iron-prompt)

## 功能

- **今日训练页** — A/B 日计划，逐组重量/次数/时长/RPE，点按确认，确认第一组后自动计时
- **自动保存** — 数据仅存浏览器 localStorage，每次修改即存，不上传任何服务器
- **导出给 AI** — 一键生成分析 prompt：固定背景 + 最近 N 次日志（含状态/完成标记）+ 逐动作趋势 + 严格输出模板，粘贴给 AI 即可
- **导入 AI 方案** — 粘贴 AI 返回的 JSON（容忍 ```json 包裹与多余逗号），只更新计划与动作库，不动日志
- **状态与完成标记** — 记录当日整体状态（佳/一般/差）；未完成组保留 done 标记，不计入容量与趋势
- **组间休息倒计时** — 确认一组后自动开始，进度条 + ±15s + 跳过，结束响铃；基于时间戳，切后台回来仍准确
- **可安装离线使用** — PWA（manifest + service worker），添加到主屏幕后离线可用

## 数据（四层，不混存）

| 层 | 内容 |
|---|---|
| `logs` | 训练日志：日期/动作/组（重量·次数·时长·RPE·done·side）/当日状态/用时 |
| `exercises` | 动作库：肌群/模式/单位/要点/避坑/节奏/替代/个人注意 |
| `program` | A/B 日计划：分区、逐组规格（热身/正式、重量/次数/时长/目标 RPE） |
| `sessions` | 进行中的记录（按 A/B 分存，结束前不写入 logs） |

导出快照由 logs 即时打包生成，不单独存储。

## 已知限制

- **单浏览器存储**：数据只在本机 localStorage，换设备或换浏览器不会同步。JSON 全量备份（P1-7）落地前，请定期用「导出给 AI → 仅复制数据」手动留存。
- **单文件是刻意选择**：`index.html` 内联 CSS/JS，为的是零构建、直接双击打开。改动时请保持这一约束。

## 开发

```bash
node test-ironlog.js   # DOM 桩逻辑测试（零依赖）
```

浏览器直接打开 `index.html` 即可使用；推送 main 自动部署 GitHub Pages。

PWA 资源（`manifest.webmanifest` / `icon.svg` / `sw.js`）需与 `index.html` 一起发布，已在 CI 的 `Prepare dist` 步骤列出；`sw.js` 的缓存版本串由 CI 用 `APP_VERSION` 自动改写，本地改版本后无需手动同步（但测试会校验两者一致）。

## 版本

- **v2（当前）**：单文件重写，核心闭环「记录 → 导出 → AI 分析 → 导入方案 → 执行」
- **v1（IronPrompt Pro）**：已归档，见 git 历史（至 v1.3.1）

## License

MIT