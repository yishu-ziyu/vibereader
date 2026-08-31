# BDD/TDD: Summary to Concept Card

## Scope

继续推进 PRD 的 VibeCard P1：Summary 要点可以保存为 Concept Card，并进入右侧 Notes/Artifacts。

不做：
- 不新增第二套卡片系统。
- 不把每条 bullet 自动拆成多张卡。
- 不改变 Summary 的 AI 生成提示词。

## Behaviors

### 行为 1：已生成摘要可以保存为 Concept Card

Given 当前文档 `doc-1` 的 `Introduction` section 已生成摘要和关键要点
When 用户点击 SummaryCard 里的“保存概念卡片”
Then 系统应创建一张 `concept_card` artifact
And artifact 应包含 `documentId`、section id/title、summary、key points 和原 section text 来源
And artifact 应标记为 `grounded`

业务规则：Summary 要点不是临时 UI 文本，必须能沉淀成可复用阅读资产。

### 行为 2：无文档绑定时不保存 Concept Card

Given SummaryCard 没有 `documentId`
When 用户尝试保存概念卡片
Then 不应创建 artifact
And UI 应提示先打开文档

业务规则：VibeCard 必须按文档隔离，不能生成无归属卡片。

### 行为 3：SummaryPanel 必须把创建结果交回 App

Given 用户在 SummaryPanel 中保存 Concept Card
When `SummaryCard` 创建 artifact 成功
Then `SummaryPanel` 应通过 `onArtifactCreated` 把 artifact 交回 App
And App 应把右侧切到 Notes/Artifacts

业务规则：Summary 不是独立孤岛，产物要进入统一 Notes / VibeCard 流程。

## Boundary Conditions

- section 没有页码时允许保存，但来源至少包含 section id/title 和 section content。
- 没有 key points 但有 summary 时仍允许保存。
- 没有 summary 且没有 key points 时不显示保存入口。
- 持久化失败时不应清空现有 summary。
