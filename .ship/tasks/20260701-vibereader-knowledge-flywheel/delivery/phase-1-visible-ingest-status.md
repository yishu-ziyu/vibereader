# Phase 1 Delivery: Visible Ingest Status

Date: 2026-07-01

## Goal

Connect UniRAG ingest to the real Reader workflow so opening a document can start knowledge ingest and expose visible status without blocking reading.

## Implemented

Project:

```text
/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone
```

Files changed:

- `src/App.jsx`
- `src/TaskStatusPanel.jsx`
- `src/services/documentKnowledgeService.js`
- `src/services/documentKnowledgeService.test.js`
- `src/WorkspaceLayout.test.jsx`

## Reader Workflow

When a document is opened:

1. VibeReader still performs its existing local source indexing.
2. If UniRAG health is available, VibeReader starts `startDocumentKnowledgeIngest`.
3. The current document is sent through `UniRagHttpAdapter.ingestDocument()`.
4. The ingest job is polled through `UniRagHttpAdapter.getIngestStatus()`.
5. A `DocumentKnowledgeLink` is saved locally.
6. A `knowledge_ingest` task is recorded for the document.
7. The top workspace header shows visible ingest state.

## Visible States

The Reader header can now show:

- `知识入库：等待检查`
- `知识入库：等待 UniRAG`
- `知识入库：排队中`
- `知识入库：{percent}%`
- `知识入库：已完成`
- `知识入库：失败`

The task panel recognizes `knowledge_ingest` as:

```text
知识入库
```

Failed or cancelled knowledge ingest tasks can be retried from the task panel.

## DocumentKnowledgeLink

The lightweight link stores:

```js
{
  readerDocumentId,
  readerFingerprint,
  uniRagJobId,
  uniRagStatusUrl,
  uniRagSourceId,
  uniRagFilename,
  contentHash,
  status,
  percent,
  message,
  error,
  startedAt,
  ingestedAt,
  updatedAt
}
```

For now this is stored through a local storage seam. This is enough to support the next controlled query increment. If the product later needs stronger desktop persistence, this seam can move to Tauri storage commands.

## Verification

### Service And Adapter Tests

Command:

```bash
npm test -- src/services/documentKnowledgeService.test.js src/services/ragEngineAdapter.test.js
```

Result:

```text
Test Files  2 passed (2)
Tests       14 passed (14)
```

### Workflow Unit Test

Command:

```bash
npm test -- src/WorkspaceLayout.test.jsx -t "UniRAG knowledge ingest|indexes a readable document|persists readable"
```

Result:

```text
Test Files  1 passed (1)
Tests       3 passed | 14 skipped (17)
```

### Phase Regression

Command:

```bash
npm test -- src/services/documentKnowledgeService.test.js src/services/ragEngineAdapter.test.js src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx src/WorkspaceLayout.test.jsx
```

Result:

```text
Test Files  5 passed (5)
Tests       50 passed (50)
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

### Browser Smoke

Dev server:

```text
http://127.0.0.1:3322/
```

UniRAG API was simulated with Playwright route interception for:

- `/api/health`
- `/api/ingest/jobs`
- `/api/ingest/jobs/{job_id}`

Observed:

```json
{
  "ok": true,
  "containsUniRagHealth": true,
  "containsIngestCompleted": true,
  "containsDocument": true,
  "errors": []
}
```

## Acceptance Status

- Opening a document can start ingest when UniRAG is available: satisfied.
- Reading remains usable while ingest runs: satisfied.
- UI distinguishes active/completed/fallback states: satisfied.
- Completed ingest stores identity data for query routing: satisfied through `DocumentKnowledgeLink`.
- Failed ingest can be retried: satisfied through `knowledge_ingest` task retry.
- Browser smoke verifies status is visible: satisfied.

## Next Increment

Controlled UniRAG query:

1. Use `DocumentKnowledgeLink` to decide when current-document UniRAG query is allowed.
2. Route a controlled text-only question through `UniRagHttpAdapter.query()`.
3. Render UniRAG citations as Reader `sourceRefs`.
4. Keep local fallback when ingest is missing, failed, or UniRAG is unavailable.
