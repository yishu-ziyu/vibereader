# Phase 1 Implementation Plan: UniRAG Memory Backend (Narrow Slice)

Date: 2026-07-02

对应 Goal: [phase-1-unirag-memory-backend-goal.md](./phase-1-unirag-memory-backend-goal.md)

## Goal

在 `services/uni-rag` 中实现真实 memory backend，让 Reader 的 memory-aware query 不再只靠 Playwright route mock。

最小可验证路径：

```text
Reader save card -> POST /api/memory/jobs -> UniRAG 持久化 -> 后续 /api/query 带 include_memory=true -> 返回 saved_memory citation -> Reader 渲染「我的记忆」 -> 点击回到 Notes 卡片
```

## Scope (narrow slice)

只做让 smoke 通过的最小集，不做高质量检索/去重/embedding 索引：

1. **MemoryStore (SQLite)** — 持久化 saved_artifact memory payload
2. **POST /api/memory/jobs** — 同步持久化，返回 `status=completed` + `job_id` + `result.memory_id`（Reader 有 fast-path）
3. **GET /api/memory/jobs/{job_id}** — 返回 completed 状态
4. **`/api/query` + `/api/kbs/{kb_id}/query`** — 接收 `include_memory` + `memory_top_k`
5. **Memory 检索** — SQLite LIKE 匹配 question 关键词到 title/text，无匹配则返回最近 N 条；保证 smoke 必出 citation
6. **Citation schema 扩展** — 加 `source_type`、`artifact_id`、`artifact_type`、`memory_id`、`title`、`source_refs` 可选字段，让 Reader 能识别为 `saved_memory`
7. **Memory 注入 prompt** — 把 memory text 作为额外 context 注入 LLM prompt（标记为「用户已保存的记忆」），让 LLM 有机会引用；同时无条件 append 到 citations 列表，保证 smoke 可见

## Out of Scope

- Memory embedding / 向量化检索（phase-2）
- Memory 去重 / 版本管理
- Memory 跨 KB 隔离（先全局共享一个 memory.db）
- Memory 编辑/删除 API
- Memory 的 BM25 索引
- LLM 必须引用 memory（只注入 context + 无条件 append citation）

## Reader 契约（已核对）

### POST /api/memory/jobs 请求体

```json
{
  "memory": {
    "source": "vibereader",
    "kind": "saved_artifact",
    "artifactId": "artifact-xxx",
    "artifactType": "explain_card",
    "title": "...",
    "document": { "id": "", "name": "", "kind": "", "fingerprint": null },
    "verificationStatus": "grounded",
    "sourceRefs": [{ "documentId", "documentName", "page", "paragraphId", "chunkId", "label", "text", "grounding" }],
    "content": { "question", "answer", "summary", "explanation", "body", "userNote", "keyPoints", "claims" },
    "text": "...Markdown...",
    "createdAt": 1782915796655,
    "savedAt": 1782915796655
  }
}
```

字段全部 camelCase。UniRAG Pydantic 端用 `Field(alias="artifactId")` + `populate_by_name=True` 接受。

### POST /api/memory/jobs 响应（Reader 期望 snake_case）

```json
{
  "job_id": "memory-job-xxx",
  "status_url": "/api/memory/jobs/memory-job-xxx",
  "status": "completed"
}
```

Reader 看到 `status=completed` 会跳过轮询直接成功（fast-path），所以**同步持久化即可**，不需要异步 job 状态机。

### GET /api/memory/jobs/{job_id} 响应

```json
{
  "job_id": "memory-job-xxx",
  "status": "completed",
  "step": "done",
  "percent": 100,
  "message": "记忆沉淀完成",
  "result": { "memory_id": "memory-abc" },
  "error": null
}
```

### /api/query 请求体新增字段

```json
{
  "question": "...",
  "include_memory": true,
  "memory_top_k": 3,
  ...existing fields
}
```

### /api/query 响应 citation 扩展

Reader 识别 memory citation 的方式：检查 `source_type`/`sourceType`/`evidence_type`/`kind` 或 `artifact_id`/`memory_id` 任一字段。UniRAG 返回的 saved_memory citation：

```json
{
  "chunk_id": "memory:<memory_id>",
  "source": "saved_memory",
  "section": "<title>",
  "page": 0,
  "text": "<memory.text>",
  "span": null,
  "source_type": "saved_memory",
  "artifact_id": "artifact-xxx",
  "artifact_type": "explain_card",
  "memory_id": "memory-abc",
  "title": "<title>",
  "source_refs": [{...original sourceRefs from Reader...}]
}
```

## Work Breakdown

### Slice 1: Config + Storage

**Files**:
- `services/uni-rag/src/uni_rag/config.py` — 加 `memory_db_path` property
- `services/uni-rag/src/uni_rag/store/memory.py` — 新建 MemoryStore
- `services/uni-rag/tests/unit/test_memory_store.py` — 新建单元测试

**MemoryStore API**:
```python
class MemoryStore:
    def __init__(self, db_path: Path): ...
    def add(self, memory_id, artifact_id, artifact_type, title, text,
            document_id, document_name, source_refs, verification_status,
            created_at, saved_at) -> None
    def get(self, memory_id) -> dict | None
    def search(self, query: str, top_k: int) -> list[dict]  # LIKE + fallback recent
    def list_recent(self, top_k: int) -> list[dict]
    def count(self) -> int
```

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS saved_memories (
    memory_id TEXT PRIMARY KEY,
    artifact_id TEXT NOT NULL,
    artifact_type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    document_id TEXT NOT NULL DEFAULT '',
    document_name TEXT NOT NULL DEFAULT '',
    source_refs_json TEXT NOT NULL DEFAULT '[]',
    verification_status TEXT NOT NULL DEFAULT 'ungrounded',
    created_at TEXT NOT NULL,
    saved_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_artifact ON saved_memories(artifact_id);
CREATE INDEX IF NOT EXISTS idx_memories_created ON saved_memories(created_at DESC);
```

**Search 策略**:
- 按 question 关键词（去除停用词后 split）做 `LIKE %kw%` on (title, text)
- 命中则按 created_at DESC 排序取 top_k
- 无命中则返回最近 top_k 条
- 保证 smoke 必出 citation

### Slice 2: Schemas

**File**: `services/uni-rag/src/uni_rag/api/schemas.py`

- 扩展 `QueryRequest`: 加 `include_memory: bool = False`, `memory_top_k: int = 3`
- 扩展 `Citation`: 加可选字段 `source_type`, `artifact_id`, `artifact_type`, `memory_id`, `title`, `source_refs: list[dict] | None`
- 新增：`MemoryPayload`, `MemoryDocument`, `MemorySourceRef`, `MemoryGrounding`, `MemoryContent`, `MemoryJobsRequest`, `MemoryJobStartResponse`, `MemoryJobStatusResponse`, `MemoryJobResult`
- 所有 camelCase 字段用 `Field(alias="...")` + `model_config = ConfigDict(populate_by_name=True)`

### Slice 3: Pipeline

**File**: `services/uni-rag/src/uni_rag/rag/pipeline.py`

- `RAGPipeline.query(...)` 加参数 `include_memory=False, memory_top_k=3, memory_store=None`
- 若 `include_memory` and `memory_store`:
  - `memories = memory_store.search(question, memory_top_k)`
  - 把 memory text 拼进 user prompt（在 `<context>` 后追加 `<saved_memory>` 块）
  - 不强求 LLM 引用，但无条件 append memory citations 到 result

### Slice 4: Routes

**File**: `services/uni-rag/src/uni_rag/api/routes.py`

- 模块级 `_memory_store`, `_memory_jobs`, `_memory_jobs_lock`
- `get_memory_store()` 懒加载
- `POST /api/memory/jobs`: 接收 `MemoryJobsRequest`，生成 `memory_id` (uuid4 hex)，存 MemoryStore，注册 job status=completed，返回 `MemoryJobStartResponse`
- `GET /api/memory/jobs/{job_id}`: 从 `_memory_jobs` 读，返回 `MemoryJobStatusResponse`
- 修改 `_query_pipeline` 透传 `include_memory` + `memory_top_k` + `memory_store`
- 修改 `/api/query` 和 `/api/kbs/{kb_id}/query` 把 `req.include_memory` 等传给 `_query_pipeline`

### Slice 5: 集成测试

**File**: `services/uni-rag/tests/integration/test_api.py` (新增 test cases)

- `test_memory_jobs_create_and_status` — POST memory，GET status，验证持久化
- `test_query_with_include_memory_returns_saved_memory_citation` — 先 POST memory，再 POST /api/query with include_memory=true，验证 citations 里有 source_type=saved_memory
- `test_query_without_include_memory_does_not_return_memory` — 反向验证
- `test_query_include_memory_empty_store` — 空库不破坏正常 query

### Slice 6: 本地联调 smoke

- 启 UniRAG 8766
- 启 Reader 3217
- 上传 sample.md
- 提问，保存回答卡片
- 等待「记忆沉淀：已完成」
- 再次提问
- 验证回答出现「我的记忆」citation
- 点击 citation 跳回 Notes 卡片
- 失败路径：include_memory=false 时不出现 memory citation

### Slice 7: 文档回写

- `delivery/phase-1-unirag-memory-backend-impl.md` — 实现交付记录
- `e2e/phase-1-unirag-memory-backend-browser.md` — 真实服务 smoke 结果
- `control/run_state.yaml` — 更新 status + completed_artifacts
- `services/uni-rag/DEVLOG.md` 或 README — 记录 memory backend 落地
- `apps/reader/DEVLOG.md` — 如有 Reader 侧改动（预期不需要）

## Verification Environment

- macOS, Python 3.10+ (uv-managed)
- UniRAG: `uv run uni-rag serve --port 8766`
- Reader: `npm run dev -- --port 3217`
- 测试：`cd services/uni-rag && uv run pytest tests/unit/test_memory_store.py tests/integration/test_api.py -v`
- 浏览器 smoke：Playwright 或手动 Chrome

## Acceptance Criteria

| # | 条件 | 验证方法 |
|---|------|---------|
| 1 | POST /api/memory/jobs 接受 Reader payload 并持久化 | 单元测试 + 集成测试 |
| 2 | GET /api/memory/jobs/{job_id} 返回 completed + result.memory_id | 集成测试 |
| 3 | /api/query 接收 include_memory + memory_top_k | 集成测试 |
| 4 | include_memory=true 时返回 saved_memory citation | 集成测试 |
| 5 | saved_memory citation 包含 source_type/artifact_id/artifact_type/memory_id/title/text/source_refs | 集成测试 |
| 6 | include_memory=false 时不返回 memory citation | 集成测试 |
| 7 | 空库时 query 不崩 | 集成测试 |
| 8 | Reader + UniRAG 本地联调 smoke 全路径通过 | 浏览器验证 |
| 9 | 失败路径：UniRAG 不启动时 Reader 普通 RAG 不破坏 | 已有 fallback 验证 |

## Risks

1. **camelCase 字段映射** — Pydantic v2 alias 行为需仔细测试，建议写一个 round-trip 测试
2. **job 状态持久化** — 当前设计是内存 dict，服务重启丢失；Reader 轮询时会拿到 unknown status 继续轮询直到超时。phase-1 可接受，但 smoke 时服务不要中途重启
3. **memory_id 生成** — UniRAG 用 uuid4().hex，Reader 只接收不生成
4. **Citation schema 向后兼容** — 新增字段全部 Optional + default None，老调用方不受影响
5. **LLM 不引用 memory** — 不强求；无条件 append 保证 smoke 可见

## User Confirmation Needed

无。所有改动在 services/uni-rag 内部，不涉及产品定位/主流程/隐私/重依赖。Reader 侧不改代码（契约已对齐）。
