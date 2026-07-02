# Phase 1 Goal: Memory-Aware Query

Date: 2026-07-01

## Goal

After a user saves a verified answer or reading card into memory, later questions should be able to retrieve that user-confirmed memory alongside raw document evidence.

## Why This Matters

This is the first complete knowledge flywheel:

```text
read -> ask -> verify -> save -> later answer gets smarter
```

Without this step, memory ingest is only archival. With this step, the product begins to feel like it is learning with the user.

## Scope

Implement:

1. Query payload support for including saved-memory retrieval mode.
2. UI/source metadata that distinguishes raw document evidence from user-confirmed memory.
3. A controlled smoke where a saved answer is later returned as memory context.
4. Fallback when memory retrieval is unavailable.

## Out Of Scope

- account sync,
- semantic memory deduplication,
- multi-document graph UI,
- memory editing/versioning.

## Acceptance Criteria

- A saved memory can be retrieved by a later question through the UniRAG path.
- The assistant message can show whether evidence came from raw document chunks or saved user memory.
- Failure to retrieve saved memory does not break normal document RAG.
- Browser smoke verifies save -> later query uses memory.
