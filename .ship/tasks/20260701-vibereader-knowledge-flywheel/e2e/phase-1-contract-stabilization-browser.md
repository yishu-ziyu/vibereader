# E2E: Phase-1 Contract Stabilization — Browser + Service

> Task id: `20260701-vibereader-knowledge-flywheel`
> Phase: `phase-1-contract-stabilization`
> Contract version: `reader-unirag-memory-v1`
> Date: 2026-07-02
> Services: UniRAG `http://127.0.0.1:8766` (real) + Reader `http://127.0.0.1:3217` (real)
> Tooling: curl (service-level) + Playwright MCP (browser-level)
> Mock: none — real Reader + real UniRAG, no Playwright route mock

## 目标

验证 `reader-unirag-memory-v1` contract 在真实 Reader + 真实 UniRAG 环境下端到端贯通，覆盖：

1. UniRAG health visible / reachable
2. Reader 上传固定测试文档
3. 知识入库完成
4. query 返回 saved_memory citation 带 contract_version + 全字段
5. 失败路径：include_memory=false / unknown memory job / 空 store

## 服务级 E2E（curl 真实 UniRAG）

### 步骤 1：UniRAG health

```bash
curl http://127.0.0.1:8766/api/health
```

结果：`{"status":"ok"}` — PASS

### 步骤 2：POST memory job（saved-answer-card fixture，camelCase contractVersion）

```bash
curl -X POST http://127.0.0.1:8766/api/memory/jobs \
  -H 'Content-Type: application/json' \
  -d @contracts/reader-unirag-memory/v1/saved-answer-card.json
```

结果：`{"job_id":"c8fa9fbbbd5d485080babf614e7b28e3","status":"completed"}` — PASS

contractVersion（camelCase）被 UniRAG Pydantic alias 接受并持久化为 contract_version（snake_case）。

### 步骤 3：GET memory job

```bash
curl http://127.0.0.1:8766/api/memory/jobs/c8fa9fbbbd5d485080babf614e7b28e3
```

结果：`{"status":"completed","memory_id":"c8fa9fbbbd5d485080babf614e7b28e3",...}` — PASS

### 步骤 4：query include_memory=true — saved_memory citations 带 contract_version

```bash
curl -X POST http://127.0.0.1:8766/api/query \
  -H 'Content-Type: application/json' \
  -d '{"question":"监督学习","include_memory":true,"memory_top_k":3}'
```

结果：200，3 个 saved_memory citations，全部含：

```json
{
  "chunk_id": "memory:<memory_id>",
  "source": "saved_memory",
  "source_type": "saved_memory",
  "artifact_id": "<Reader artifactId>",
  "artifact_type": "answer",
  "memory_id": "<UniRAG memory id>",
  "title": "<title>",
  "source_refs": [{...}],
  "contract_version": "reader-unirag-memory-v1"
}
```

PASS — contract_version 端到端贯通（Reader camelCase → UniRAG 持久化 snake_case → query 返回 snake_case → Reader normalize 兼容）。

### 步骤 5：失败路径 — unknown memory job

```bash
curl http://127.0.0.1:8766/api/memory/jobs/nonexistent-job-12345
```

结果：HTTP 404 `{"detail":"Memory job not found: nonexistent-job-12345"}` — PASS

### 步骤 6：失败路径 — include_memory=false

```bash
curl -X POST http://127.0.0.1:8766/api/query \
  -d '{"question":"监督学习","include_memory":false}'
```

结果：200，4 个 document citations，0 个 saved_memory citation — PASS

### 步骤 7：失败路径 — 空 memory store query

UniRAG test_contract_v1.py `test_empty_memory_store_query_does_not_break` 验证：空 store 时 query 不破坏，document citations 正常返回 — PASS

## 浏览器级 E2E（Playwright MCP 对真实 Reader + 真实 UniRAG）

### 步骤 1：UniRAG health visible in Reader UI

Playwright `playwright_navigate` → `http://127.0.0.1:3217/`
`playwright_get_visible_text` 确认 "知识引擎：UniRAG" 可见 — PASS

### 步骤 2：上传 sample.md

file input 是 hidden，先 `playwright_evaluate` 设 `display:block`，再 `playwright_upload_file` 上传 `/Users/mahaoxuan/Desktop/AI产品经理/自研产品/vibereader/apps/reader/demo-assets/sample.md` — PASS

### 步骤 3：知识入库完成

`playwright_evaluate` 读 body.innerText，匹配到 "知识入库：已完成" — PASS

### 步骤 4：浏览器环境 fetch UniRAG query — saved_memory citations 带 contract_version

在 Reader 浏览器 console 用 `fetch('http://127.0.0.1:8766/api/query', ...)` 调真实 UniRAG：

```javascript
const resp = await fetch('http://127.0.0.1:8766/api/query', {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({question:'监督学习', include_memory:true, memory_top_k:3})
});
```

结果：200，7 个 citations（4 document + 3 saved_memory），3 个 saved_memory citations 全部 `contract_version: "reader-unirag-memory-v1"`，字段完整：

```json
{
  "chunk_id": "memory:2dc412ad...",
  "source": "saved_memory",
  "source_type": "saved_memory",
  "artifact_id": "smoke-art-1",
  "artifact_type": "answer",
  "memory_id": "2dc412ad...",
  "title": "服务级smoke测试记忆",
  "source_refs": [{documentId, documentName, page, paragraphId, chunkId, label, text}],
  "contract_version": "reader-unirag-memory-v1"
}
```

PASS — 真实浏览器 + 真实 UniRAG，contract_version 端到端贯通。

### 步骤 5：document citations 字段一致性

同一 query 的 4 个 document citations 也有 `contract_version` 字段（值 null，符合 schema 统一）。Reader normalize 用 `|| 'reader-unirag-memory-v1'` 默认链兼容 — PASS

### 步骤 6：失败路径 — include_memory=false（浏览器环境）

```javascript
fetch(..., {body: JSON.stringify({question:'监督学习', include_memory:false})})
```

结果：200，4 个 citations，0 个 saved_memory（source_type !== 'saved_memory' && contract_version !== 'reader-unirag-memory-v1'）— PASS

### 步骤 7：失败路径 — unknown memory job（浏览器环境）

```javascript
fetch('http://127.0.0.1:8766/api/memory/jobs/nonexistent-job-12345')
```

结果：HTTP 404 `{"detail":"Memory job not found: nonexistent-job-12345"}` — PASS

### 步骤 8：POST memory job（浏览器环境，camelCase contractVersion）

在浏览器 console POST saved-answer-card fixture（含 `contractVersion: "reader-unirag-memory-v1"` camelCase）：

结果：`{"job_id":"4210f65eb5634c1eb2c251f8bc323291","status":"completed"}` — PASS

UniRAG Pydantic `Field(alias="contractVersion")` + `populate_by_name=True` 正确接受 camelCase。

### 步骤 9：Reader Chat 面板可见

切换到 Chat tab，确认：
- "Start a new conversation" 可见
- "Press Enter to send, Shift+Enter for newline" 可见
- "模型：Custom model (MiniMax-M3)" 可见
- Send 按钮存在

PASS — Reader UI 正常加载，Chat 面板就绪。

### 步骤 10：Reader normalize（单测层验证）

Reader `contract.v1.test.js` 6 项验证：
- buildSavedMemoryPayload 输出含 contractVersion: 'reader-unirag-memory-v1'
- normalizeUniRagQueryResponse 透传 contract_version → contractVersion
- UniRAG 缺字段时默认 v1
- normalize unresolved citation 保留缺失 artifactId
- document-only citation 不受 memory contract 影响

PASS — Reader 侧 contract 处理逻辑经单测验证。

## 未完成（阻塞项）

### Chat UI 完整飞轮

handoff 第 3.3 节要求的 10 步飞轮中，步骤 4（提问并获得回答）→ 步骤 5（保存回答为卡片）→ 步骤 7（UI 出现「我的记忆」）→ 步骤 9（点击 memory citation 跳回卡片）未在浏览器 UI 完成。

**阻塞原因**：
1. Chat 输入框是 Slate.js React 富文本编辑器（`div[data-slate-editor="true"][contenteditable="true"]`）。`document.execCommand('insertText', false, '问题内容')` 能插入 DOM 文本，但 Slate 的 React 合成事件 `onBeforeInput` 不被触发，导致 Slate 内部 model 不更新，Send 按钮点击后消息不发出。
2. Chat 依赖 MiniMax API Key 配置（"模型：Custom model (MiniMax-M3)"），当前环境 Key 状态未确认。
3. Playwright MCP 工具集无 `keyboard.type`（只有 `press_key` 按单键），无法模拟 IME 中文输入。

**替代验证**：
- contract 端到端贯通通过"浏览器环境 fetch 真实 UniRAG + Reader 单测验证 normalize"组合验证，等价于完整飞轮的 contract 部分。
- Reader UI 加载、文档上传、知识入库、Chat 面板就绪已在浏览器验证。
- saved_memory citation 的 contract_version + 全字段在真实浏览器 + 真实 UniRAG 环境验证。

**建议**：Codex 复核后，由人工在 Reader UI 手动完成 Chat 飞轮（提问→保存卡片→再提问→点击「我的记忆」），或用完整 Playwright（非 MCP，支持 `page.keyboard.type`）补完 UI 自动化。

## 结论

contract 稳定化核心目标达成：

- `reader-unirag-memory-v1` 在 UniRAG（持久化 + 检索 + 返回）和 Reader（构造 + 发送 + normalize）两侧落地。
- 共享 fixtures 被两侧 contract tests 双向引用。
- 服务级 + 浏览器级真实 E2E 验证 contract_version 端到端贯通。
- 失败路径（unknown job / include_memory=false / 空 store / unresolved citation）覆盖。
- 完整 Chat UI 飞轮受 Slate.js 自动化 + API Key 限制阻塞，标记 needs-codex-review。

status: `needs-codex-review`
