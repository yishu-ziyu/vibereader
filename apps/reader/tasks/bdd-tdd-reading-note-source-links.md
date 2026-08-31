# Phase 27：Reading Note Source Links

## BDD 行为

### 行为 1：导出来源可点击

Given 当前文档已有一个带 `sourceRefs` 的 `reading_note` artifact
When 用户导出当前文档的 Reading Note Markdown
Then VibeCards 区域的来源应渲染为 Markdown 链接
And 文末 Sources 区域应包含对应 anchor 和原文摘录

业务规则：导出的阅读笔记不能只告诉用户“P2 page-2-para-0”，还要让用户在 Markdown/Obsidian 内能从卡片跳到证据摘录。

## 边界条件

- 同一个 source ref 被多个卡片引用时，Sources 区域只应出现一次。
- 没有 source refs 时，不生成空 Sources 区域。
- 没有原文摘录时仍保留可跳转 anchor。

## TDD 记录

- RED：扩展 Rust export 测试，当前 Markdown 只有纯文本 `Source ref`，没有链接、Sources anchor 或摘录。
- GREEN：Rust `export_reading_note` 现在把 source refs 渲染成 Markdown 链接，并在文末输出去重后的 `## Sources` anchor 与摘录。
- 验证：`cargo test --test storage_core reading_note_export_renders_artifact_body_and_source_refs` 通过。
- 回归：`cargo fmt --check && cargo check && cargo test`、`npm run test`、`npm run build` 均通过。
