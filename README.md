# IronPrompt Pro

> 纯力量训练系统 · 移动端优先 · 零后端纯前端

[![Deploy to GitHub Pages](https://github.com/Poro789/iron-prompt/actions/workflows/deploy.yml/badge.svg)](https://github.com/Poro789/iron-prompt/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**在线访问：** [https://poro789.github.io/iron-prompt](https://poro789.github.io/iron-prompt)

## ✨ 功能特性

- **A/B 日计划切换** — 双日分化训练方案，按训练阶段（Phase）组织动作
- **训练量实时统计** — 顶部状态栏实时显示本次训练总量（kg）
- **组间休息计时器** — 一键启动，支持 +15s 快速加时，结束语音提醒
- **节奏教练** — 按节奏引导计数，每 3 次语音提示「稳住」
- **语音提示** — 基于 Web Speech API，准备口令、动作口诀、整组完成播报（可开关）
- **AI 复盘闭环**
  - 📋 一键复制 AI 复盘 Prompt（含硬件约束与推拉诊断）
  - 🔁 粘贴 AI 返回的 `json` 处方块，解析并直接装载为新训练计划
- **JSON 全量备份** — 导出/导入完整训练数据，跨设备迁移
- **本地存储** — 数据保存在浏览器 `localStorage`，离线可用，无隐私上传

## 🛠 技术栈

| 组件 | 说明 |
|------|------|
| [Vue 3.3](https://vuejs.org/) | 全局生产构建（`vue.global.prod.js`），无需构建工具 |
| 纯 CSS | 深色健身主题样式 |
| Web Speech API | 语音播报（浏览器原生） |

纯静态站点：**无打包、无依赖安装、无后端**，双击 `index.html` 即可运行。

## 📁 项目结构

```
iron-prompt/
├── index.html                  # 应用入口
├── css/
│   └── style.css               # 样式
├── js/
│   ├── vue.global.prod.js      # Vue 3.3.4 运行时（本地化）
│   └── app.js                  # 应用逻辑
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Pages 自动部署
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

## 📦 部署

推送 `main` 分支后，[GitHub Actions](.github/workflows/deploy.yml) 自动构建并发布到 GitHub Pages，无需手动操作。

## 📄 许可

[MIT](LICENSE) © Poro789
