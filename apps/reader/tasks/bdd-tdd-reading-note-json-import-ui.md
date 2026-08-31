# Phase 32：Reading Note JSON Import UI

目标：把 Phase 31 的 Rust/SQLite JSON 导入能力接到 Notes / Export 面板，让用户可以从界面把导出的 Reading Note JSON 重新导入 VibeReader。

## BDD 行为

### 行为 1：用户可以粘贴 Reading Note JSON 并导入

Given 用户打开 Notes / Export 面板
When 用户点击 `Import JSON`
And 粘贴 `exportType: reading_note` 的 JSON
And 点击 `Import Reading Note`
Then 前端应调用 `importPersistentReadingNoteJson(json)`
And 导入成功结果应回调给上层刷新

业务规则：JSON 重新导入不能只停留在 Tauri command，必须有用户可触达的导入入口。

### 行为 2：用户可以选择 JSON 文件并走同一导入流程

Given 用户打开 Notes / Export 面板
When 用户选择 `.json` 文件
Then 文件内容应填入 Reading Note JSON 输入框
And 点击 `Import Reading Note` 后应调用同一个持久化导入 adapter

业务规则：导出文件通常来自磁盘下载，导入入口必须支持选择文件，而不是只支持复制粘贴。

### 行为 3：导入成功后刷新最近文档和当前 Notes

Given 用户当前正在阅读文档
When Reading Note JSON 导入成功
Then App 应重新读取最近文档列表
And 如果导入的是当前文档，应重新读取当前文档的 Notes / VibeCards

业务规则：导入成功后用户应能看到恢复的数据，不应要求重启应用才看到结果。

## 边界

- 本切片不做复杂冲突解决 UI；重复导入的替换语义由 Phase 31 Rust storage 保证。
- 本切片不自动切换到导入文档；只刷新最近文档列表和当前文档 Notes。
- 浏览器 runtime 下 adapter 仍可能返回 `null`，UI 显示“不支持本地 JSON 导入”。

## TDD 记录

- RED：`npm run test -- src/ArtifactPanel.test.jsx` 先失败于找不到 `Import JSON` 按钮。
- RED：`npm run test -- src/WorkspaceLayout.test.jsx` 先失败于 `ArtifactPanel` 未收到 `onReadingNoteImported`。
- GREEN：`npm run test -- src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（2 files / 25 tests）。
- 全量：`npm run test` 通过（49 files / 253 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- 构建：`npm run build` 通过，保留既有 chunk size warning。
- Rust：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（21 storage tests + 1 command test）。
- Whitespace：`git diff --check` 通过。
