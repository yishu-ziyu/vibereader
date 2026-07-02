# Phase 1 E2E: Visible Ingest Browser Smoke

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

## Scenario

1. Open VibeReader.
2. Upload a markdown document.
3. Health endpoint returns UniRAG available.
4. Ingest start endpoint returns job id.
5. Ingest status endpoint returns completed.
6. Verify visible Reader status.

## Result

```json
{
  "ok": true,
  "containsUniRagHealth": true,
  "containsIngestCompleted": true,
  "containsDocument": true,
  "errors": []
}
```

## Cleanup

The Vite dev server was stopped after the smoke test.

Port checks after cleanup:

```text
3322: no listener
8766: no listener
```
