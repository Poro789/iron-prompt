# IronPrompt Pro

> 纯力量训练系统 · 移动端优先 · 桌面双栏工作台 · 零后端纯前端

[![Deploy to GitHub Pages](https://github.com/Poro789/iron-prompt/actions/workflows/deploy.yml/badge.svg)](https://github.com/Poro789/iron-prompt/actions/workflows/deploy.yml)
[![Latest Release](https://img.shields.io/github/v/release/Poro789/iron-prompt)](https://github.com/Poro789/iron-prompt/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**在线访问：** [https://poro789.github.io/iron-prompt](https://poro789.github.io/iron-prompt) ｜ **版本记录：** [CHANGELOG](CHANGELOG.md) · [Releases](https://github.com/Poro789/iron-prompt/releases)

## ✨ 功能特性

- **A/B 日计划切换** — 双日分化训练方案，按训练阶段（Phase）组织动作
- **新训练日一键重置** — 清空 A/B 两日全部打卡状态、吨位归零，保留负荷与 RPE 记录
- **训练量实时统计** — 顶部状态栏实时显示本次训练全阶段有效正式组总量（kg）
- **组间休息计时器** — 手动一键启动（90s）或打卡后自动启动，支持 +15s 快速加时，墙钟计时不漂移，结束语音提醒
- **节奏教练** — 按节奏引导计数，每 3 次语音提示「稳住」，整组跑完自动真正打卡并入休息
- **语音提示** — 基于 Web Speech API，准备口令、动作口诀、整组完成播报（开关持久化，同时控制提示音）
- **训练者档案** — 体重 / 每日准备度随手可改，随复盘 Prompt 一起发送
- **AI 复盘闭环**
  - 📋 一键复制 AI 复盘 Prompt（含硬件约束与推拉诊断）
  - 🔁 粘贴 AI 返回的 `json` 处方块，**粘贴后自动解析装载**（也可手动点击按钮）
  - 📦 处方全量装载：5 大阶段（升温/主项/辅助/核心/冷身）全覆盖，**同名动作覆盖 + 新动作自动追加**，加载后 Toast 显示「更新 X 个 / 新增 X 个」
  - 🧩 兼容未知阶段名：AI 返回新的 phase 会自动创建对应区块；阶段名大小写/空白自动归一
- **JSON 全量备份** — 导出/导入完整训练数据（还原前二次确认 + 结构校验 + 自动迁移旧版本），跨设备迁移
- **本地存储** — 数据保存在浏览器 `localStorage`（防抖写入 + 异常兜底），无需网络请求，缓存后离线可用，无隐私上传
- **🖥️ 桌面版视图** — 移动端体验完全保留；宽屏下自动升级为双栏工作台：休息计时大卡 / 本次训练统计 / AI 复盘内联面板组成的粘性侧栏，弹窗居中化，`R` 键快捷控制休息计时，`Esc` 关闭弹窗

## 🛠 技术栈

| 组件 | 说明 |
|------|------|
| [Vue 3.5](https://vuejs.org/) | 全局生产构建（`vue.global.prod.js`，本地化 3.5.41），无需构建工具 |
| 纯 CSS | 深色健身主题样式（零依赖手写工具类） |
| Web Speech API | 语音播报（浏览器原生） |
| Node test runner | 核心纯函数单测 + 应用冒烟测试（最小 Vue 桩执行真实 `setup()`），零依赖 |

纯静态站点：**无打包、无依赖安装、无后端**，双击 `index.html` 即可运行。

## ✅ 测试

```bash
node --test        # 零依赖：核心函数单测 + 应用冒烟测试（共 20+ 用例）
```

## 📁 项目结构

```
iron-prompt/
├── index.html                  # 应用入口
├── css/
│   └── style.css               # 样式
├── js/
│   ├── vue.global.prod.js      # Vue 3.5.41 运行时（本地化）
│   ├── core.js                 # 核心纯函数（求解器/AI 解析/迁移，可单测）
│   └── app.js                  # UI 状态与交互
├── tests/
│   ├── core.test.mjs           # 核心函数单元测试（node --test）
│   └── app.smoke.test.mjs      # 应用冒烟测试（Vue/DOM 桩，关键业务路径回归）
├── package.json                # 仅 test 脚本，零依赖
├── CHANGELOG.md                # 版本更新记录
├── .github/
│   └── workflows/
│       └── deploy.yml          # 测试 + GitHub Pages 自动部署
├── LICENSE
└── README.md
```

## 🚀 快速开始

```bash
# 方式一：直接使用在线版
# https://poro789.github.io/iron-prompt

# 方式二：本地运行（无需任何依赖）
git clone https://github.com/Poro789/iron-prompt.git
cd iron-prompt
# 用浏览器打开 index.html 即可
```

## 📦 部署与版本

- **GitHub Pages**：推送 `main` 分支后，[GitHub Actions](.github/workflows/deploy.yml) 自动部署，无需手动操作。
- **版本管理**：遵循 [语义化版本](https://semver.org/lang/zh-CN/)（`vMAJOR.MINOR.PATCH`），每次发版创建 Git Tag 并在 [Releases](https://github.com/Poro789/iron-prompt/releases) 发布更新说明，详细变更见 [CHANGELOG.md](CHANGELOG.md)。
- **注意**：应用数据保存在浏览器 `localStorage`，升级版本不影响已有数据（旧存档会自动补齐新增结构）；如需跨设备迁移请使用「备份 JSON / 还原 JSON」。

## 📄 许可

[MIT](LICENSE) © Poro789
