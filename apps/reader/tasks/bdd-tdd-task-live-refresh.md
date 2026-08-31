# Phase 15 BDD/TDD：Task 状态实时刷新

日期：2026-06-11

## 范围

本切片只解决 Tasks 面板的本地实时刷新链路：

- `savePersistentTask` 成功写入 Tauri storage 后，发出本地 task update 事件。
- `TaskStatusPanel` 监听当前文档的 task update 事件，并重新读取该文档任务快照。
- 不引入后台 executor、取消、重试或 Rust progress event stream。

## BDD 行为

### 行为 1：任务状态保存成功后通知当前渲染进程

Given 当前运行在 Tauri runtime
When 前端调用 `savePersistentTask` 成功写入 task record
Then 前端应该发出一个本地 `task updated` 事件
And 事件 payload 应该包含 `documentId` 和 task record

业务规则：任务写入数据库后，当前 UI 不应该依赖用户手动切 tab 才看到状态变化。

### 行为 2：Tasks 面板收到当前文档任务事件后刷新快照

Given 用户正在查看文档 A 的 Tasks 面板
And 面板当前没有任务
When 文档 A 的 task updated 事件发生
Then 面板应该重新调用 `listPersistentTasks(documentId)`
And 显示最新任务状态

业务规则：Summary、Attention、Source Index 等阅读任务完成后，用户能在同一文档上下文里看到最新状态。

### 行为 3：其它文档任务事件不刷新当前面板

Given 用户正在查看文档 A 的 Tasks 面板
When 文档 B 的 task updated 事件发生
Then 文档 A 的 Tasks 面板不应该重新读取任务列表

业务规则：多文档隔离不能被全局 task 事件破坏。

### 行为 4：保存失败或浏览器 no-op 不发送成功事件

Given 当前没有 Tauri persistent storage
When 前端调用 `savePersistentTask`
Then 不应该发出 task updated 事件

业务规则：只有真实持久化成功的 task state 才能驱动 UI 进入“已刷新”的状态。

## TDD 映射

- `src/services/persistentStorage.test.js`
  - 验证 `savePersistentTask` 成功后发出事件。
  - 浏览器 runtime 既有 no-op 测试覆盖不会调用 Tauri command；本切片不新增浏览器事件。
- `src/TaskStatusPanel.test.jsx`
  - 验证当前文档事件触发刷新。
  - 验证其它文档事件不会刷新。

## 验收

- RED：新增测试先失败于缺少 task update 事件和面板订阅。
- GREEN：最小实现事件常量、事件派发和面板监听。
- 回归：相关单测、全量前端测试、构建、Rust check/test、`git diff --check` 通过。
