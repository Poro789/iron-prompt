# Iron Log

> 力量训练记录 · 纯前端零构建 · 移动端优先 · 可安装离线使用

[![Deploy to GitHub Pages](https://github.com/Poro789/iron-prompt/actions/workflows/deploy.yml/badge.svg)](https://github.com/Poro789/iron-prompt/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**在线访问：** [https://poro789.github.io/iron-prompt](https://poro789.github.io/iron-prompt)  ｜  **变更记录：** [CHANGELOG](CHANGELOG.md)

## 功能

- **今日训练页** — A/B 日计划，逐组重量/次数/时长/RPE，点按确认，确认第一组后自动计时
- **自动保存** — 数据仅存浏览器 localStorage，每次修改即存，不上传任何服务器
- **导出给 AI** — 一键生成分析 prompt：固定背景 + 最近 N 次日志（含状态/完成标记）+ 逐动作趋势（回看 12 次）+ 严格输出模板，粘贴给 AI 即可
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

- **单浏览器存储**：数据只在本机 localStorage，换设备或换浏览器不会同步，也没有合并机制。JSON 全量备份（P1-7）落地前，请定期用「导出给 AI → 仅复制数据」手动留存，换机时用它迁移。
- **趋势方向是启发式**：`up` / `down` 需首尾与后半段均值同向；会话数 ≥ 6 时再校验近 3 次均值，否则判为 `plateau`。它是给 AI 的提示，不是医学结论。

## 结构

```
index.html            结构（无内联 CSS/JS）
css/style.css         样式
js/app.js             逻辑（APP_VERSION 唯一来源）
manifest.webmanifest  PWA 清单
icon.svg              图标
sw.js                 离线缓存（缓存版本串由 CI 按 APP_VERSION 改写）
fixtures/plan-A.json  测试夹具（一份真实 A 日计划）
```

零构建：无打包器、无依赖，`css`/`js` 直接外链。测试直接读 `js/app.js`，不解析 HTML。

## 开发

```bash
node test-ironlog.js   # DOM 桩逻辑测试（零依赖）
npx serve .            # 本地预览（SW 需要 http，file:// 下不注册）
```

推送 main 自动部署 GitHub Pages。`sw.js` 的缓存版本串由 CI 用 `APP_VERSION` 自动改写；本地改版本后无需手动同步（测试会校验两者一致）。

## 版本

- **v2（当前）**：核心闭环「记录 → 导出 → AI 分析 → 导入方案 → 执行」；v0.6.0 起按标准规范拆分 css/js
- **v1（IronPrompt Pro）**：已归档，见 git 历史（至 v1.3.1）

## License

MIT