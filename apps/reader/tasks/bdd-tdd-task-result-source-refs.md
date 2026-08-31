# Phase 25：Task Result Source Refs

目标：Agent task 结果保存到 Notes 时，不能只保存纯文本。若 task result 带有来源引用，Reading Note artifact 必须保留 source refs、标记为 grounded，并能在 Notes 面板展示来源标签。

## BDD 行为

### 行为 1：Agent task lifecycle 保留来源引用

Given reading agent 返回 completed result
And result 中包含 `sourceRefs`
When `runReadingAgentTask` 写入 succeeded task record
Then task `result.sourceRefs` 应保留 bounded source refs

业务规则：任务结果是后续 Notes / Export / 回跳的来源，不能在 task runner 层丢掉来源。

### 行为 2：保存 task result 到 Notes 时保留来源

Given 当前文档有一个 succeeded agent task
And task result 中有 content 和 sourceRefs
When 用户点击 `Save to Notes`
Then App 创建 `reading_note` artifact
And artifact 的 `currentContent.sourceRefs`、`sourceSpanIds`、`source` 和 `verificationStatus` 应反映这些来源

业务规则：有来源的 Agent 输出应成为 grounded Reading Note，而不是 ungrounded 纯文本。

### 行为 3：Reading Note 显示来源标签

Given Notes 面板收到 `reading_note` artifact
And artifact `currentContent.sourceRefs` 包含页码和段落 id
When 用户查看该 note
Then Notes 面板应显示来源标签，例如 `P2 · page-2-para-0`

业务规则：用户需要一眼知道 Note 来自文档哪里，后续才能回跳和导出。

## 边界

- 没有 sourceRefs 的 task result 仍可保存，但保持 `ungrounded`。
- sourceRefs 只保存 bounded metadata，不保存全文。
- 本切片不实现完整 Markdown 模板合并，也不新增云模型 planner。
