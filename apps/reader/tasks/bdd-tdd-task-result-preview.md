# Phase 23 BDD/TDD：Task Result Preview

## Scope

本切片只让 Tasks 面板显示已完成任务的短结果预览，优先服务 Phase 22 的 `paper_overview_agent`。

不在本切片实现 Markdown 渲染、复制、保存到 Notes、VibeCard 生成或 source refs 点击。

## BDD

### 1. 已成功任务显示结果预览

Given 当前文档有一个 `succeeded` 的 `paper_overview_agent` task
And task result 中有 `content`
When 用户查看 Tasks 面板
Then 面板显示该结果的短预览

业务规则：Agent task 的产物必须对用户可见，不能只写入本地 task record。

### 2. 长结果预览必须有长度上限

Given task result content 很长
When Tasks 面板显示结果预览
Then 只显示 bounded preview，并用省略号提示被截断

业务规则：Tasks 面板是任务状态区，不能让长内容撑爆右侧工具栏。

### 3. 没有结果内容时不显示空预览

Given task 没有 `result.content`
When 用户查看 Tasks 面板
Then 不显示空结果容器

业务规则：UI 不应显示无意义的空状态块。

## Test Mapping

- BDD 1 / 2 / 3 -> `src/TaskStatusPanel.test.jsx`

## Verification

- RED：`npm run test -- src/TaskStatusPanel.test.jsx`
- GREEN：同上
- 全量：`npm run test`
- Build：`npm run build`
- Rust：`cd src-tauri && cargo fmt --check && cargo check && cargo test`
- Whitespace：`git diff --check`
