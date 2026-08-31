# BDD/TDD: VibeCard Drag to Chat

## Scope

继续推进 PRD 的 VibeCard P1：Cards 可以拖入 Chat。这里的 Cards 指 Notes/Artifacts 中统一保存的 VibeCard-style artifacts，包括 Lens Card、Explain Card、Concept Card、Evidence Card。

不做：
- 不新增拖拽库。
- 不自动发送消息。
- 不新增第二套 Chat 注入协议。

## Behaviors

### 行为 1：Notes 中的 VibeCard 可作为拖拽源

Given Notes/Artifacts 中有一张已保存的 VibeCard
When 用户从卡片上开始拖拽
Then 卡片应写入 `application/x-vibereader-drag-inject` 数据
And `text/plain` 应包含可读的卡片摘要
And payload 应包含卡片标题、核心内容和来源页码

业务规则：VibeCard 是阅读资产，必须能重新进入 Chat 上下文。

### 行为 2：拖入 Chat 只注入草稿

Given 用户把 VibeCard 拖到 Chat 面板
When Chat 接收到现有 drag-inject payload
Then 输入框应插入引用文本
And 不应自动发送消息

业务规则：拖拽是构造上下文，不是隐式发起 AI 请求。

### 行为 3：无页码来源的卡片仍可拖拽

Given 某张 VibeCard 没有 page
When 用户拖拽它
Then 仍应生成可读 payload
And page 应回退到默认页码，避免破坏现有 drag-inject parser

业务规则：Concept Card 可能只有 section 来源，不应因此失去进入 Chat 的能力。
