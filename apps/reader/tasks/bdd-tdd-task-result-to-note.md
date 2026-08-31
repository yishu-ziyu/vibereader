# Phase 24 BDD/TDD：Task Result To Note

## Scope

本切片把 completed Agent task 的结果保存为 Notes 中可见的 `reading_note` artifact。

不在本切片实现 Markdown 展开编辑器、source refs 点击、VibeCard 类型归类、批量保存、自动保存或 Agent planner。

## BDD

### 1. 成功任务结果可以保存到 Notes

Given 当前文档有一个 `succeeded` 的 `paper_overview_agent` task
And task result 中有 content
When 用户点击 `Save to Notes`
Then App 创建当前文档绑定的 `reading_note` artifact
And 切换到 Notes 面板

业务规则：Agent task 的产物必须能沉淀成阅读结果，而不是停留在任务列表。

### 2. 没有结果内容的任务不能保存

Given task 没有 result content
When 用户查看 Tasks 面板
Then 不显示 `Save to Notes`

业务规则：不能保存空 note，避免污染本地知识资产。

### 3. 保存后的 reading note 在 Notes 面板可读

Given Notes 面板收到 `reading_note` artifact
When 用户查看该 artifact
Then 能看到 note 标题和正文

业务规则：写入 artifact 后必须是用户可见的阅读产物。

## Test Mapping

- BDD 1 -> `src/WorkspaceLayout.test.jsx`
- BDD 2 -> `src/TaskStatusPanel.test.jsx`
- BDD 3 -> `src/ArtifactPanel.test.jsx`

## Verification

- RED：`npm run test -- src/TaskStatusPanel.test.jsx src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx`
- GREEN：同上
- 全量：`npm run test`
- Build：`npm run build`
- Rust：`cd src-tauri && cargo fmt --check && cargo check && cargo test`
- Whitespace：`git diff --check`
