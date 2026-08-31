# Phase 33：Document Content Persistence Foundation

目标：把文本类文档正文从前端运行时状态推进到 Rust-backed SQLite，让 Markdown / Text / HTML 文档在 Recent documents 中可以恢复阅读内容，而不是只恢复 metadata。

## BDD 行为

### 行为 1：文本类文档打开后保存正文

Given 用户打开 Markdown / Text / HTML 文档
When 文档进入工作台并完成解析
Then App 应保存 document metadata
And 应把 `contentText` 写入 `document_contents`
And 保存记录应包含 `documentId`、`sourceType`、`createdAt` 和 `updatedAt`

业务规则：Recent documents 不能只显示文件名；对文本类文档，应具备重启后恢复正文的基础数据。

### 行为 2：Recent 文本文档点击后恢复正文

Given 本地数据库已有某个文本文档的 metadata 和 persisted content
When 用户点击 Recent documents 中的该文档
Then App 应从 Rust storage 加载正文
And 用恢复后的正文打开 DocumentReader
And 重新触发 source index

业务规则：用户不应被迫重新选择本地文件才能继续阅读已经持久化过的文本类文档。

### 行为 3：浏览器 runtime 保持 metadata-only fallback

Given 当前不是 Tauri runtime
When 前端调用 document content 持久化 API
Then adapter 应返回 `null`
And 不应把正文塞回 Web recent metadata

业务规则：浏览器 fallback 继续保持轻量，只用于开发刷新恢复；可靠正文持久化由 Rust-backed storage 承担。

## 边界

- 本切片只恢复 Markdown / Text / HTML 正文。
- 本切片不缓存 PDF 二进制、不做 OCR 缓存，也不改变 PDF 重新打开策略。
- 本切片不做 document 删除级联和 schema migration UI；后续本地数据层任务统一处理。

## TDD 记录

- RED：`cargo test --test storage_core document_content` 先失败于缺少 `DocumentContentInput` 与 storage 方法。
- GREEN：`cargo test --test storage_core document_content` 通过（1 test）。
- RED：`npm run test -- src/services/persistentStorage.test.js` 先失败于缺少 `savePersistentDocumentContent` / `loadPersistentDocumentContent`。
- GREEN：`npm run test -- src/services/persistentStorage.test.js` 通过（1 file / 6 tests）。
- RED：`npm run test -- src/WorkspaceLayout.test.jsx` 先失败于 App 未保存正文、Recent 未恢复正文。
- GREEN：`npm run test -- src/WorkspaceLayout.test.jsx` 通过（1 file / 11 tests）。
- 全量：`npm run test` 通过（49 files / 256 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- 构建：`npm run build` 通过，保留既有 chunk size warning。
- Rust：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（22 storage tests + 1 command test）。
- Whitespace：`git diff --check` 通过。
