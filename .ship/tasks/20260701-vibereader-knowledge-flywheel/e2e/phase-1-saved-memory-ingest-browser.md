# Phase 1 E2E: Saved Memory Ingest Browser Smoke

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
- `GET http://127.0.0.1:8766/api/ingest/jobs/doc-job`
- `POST http://127.0.0.1:8766/api/query`
- `POST http://127.0.0.1:8766/api/memory/jobs`
- `GET http://127.0.0.1:8766/api/memory/jobs/memory-job`

## Scenario

1. Open VibeReader.
2. Dismiss onboarding for the smoke run.
3. Seed MiniMax-M3 token-plan model config.
4. Upload `demo-assets/sample.md`.
5. Wait for `知识入库：已完成`.
6. Ask `What should I remember from this document?`.
7. Mock UniRAG answer with paragraph-groundable citation.
8. Save the assistant answer card.
9. Verify `/api/memory/jobs` receives the saved artifact payload.
10. Verify visible `记忆沉淀：已完成`.

## Memory Payload

Observed memory payload included:

```json
{
  "source": "vibereader",
  "kind": "saved_artifact",
  "artifactType": "explain_card",
  "title": "AI 回答：What should I remember from this document?",
  "verificationStatus": "grounded",
  "sourceRefs": [
    {
      "page": 1,
      "paragraphId": "page-1-para-5",
      "label": "P1",
      "grounding": {
        "precision": "paragraph",
        "matchedBy": "text",
        "score": 1
      }
    }
  ],
  "content": {
    "question": "What should I remember from this document?",
    "answer": "UniRAG answer ready to save as memory."
  }
}
```

The artifact id and document id are generated per run.

## Result

```text
SAVED_MEMORY_INGEST_SMOKE_OK {"health":2,"ingest":1,"status":1,"query":1,"memory":1,"memoryStatus":1}
```

Visible assertions passed:

- `知识入库：已完成`
- `UniRAG answer ready to save as memory.`
- `原文依据`
- `保存回答卡片`
- `记忆沉淀：已完成`

## Cleanup

The Vite dev server was stopped after the smoke test.

Port check after cleanup:

```text
3322: no listener
```
