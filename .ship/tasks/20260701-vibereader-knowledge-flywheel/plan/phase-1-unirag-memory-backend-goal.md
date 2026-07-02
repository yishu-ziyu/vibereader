# Phase 1 Goal: UniRAG Memory Backend

Date: 2026-07-01

## Goal

Make the Reader memory-aware query contract real by implementing saved-memory persistence and retrieval inside UniRAG.

## Why This Matters

The Reader now asks for saved memory and can render memory citations correctly. But without backend support, the knowledge flywheel only works in mocked contract tests.

The next product milestone is:

```text
save card -> UniRAG stores memory -> later real query retrieves memory -> Reader jumps to saved card -> user can verify original source
```

## Scope

Implement in UniRAG:

1. `POST /api/memory/jobs`
2. `GET /api/memory/jobs/{job_id}`
3. Memory persistence for VibeReader saved artifacts.
4. `include_memory` and `memory_top_k` on `/api/query`.
5. Retrieval fusion between raw document chunks and saved memory snippets.
6. `saved_memory` citations containing:
   - `artifact_id`,
   - `artifact_type`,
   - `memory_id`,
   - `title`,
   - `text`,
   - nested `source_refs`.

## Out Of Scope

- Memory deduplication.
- Memory editing/versioning UI.
- Cloud sync.
- Multi-user accounts.
- Cross-device memory.

## Acceptance Criteria

- UniRAG can accept a VibeReader `saved_artifact` memory payload.
- UniRAG can report memory ingest job status.
- A later real `/api/query` with `include_memory: true` can return a `saved_memory` citation.
- Reader can display that real memory citation as `我的记忆`.
- Clicking the real memory citation jumps to the saved Notes card.
- Browser smoke uses a real local UniRAG service, not Playwright route mocks.
