# Phase 28：Export Filenames

## BDD 行为

### 行为 1：完整 Reading Note 下载文件名包含文档名和日期

Given 用户正在阅读 `Export Paper.pdf`
And 已生成 Reading Note 预览
When 用户下载 Markdown 或 JSON
Then 下载文件名应包含清理后的文档名和当天日期

业务规则：导出文件进入 Finder、Obsidian 或课程资料目录后，应能直接从文件名识别来源文档，而不是只看到内部 document id。

### 行为 2：选中 VibeCards 导出文件名同样包含文档名

Given 用户选择了当前文档的部分 VibeCards
When 用户下载 Selected Markdown 或 Obsidian Markdown
Then 下载文件名应包含清理后的文档名、导出类型和日期

业务规则：部分卡片导出也属于当前文档的阅读产物，不能只用 `doc-1` 这类内部 id 命名。

## 边界条件

- 文档名中的空格、扩展名和特殊字符应清理为稳定 slug。
- 缺少文档名时继续 fallback 到 `documentId`。
- 文件名仍保留日期，便于重复导出时区分版本。

## TDD 记录

- RED：新增 ArtifactPanel 测试，当前下载文件名只包含 `documentId`，不包含文档名。
- GREEN：`ArtifactPanel` 使用 `documentName` 生成导出文件名，App 将 `currentDocument.name` 传给 Notes 面板；缺少文档名时保留 `documentId` fallback。
- 验证：`npm run test -- src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过。
- 回归：`npm run test`、`npm run build`、`cd src-tauri && cargo fmt --check && cargo check && cargo test` 均通过。
