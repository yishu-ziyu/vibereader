# Phase 26：Reading Note Export Source Refs

## BDD 行为

### 行为 1：导出 Agent Reading Note 时保留来源

Given 当前文档已有一个由 Agent task result 保存的 `reading_note` artifact
And artifact 的 `ai_content` JSON 中包含 `body` 和 `sourceRefs`
When 用户导出当前文档的 Reading Note
Then Markdown 导出应包含该 Reading Note 正文
And Markdown 导出应显示 source ref 的页码和段落锚点

业务规则：Agent 生成的阅读笔记不能在导出时丢掉证据位置，否则用户从 Obsidian/Markdown 回看时无法核查来源。

## 边界条件

- `ai_content` 不是合法 JSON 时，导出不应失败，仍按普通 VibeCard 导出。
- `sourceRefs` 为空时，不应生成空的 Sources 列表。
- 导出仍不能包含 API key、Authorization 等敏感字段。

## TDD 记录

- RED：新增 Rust 存储测试，当前 Markdown 未包含 `reading_note` 的正文和 `sourceRefs` 段落锚点。
- GREEN：`export_reading_note` 的 Markdown renderer 会解析 `reading_note` 的 `ai_content.body` 和 `ai_content.sourceRefs`，导出正文、页码和段落锚点。
- 验证：`cargo test --test storage_core reading_note_export_renders_artifact_body_and_source_refs` 通过。
- 回归：`cargo fmt --check && cargo check && cargo test`、`npm run test`、`npm run build` 均通过。
