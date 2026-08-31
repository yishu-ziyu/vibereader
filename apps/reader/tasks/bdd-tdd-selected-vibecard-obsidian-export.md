# BDD/TDD：选中 VibeCards 的 Obsidian Markdown 导出

日期：2026-06-11

## 业务目标

Notes / Export P1 要支持 Obsidian 格式。上一切片已经支持只导出选中的 VibeCards，本切片在同一条用户路径上增加 Obsidian Markdown 预览和下载，不新建第二套卡片系统，也不改变 Rust-backed 全文 Reading Note 导出。

## 行为 1：只把选中的 VibeCards 导出为 Obsidian Markdown

Given 当前文档有多张 VibeCards

And 用户只勾选其中一张

When 用户点击 Obsidian 导出

Then 预览只包含被选中的卡片

And 未选中的卡片内容不会进入预览

业务规则：Obsidian 导出必须继承 selected-card export 的选择边界，不能退回为全量导出。

## 行为 2：Obsidian Markdown 保留来源引用

Given 被选中的 VibeCard 有 page 和 paragraph id

When 用户生成 Obsidian Markdown

Then frontmatter 包含 `document_id`、`card_count` 和 `tags`

And 卡片正文包含 Obsidian 可读的来源字段、页码、paragraph id 和 source quote / note

业务规则：导出文件进入 Obsidian 后仍然能追溯到 VibeReader 原文位置。

## 行为 3：未选择卡片时不生成 Obsidian 预览

Given 当前没有任何 VibeCard 被选中

When 用户点击 Obsidian 导出

Then 系统提示先选择卡片

And 不生成空的 Obsidian 文件预览

业务规则：避免用户把空文件误认为一次成功导出。

## 边界说明

- 本切片只做选中 VibeCards 的 Obsidian Markdown，不实现完整模板系统。
- 全文 Reading Note 仍保留现有 Rust-backed `exportPersistentReadingNote(documentId)`。
- Obsidian 格式先在前端生成，后续可迁移到 Rust export service。
- 直接用户内容本身不会被篡改；本切片只保证不额外写入 API key、请求 header 或内部日志字段。
