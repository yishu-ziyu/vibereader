# Phase 1 Delivery: UniRAG Dedicated Port and Visible Health

Date: 2026-07-01

## Goal

Resolve the UniRAG local port conflict and make the reader show whether it is backed by UniRAG or degraded to the local retrieval fallback.

## Decision

Use a dedicated VibeReader UniRAG development port:

```text
http://127.0.0.1:8766
```

The existing `127.0.0.1:8765` listener was left untouched because it belonged to another Python process and did not respond like UniRAG at `/api/health`.

## Implemented

### VibeReader

Project:

```text
/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone
```

Files changed:

- `src/services/ragEngineAdapter.js`
- `src/services/ragEngineAdapter.test.js`
- `src/App.jsx`

Changes:

- Changed the default UniRAG base URL to `http://127.0.0.1:8766`.
- Added a test that locks the dedicated default port.
- Wired `UniRagHttpAdapter.health()` into app state.
- Added a visible header status:
  - `知识引擎：UniRAG` when UniRAG `/api/health` is reachable.
  - `知识引擎：本地检索` when UniRAG is unavailable and VibeReader is using local fallback.
  - `知识引擎：检查中` during initial health check.
- Health is refreshed every 30 seconds.

### UniRAG

Project:

```text
/Users/mahaoxuan/Desktop/AI产品经理/uni-rag
```

Files changed:

- `README.md`
- `src/uni_rag/api/app.py`

Changes:

- Documented the dedicated VibeReader startup command:

```bash
uv run uni-rag serve --port 8766
```

- Added local development CORS support for browser-based VibeReader requests from `localhost` and `127.0.0.1` on arbitrary local ports.

## Product Impact

The user no longer needs to infer whether the knowledge backend is alive. The product now exposes the actual operating mode:

- UniRAG mode means the knowledge engine is reachable.
- Local retrieval mode means the reader still works, but is degraded and not using the long-term knowledge engine.

This preserves continuity for the first internal users while making backend failures visible.

## Verification Summary

### UniRAG Real Health

Command:

```bash
uv run uni-rag serve --port 8766
```

Health check:

```bash
curl http://127.0.0.1:8766/api/health
```

Result:

```json
{"status":"ok"}
```

### Browser E2E

With UniRAG running:

```json
{
  "ok": true,
  "containsVibeReader": true,
  "containsUniRagHealth": true,
  "errors": []
}
```

With UniRAG stopped:

```json
{
  "ok": true,
  "containsVibeReader": true,
  "containsLocalFallback": true,
  "pageErrors": []
}
```

### Tests

Command:

```bash
npm test -- src/services/ragEngineAdapter.test.js src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx
```

Result:

```text
Test Files  3 passed (3)
Tests       25 passed (25)
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

### UniRAG App Import

Command:

```bash
uv run python - <<'PY'
from uni_rag.api.app import create_app
app = create_app()
print(app.title, app.version)
PY
```

Result:

```text
uni-rag 0.1.0
```

Observed warning:

```text
jieba imports pkg_resources, which is deprecated upstream.
```

This warning does not block the app import or server startup.

## Remaining Work

Next increment after query adapter:

1. Add ingest handoff from the current reading document into UniRAG.
2. Preserve citation and source jumps from VibeReader into the knowledge engine.
3. Add a user-facing settings row for the UniRAG endpoint once the integration moves beyond local development.
