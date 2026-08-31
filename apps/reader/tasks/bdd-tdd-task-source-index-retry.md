# Phase 16 BDD/TDD：Source Index 任务重试

日期：2026-06-11

## 范围

本切片只做一个真实可执行的 task retry 闭环：

- failed / cancelled 的 `source_index` task 在 Tasks 面板里显示 Retry。
- 点击 Retry 后，面板把完整 task record 交给上层。
- App 只对当前文档的 `source_index` task 执行重试，调用现有 `indexDocumentSourceSpans(currentDocument)`。
- 不为 Summary / Attention 伪造重试，因为它们还没有统一 executor。
- 不实现取消；没有真实 cancellation token 前，不显示假的 Cancel。

## BDD 行为

### 行为 1：失败的 source index task 可以请求重试

Given 当前文档的 Tasks 面板里有一个 `status = failed` 的 `source_index` task
When 用户点击 Retry
Then 面板应该调用 `onRetryTask(task)`
And 传出的 task 必须保留 `id`、`documentId`、`type` 和 `status`

业务规则：用户看到 source indexing 失败后，应该有明确恢复动作，而不是只能重新打开文档或重启应用。

### 行为 2：App 把 source index retry 接到当前文档索引

Given 当前 workspace 已打开文档 A
And 用户正在 Tasks 面板点击文档 A 的 failed source index task 的 Retry
When App 收到 retry task
Then App 应该重新调用 `indexDocumentSourceSpans(documentA)`

业务规则：Retry 必须触发真实已有能力，不能只是更新 UI 或写一个新的 task 状态。

### 行为 3：非当前文档或未知 task 类型不执行重试

Given 当前 workspace 已打开文档 A
When App 收到文档 B 或未知 task 类型的 retry task
Then App 不应该调用当前文档索引，也不应该伪造成功

业务规则：task action 必须保持文档隔离，并且不能在没有 executor 的任务类型上制造误导。

## TDD 映射

- `src/TaskStatusPanel.test.jsx`
  - failed `source_index` task 显示 Retry。
  - 点击 Retry 调用 `onRetryTask(task)`。
- `src/WorkspaceLayout.test.jsx`
  - App 传入 `onRetryTask`。
  - 点击 Tasks 面板 mock Retry 后调用 `indexDocumentSourceSpans(currentDocument)`。

## 验收

- RED：目标测试先失败于缺少 Retry 按钮和 App retry callback。
- GREEN：最小实现 `TaskStatusPanel` retry action 和 App source index retry handler。
- 回归：相关单测、全量前端测试、构建、Rust check/test、`git diff --check` 通过。
