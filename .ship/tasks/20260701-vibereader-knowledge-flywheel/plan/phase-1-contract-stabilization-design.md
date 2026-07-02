# Phase-1 Design: Reader-UniRAG Memory/Citation Contract Stabilization

> Task: `20260701-vibereader-knowledge-flywheel`
> Phase: `phase-1-contract-stabilization`
> Route: `/yishuship:design` → `/yishuship:dev` → `/yishuship:e2e` → `/yishuship:handoff`
> Date: 2026-07-02
> Contract version: `reader-unirag-memory-v1`

## Goal

把 Reader ↔ UniRAG 的 memory/citation 边界做成可测试、可版本化、可回放的 contract。完成后必须能证明完整飞轮：

```
Reader 打开文档 → 提问 → 保存卡片 → Reader POST UniRAG memory →
再提问 include_memory=true → UniRAG 返回 saved_memory citation →
Reader 显示「我的记忆」→ 点击 → 跳回卡片或源位置（找不到时明确降级）
```

## Scope

1. 定义 `reader-unirag-memory-v1` contract（schema + 版本字段）
2. 新增共享 JSON fixtures（`contracts/reader-unirag-memory/v1/`）
3. UniRAG 侧 contract tests（fixtures 可被接收/持久化/检索/返回稳定字段）
4. Reader 侧 contract tests（构造 payload / ingest / normalize / render / jump / 降级）
5. 真实浏览器 E2E（真实 Reader + 真实 UniRAG，非仅 route mock）
6. 失败路径覆盖（missing memory job / UniRAG 不可用 / citation 找不到目标）
7. yishuship delivery/e2e 报告 + run_state/DEVLOG 回写

## Out of Scope

- 云端 monorepo 迁移
- UI 重设计
- memory 去重/编辑/版本历史
- 云同步/账号系统
- 更换 model provider
- 替换 Reader 或 UniRAG 现有架构
- 收束 artifactType 枚举值（仅记录分歧，不改 Reader 现有值）

## Interface / Contract

### 1. Memory Payload（Reader → UniRAG POST /api/memory/jobs）

Reader 发 camelCase，UniRAG 用 Pydantic alias 接收。新增 `contractVersion` 字段（兼容新增，旧 Reader 不发时 UniRAG 默认 `reader-unirag-memory-v1`）。

```json
{
  "memory": {
    "source": "vibereader",
    "kind": "saved_artifact",
    "artifactId": "<Reader artifact id>",
    "artifactType": "<explain_card|lens_card|evidence_card|concept_card|concept|reading_note>",
    "title": "<title>",
    "document": { "id": "...", "name": "...", "kind": "...", "fingerprint": "..." },
    "verificationStatus": "grounded|ungrounded",
    "sourceRefs": [
      {
        "documentId": "...", "documentName": "...", "page": 1,
        "paragraphId": "...", "chunkId": "...", "label": "P1",
        "text": "<source excerpt>",
        "grounding": { "precision": "paragraph|page|text|unknown", "matchedBy": "...", "score": 0.0 }
      }
    ],
    "content": { "question": "...", "answer": "...", "summary": "...", "explanation": "...", "body": "...", "userNote": "...", "keyPoints": [], "claims": [] },
    "text": "<flattened markdown>",
    "createdAt": 1735900000,
    "savedAt": 1735900000,
    "contractVersion": "reader-unirag-memory-v1"
  }
}
```

**artifactType 分歧记录**：handoff 期望 `answer|card|note|highlight|summary|qa`，但 Reader 实际发 `explain_card|lens_card|evidence_card|concept_card|concept|reading_note`（savedMemoryService.js INGESTIBLE_ARTIFACT_TYPES）。本阶段不收束：UniRAG `artifact_type` 是自由字符串（`extra="allow"`），接受任何值；fixtures 用 Reader 实际值保证真实可回放；contract 文档记录此分歧为未来收束项。

### 2. Memory Job Response（UniRAG → Reader）

POST 同步返回 `status="completed"`（Reader fast-path）：

```json
{ "job_id": "<memory_id>", "status_url": "/api/memory/jobs/<memory_id>", "status": "completed" }
```

GET 返回：

```json
{
  "job_id": "<memory_id>", "status": "completed", "step": "done", "percent": 100,
  "message": "记忆已保存",
  "result": { "memory_id": "<memory_id>", "chunks": 1 },
  "error": null
}
```

### 3. Query with Memory（Reader → UniRAG POST /api/query）

Reader body 用 snake_case：

```json
{
  "question": "...", "session_id": "...", "top_k": 5,
  "style": "academic", "provider": "minimax", "mode": "chat",
  "include_memory": true, "memory_top_k": 3
}
```

### 4. saved_memory Citation（UniRAG → Reader）

UniRAG 返回 snake_case，Reader normalize 时兼容 snake_case + camelCase。新增 `contract_version` 字段：

```json
{
  "chunk_id": "memory:<memory_id>",
  "source": "saved_memory",
  "section": "<title>",
  "page": 0,
  "text": "<memory text>",
  "span": null,
  "source_type": "saved_memory",
  "artifact_id": "<Reader artifactId>",
  "artifact_type": "<explain_card|...>",
  "memory_id": "<UniRAG memory id>",
  "title": "<title>",
  "source_refs": [
    {
      "documentId": "...", "documentName": "...", "page": 1,
      "paragraphId": "...", "chunkId": "...", "label": "P1",
      "text": "...",
      "grounding": { "precision": "...", "matchedBy": "...", "score": 0.0 }
    }
  ],
  "contract_version": "reader-unirag-memory-v1"
}
```

**兼容性**：`contract_version` 是可选字段。旧 Reader 不识别时忽略；旧 UniRAG 不返回时 Reader 默认按 v1 解析。不破坏任何现有字段。

### 5. Reader 侧 normalize 输出（内部）

`memorySourceRefFromUniRagCitation` 输出 camelCase：

```js
{
  id: artifactId || memoryId || chunkId,
  artifactId, artifactType, memoryId, memoryTitle,
  documentId, documentName, source: '我的记忆',
  section, page, paragraphId, label, text, span,
  evidenceType: 'memory', sourceType: 'saved_memory',
  sourceRefs: [...], contractVersion: 'reader-unirag-memory-v1'
}
```

## Shared Fixtures

位置：`contracts/reader-unirag-memory/v1/`（项目根级，两侧共享）。

| 文件 | 内容 |
|------|------|
| `README.md` | contract 版本、字段定义、artifactType 分歧、兼容性策略 |
| `saved-answer-card.json` | explain_card 的完整 memory payload（POST /api/memory/jobs body） |
| `reading-card.json` | concept_card 的 memory payload |
| `note.json` | reading_note 的 memory payload |
| `highlight.json` | lens_card 的 memory payload（高亮类） |
| `query-response-with-saved-memory.json` | /api/query include_memory=true 的完整响应（含 saved_memory citation） |
| `citation-unresolved.json` | 找不到目标的 citation（artifactId 不存在） |

每个 fixture 顶层带 `$schema` 提示和 `contract_version` 字段。fixtures 被 Reader 和 UniRAG 两侧测试同时引用，保证一致性。

## Test Plan

### UniRAG 侧 contract tests（`services/uni-rag/tests/integration/test_contract_v1.py`）

用 `json.load` 读共享 fixtures，跑 TestClient：

1. `test_saved_answer_card_fixture_persists` — POST saved-answer-card.json → 200 completed → GET → result.memory_id 存在
2. `test_reading_card_fixture_persists` — POST reading-card.json → 200 completed
3. `test_note_fixture_persists` — POST note.json → 200 completed
4. `test_highlight_fixture_persists` — POST highlight.json → 200 completed
5. `test_query_with_saved_memory_fixture_returns_citation` — 先 POST 一个 fixture，再 POST /api/query include_memory=true → citations 含 saved_memory 且字段稳定（source_type/artifact_id/memory_id/title/source_refs/contract_version）
6. `test_missing_memory_job_returns_404` — GET 不存在 job_id → 404
7. `test_include_memory_false_no_memory_citation` — POST fixture 后 query include_memory=false → 无 saved_memory citation
8. `test_empty_memory_store_query_does_not_break` — 不 POST 任何 memory，query include_memory=true → 200，无 memory citation
9. `test_contract_version_field_present_in_citation` — 验证 saved_memory citation 含 `contract_version: "reader-unirag-memory-v1"`
10. `test_contract_version_accepted_in_payload` — 验证 POST body 含 `contractVersion` 时被接受（不报 422）

### Reader 侧 contract tests（`apps/reader/src/services/contract.v1.test.js`）

用 `import` 读共享 fixtures（vitest 支持 import json）：

1. `buildSavedMemoryPayload produces contract-compatible payload` — 构造的 payload 与 saved-answer-card.json 字段集一致，含 `contractVersion`
2. `isMemoryCitation detects fixture citation` — 用 query-response-with-saved-memory.json 的 citation 喂 isMemoryCitation → true
3. `memorySourceRefFromUniRagCitation normalizes fixture citation` — normalize 后字段稳定（artifactId/memoryId/sourceType/contractVersion）
4. `normalize handles missing contract_version gracefully` — 去掉 contract_version 的 citation 仍能 normalize（默认 v1）
5. `ingestMemory sends fixture payload shape` — mock fetch，调 ingestMemory，验证 body 是 `{ memory: {...} }`
6. `citation-unresolved triggers fallback` — normalize citation-unresolved.json 后，handleNavigateSourceRef 找不到目标时显示 warning（已有 antMessage.warning 逻辑）

### 不破坏现有测试

- UniRAG: `tests/unit/test_memory_store.py`（29）、`tests/integration/test_memory_api.py`（10）继续通过
- Reader: `savedMemoryService.test.js`、`ragEngineAdapter.test.js`、`App.retrievalContext.test.jsx` 继续通过（可能需微调以兼容 contract_version 新字段，但不删断言）

## E2E Plan

真实 Reader（3217）+ 真实 UniRAG（8766），Playwright 脚本 `apps/reader/e2e/memory-citation-loop.spec.js`：

1. 访问 Reader 3217，验证 UniRAG health 可见/reachable
2. 上传/打开固定测试文档（demo-assets/sample.md）
3. 提问并获得回答
4. 保存回答为卡片（触发 POST /api/memory/jobs）
5. 验证 UniRAG memory job completed（可轮询或 fast-path）
6. 再次提问（include_memory=true 由 Reader 默认发送）
7. UI 出现「我的记忆」分组
8. 点击 memory citation
9. 验证跳回 Notes/Artifacts 卡片（`[data-artifact-id]` 高亮）或源段落
10. 失败路径：构造 artifactId 不存在的 citation，点击后验证 `antMessage.warning('未找到这条记忆卡片')` 可见

E2E 不只用 Playwright route mock，必须启真实服务。若 CI 环境无法启服务，标记为 `@local-only` 手动跑。

## Failure Modes

| 失败场景 | 预期行为 | 测试 |
|---------|---------|------|
| UniRAG 不可用 | Reader 保存时 `status: 'fallback'` 本地降级，顶部状态条提示 | Reader contract test + E2E |
| POST /api/memory/jobs 5xx | Reader 记录 failed task，不隐藏错误 | Reader test（savedMemoryService.test.js 已有） |
| GET 不存在 job_id | 404 | UniRAG contract test 6 |
| memory store 空时 query | 200，无 memory citation | UniRAG contract test 8 |
| citation artifactId 不存在 | `antMessage.warning('未找到这条记忆卡片')` | Reader test 6 + E2E 10 |
| citation 无 artifactId 但有 sourceRefs | 回退到按原文段落跳 | Reader 现有逻辑 |
| LLM 失败 | /api/query 502，Reader 显示友好错误 | UniRAG 现有逻辑 |
| memory 检索异常 | 不破坏主 query 路径（try/except） | UniRAG pipeline.py 已有 |

## Acceptance Criteria

- [ ] `contracts/reader-unirag-memory/v1/` 含 7 个 fixtures + README
- [ ] UniRAG contract tests 10 项全通过
- [ ] Reader contract tests 6 项全通过
- [ ] 现有 UniRAG 测试（29+10）无回归
- [ ] 现有 Reader 测试无回归
- [ ] `contract_version: "reader-unirag-memory-v1"` 出现在 fixtures、UniRAG citation、Reader normalize 输出
- [ ] contract_version 兼容旧字段（不发也能解析）
- [ ] 浏览器 E2E 10 步全通过（真实服务）
- [ ] 失败路径有可见降级（warning 或 fallback 状态）
- [ ] delivery + e2e 报告写入 .ship
- [ ] run_state.yaml 更新
- [ ] DEVLOG 更新（UniRAG + Reader）
- [ ] 无密钥/db/构建产物进入 git

## Implementation Order（窄切片）

1. **Slice D1**: 创建 `contracts/reader-unirag-memory/v1/` 7 fixtures + README
2. **Slice D2**: UniRAG 加 `contract_version` 字段（schemas.py MemoryPayload + Citation + pipeline._build_memory_citations）
3. **Slice D3**: Reader 加 `contractVersion` 字段（savedMemoryService.buildSavedMemoryPayload + ragEngineAdapter.memorySourceRefFromUniRagCitation）
4. **Slice D4**: UniRAG contract tests（test_contract_v1.py，10 项）
5. **Slice D5**: Reader contract tests（contract.v1.test.js，6 项）
6. **Slice D6**: 跑两侧全部测试，确认无回归
7. **Slice D7**: E2E 脚本 + 真实联调
8. **Slice D8**: handoff 文档回写

## Risks

- **artifactType 分歧**：记录但不收束，fixtures 用 Reader 实际值。未来需统一枚举。
- **fixtures 跨仓库引用**：contracts/ 在 workbench 根，Reader 和 UniRAG 是独立 git repo。测试用相对路径 `../../contracts/...` 引用。若未来拆分需复制。
- **E2E 真实服务依赖**：需要 LLM API key + BGE-M3 模型加载（慢）。标记 @local-only。
- **contract_version 兼容性**：旧 UniRAG 不返回时 Reader 默认 v1，但若未来 v2 出现需严格判断。本期不实现 v2。
