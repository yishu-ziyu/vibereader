# Phase 1 E2E: Document Ingest Contract

Date: 2026-07-01

## Purpose

Verify that UniRAG's ingest job API matches the VibeReader Adapter contract before wiring ingest into the visible Reader workflow.

## Contract

Start ingest:

```http
POST /api/ingest/jobs
Content-Type: multipart/form-data
```

Field:

```text
file
```

Response:

```json
{
  "job_id": "e6c4c5d794ec4498a7be6d5e4f47faa8",
  "status_url": "/api/ingest/jobs/e6c4c5d794ec4498a7be6d5e4f47faa8"
}
```

Poll status:

```http
GET /api/ingest/jobs/{job_id}
```

Observed status:

```text
completed
```

Observed filename:

```text
contract.txt
```

## Result

The UniRAG API contract matches `UniRagHttpAdapter.ingestDocument()` and `UniRagHttpAdapter.getIngestStatus()`.

## Residual Risk

This was a contract smoke with a fake ingest pipeline. It validates HTTP shape and job tracking, not full embedding or retrieval quality.

Full quality validation belongs after visible ingest is wired into the Reader and a fixed PDF is used for a golden journey.
