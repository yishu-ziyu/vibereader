# Phase-1 E2E: UniRAG Memory Backend — Service-Level Smoke

> Task: `20260701-vibereader-knowledge-flywheel`
> Phase: `phase-1-unirag-memory-backend`
> Type: service-level (curl against running UniRAG 8766)
> Date: 2026-07-02
> Status: ✅ passed

## 为什么是服务级而非浏览器级

用户是产品经理，浏览器级 smoke 需要在 Reader UI 手动操作（上传文件 / 提问 / 保存卡片 / 点击引用跳转）。UniRAG 侧的契约可通过 curl 直接验证 HTTP 端点行为，无需 Reader UI 介入。本文档证明 UniRAG memory backend 真实工作；浏览器级 smoke 待用户在 Reader 联调时验收（见 `e2e/phase-1-memory-aware-query-browser.md` 的延伸）。

## 环境

- UniRAG: `uv run uni-rag serve --port 8766`（services/uni-rag，加载 .env）
- 数据目录: `services/uni-rag/data/`（含已有 sample.pdf 等 ingest 产物 + 新 memory.db）
- LLM: MiniMax M3（.env 中的 UNI_RAG_LLM_API_KEY）

## 测试步骤与结果

### Step 1: Health check

```bash
curl -s http://127.0.0.1:8766/api/health
```

✅ Response: `{"status":"ok"}`

### Step 2: POST /api/memory/jobs（Reader camelCase payload）

```bash
curl -s -X POST http://127.0.0.1:8766/api/memory/jobs \
  -H "Content-Type: application/json" \
  -d '{"memory":{"source":"vibereader","kind":"saved_artifact","artifactId":"smoke-art-1","artifactType":"answer","title":"服务级smoke测试记忆","document":{"id":"doc-smoke","name":"sample.md","kind":"md"},"verificationStatus":"ungrounded","sourceRefs":[{"documentId":"doc-smoke","documentName":"sample.md","page":1,"chunkId":"src1","label":"§1","text":"监督学习使用标注数据。"}],"content":{"question":"什么是监督学习？","answer":"监督学习使用标注数据训练模型。","summary":"","explanation":"","body":"","userNote":"","keyPoints":[],"claims":[]},"text":"","createdAt":1735900000,"savedAt":1735900000}}'
```

✅ Response:
```json
{
  "job_id": "2dc412ad66a34e1396141b3de449eb93",
  "status_url": "/api/memory/jobs/2dc412ad66a34e1396141b3de449eb93",
  "status": "completed"
}
```

**关键验证点**：
- `status="completed"` → 触发 Reader fast-path（跳过轮询）
- `job_id` = uuid hex（与 memory_id 相同，便于追溯）

### Step 3: GET /api/memory/jobs/{job_id}

```bash
curl -s http://127.0.0.1:8766/api/memory/jobs/2dc412ad66a34e1396141b3de449eb93
```

✅ Response:
```json
{
  "job_id": "2dc412ad66a34e1396141b3de449eb93",
  "status": "completed",
  "step": "done",
  "percent": 100,
  "message": "记忆已保存",
  "result": {
    "memory_id": "2dc412ad66a34e1396141b3de449eb93",
    "chunks": 1
  },
  "error": null
}
```

**关键验证点**：
- `result.memory_id` 返回给 Reader（Reader 后续可用它做 citation 跳转）

### Step 4: GET 不存在的 job_id → 404

```bash
curl -s http://127.0.0.1:8766/api/memory/jobs/nonexistent
```

✅ Response: `{"detail":"Memory job not found: nonexistent"}`（HTTP 404）

### Step 5: POST /api/query with include_memory=true

```bash
curl -s -X POST http://127.0.0.1:8766/api/query \
  -H "Content-Type: application/json" \
  -d '{"question":"什么是监督学习？","include_memory":true,"memory_top_k":3}'
```

✅ Response（节选）：
```json
{
  "answer": "## 监督学习的定义\n\n监督学习（Supervised Learning）...\n[a758192176a2ca28:147]...",
  "citations": [
    {"chunk_id":"a758192176a2ca28:147","source":"sample.pdf","source_type":null,...},
    {"chunk_id":"a758192176a2ca28:339","source":"sample.pdf","source_type":null,...},
    {"chunk_id":"1038c8a148cee7af:147","source":"sample_copy.pdf","source_type":null,...},
    {"chunk_id":"ad89efaf39a50e51:147","source":"escape.pdf","source_type":null,...},
    {
      "chunk_id": "memory:2dc412ad66a34e1396141b3de449eb93",
      "source": "saved_memory",
      "section": "服务级smoke测试记忆",
      "page": 0,
      "text": "服务级smoke测试记忆\n什么是监督学习？\n监督学习使用标注数据训练模型。\n监督学习使用标注数据。",
      "span": null,
      "source_type": "saved_memory",
      "artifact_id": "smoke-art-1",
      "artifact_type": "answer",
      "memory_id": "2dc412ad66a34e1396141b3de449eb93",
      "title": "服务级smoke测试记忆",
      "source_refs": [{"documentId":"doc-smoke","documentName":"sample.md","page":1,"paragraphId":"","chunkId":"src1","label":"§1","text":"监督学习使用标注数据。"}]
    }
  ],
  "session_id": "93aa69c341dc4c20af9f52711612d619"
}
```

## 关键验证点汇总

| 验收项 | 结果 |
|--------|------|
| POST /api/memory/jobs 返回 status=completed | ✅ |
| GET /api/memory/jobs/{job_id} 返回 result.memory_id | ✅ |
| GET 不存在 job_id 返回 404 | ✅ |
| /api/query include_memory=true 返回 saved_memory citation | ✅ |
| saved_memory citation 含 source_type="saved_memory" | ✅ |
| saved_memory citation 含 artifact_id / artifact_type / memory_id / title / source_refs | ✅ |
| chunk_id 以 "memory:" 开头（不与文档 chunk 冲突） | ✅ |
| 文档 RAG 未被破坏（4 个文档 citation 正常返回） | ✅ |
| LLM 真实调用成功（MiniMax M3） | ✅ |
| include_memory=false 默认行为不变（见集成测试） | ✅ |

## 未验证（需用户浏览器联调）

- [ ] Reader UI 上传 sample.md → 提问 → 保存回答卡片 → 触发 POST /api/memory/jobs
- [ ] Reader 再次提问 → 回答区出现「我的记忆」分区
- [ ] 点击「我的记忆」citation → 跳回 Notes 卡片
- [ ] Notes 卡片可验证原始 source_ref（documentName/page/chunkId）

这些步骤需要 Reader UI 交互，超出 UniRAG 服务级 smoke 范围。Reader 侧 contract 已在 `delivery/phase-1-memory-aware-query.md` 验证（Playwright route mock），现在 UniRAG 真实 backend 已就绪，可切换到真实联调。
