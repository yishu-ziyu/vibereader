# Phase 1 E2E: Memory-Aware Query Browser Smoke

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

## Scenario

1. Open VibeReader.
2. Mark onboarding as dismissed for the smoke run.
3. Seed MiniMax-M3 token-plan model config with a fake local smoke key.
4. Upload `demo-assets/sample.md`.
5. Wait for visible `知识入库：已完成`.
6. Ask `What should I remember?`.
7. Verify `/api/query` receives `include_memory: true` and `memory_top_k: 3`.
8. Mock a document citation answer.
9. Save the assistant answer card.
10. Verify `/api/memory/jobs` receives an `explain_card` memory payload.
11. Wait for visible `记忆沉淀：已完成`.
12. Ask `What did my saved memory say?`.
13. Verify the second `/api/query` also sends `include_memory: true` and `memory_top_k: 3`.
14. Mock a `saved_memory` citation with the saved `artifact_id`.
15. Verify the assistant message shows `我的记忆`.
16. Click the memory citation.
17. Verify Notes becomes active and the saved card gets `.artifact-pulse-highlight`.

## Observed Result

```json
{
  "ok": true,
  "url": "http://127.0.0.1:3322/",
  "queryPayloads": [
    {
      "question": "What should I remember?",
      "session_id": "session-1782915794374-tw0edkq",
      "top_k": 5,
      "style": "academic",
      "provider": "minimax",
      "mode": "chat",
      "include_memory": true,
      "memory_top_k": 3
    },
    {
      "question": "What did my saved memory say?",
      "session_id": "session-1782915794374-tw0edkq",
      "top_k": 5,
      "style": "academic",
      "provider": "minimax",
      "mode": "chat",
      "include_memory": true,
      "memory_top_k": 3
    }
  ],
  "memoryArtifactId": "artifact-1782915796655-i9vtthy",
  "memoryPayloadArtifactType": "explain_card"
}
```

The fake smoke API key was `test-key-not-used`; no real model provider was called.

## Visible Assertions

Passed:

- `.workspace-body`
- `.document-reader-markdown`
- `知识入库：已完成`
- `UniRAG memory smoke first answer`
- `原文依据`
- `记忆沉淀：已完成`
- `UniRAG memory smoke second answer`
- `我的记忆`
- active Notes tab after clicking memory citation
- saved card has `.artifact-pulse-highlight`

## Boundary

This is a Reader contract smoke. It validates browser behavior and expected API payloads. It does not validate real UniRAG memory retrieval because the UniRAG backend did not yet expose verified `include_memory` behavior in the inspected codebase.

## Cleanup

The smoke ran on a temporary dev server at port `3322`.
