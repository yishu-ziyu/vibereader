# Phase 31：Reading Note JSON Import

## BDD 行为

### 行为 1：Rust 可以重新导入 Reading Note JSON

Given 用户已经从 VibeReader 导出 Reading Note JSON
When Rust 后端导入这个 JSON
Then SQLite 中应恢复该文档 metadata、摘要、批注、VibeCards、Flashcards、Attention insights、Thinking Tree 和 Conversations

业务规则：PRD 要求 JSON 可重新导入 VibeReader；导入不能只是解析成功，必须把阅读产物写回本地数据层。

### 行为 2：导入必须校验导出类型和 schema 版本

Given 用户导入一个 JSON 文件
When JSON 缺少 `exportType: "reading_note"` 或 `schemaVersion: 1`
Then Rust 后端应返回 validation error

业务规则：导入是写库操作，不能把未知 JSON 当成 VibeReader 阅读笔记写入。

### 行为 3：前端 adapter 暴露 Tauri 导入命令

Given Tauri persistent storage 可用
When 前端调用 `importPersistentReadingNoteJson(json)`
Then 它应调用 `storage_import_reading_note_json`

业务规则：后续文件选择 UI 应复用统一 adapter，而不是在组件里直接调用 Tauri command。

## 边界条件

- 本切片不实现“选择 JSON 文件”的 UI。
- 本切片只支持 `schemaVersion: 1`。
- 同一文档重复导入时，文档级集合应按导出内容恢复，而不是追加重复的 annotation / attention / flashcard rows。

## TDD 记录

- RED：`cargo test --test storage_core import_reading_note` 先失败于 `Storage` 缺少 `import_reading_note_json`；`npm run test -- src/services/persistentStorage.test.js` 先失败于缺少 `importPersistentReadingNoteJson`。
- GREEN：Rust `import_reading_note_json` 校验 `exportType/schemaVersion` 后把导出的 Reading Note JSON 写回 SQLite；Tauri command `storage_import_reading_note_json` 和前端 adapter `importPersistentReadingNoteJson` 已接通。
- 验证：目标 Rust/前端测试已转绿，完整验证见 `tasks/todo.md` 与 `DEVLOG.md`。
