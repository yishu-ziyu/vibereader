# Phase 38：Create VibeCard Agent Entry

## 背景

`card_generation_agent` 已经在 Reading Agent Skill Registry 中注册，但还没有作为可运行入口出现在 Tasks 面板。这个 agent 会写入本地 VibeCard，因此需要用户确认和一次性任务权限，不能使用默认只读权限直接执行。

## 目标

用户在当前文档的 Tasks 面板点击 `Create VibeCard` 后，系统先确认写入，再从当前文档的有界 source chunks 创建至少 3 张 source-grounded VibeCards。

## 范围

- 将 `card_generation_agent` 暴露为可运行 reading task，按钮文案为 `Create VibeCard`。
- 新增本地 deterministic `card_generation_agent` model。
- 一次任务至少尝试创建 3 张 VibeCard。
- 运行前使用确认弹窗说明会写入当前文档。
- 只在本次任务 runtime options 中临时允许 `create_vibecard`。
- 通过现有 artifact/VibeCard persistence 链路保存卡片。

## 不做

- 不接云模型 planner。
- 不做批量质量评分。
- 不做 spaced repetition。
- 不做 Anki / Obsidian 导出。
- 不开放全局写权限。
- 不生成无来源事实卡片。

## BDD 行为

### 行为 1：Tasks 面板显示产品化入口

Given 用户已经打开当前文档
When 用户进入 `Tasks` 面板
Then 用户看到 `Create VibeCard` 按钮

业务规则：用户看到的是产品动作，而不是内部 agent 类型名。

### 行为 2：写入前必须确认

Given 用户点击 `Create VibeCard`
When 系统准备运行会写入卡片的 agent
Then 系统先弹出确认，说明会为当前文档创建至少 3 张 VibeCard

业务规则：写入型 Agent 不能静默修改用户的本地阅读资产。

### 行为 3：取消确认不会创建卡片

Given 用户看到确认弹窗
When 用户取消
Then 不启动 agent task
And 不调用 `create_vibecard`

业务规则：用户取消就是完整停止，不留下半执行任务。

### 行为 4：确认后创建至少 3 张有来源卡片

Given 当前文档有至少 3 个 source chunks
When 用户确认运行 `Create VibeCard`
Then agent 依次读取文档、读取 chunks、调用 3 次 `create_vibecard`
And 每张卡片都有 title、type、sourceText、page 或 paragraphId
And task result 保留 created card 的 source refs

业务规则：第一版 card generation 的最小可用结果是 3 张可回到原文的卡片。

### 行为 5：写权限只对本次任务生效

Given 默认 reading agent permissions 是只读
When 用户确认运行 `Create VibeCard`
Then 本次 task runtime options 才包含 `create_vibecard` 和 `canWriteVibeCards: true`

业务规则：默认 Agent 仍保持读安全，写入只通过明确动作开启。

## TDD 映射

- BDD 1 -> `src/TaskStatusPanel.test.jsx`
- BDD 2 / 3 / 5 -> `src/WorkspaceLayout.test.jsx`
- BDD 4 -> `src/agent/readingTaskModels.test.js` + `src/WorkspaceLayout.test.jsx`

## 验收

- `Create VibeCard` 文案在当前文档 Tasks 面板可见。
- 用户取消确认后不会调用 `runReadingAgentTask`。
- 用户确认后 `runReadingAgentTask` 收到 `card_generation_agent` task。
- Runtime permissions 包含 `create_vibecard` 和 `canWriteVibeCards: true`。
- Model 在足够 chunks 下连续创建 3 张不同 VibeCard。
- `npm run test` 通过。
- `npm run build` 通过。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过。
- `git diff --check` 通过。
