# IronPrompt Pro 代码审查报告

> **📌 第二轮复检（2026-08-26，针对 v1.2.0 修复后的代码）**
>
> ## A. 验证方法与结果
>
> 1. **单元测试**：`node --test` → **14/14 通过**（求解器/AI 解析/迁移/吨位/格式）。
> 2. **语法检查**：`node --check` core.js / app.js / vue.global.prod.js 全部通过。
> 3. **CSS 类完整性**：正则比对 HTML/JS 引用的 150 个类 token 与 style.css 定义 → **0 缺失**（第一轮发现的 31 处已全部补齐；脚本残留的 8 个"缺失"均为 `:class` 三目表达式中的非类名值，误报）。
> 4. **模板引用一致性**：模板引用的 56 个根标识符 vs setup 导出（57 个）→ **0 悬空引用**。
> 5. **冒烟测试**（Node + 最小 Vue/DOM 桩，真实执行 `setup()` 与全部关键函数路径）：34 项断言全部通过，覆盖：两击打卡流、吨位统计、**节拍教练真正完成打卡（P0-2 修复生效）**、休息计时（自动/手动/+15s/停止/墙钟递减）、AI 处方装载（大小写归一/同名覆盖/空 sets 兜底/未知阶段/review-only/非法 JSON 提示）、新训练日重置、A/B 切换、编辑草稿取消/保存、**拉力绳字符串污染回归（P0-4 修复生效）**。
>
> ## B. 第一轮问题闭环状态
>
> | 第一轮问题 | 状态 | 验证证据 |
> |---|---|---|
> | P0-1 AudioContext 泄漏 | ✅ 已修 | 单例 + resume，冒烟中反复发声无异常 |
> | P0-2 节拍教练假完成 | ✅ 已修 | 冒烟：带练跑完 `set.done === true`、休息计时自动启动 |
> | P0-3 完成组跑带练被反打卡 | ✅ 已修 | 模板 `!set.done` 才显示 🎵；完成分支跳过已打勾组 |
> | P0-4 拉力绳字符串污染 | ✅ 已修 | 单测 + 冒烟：字符串输入后 weight 仍为数字、无 "015" 伪值 |
> | P0-5 训练量永不重置 | ✅ 已修 | 「🌅 新训练日」按钮，冒烟验证 done 清空 + 吨位归零 |
> | P1-6 求解器爆炸 | ✅ 已修 | DP 化，单测：极端库存 <1s（原 21.8s），渲染上限 1500 |
> | P1-7 31 个缺失 CSS 类 | ✅ 已修 | 类比对 0 缺失 |
> | P1-8 备份还原链路 | ✅ 已修 | 确认/校验/迁移/重选/失败提示全部就位（单测 validateBackup/migratePlans） |
> | P1-9 athlete 无编辑入口 | ✅ 已修 | 配置中心「训练者档案」表单 |
> | P1-10 语音开关不持久化 | ✅ 已修 | `iron_prompt_voice_v1` 键 |
> | P1-11 吨位只统计 strength | ✅ 已修 | 单测：accessory 组计入 |
> | P1-12 AI 解析边角 | ✅ 已修 | 冒烟逐项验证 |
> | P1-13 带练与 A/B/语音脱节 | ✅ 已修 | switchPlan 停止带练 + cancelSpeech |
> | P1-14 休息计时无手动入口 | ✅ 已修 | 顶栏 ⏱ 按钮（冒烟 90s 启动） |
> | P1-15 快速编辑无取消/字段少 | ✅ 已修 | 草稿模式 + 全字段（冒烟验证取消/保存） |
> | P1-16 toast 定时器竞争 | ✅ 已修 | 单一 timer + clearTimeout |
> | P2 各项（漂移/竞态/截断/静音语义/blob/版本/死字段回退/存档校验/input 重置/clipboard 降级） | ✅ 已修或已接受 | 见 CHANGELOG 1.2.0 |
>
> ## C. 第二轮新发现（⚠️ 需要再修）
>
> ### R1 🔴 高危｜首次启动（空 localStorage）数据未迁移 → 两处 TypeError 崩溃
> - 位置：`js/app.js:159-164`
> - 根因：`storedPlans ? Core.migratePlans(storedPlans, …) : JSON.parse(JSON.stringify(INITIAL_PLANS))` —— **只有「有存档」分支跑了迁移**。`INITIAL_PLANS` 只定义了 warmup/strength/cooldown，没有 `accessory`/`core` 键。
> - 触发路径（冒烟实测复现其一）：
>   1. 全新用户首次粘贴 AI 处方且含 `accessory`/`core` 阶段 → `addPhaseIfMissing` 因阶段已在元数据列表中而提前返回、**不会补数据键** → `activeSession.value.phases['accessory']` 为 `undefined` → `list.find(...)`（app.js:666）抛 TypeError，且异常发生在点击处理器中：处方被**半装载**（coach_review 与前面的动作已写入），无错误提示，控制台报错。
>   2. 更简单的触发：⚙️ →「1. 动作编排」→ 在「辅助强化/核心稳定」小节点「+ 加动作」→ `activeSession.value.phases[k].push`（app.js:502）同样 TypeError。
> - 影响面：**所有全新安装用户**（老用户有 v10 存档会走迁移分支，不受影响）。README 主打的「5 大阶段处方全覆盖」正是最容易踩中的路径。
> - 建议修复（一行）：两个分支统一走迁移——
>   ```js
>   const plansData = reactive(Core.migratePlans(
>     storedPlans ? storedPlans : JSON.parse(JSON.stringify(INITIAL_PLANS)),
>     PHASE_ORDER
>   ));
>   ```
>
> ### R2 🟠 中危｜`startNewDay` 不停止进行中的节拍教练
> - 位置：`js/app.js:532-548`（调了 `stopRestTimer()` 但没调 `stopTempoCoach`）
> - 后果：重置后带练继续跑，结束时把某一组**重新打勾**（done 刚清零又被置 true），状态与用户预期不符。
> - 建议：重置时一并 `stopTempoCoach(true)`。
>
> ### R3 🟠 中危｜备份校验不要求 A/B 两键齐全
> - 位置：`js/core.js validateBackup`
> - 后果：仅含单计划（如只有 A）的备份可通过校验；还原后切换到缺失的那一日 → `activeSession` 为 `undefined` → 模板渲染 `activeSession.coach_review` 抛错、界面崩溃。
> - 建议：校验时要求 `plansData.A` 与 `plansData.B` 均存在（或在应用层对缺失日自动补默认计划）。
>
> ### R4 🟡 低危（一批）
> 1. **CI 测试命令**：`.github/workflows/deploy.yml` 与 `package.json` 使用无路径的 `node --test`，依赖 Node 的目录自动发现（本机 Node 24 已验证有效；CI 用 Node 20）。为防跨版本发现行为差异导致「0 个测试静默通过」，建议改为显式 `node --test tests/core.test.mjs`。
> 2. **`coach_review` 若被 AI 返回为数组**（typeof 也是 object）：装载后胶囊/看板显示空内容。建议 `Array.isArray` 时拒收。
> 3. **`v-model.number` 清空输入**：Vue 3.5 下为空串或 NaN——所有核心消费点经 `Core.num` 兜底均安全（已逐点核对），仅展示层会短暂出现「体重: 0kg」。可接受，或输入失焦时回填默认值。
> 4. **AI 处方的小数节奏**（如 `[2.5,0.5,1.5]`）：`parseAIResponse` 不取整，带练标题显示 `2.5s` 而倒计时按四舍五入执行，轻微不一致；编辑保存路径已取整。
> 5. **RPE 默认值展示**（第一轮 U3，有意延后）：`RPE {{ set.rpe || 8 }}` 无法区分「未选择」与「选了 8」。
> 6. **触控目标**：💡✏️ 已从 24px 提到 28px，✓/🎵/热 仍 28px，未达 44px 建议值（紧凑设计权衡）。
> 7. **弹窗焦点管理**：已支持 Esc 关闭，但无 focus trap / 关闭后焦点还原（a11y 进阶项）。
> 8. **z-index 同层**：配置抽屉与节拍抽屉同为 z-100，同时打开时前者（DOM 靠后）覆盖后者；可接受（带练继续可听/可见于关闭后）。
> 9. **手动休息固定 90s**：未取当前屏幕未完成动作的 `target_rest`，智能一点会更好。
> 10. **`confirm()` 系统弹窗**：白色系统样式与深色主题不搭（可替换为应用内确认弹窗，属打磨项）。
>
> ### R5 ℹ️ 已知取舍 / 后续可选
> - 计时器未拆子组件（每秒整树重渲染）：当前规模（几十~百余组）无感，处方膨胀到 300+ 组时再做。
> - Vue 3.3.4 → 3.5.41 升级：语法与 API 面已验证（本项目只用 createApp/setup/ref/reactive/computed/watch + in-DOM 模板，均为稳定 API），但**本环境无浏览器，未做真机回归**，建议发布前人工过一遍主流程（打卡/带练/AI 装载/备份还原）。
> - ESLint/Prettier、PWA（manifest+Service Worker，真·离线可安装）、CSS 变量化配色、emoji→SVG 图标、`avg_hr`/`rest_hr` 死字段处置——均为后续可选项。
> - 损坏存档的迁移策略是「重置为默认结构」而非「保留残片」：有意的取舍（防崩溃优先），已在代码注释体现。
>
> ## D. 结论
>
> v1.2.0 已闭环第一轮报告的全部 P0/P1 与绝大多数 P2（共 30+ 项），自动化验证（单测/语法/类比对/引用比对/冒烟）全绿。
> **当前最需要处理的只有一项：R1（首启未迁移 → 崩溃）**，另有 R2/R3 两个中危与一批低危打磨项。建议 R1 一行修复 + 补一个「空存储 + AI 装载 accessory」的单测/冒烟断言后即可发布。

---

# 第一轮审查（2026-08-25，针对 v1.1.0）

> 审查范围：`index.html`、`js/app.js`、`css/style.css`、`CHANGELOG.md`、`.github/workflows/deploy.yml` 等全部项目文件
> 审查方式：逐行人工审查 + 关键逻辑的 Node.js 行为仿真验证（未修改项目任何代码）
> 结论：整体架构清晰、无 XSS/网络安全风险、文档维护良好；但存在 **5 个高危功能性 Bug**、一批中低危问题，以及 **31 个 CSS 工具类缺失** 导致美术设计大面积落空。

---

## 一、Bug 清单（按严重程度）

### 🔴 P0 — 高危（核心功能直接受损）

#### 1. `playTone` 每次调用都新建 AudioContext，约 6 次后声音永久失效
- 位置：`js/app.js:240-252`
- 问题：每次发声都 `new (window.AudioContext || window.webkitAudioContext)()`，从不 `close()`、从不 `resume()`。浏览器（Chrome）最多允许约 6 个存活 AudioContext，超出后新上下文停留在 suspended 状态。
- 影响：节拍带练每秒滴答、组完成音、休息提醒音——一次正常训练用不到 10 组就会触发上限，**之后所有提示音永久静音**，而 UI 上看不出任何异常。
- 建议：模块级单例 AudioContext，首次用户手势时创建并 `resume()`，复用发声；`catch` 中保留降级。

#### 2. 节拍教练（🎵）结束时的「自动打卡」没有真正打卡
- 位置：`js/app.js:303-308`（`startTempoCoach` 结束分支）→ `handleSetCheck`（350-358 行）
- 问题：带练完成时调用 `handleSetCheck(phaseKey, ex, set)`。对未完成的 set，第一次调用只会把 `showRpePicker` 翻为 true（打开 RPE 面板），**`completeSet` 不会被执行**。
- 实测仿真：
  ```
  coach auto-finish:  picker=true  completed=false   ← 语音已播「整组完成！…进入休息」
  ```
- 影响：语音播报「整组完成！表现优秀，进入休息」，但组实际未打勾、休息计时器**不启动**、训练量不增加，卡片上突然弹出 RPE 面板，用户必须再手动点一次 RPE 或 ✓ 才真正完成。语音承诺与实际行为不一致，是交互上最迷惑的路径。
- 建议：带练完成应走独立的 `completeSet`（可默认 RPE=8 或保持面板让用户补选），与手动 ✓ 的两击流区分开。

#### 3. 对「已完成」的组启动节拍教练，结束时会把该组悄悄取消打卡
- 位置：同上（`handleSetCheck` 的 else 分支）
- 问题：🎵 按钮对已完成（✓）的组仍然显示；带练跑完后 `set.done = true → false`，无任何提示。
- 建议：`isExerciseDone` 的组或 `set.done` 的组隐藏 🎵 按钮；或结束时跳过 `handleSetCheck`。

#### 4. 拉力绳磅数输入框编辑后，全部负荷选项被字符串拼接污染
- 位置：`index.html:276`（`v-model="equipment.bands[bIdx]"`，number input 无 `.number` 修饰符）+ `js/app.js:199-204`（`sum += bands[j]`）
- 问题：用户编辑任意一个磅数输入框后，Vue 写入的是**字符串**。`sum += bands[j]` 变成字符串拼接。
- 实测仿真（编辑其中一项为字符串 `"15"` 后）：
  ```
  默认数值:  [{"weight":10},{"weight":15},{"weight":25,"label":"叠: 10+15磅"},{"weight":20},…]
  编辑之后:  [{"weight":10},{"weight":"015"},{"weight":"1015","label":"叠: 10+15磅"},{"weight":20},{"weight":30},{"weight":"01520"},…]
  ```
- 影响：负荷选择器出现 `015磅`、`1015磅` 等荒谬选项并可被选入动作；AI Prompt 里的「物理硬件约束」列表同样被污染，AI 将基于错误库存开处方。
- 建议：`v-model.number`（或提交时 `Number()` 归一）；`availableBandOptions` 内对元素做 `Number()` 防御。哑铃侧因为只参与乘法（隐式转换安全）所以没炸，但同样建议 `.number` 保持一致。

#### 5. 没有「新训练日 / 重置」入口，「本次训练总量」实际是历史累计
- 位置：`js/app.js:227-237`（`sessionVolume`）、全文无 reset 逻辑
- 问题：`set.done` 持久化在 localStorage 且永不重置；状态栏「{{ sessionVolume }} kg」、Prompt 中「今日有效正式组做功吨位」统计的是**历史上所有被打勾的正式组之和**，不是「本次/今日」。
- 影响：第二天打开 App，顶栏立刻显示昨天的吨位；发给 AI 的「今日打卡实录」混入多日数据，加重信号判定（组组做满且末组 RPE≤8）完全失真。这是当前产品闭环里最大的逻辑缺口。
- 建议：增加「开始新训练日」按钮（一键把所有 `done` 置 false、清空/归档 RPE），或在 A/B 切换/日期变更时提示重置；把打卡快照（带时间戳）存入历史，Prompt 引用「最近一次快照」。

### 🟠 P1 — 中危

#### 6. 哑铃/拉力绳组合求解器无上界，极端库存下页面冻结 20+ 秒
- 位置：`js/app.js:169-193`（`availableDumbbellOptions`，笛卡尔积）、195-210（`availableBandOptions`，2^n 子集）
- 实测仿真：
  ```
  默认库存:            35 个选项
  4 片规×20 片:        247 个选项, 5ms
  6 片规×40 片:        31196 个选项, 21791ms  ← 同步阻塞，页面假死 22 秒
  ```
  拉力绳同理：20 根绳子 → 2^20 ≈ 100 万次枚举；`1 << bands.length` 超过 30 根还会位溢出。
- 建议：对组合数设上限（如 >2000 个选项时只返回「可达重量集合」而不枚举装载方案，或分片/惰性计算）；对输入做合理性校验（片规 ≤ 8 种、数量 ≤ 20、绳子 ≤ 12 根）。

#### 7. 31 个 HTML/JS 中使用的 CSS 工具类未定义，美术设计大面积落空
- 位置：`css/style.css`（手写子集）vs `index.html` / `js/app.js` 实际引用
- 实测核对（节选，完整清单见附录 A），按影响排序：

  | 缺失类 | 使用处 | 实际后果 |
  |---|---|---|
  | `max-w-md` / `max-w-sm` | 3 个底部抽屉(192/218/304)、3 个居中弹窗(324/341/366) | **桌面端所有弹窗拉满视口宽度**（modal 是 `position:fixed` 相对视口），最显眼的美术事故 |
  | `opacity-60` | 已完成动作卡片(80) | 完成的动作**不半透明置灰**，「done」视觉状态只剩边框色，辨识度大降 |
  | `overflow-hidden` | 阶段卡片(62) | 阶段头 `bg-slate-800` 直角**戳出** `rounded-xl` 圆角，每个 section 都可见 |
  | `flex-wrap` | 拉力绳规格 chips(274) | 绳子多了不换行，横向溢出容器 |
  | `text-cyan-400` / `text-indigo-400` | `app.js:93-94`（accessory/core 阶段标题色） | 新增的两大阶段标题**丢失主题色**，渲染为继承的白色 |
  | `bg-indigo-600` | 节拍教练「第 X/Y 次」徽章(195) | 徽章无背景，白字直接落在卡片上 |
  | `shadow-lg` / `shadow-2xl` | 顶栏 + 全部 6 个弹窗 | 设计中的全部投影不存在，层次变平 |
  | `min-w-0` | 动作名/负荷区(85/115) | flex 子项不收缩，长动作名无法 ellipsis，会挤掉右侧按钮 |
  | `mt-1 my-1 mb-1 ml-1 ml-2 ml-auto p-1 p-0-5 pb-2 pt-1 pt-2 pr-2 px-1-5` | 多处 | 标签-输入框、弹窗头-分隔线、chips 内边距等间距全部丢失/挤压 |
  | `max-h-32` / `overflow-y-auto`(类) | 杠铃片列表(259) | 片规多时列表不限制高度（兜底：外层抽屉自身可滚） |
  | `cursor-pointer` / `hover:text-rose-400` / `sm:text-sm` | AI 胶囊(52)、还原 JSON label(292)、✕(34)、主按钮(179) | 无手型光标、无 hover 反馈、宽屏下主按钮字号永远 12px |
  | `border-rose-800` / `text-rose-200` / `bg-transparent` | AI 复盘弹窗(372)、band 输入(276) | 颜色回退（影响轻微） |
  | `overflow-x-auto` | RPE 行(152) | 目前 8 个 `flex-1` 按钮恰好放得下，暂无可见影响（脆弱） |

- 建议：二选一——(a) 补全缺失的工具类（约 150 行 CSS 以内）；(b) 引入真正的 Tailwind（CDN 或构建），一劳永逸。推荐 (a)，保持零依赖定位。

#### 8. 备份还原链路缺陷
- 位置：`js/app.js:590-606`（`importJSONBackup`）
- 问题（叠加）：
  1. **无二次确认**：还原直接 `Object.assign` 覆盖全部数据，一次误点即丢档（导出/还原按钮并排，误触概率不低）；
  2. **无结构迁移**：导入旧版备份（缺 `accessory`/`core` 键）后，`generateAndCopyPrompt` 里 `s.phases[ph.key]`（459-460 行）与 `addExercise`（423 行）对 undefined 直接报错 → 点「复制 Prompt」或「+加动作」整条链路崩溃（启动时的迁移只在加载时跑过一次）；
  3. **同文件重选无效**：`input[type=file]` 的 `value` 不重置，连续两次选同一文件不触发 `change`；
  4. **静默失败**：`data.plansData && data.equipment` 不满足时什么都不提示；
  5. `Object.assign(equipment, …)` 是浅合并，未来 equipment 增加嵌套结构时会有残留键。
- 建议：`confirm()` + 导入后重跑阶段迁移 + `e.target.value = ''` + 明确的成功/失败 toast（替代 alert）。

#### 9. `athlete`（体重/准备度）没有任何编辑入口，Prompt 数据恒为旧值
- 位置：`js/app.js:19,55`（初始 70kg / readiness 4）、448-451 行（Prompt 引用）
- 问题：界面上无处修改，AI 处方解析也不写回 `athlete`，所以 Prompt 永远写着「体重 70kg | 准备度 4/5」。对以「个性化复盘」为卖点的闭环是硬伤。
- 建议：配置中心 Tab 3 增加「训练者档案」小组（体重、准备度 1-5 滑杆、可选 avg_hr/rest_hr——这两字段目前完全是死数据，见 P2-12）。

#### 10. 语音开关 `voiceEnabled` 不持久化
- 位置：`js/app.js:82`
- 问题：刷新后恢复为开。用户明确关过语音，第二天又被「准备，…口诀…」吓一跳。
- 建议：并入 EQUIP_KEY 或独立键持久化。

#### 11. 训练量统计只覆盖 `strength` 阶段
- 位置：`js/app.js:229`
- 问题：AI 完全可能把主项放进 `accessory`（例如「肩推 4×8 加强」），那些组的吨位不计入 `sessionVolume`，顶栏与 Prompt 的「吨位」都被低估。
- 建议：统计「所有阶段中 `set_type !== 'warmup'` 的 `weight_reps` 完成组」，与「有效正式组」语义一致。

#### 12. AI 处方解析的边角问题
- 位置：`js/app.js:512-566`
- 问题：
  1. `item.phase` 不做大小写/空白归一：AI 返回 `"Strength"` 会新建一个名为 "Strength" 的阶段块（而非归入 strength），与同名覆盖逻辑打架；
  2. 只含 `coach_review` 不含 `prescription` 的合法回复：装载成功但**无任何 toast**（成功提示被包在 `if (data.prescription…)` 里），用户不知道胶囊条是刚更新的；
  3. 失败用 `alert()`，与全应用 toast 体系不一致且阻塞；
  4. 同名覆盖时 `item.overload_status || ''` 会把已有状态清空（AI 偶尔漏字段即丢失🟢/🔴标记）；
  5. `suggested_sets` 为空数组的动作会创建出一个**永远无法完成**的卡片（`isExerciseDone` 要求 `sets.length > 0`），阶段进度卡死在 x/y-1。
- 建议：phase 键 `String(item.phase).trim().toLowerCase()` 白名单兜底；review-only 也给 toast；`overload_status` 用 `??` 语义；空 sets 时给一个默认 working 组或跳过该动作。

#### 13. 节拍教练与 A/B 切换、语音取消脱节
- 位置：`js/app.js:266-339`
- 问题：
  1. 带练运行中切换 A/B：教练继续按**旧计划**的动作倒计时/播报，结束后把勾打在旧计划的 set 上，而主视图已是另一计划（`completeSet` 里的阶段完成判断却用新计划的 `activeSession`，判断基准错位）；
  2. `stopTempoCoach` 不调用 `speechSynthesis.cancel()`，提前退出时「准备/稳住」语音仍在继续；
  3. 带练运行中打开其他抽屉（配置中心 DOM 更靠后）会盖住教练抽屉，两者 z-index 相同（100）。
- 建议：切换计划时自动 `stopTempoCoach()`（含 cancel 语音）；或教练 UI 上注明「正在带练 A 日动作」。

#### 14. 休息计时器没有手动启动入口
- 位置：`js/app.js:379-398`
- 问题：计时器只能在「完成一组」后自动启动。训练中想提前歇 2 分钟（还没打卡）时无从下手。
- 建议：顶栏常备一个 ⏱ 按钮（默认 90s 或取当前动作 `target_rest`），与「+15s/✕」同组。

#### 15. 快速编辑弹窗（✏️）无「取消」且可编辑字段过少
- 位置：`index.html:340-361`、`js/app.js:402`
- 问题：
  1. `v-model` 直接绑定真实对象，输入即落库，「保存微调」实际只是关闭；改错名字无法撤销（无取消按钮）；
  2. 无法编辑 `mode`（自重/计时/拉力绳动作只能靠 AI 处方创建，`addExercise` 固定 `weight_reps`）、`tempo`、`pitfalls`、`target`；
  3. `target_rest` 用普通 `v-model` 会写入字符串（当前恰好因 JS 类型强转不炸，属侥幸）。
- 建议：先拷贝到草稿对象，「保存」提交 / 「取消」丢弃；补齐 mode 选择（4 种模式）与 tempo 三个数字输入。

#### 16. `showToast` 无定时器管理
- 位置：`js/app.js:163-166`
- 问题：共享一个 3.5s `setTimeout` 且从不清除——旧 toast 的定时器会提前掐掉新 toast（实测时序：A 后 1s 弹 B，B 只存活 2.5s）。
- 建议：保存 timer id，新 toast 先 `clearTimeout`。

### 🟡 P2 — 低危 / 健壮性

17. **计时器漂移**：休息计时与节拍教练都用 `setInterval(1000)`，长时间后台/低性能机会有累积漂移。建议改 `Date.now()` 基准计算（`timeLeft = Math.max(0, Math.round((deadline - now)/1000))`）。
18. **语音 cancel→speak 竞态**：`speakText` 先 `speechSynthesis.cancel()` 再立即 `speak()`，部分 Chrome 版本会丢第一句（官方已知行为）。可加 50-100ms 延迟 speak 或改用队列。
19. **口诀截断**：`ex.cues.slice(0, 16)`（277 行）可能截在半句。可按标点截断或读全文。
20. **🔇 不静音提示音**：语音开关只影响 TTS，`playTone` 滴答/提示音照常。用户预期「静音」通常是全部静音。建议开关语义覆盖提示音（或分两个开关）。
21. **备份版本号不一致**：导出 `version: '5.0'`（581 行）与应用 semver 1.1.0、存储键 `v10` 三套体系并存，无法用于兼容判断。建议统一为应用版本号 + 结构版本。
22. **blob URL 不回收**：`exportJSONBackup` 的 `URL.createObjectURL` 从不 `revokeObjectURL`（84-86 行），小泄漏。
23. **死字段**：`avg_hr` / `rest_hr` 只存在于初始数据，无处读写（21-22、56-57 行）。要么做进「训练者档案」，要么删。
24. **AI 看板弹窗回退不一致**：胶囊条用 `motivation_highlight || summary`（index.html:55），弹窗直接显示 `motivation_highlight`（373 行）——字段缺失时弹窗出现空框。
25. **localStorage 无结构校验**：存档被篡改/异常（如 `{}`）时，`visiblePhases` 的 `activeSession.value.phases[p.key]` 抛错 → 白屏且无提示（v-cloak 解除前是空白）。建议启动时做 schema 校验 + 损坏时备份旧档并回退 `INITIAL_PLANS`。
26. **v-for 使用索引 key**（index.html:79、102、238、260、275）：增删动作/组时复用 vnode 状态，极端情况下 RPE 面板状态错位。建议用动作名/组序号+动作名组合键。
27. **`stopRestTimer` 后 +15s 的幽灵态不可达但无防护**：`adjustRestTimer` 对 `running=false` 的计时器直接加时（当前 UI 恰好不可达）。加一行 `if (!restTimer.running) return` 更稳。
28. **clipboard 无降级**：非安全上下文（http 部署到 LAN 等场景）直接失败只显示 toast。可加 `document.execCommand('copy')` 兜底。

---

## 二、交互 / 体验（UX）建议

| # | 现状 | 建议 |
|---|---|---|
| U1 | 无「新训练日」概念（同 P0-5） | 顶部或底部栏常驻「🌅 开始新一天」，二次确认后重置 done 状态并归档昨日快照 |
| U2 | 两击打卡（✓→RPE→✓）学习成本高 | 第一次 ✓ 时在按钮旁短暂提示「点 RPE 或再点 ✓ 完成」；或 RPE 面板加一个「用默认 8」按钮，一次点完 |
| U3 | RPE 面板默认显示「RPE 8」像是已选 | 显示「RPE 默认 8」或占位符，区分已选与默认 |
| U4 | 计时模式（拉伸 180s）只能 ±1s 步进 | `ex.mode === 'time'` 时步进取 5s（或长按加速） |
| U5 | 还原备份 / 装载 AI 处方 / 删除动作均无确认 | 破坏性操作统一 `confirm` 或抽屉内确认步骤 |
| U6 | 弹窗只能点按钮/遮罩关闭 | 支持 Esc 关闭；打开时 focus 移入、关闭时还原（当前无 focus trap，Tab 会跑到弹窗后面） |
| U7 | `user-scalable=no` + `maximum-scale=1`（index.html:5） | 允许缩放（WCAG 要求）；若担心误触，改用 `touch-action` 精细控制 |
| U8 | 全局 `user-select: none`（style.css:11） | 胶囊条、Toast、Prompt 预览文本应允许选中复制（当前任何文字都无法长按选中） |
| U9 | 💡✏️ 按钮 24px、✓/🎵 28px | 移动端触控目标建议 ≥ 40px（可扩大点击热区而不改视觉尺寸） |
| U10 | 图标按钮无 `aria-label`（⚙️/🗣️/✕/💡/✏️/🎵/✓） | 补 aria-label，弹窗加 `role="dialog"`/`aria-modal` |
| U11 | 空计划无空态 | 某日一个动作都没有时给引导文案（「去配置中心加动作 / 粘贴 AI 处方」） |
| U12 | 无触觉反馈 | 打卡成功 `navigator.vibrate(30)`（Android/部分 iPhone 生效），成本一行 |
| U13 | 顶栏 A/B 切换后无任何提示 | 切日时 toast 提示当前日期计划，避免误切 |
| U14 | 主按钮文案长（「复制 AI 复盘 Prompt (含硬件约束与推拉诊断)」） | 主文案「📋 复制 AI 复盘 Prompt」，副说明移入 tooltip/首次引导 |

## 三、美术 / 视觉建议

1. **优先修复 31 个缺失工具类**（P1-7 清单）——这是当前视觉与「设计意图」差距的最大来源，尤其：桌面端弹窗全宽、完成卡不置灰、阶段头直角外溢、accessory/core 标题失色。
2. 顶栏 `sticky-header { top: 0.25rem }`（style.css:185）：滚动时顶部留 4px 缝隙露出内容，建议 `top: 0` 并把缝隙交给容器 padding。
3. Toast 使用 `animate-ping`（无限闪烁）持续 3.5s：建议改为 fadeIn + 2.5s 后 fadeOut 的单向动画，减少视觉噪音。
4. 次级文字 `text-slate-500`(#64748b) 在 `bg-slate-900`/`bg-slate-950` 上对比度约 4.5:1 上下，12px 小字偏勉强：建议次级文字提亮到 slate-400，或仅用于装饰性文字。
5. 无 `prefers-reduced-motion` 媒体查询：无限 `animate-ping` 对前庭敏感用户不友好，建议加 `@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }`。
6. 无品牌标识：顶栏只有功能元素，建议加一个极简 logo/字标（如铁灰色哑铃 emoji 或 SVG 单色图标）强化产品识别。
7. 无 favicon（浏览器标签页 404）、无 `theme-color`、无 OG 元信息——分享卡片是空白。
8. 深浅两套阶段色（amber/rose/cyan/indigo/emerald）体系很好，补上缺失的 cyan/indigo 后建议把配色 token 抽成 CSS 变量（`--ph-warmup` 等），方便未来换肤。
9. emoji 图标跨平台渲染差异大（Windows 与 iOS 的 ⏱️🗣️ 差别明显），重要按钮可换内联 SVG。
10. 深色主题整体完成度高：slate 层级、rose 主色、mono 数字处理都正确，`button:active` 缩放反馈也到位——保持。

## 四、性能建议

1. **求解器上限**（P0-6）：最大风险点。除设上限外，`availableDumbbellOptions` 目前是 computed 同步计算——31k 选项的 22 秒阻塞无法被用户打断。
2. **每秒整树重渲染**：`restTimer`/`tempoCoach` 每秒变化触发整个单组件（全部阶段×动作×组）重渲染。当前规模（几十个组）无感，但 AI 处方膨胀到 100+ 组后每 tick 成本可观。建议把「休息计时显示」「节拍教练抽屉」拆成两个子组件，隔离高频响应式依赖。
3. **deep watch 全量写盘**：每次输入击键都 `JSON.stringify` 整个 plansData。当前 ~30KB 量级无所谓，建议加 300-500ms 防抖，并顺带规避隐私模式下 `setItem` 抛错（见 4）。
4. **localStorage 异常未捕获**：配额满/隐私模式禁用时 `watch` 回调里 `setItem` 抛未捕获异常，每次交互都刷一条错误（数据仍在内存中可用）。建议 try/catch + 一次性 toast 警告。
5. 静态资源：`vue.global.prod.js`(128KB) 可在 GitHub Pages 用 `_headers` 加 `Cache-Control: max-age=31536000, immutable`（文件名带版本时）。
6. CSS/HTML/JS 总体积 ~160KB，首屏无网络请求（除 Vue 本地化外零依赖）——性能基线非常好，保持。

## 五、工程化建议

1. **零测试**：核心纯函数（哑铃/拉力绳求解器、AI 处方解析、Prompt 生成）非常适合 Node 单测（本报告的仿真脚本可直接改造为测试基线）。建议加 `tests/` + `node --test`，deploy workflow 里加一个 test job。
2. **无 lint**：建议 ESLint（flat config）+ `prettier`，workflow 加 lint job；能提前抓出 P2-25 这类类型问题。
3. **Vue 版本**：本地化的是 3.3.4（2023-11），3.5.x 有渲染性能改进与 bug 修复。建议升级并在文件头注释版本/来源/校验和。
4. **deploy.yml**：`path: .` 会把 `.github`、`.gitignore`、本审查报告等一起发布到线上。建议显式列出需要的文件（或先 `git archive`）。顺手可加 `404.html`。
5. **app.js 模块化**：621 行单文件尚可读，但建议按职责拆为 `storage.js`（存取+迁移+校验）、`hardware.js`（求解器）、`speech.js`（TTS/音频）、`ai.js`（Prompt/处方解析）、`app.js`（UI 状态），为将来加测试与功能（训练历史、多计划）留空间。
6. **版本体系统一**（P2-21）：应用 semver、`STORAGE_KEY` 的 v10、备份 `version:'5.0'` 三套编号，建议统一：备份文件带 `appVersion` + `schemaVersion`，导入时按 schemaVersion 迁移。
7. CHANGELOG 维护得很好（Keep a Changelog 格式 + 语义化版本）；本次发现的多处「Fixed」声明（如空阶段误判）与实现方式（直接隐藏空阶段）一致，无需改动，仅提示后续发版把本报告修复项纳入 Unreleased。
8. README 的「离线可用」表述建议改为「无需网络请求，浏览器缓存后可离线使用」，避免与 PWA 级离线混淆（若做 PWA 则维持原话并加 manifest + SW）。

---

## 附录 A：缺失 CSS 工具类完整清单（实测）

在 `index.html` / `js/app.js` 中被引用、但 `css/style.css` 未定义（31 个）：

```
flex-wrap            (index.html:274)      拉力绳 chips 不换行
overflow-hidden      (index.html:62)       阶段卡片不裁剪直角
overflow-x-auto      (index.html:152)      RPE 行横向滚动（当前无可见影响）
overflow-y-auto      (index.html:259)      片规列表滚动
max-h-32             (index.html:259)      片规列表限高
max-w-md             (192/218/304)         底部抽屉最大宽度（桌面端拉满视口）
max-w-sm             (324/341/366)         居中弹窗最大宽度（桌面端拉满视口）
min-w-0              (85/115)              长名称截断失效
ml-1                 (34)                  休息计时 ✕ 间距
ml-2                 (57/278)              胶囊「详情>」、chip ✕ 间距
ml-auto              (265/278)             chip ✕ 右对齐失效
mt-1                 (252/349/353/357)     label-输入框间距
my-1                 (206)                 节拍大数字上下间距
mb-1                 (255/270)             小节标题下间距
p-1                  (225)                 Tab 容器内边距
p-0-5                (15)                  A/B 切换组内边距
pb-2                 (219/305/325/342/367) 弹窗头与分隔线间距
pt-1                 (147)                 RPE 面板上间距
pt-2                 (290)                 AI 数据区分隔上间距
pr-2                 (239)                 动作名右间距
px-1-5               (88)                  overload 徽章水平内边距
opacity-60           (80)                  完成卡片不置灰
shadow-lg            (13)                  顶栏投影
shadow-2xl           (192/218/304/324/341/366) 全部弹窗投影
bg-indigo-600        (195)                 节拍 rep 徽章背景
bg-transparent       (276)                 band 输入背景（有默认样式兜底）
border-rose-800      (372)                 AI 看板激励框边框色
text-rose-200        (372)                 AI 看板激励文字色
text-cyan-400        (app.js:93)           accessory 阶段标题色
text-indigo-400      (app.js:94)           core 阶段标题色
cursor-pointer       (52/292)              胶囊条/还原按钮无手型
hover:text-rose-400  (34)                  ✕ 无 hover 变色
sm:text-sm           (179)                 宽屏主按钮字号不升级
```

## 附录 B：验证方法

- CSS 缺失类：正则提取 `class=`/`:class=` 中全部 token，与 style.css 中的类定义逐一比对（31 个缺失 / 其余 170+ 个命中）。
- 拉力绳字符串污染、节拍教练完成流、求解器耗时、阶段插入顺序：将 `app.js` 中对应函数原样复制到独立 Node 脚本（`node v24`）运行实测，结果见正文 P0-2/4、P1-6。
- 其余条目为代码静态审查结论，均标注了行号，可逐条复核。
