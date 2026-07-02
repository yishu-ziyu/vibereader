# Phase 1 E2E: Citation Grounding And Jump Browser Smoke

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
3. Seed MiniMax-M3 token-plan model config.
4. Upload `demo-assets/sample.md`.
5. Wait for `知识入库：已完成`.
6. Open Chat.
7. Ask `What is the core loop of this document?`.
8. Mock UniRAG answer with a citation whose remote `chunk_id` does not equal a Reader paragraph id.
9. Verify the citation renders as paragraph-level `P1`, not degraded page/document evidence.
10. Click the citation.
11. Verify the left Reader highlights the matched paragraph.

## Query Payload

Observed request:

```json
{
  "question": "What is the core loop of this document?",
  "session_id": "session-1782908242955-kjkb9j1",
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
CITATION_GROUNDING_JUMP_SMOKE_OK {"health":2,"ingest":1,"status":1,"query":1}
```

Visible assertions passed:

- `知识入库：已完成`
- `UniRAG smoke answer: the reader and assistant stay visible together.`
- `原文依据`
- `P1`
- `.paragraph-pulse-highlight` on the Reader paragraph containing `reader and assistant are visible at the same time`

## Cleanup

The Vite dev server was stopped after the smoke test.

Port check after cleanup:

```text
3322: no listener
```
