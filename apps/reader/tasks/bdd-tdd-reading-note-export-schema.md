# Phase 30：Reading Note Export Schema

## BDD 行为

### 行为 1：Reading Note JSON 导出声明导出类型

Given 用户导出当前文档的 Reading Note JSON
When Rust 后端生成结构化 JSON payload
Then payload 顶层应包含 `exportType: "reading_note"`

业务规则：导出的 JSON 可能被重新导入、被其它工具读取，不能只靠字段形状猜测它是什么类型的 VibeReader 产物。

### 行为 2：Reading Note JSON 导出声明 schema 版本

Given 用户导出当前文档的 Reading Note JSON
When Rust 后端生成结构化 JSON payload
Then payload 顶层应包含 `schemaVersion: 1`

业务规则：后续导入、迁移或兼容旧导出文件时，需要明确的版本号，而不是把当前字段结构当成隐式协议。

## 边界条件

- 本切片只声明当前 Reading Note export schema，不实现 JSON 重新导入。
- `exportType` 使用稳定 snake_case 字符串，便于跨语言解析。
- `schemaVersion` 使用整数，后续破坏性变更时递增。

## TDD 记录

- RED：`cargo test --test storage_core builds_markdown_reading_note_export_without_secrets` 先失败于 `ReadingNoteExport` 缺少 `export_type` 和 `schema_version` 字段。
- GREEN：Rust `export_reading_note` 使用常量生成 `exportType: "reading_note"` 和 `schemaVersion: 1`，并同时写入 command 返回体和 JSON payload。
- 验证：目标 Rust 测试已转绿，完整验证见 `tasks/todo.md` 与 `DEVLOG.md`。
