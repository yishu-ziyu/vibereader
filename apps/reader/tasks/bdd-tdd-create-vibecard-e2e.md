# Phase 39：Create VibeCard E2E Acceptance

## 背景

Phase 38 已经把 `card_generation_agent` 暴露为 `Create VibeCard`，并在确认后开启一次性写卡权限。Phase 39 要把它推进到产品可验收闭环：用户确认后，右侧 Notes / VibeCards 区必须能看到至少 3 张真实保存的卡片。

## 目标

用户点击 `Create VibeCard` 并确认后，系统用当前文档的 source chunks 创建至少 3 张 source-grounded VibeCards，并自动展示在右侧卡片区。来源不足时不创建部分卡，也不把一两张卡伪装成成功。

## 范围

- 覆盖真实 reading agent loop：model、tools、permissions、create_vibecard adapter。
- 让 agent-generated VibeCard 在 `ArtifactPanel` 中显示标题、来源文本、AI 内容和来源标签。
- 让 App 在任务运行过程中把 3 张 VibeCard 写入现有 artifact 状态，并切换到 Notes。
- 来源不足 3 个 chunks 时明确返回不足说明，不调用 `create_vibecard`。
- 成功后给出“已创建 3 张 VibeCard”反馈。

## 不做

- 不接云模型 planner。
- 不做卡片质量评分。
- 不做 spaced repetition。
- 不做 Anki / Obsidian 新导出能力。
- 不改变现有 Reading Note JSON schema。

## BDD 行为

### 行为 1：确认后真实创建三张卡

Given 用户打开一篇有至少 3 个可用 source chunks 的文档
When 用户点击 `Create VibeCard` 并确认
Then reading agent loop 调用 3 次 `create_vibecard`
And 每次写入都带 documentId、sourceText、page 或 paragraphId

业务规则：最低可用结果是 3 张有来源卡片。

### 行为 2：三张卡进入右侧卡片区

Given 用户确认运行 `Create VibeCard`
When 三张卡保存成功
Then 右侧自动切到 Notes / VibeCards 区
And ArtifactPanel 收到 3 张新卡
And 每张卡都保留 sourceText 和来源定位

业务规则：产品验收看的是用户能不能看到结果，不只是后台 task 成功。

### 行为 3：卡片内容可读

Given agent 创建了一张 VibeCard
When 用户查看 Notes / VibeCards 区
Then 用户能看到卡片标题、来源文本、AI 内容和来源页码/段落

业务规则：VibeCard 不是隐藏 JSON，必须能被阅读、回跳、复用。

### 行为 4：来源不足时不生成部分成功

Given 当前文档少于 3 个可用 source chunks
When 用户确认运行 `Create VibeCard`
Then 系统不调用 `create_vibecard`
And 任务结果说明至少需要 3 个来源片段
And 不显示 `Created 1` 或 `Created 2` 的成功文案

业务规则：不足来源应停止并解释，不能用一张卡冒充完成。

## TDD 映射

- BDD 1 -> `src/agent/cardGenerationFlow.test.js`
- BDD 2 -> `src/WorkspaceLayout.test.jsx`
- BDD 3 -> `src/ArtifactPanel.test.jsx`
- BDD 4 -> `src/agent/readingTaskModels.test.js`

## 验收

- `Create VibeCard` 成功路径保存 3 张卡。
- ArtifactPanel 能显示 agent-generated VibeCard 的 title、sourceText、aiContent 和 source label。
- 少于 3 个 chunks 时不调用 `create_vibecard`。
- 成功后切到 Notes / VibeCards 区。
- 定向测试、全量测试、构建、Rust 检查、diff 检查通过。
