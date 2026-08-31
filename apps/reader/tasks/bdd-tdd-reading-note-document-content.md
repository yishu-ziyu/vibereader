# Phase 34：Reading Note Document Content Export

目标：让 Reading Note JSON 导出 / 重新导入覆盖 Phase 33 新增的 `document_contents` 正文数据，确保文本类文档可以通过 JSON 备份完整恢复。

## BDD 行为

### 行为 1：Reading Note JSON 导出携带文档正文

Given 当前文档有 persisted `document_contents`
When 用户导出 Reading Note JSON
Then JSON payload 应包含 `documentContent`
And `documentContent.contentText`、`sourceType`、时间戳应来自本地数据库

业务规则：JSON 备份不能只恢复文档 metadata，否则 Markdown / Text / HTML 文档重新导入后仍缺正文。

### 行为 2：Reading Note JSON 导入恢复文档正文

Given Reading Note JSON payload 包含 `documentContent`
When 用户导入该 JSON
Then Rust storage 应写回 `document_contents`
And `load_document_content(document_id)` 应能读到原正文

业务规则：重新导入 VibeReader 后，Recent 文本文档应具备恢复阅读器的正文基础。

### 行为 3：旧 JSON 仍可导入

Given 旧版 schema v1 Reading Note JSON 缺少 `documentContent`
When 用户导入该 JSON
Then 导入不应因为缺字段失败

业务规则：Phase 30-32 期间导出的 JSON 仍然有效；新增字段必须向后兼容。

## 边界

- 本切片只覆盖 JSON 结构化导出 / 导入，不把正文渲染进 Markdown 导出正文。
- 本切片不改变 `schemaVersion`，`documentContent` 是 v1 的向后兼容可选字段。
- 本切片不处理 PDF 二进制、OCR 缓存或 source spans 的完整导出。

## TDD 记录

- RED：`cargo test --test storage_core reading_note` 先失败于 JSON 缺少 `documentContent`，导入后 `load_document_content` 为空。
- GREEN：`cargo test --test storage_core reading_note` 通过（4 tests）。
- GREEN：`npm run test -- src/services/persistentStorage.test.js` 通过（1 file / 6 tests）。
- 全量：`npm run test` 通过（49 files / 256 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- 构建：`npm run build` 通过，保留既有 chunk size warning。
- Rust：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（22 storage tests + 1 command test）。
- Whitespace：`git diff --check` 通过。
