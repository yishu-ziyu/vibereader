# Phase 1 E2E: UniRAG Health Status

Date: 2026-07-01

## Environment

VibeReader:

```text
/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone
http://127.0.0.1:3322/
```

UniRAG:

```text
/Users/mahaoxuan/Desktop/AI产品经理/uni-rag
http://127.0.0.1:8766/api/health
```

Browser:

```text
Playwright Chromium, headless
```

## Scenario 1: UniRAG Available

Setup:

```bash
uv run uni-rag serve --port 8766
npm run dev -- --port 3322
```

Expected visible state:

```text
知识引擎：UniRAG
```

Observed result:

```json
{
  "ok": true,
  "containsVibeReader": true,
  "containsUniRagHealth": true,
  "errors": []
}
```

## Scenario 2: UniRAG Unavailable

Setup:

```bash
# UniRAG server stopped
npm run dev -- --port 3322
```

Expected visible state:

```text
知识引擎：本地检索
```

Observed result:

```json
{
  "ok": true,
  "containsVibeReader": true,
  "containsLocalFallback": true,
  "pageErrors": []
}
```

## Cleanup

The VibeReader and UniRAG development servers were stopped after the E2E checks.

Port checks after cleanup:

```text
3322: no listener
8766: no listener
```
