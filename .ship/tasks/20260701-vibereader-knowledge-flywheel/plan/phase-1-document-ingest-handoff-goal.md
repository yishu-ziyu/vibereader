# Phase 1 Goal: Document Ingest Handoff

Date: 2026-07-01

## Goal

VibeReader can send the currently opened document to UniRAG and track ingest status without blocking reading.

## Why This Matters

The product cannot honestly route reading questions through UniRAG until the current document is inside UniRAG with a stable identity.

This is the next required step toward the signature reading moment:

> current reading state becoming source-grounded future memory.

## Scope

Implement:

1. `UniRagHttpAdapter.ingestDocument(input)`.
2. `UniRagHttpAdapter.getIngestStatus(jobId)`.
3. normalized ingest job result shape.
4. document identity mapping proposal.
5. tests for upload payload and status mapping.
6. lightweight UniRAG API contract verification.

## Out Of Scope

- switching main chat routing to UniRAG,
- citation jump,
- saved notes/cards ingest,
- desktop sidecar lifecycle,
- monorepo migration.

## Acceptance Criteria

- Adapter can POST a document file/blob to `/api/ingest/jobs`.
- Adapter can GET `/api/ingest/jobs/{job_id}`.
- Adapter returns normalized job status:
  - `jobId`
  - `status`
  - `percent`
  - `message`
  - `filename`
  - `result`
  - `error`
- Tests cover success and failure.
- Delivery and E2E contract records are written.

## Verification Environment

VibeReader:

```text
/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone
```

UniRAG:

```text
/Users/mahaoxuan/Desktop/AI产品经理/uni-rag
```

Use fake-pipeline or API contract tests when full embedding model startup would slow down the loop.
