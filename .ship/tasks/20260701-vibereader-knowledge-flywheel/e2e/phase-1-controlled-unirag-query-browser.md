# Phase 1 E2E: Controlled UniRAG Query Browser Smoke

Date: 2026-07-01

## Environment

VibeReader:

```text
/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone
http://127.0.0.1:3322/
```

Browser:

```text
Playwright Chromium, headless
```

UniRAG:

```text
Simulated through Playwright route interception
```

Intercepted endpoints:

- `GET http://127.0.0.1:8766/api/health`
- `POST http://127.0.0.1:8766/api/ingest/jobs`
- `GET http://127.0.0.1:8766/api/ingest/jobs/smoke-job`
- `POST http://127.0.0.1:8766/api/query`

## Scenario

1. Open VibeReader.
2. Dismiss onboarding for the smoke run.
3. Seed a MiniMax-M3 token-plan model config with a test key.
4. Upload `demo-assets/sample.md`.
5. Mock UniRAG health as available.
6. Mock ingest start and completion.
7. Wait for visible `知识入库：已完成`.
8. Open Chat.
9. Type a real chat message into the Slate editor.
10. Verify `/api/query` receives the question and provider context.
11. Verify the assistant answer and `原文依据` citation are visible.

## Query Payload

Observed request:

```json
{
  "question": "What is the core loop of this document?",
  "session_id": "session-1782906165345-bcbm3yv",
  "top_k": 5,
  "style": "academic",
  "provider": "minimax",
  "mode": "chat",
  "api_key": "test-key"
}
```

The session id is generated per run.

## Result

```text
CONTROLLED_UNIRAG_QUERY_SMOKE_OK {"health":2,"ingest":1,"status":1,"query":1}
```

Visible assertions passed:

- `sample.md`
- `知识入库：已完成`
- `UniRAG smoke answer: the reader and assistant stay visible together.`
- `原文依据`
- `P1`

## Cleanup

The Vite dev server was stopped after the smoke test.

Port check after cleanup:

```text
3322: no listener
```
