# Phase 1 E2E: UniRAG Query Contract

Date: 2026-07-01

## Purpose

Verify that the UniRAG `/api/query` HTTP contract matches what `UniRagHttpAdapter.query()` expects before routing real VibeReader chat through it.

## Contract

Request:

```http
POST /api/query
X-API-Key: test-key
Content-Type: application/json
```

Body:

```json
{
  "question": "what is the contract?",
  "session_id": "reader-session",
  "top_k": 3,
  "provider": "minimax",
  "style": "academic",
  "mode": "chat"
}
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

## Result

The API contract matches the VibeReader Adapter mapping:

- `answer` maps to assistant content.
- `session_id` maps to `sessionId`.
- `citations` map to Reader `sourceRefs`.
- `X-API-Key` reaches the pipeline as `api_key`.
- `provider: minimax` reaches the pipeline unchanged.

## Residual Risk

This is a contract smoke with a fake pipeline. It does not prove real document ingest, retrieval quality, or LLM completion. Those belong to the next ingest-and-query increment.
