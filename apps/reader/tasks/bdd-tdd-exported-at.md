# Phase 29：Exported At Timestamp

## BDD 行为

### 行为 1：Rust Reading Note 导出产物包含导出时间

Given 用户为当前文档生成 Reading Note 导出预览
When Rust 后端返回 Markdown 和 JSON 导出内容
Then 导出结果应包含同一个 `exportedAt` 时间戳
And Markdown metadata 应显示 `Exported At`

业务规则：Reading Note 是可归档的阅读产物，文件内容需要记录实际导出时间，不能只依赖 Finder 文件时间或前端点击时间。

### 行为 2：完整 Reading Note 下载文件名使用导出时间

Given Rust 导出预览返回 `exportedAt`
When 用户下载 Markdown 或 JSON
Then 文件名日期应来自 `exportedAt`

业务规则：同一次导出的 Markdown、JSON 和内部 metadata 应共享同一个时间来源，避免预览和下载跨日期时产生不一致。

## 边界条件

- `exportedAt` 使用毫秒级 Unix timestamp，保持前后端传输简单。
- 旧环境或异常返回缺少 `exportedAt` 时，前端继续 fallback 到当前时间。
- 选中 VibeCards 导出仍由前端即时生成，暂不强行迁移到 Rust 导出时间。

## TDD 记录

- RED：`npm run test -- src/ArtifactPanel.test.jsx` 先失败于完整 Reading Note 文件名仍使用浏览器当前日期；`cargo test --test storage_core builds_markdown_reading_note_export_without_secrets` 先编译失败于 `ReadingNoteExport` 缺少 `exported_at` 字段。
- GREEN：Rust `export_reading_note` 生成 `exportedAt`，返回体、JSON payload 和 Markdown metadata 共享同一时间戳；`ArtifactPanel` 在完整 Reading Note Markdown / JSON 下载时使用 `exportPreview.exportedAt` 生成文件名日期。
- 验证：目标测试已转绿，完整验证见 `tasks/todo.md` 与 `DEVLOG.md`。
