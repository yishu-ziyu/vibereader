# Phase 22 BDD/TDD：Paper Overview Agent Entry

## Scope

本切片只做第一个用户可见 Agent task 入口：用户在当前文档的 Tasks 面板里启动 `paper_overview_agent`，App 用现有 `runReadingAgentTask` 写入任务生命周期。

不在本切片实现云模型 planner、写入型工具、任务取消、Agent 产物落卡片或完整 Paper Overview 模板。

## BDD

### 1. 当前文档可以启动 Paper Overview Agent

Given 当前 workspace 已打开一个文档
When 用户进入 Tasks 面板并点击 `Paper overview`
Then App 创建 `paper_overview_agent` task，并把当前文档 id 传给 `runReadingAgentTask`

业务规则：Agent 不是隐藏测试能力，必须先有一个用户能看到并触发的真实 task 入口。

### 2. 没有当前文档时不显示启动入口

Given workspace 没有当前文档
When 用户查看 Tasks 面板
Then 不显示 `Paper overview` 启动按钮

业务规则：Agent task 必须绑定文档，不能生成无文档来源的阅读任务。

### 3. 持久 payload 保留可恢复计划，不保存运行时函数

Given 调用方已经提供可序列化的 `payload.agentOptions`
When `runReadingAgentTask` 使用包含函数的运行时 `agentOptions` 执行
Then task record 保留调用方提供的可序列化 `payload.agentOptions`

业务规则：任务重试需要可恢复计划，但数据库不能依赖函数、工具实例或运行时闭包。

## Boundary Conditions

- 本切片只允许 `paper_overview_agent` 启动入口。
- 启动入口只在有 `documentId` 且传入 `onStartAgentTask` 时显示。
- App 只对当前文档启动任务。
- 持久 payload 中的 `agentOptions` 优先使用调用方提供的序列化版本。

## Test Mapping

- BDD 1 -> `src/WorkspaceLayout.test.jsx` 启动 mocked paper overview 后调用 `runReadingAgentTask`
- BDD 2 -> `src/TaskStatusPanel.test.jsx` 有文档时显示启动按钮并回调；无文档时不显示
- BDD 3 -> `src/agent/taskRunner.test.js` 预置 `payload.agentOptions` 不被运行时函数覆盖

## Verification

- RED：`npm run test -- src/agent/taskRunner.test.js src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx`
- GREEN：同上
- 全量：`npm run test`
- Build：`npm run build`
- Rust：`cd src-tauri && cargo fmt --check && cargo check && cargo test`
- Whitespace：`git diff --check`
