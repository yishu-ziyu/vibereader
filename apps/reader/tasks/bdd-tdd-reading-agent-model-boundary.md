# Phase 37：Reading Agent Model Boundary

## 背景

Phase 36 已经让 `paper_overview_agent` 和 `attention_agent` 可以从 Tasks 面板启动，但 deterministic 本地模型逻辑仍放在 `App.jsx`。随着阅读 Agent 增加，UI 入口不应该继续承载 trace 解释、tool 调用顺序和 source refs 组装。

## 目标

把本地 reading agent model 抽到 `src/agent/readingTaskModels.js`，让它通过自动化测试表达行为契约。`App.jsx` 保留文档状态、工具 adapter 和 task 执行 wiring。

## 范围

- 新增 `readingTaskModels` 公共模块。
- 保持 `paper_overview_agent` 和 `attention_agent` 现有运行行为。
- 为两个本地模型补行为测试。
- 更新 `App.jsx` 从 agent 模块导入模型。

## 不做

- 不新增云模型 planner。
- 不新增 Agent 权限 UI。
- 不改变 Tasks 面板视觉。
- 不改变 tool registry 权限。
- 不引入新的持久化表。

## BDD 行为

### 行为 1：Paper overview model 产出稳定的工具调用和来源引用

Given 当前任务是 `paper_overview_agent`
When runtime 第 1、2 次调用本地模型
Then 模型应依次请求 `get_current_document` 和 `get_document_chunks`

When runtime 把 document metadata 和 chunks 写入 trace 后再次调用模型
Then 模型应返回 `# Paper overview` 内容，并把 chunks 转成 source refs

业务规则：Paper overview 任务先读取元数据，再读取有界 source chunks，最终输出必须能回到原文位置。

### 行为 2：Attention route model 产出稳定的工具调用和来源引用

Given 当前任务是 `attention_agent`
When runtime 第 1、2、3 次调用本地模型
Then 模型应依次请求 `get_current_document`、`list_attention_insights` 和 `get_document_chunks`

When runtime 把 document metadata、saved insights 和 chunks 写入 trace 后再次调用模型
Then 模型应返回 `# Attention route` 内容，并把 insights 与 chunks 都转成 source refs

业务规则：Attention route 任务优先复用已保存 insights，再补充有界正文扫描，最终输出必须保留可回跳来源。

### 行为 3：App 只负责 wiring

Given 用户在 Tasks 面板启动 paper overview 或 attention route
When `App.jsx` 构造 task runtime options
Then `App.jsx` 应从 `src/agent` 获取本地模型，并继续注入当前 document、reading tools 和 attention insight adapter

业务规则：UI/controller 不再拥有模型 trace 解释逻辑，后续 Agent 类型可以在 agent 模块内扩展和测试。

## 边界条件

- trace 缺少 metadata 时，模型使用 `Untitled` / `unknown` 等当前 fallback。
- chunks 或 insights 为空时，输出空状态提示。
- source refs 过滤掉完全没有 page、paragraphId、text 的记录。
- 文本过长时继续按现有规则截断。

## 验收

- `src/agent/readingTaskModels.test.js` 覆盖两个模型的 tool sequence 和 source refs。
- `src/App.jsx` 不再定义 `createLocalPaperOverviewModel` / `createLocalAttentionRouteModel`。
- `npm run test` 通过。
- `npm run build` 通过。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过。
- `git diff --check` 通过。
