# Phase 42：VibeCard Persistence Restart

## 背景

Phase 38-41 已经让 `Create VibeCard` 可以生成至少 3 张带来源的卡片，并能在当前会话中回到原文。Phase 42 要验证阅读资产能沉淀：应用重启或重新打开同一文档后，VibeCards 仍存在，来源信息仍完整，`回到原文` 仍有足够数据可跳回原文。

## BDD 行为

### 行为 1：重启后恢复当前文档 VibeCards

Given 当前文档已经通过 `Create VibeCard` 保存了 3 张 VibeCard
When 应用重新加载同一文档并读取 Notes / VibeCards
Then 这 3 张 VibeCard 仍应显示在当前文档下

业务规则：VibeCard 是阅读资产，不是当前页面临时状态。

### 行为 2：恢复后的卡片保留来源字段

Given 一张 VibeCard 有 `documentId`、`page`、`paragraphId`、`sourceText`
When 它从本地持久化层恢复为 Notes 中的卡片
Then 卡片应保留原文摘录、AI 内容、来源标签和 `sourceSpanIds`

业务规则：恢复后的卡片仍应可解释、可定位、可导出。

### 行为 3：重启后仍能回到原文

Given 恢复后的 VibeCard 来源是 `P1 · chunk-3`
When 用户点击 `回到原文`
Then App 仍应能派发包含 `documentId`、`page`、`paragraphId`、`text` 的导航事件

业务规则：重启不能破坏回源能力。

### 行为 4：不同文档卡片不串

Given 本地数据库里有多个文档的 VibeCards
When 用户打开其中一个文档
Then Notes / VibeCards 只显示该文档的卡片

业务规则：文档级阅读成果必须隔离。

## TDD 映射

- `src/services/artifactService.persistentRestart.test.js`：覆盖 Tauri 持久化返回的 VibeCard record 能恢复为 source-grounded artifact，并保留 `sourceSpanIds`。
- `src/App.retrievalContext.test.jsx` 或 `src/WorkspaceLayout.test.jsx`：必要时覆盖 App 重新读取当前文档 artifacts 后，回源事件仍包含段落来源。

## 边界

- 本轮不新增卡片生成算法。
- 本轮不改变 SQLite schema。
- 本轮不做最终安装包。
- 本轮先锁住 VibeCard 持久化恢复和回源合同；真实 Tauri 桌面重启仍作为 PM 手动验收项。
