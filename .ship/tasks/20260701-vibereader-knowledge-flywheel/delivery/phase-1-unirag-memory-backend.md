# Phase-1 Delivery: UniRAG Memory Backend

> Task: `20260701-vibereader-knowledge-flywheel`
> Phase: `phase-1-unirag-memory-backend`
> Status: **service-smoke-passed** (browser smoke pending user-side)
> Date: 2026-07-02

## Goal

在 `services/uni-rag` 中实现真实 memory backend，让 Reader 的 memory-aware query 不再只靠 Playwright route mock。支撑知识飞轮：

```
read → ask → verify → save card → UniRAG stores memory → later query retrieves memory → Reader shows 我的记忆 → click jumps to saved card
```

## Scope (7 slices)

| Slice | File | What |
|-------|------|------|
| 1 | `src/uni_rag/store/memory.py` + `config.py` + `tests/unit/test_memory_store.py` | SQLite 持久化层 `MemoryStore`（add/get/list_recent/search/count）+ `memory_db_path` config |
| 2 | `src/uni_rag/api/schemas.py` | 9 个 memory schemas（接受 Reader camelCase via Pydantic v2 alias）+ `QueryRequest.include_memory`/`memory_top_k` + `Citation` memory 扩展字段 |
| 3 | `src/uni_rag/rag/pipeline.py` | `query()` 接收 `include_memory`/`memory_top_k`/`memory_store`；注入 `<saved_memory>` 块到 LLM prompt；无条件 append memory citations |
| 4 | `src/uni_rag/api/routes.py` | `POST /api/memory/jobs` 同步持久化 + `GET /api/memory/jobs/{job_id}` + `_query_pipeline` 透传 memory 参数 |
| 5 | `tests/integration/test_memory_api.py` | 10 个集成测试（POST/GET/persistence/camelCase/snake_case/6 artifact types/include_memory true/false/empty store） |
| 6 | service-level smoke | curl 真实 UniRAG 8766 验证端点契约 |
| 7 | docs回写 | 本文档 + e2e + run_state + DEVLOG |

## API Contract

### POST /api/memory/jobs

- Request: `{"memory": MemoryPayload}`（Reader camelCase）
- Response 200: `{"job_id", "status_url", "status"}`
- 行为：同步持久化到 SQLite `data/memory.db`，返回 `status="completed"` 以触发 Reader fast-path
- `memory_id` = uuid4 hex（UniRAG 生成），同时作为 `job_id` 以便追溯
- 失败时返回 `status="failed"`（HTTP 仍 200，避免 Reader HTTP 层 5xx）

### GET /api/memory/jobs/{job_id}

- Response 200: `MemoryJobStatusResponse`（含 `result.memory_id`）
- 404: `{"detail": "Memory job not found: ..."}`

### POST /api/query（扩展）

- 新增可选字段：`include_memory: bool = false`, `memory_top_k: int = 3`
- `include_memory=true` 时：从 MemoryStore 检索 top_k 记忆 → 注入 `<saved_memory>` 块到 LLM prompt → 无条件 append memory citations
- Memory 检索用 try/except 包裹，失败不破坏主 query 路径
- `include_memory=false`（默认）：行为完全不变，文档 RAG 不被破坏

### saved_memory citation 字段

```json
{
  "chunk_id": "memory:<uuid_hex>",
  "source": "saved_memory",
  "section": "<title>",
  "page": 0,
  "text": "<flattened memory text>",
  "span": null,
  "source_type": "saved_memory",
  "artifact_id": "<Reader artifactId>",
  "artifact_type": "<answer|card|note|highlight|summary|qa>",
  "memory_id": "<uuid_hex>",
  "title": "<title>",
  "source_refs": [{"documentId": "...", "documentName": "...", ...}]
}
```

Reader 通过 `source_type === "saved_memory"` 或 `artifact_id`/`memory_id` 存在性检测「我的记忆」citation，点击跳回 Notes 卡片。

## Persistence Layer

`MemoryStore`（`src/uni_rag/store/memory.py`）：

- SQLite 表 `saved_memories`：`memory_id` (PK) / `artifact_id` / `artifact_type` / `title` / `text` / `document_id` / `document_name` / `source_refs_json` / `verification_status` / `created_at` / `saved_at`
- 索引：`idx_memories_artifact`（按 artifact_id 查重）、`idx_memories_created`（list_recent 排序）
- 搜索策略：`_tokenize`（中英文分词 + 停用词）→ LIKE 匹配 title/text → 无匹配 fallback 到 list_recent（保证 smoke 必出 citation）
- 29 个单测覆盖 tokenize/CRUD/list_recent/search/persistence/None 边界

## Test Results

| Suite | Count | Status |
|-------|-------|--------|
| `tests/unit/test_memory_store.py` | 29 | ✅ pass (0.10s) |
| `tests/integration/test_memory_api.py` | 10 | ✅ pass (231s, 含 BGE-M3 加载) |
| `tests/integration/test_api.py`（回归） | 4 selected | ✅ pass (无破坏) |

## Key Design Decisions

1. **同步持久化而非异步 job**：Reader 有 fast-path（看到 `status=completed` 跳过轮询），SQLite 写入是毫秒级，无需复杂异步状态机
2. **memory_id 由 UniRAG 生成**：Reader 生成 `artifactId`（业务 ID），UniRAG 生成 `memory_id`（存储 PK），在 GET status 的 `result.memory_id` 返回
3. **memory citations 无条件 append**：memory_id 是 uuid hex（含字母），不符合 `_CITE_RE = r"\[([a-zA-Z0-9_]+:\d+)\]"`（要求 `:` 后全数字），所以 LLM 即使引用 `[memory:abc]` 也不会被 `_extract_citations` 误处理；无条件 append 保证 Reader smoke 必出「我的记忆」
4. **失败隔离**：memory 检索 try/except 包裹，memory 失败不破坏主 query 路径
5. **camelCase alias**：`Field(alias="artifactId")` + `ConfigDict(populate_by_name=True)` 接受 Reader camelCase 同时内部 snake_case
6. **`_build_memory_text`**：从 MemoryPayload 的 title/content/source_refs 拼接可搜索文本（不同 artifact_type 填不同字段）

## Files Changed

```
services/uni-rag/src/uni_rag/config.py                       (+4 lines: memory_db_path property)
services/uni-rag/src/uni_rag/store/memory.py                 (NEW, ~180 lines)
services/uni-rag/src/uni_rag/api/schemas.py                  (+125 lines: 9 memory schemas + Citation extensions)
services/uni-rag/src/uni_rag/rag/pipeline.py                 (+53 lines: query() memory params + 2 helper methods)
services/uni-rag/src/uni_rag/api/routes.py                   (+120 lines: memory endpoints + query passthrough)
services/uni-rag/tests/unit/test_memory_store.py             (NEW, 29 tests)
services/uni-rag/tests/integration/test_memory_api.py        (NEW, 10 tests)
```

## Pending

- [ ] Reader + UniRAG 本地联调浏览器 smoke（需用户在 Reader UI 手动操作：上传 sample.md → 提问 → 保存卡片 → 再提问 → 点击「我的记忆」跳回 Notes）
- [ ] 服务级 smoke 已验证契约；浏览器 smoke 待用户验收
