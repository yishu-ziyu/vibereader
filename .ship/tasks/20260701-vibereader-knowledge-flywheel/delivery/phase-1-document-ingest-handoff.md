# Phase 1 Delivery: Document Ingest Handoff

Date: 2026-07-01

## Goal

VibeReader can send a document payload to UniRAG and track the ingest job status through the `UniRagHttpAdapter` Interface.

## Implemented

Project:

```text
/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone
```

Files changed:

- `src/services/ragEngineAdapter.js`
- `src/services/ragEngineAdapter.test.js`

Adapter methods added:

- `UniRagHttpAdapter.ingestDocument(input)`
- `UniRagHttpAdapter.getIngestStatus(jobId)`

HTTP endpoints:

- `POST /api/ingest/jobs`
- `GET /api/ingest/jobs/{job_id}`

## Input Support

`ingestDocument(input)` accepts:

- `input.file`
- `input.blob`
- `input.content`
- `input.text`
- `input.document.file`
- `input.document.blob`
- `input.document.contentText`
- `input.document.pdfText`
- `input.document.text`
- `input.document.pages`

If a raw file/blob is available, it is uploaded directly.

If only text is available, the Adapter creates a text blob and uploads it as a file. This keeps the ingest seam usable before the full Reader file lifecycle is wired into the UI.

## Normalized Output

`ingestDocument()` returns:

```js
{
  jobId,
  statusUrl,
  ragEngine
}
```

`getIngestStatus()` returns:

```js
{
  jobId,
  status,
  step,
  percent,
  message,
  filename,
  result,
  error,
  ragEngine
}
```

Normalized `result`:

```js
{
  sourceId,
  chunks,
  format,
  filename
}
```

## Document Identity Mapping

Phase 1 temporary mapping:

- Reader keeps `document.id` as the local UI identity.
- UniRAG returns `source_id` and `filename`.
- The Adapter preserves `filename` and `sourceId` in normalized ingest status.
- Citation mapping will initially use UniRAG `citation.source` / `filename` plus page number.

Next identity improvement:

- introduce a `DocumentKnowledgeLink` record:

```js
{
  readerDocumentId,
  readerFingerprint,
  uniRagSourceId,
  uniRagFilename,
  contentHash,
  ingestedAt
}
```

Reason:

- filename alone is not stable enough because two files can share a name.
- Reader document ID alone is not enough because UniRAG cites by source filename/chunk metadata today.
- The link record gives us a seam for citation jump and saved artifact memory.

## Verification

### Adapter Unit Tests

Command:

```bash
npm test -- src/services/ragEngineAdapter.test.js
```

Result:

```text
Test Files  1 passed (1)
Tests       11 passed (11)
```

### Regression Tests

Command:

```bash
npm test -- src/services/ragEngineAdapter.test.js src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx
```

Result:

```text
Test Files  3 passed (3)
Tests       30 passed (30)
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

### UniRAG Ingest Contract Smoke

Project:

```text
/Users/mahaoxuan/Desktop/AI产品经理/uni-rag
```

Method:

- Used FastAPI `TestClient`.
- Replaced runtime pipeline with a fake `ingest_file`.
- Posted a multipart file to `/api/ingest/jobs`.
- Fetched `/api/ingest/jobs/{job_id}`.

Observed:

```text
POST /api/ingest/jobs -> 200 OK
GET /api/ingest/jobs/{job_id} -> 200 OK
status: completed
filename: contract.txt
```

Warnings:

- FastAPI `TestClient` emitted an `httpx` deprecation warning.
- `jieba` emitted a `pkg_resources` deprecation warning.

Neither warning blocked the contract smoke.

## Acceptance Status

- Adapter can POST document payload to `/api/ingest/jobs`: satisfied.
- Adapter can GET ingest status: satisfied.
- Normalized job status exists: satisfied.
- Tests cover success and failure: satisfied.
- UniRAG ingest contract verified without heavy embedding startup: satisfied.
- Document identity mapping proposal recorded: satisfied.

## Not Yet Done

The UI does not yet start ingest automatically when a document opens.

Next increment:

1. Store `DocumentKnowledgeLink`.
2. Wire document open/index flow to call `ingestDocument()`.
3. Show ingest status without blocking reading.
4. Only then route a controlled question through UniRAG.
