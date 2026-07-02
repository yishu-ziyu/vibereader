# Phase 1 Delivery: UniRAG Query Adapter

Date: 2026-07-01

## Goal

Move the integration from "UniRAG health is visible" to "VibeReader has a stable Adapter Interface for UniRAG query calls."

## Scope

Implemented in VibeReader:

```text
/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone
```

Files changed:

- `src/services/ragEngineAdapter.js`
- `src/services/ragEngineAdapter.test.js`

## Implemented

`UniRagHttpAdapter` now supports:

- `health()`: GET `http://127.0.0.1:8766/api/health`
- `query(input)`: POST `http://127.0.0.1:8766/api/query`

The query Interface accepts:

- `question` or `query`
- `sessionId` or `session_id`
- `topK` or `top_k`
- `style`
- `provider` or `providerKey`
- `mode`
- `apiKey`
- optional `timeoutMs`

Provider normalization:

- `minimax` -> `minimax`
- `minimax-api` -> `minimax`
- `step` / `stepfun` -> `stepfun`
- `local` -> `local`

Response normalization:

- UniRAG `answer` -> `result.answer`
- UniRAG `session_id` -> `result.sessionId`
- UniRAG `citations` -> `result.citations`
- UniRAG `citations` -> Reader-compatible `result.sourceRefs`
- result includes `ragEngine` metadata showing `engine: uni-rag`

## Deliberate Non-Integration

The main chat flow is not yet switched to UniRAG query.

Reason:

- VibeReader's current document has not yet been reliably ingested into UniRAG.
- Switching chat now would risk a false integration where the UI says UniRAG but the answer comes from an old or empty KB.

Next step must be document ingest and document identity mapping before chat routing changes.

## Verification

### VibeReader Adapter Tests

Command:

```bash
npm test -- src/services/ragEngineAdapter.test.js
```

Result:

```text
Test Files  1 passed (1)
Tests       8 passed (8)
```

### VibeReader Regression Tests

Command:

```bash
npm test -- src/services/ragEngineAdapter.test.js src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx
```

Result:

```text
Test Files  3 passed (3)
Tests       27 passed (27)
```

### Build

Command:

```bash
npm run build
```

Result:

```text
Build passed.
```

Vite emitted existing large chunk warnings; no build errors.

### UniRAG API Contract Smoke

Project:

```text
/Users/mahaoxuan/Desktop/AI产品经理/uni-rag
```

Method:

- Used FastAPI `TestClient`.
- Replaced the runtime RAG pipeline with a fake pipeline.
- Verified `/api/query` request and response schema without loading the embedding model or calling a real LLM.

Observed:

```text
POST /api/query -> 200 OK
```

Response:

```json
{
  "answer": "contract-ok",
  "citations": [
    {
      "chunk_id": "fake:1",
      "source": "fake.pdf",
      "section": "1",
      "page": 1,
      "text": "fake cited text",
      "span": [0, 15]
    }
  ],
  "session_id": "reader-session"
}
```

Pipeline call observed:

```json
{
  "question": "what is the contract?",
  "session_id": "reader-session",
  "top_k": 3,
  "style": "academic",
  "api_key": "test-key",
  "provider": "minimax",
  "mode": "chat"
}
```

## Heavy Integration Test Note

Attempted:

```bash
./.venv/bin/python -m pytest tests/integration/test_api.py -k query
```

The test started under the correct Python 3.13 venv but exceeded a reasonable wait while running `test_upload_and_query`, likely due local embedding model cold start. The process was terminated manually to avoid leaving a hung verification process.

This does not block this increment because the increment only changes the VibeReader HTTP Adapter and validates the `/api/query` contract with a fake pipeline.

## Acceptance Status

- Query HTTP Interface exists: satisfied.
- Query payload maps VibeReader provider config to UniRAG provider IDs: satisfied.
- UniRAG citations map to Reader `sourceRefs`: satisfied.
- Existing local retrieval fallback remains unchanged: satisfied.
- Main chat routing remains local/LLM until ingest is implemented: intentional.

## Next Increment

Implement document ingest handoff:

1. Add `UniRagHttpAdapter.ingestDocument()`.
2. Add `UniRagHttpAdapter.getIngestStatus()`.
3. Decide how VibeReader document identity maps to UniRAG `source_id` / filename.
4. Only after ingest works, route a controlled query path through UniRAG.
