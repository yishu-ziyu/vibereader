# Phase 1 Goal: Saved Memory Ingest

Date: 2026-07-01

## Goal

When a user saves a verified AI answer, reading card, or note, VibeReader should add that user-confirmed artifact to the knowledge flywheel so future retrieval can use both raw document chunks and the user's own distilled understanding.

## Why This Matters

Raw RAG remembers documents. A learning product should remember what the user decided was worth keeping.

The intended loop is:

```text
read -> ask -> verify source -> save -> retrieve stronger memory later
```

## Scope

Implement:

1. A saved-memory ingest contract for answer cards / reading cards / notes.
2. Source ref preservation, including grounding precision.
3. A visible task/status path for saved memory ingest.
4. Tests showing a saved artifact is submitted to the knowledge layer.
5. Browser smoke showing a saved verified card enters the memory pipeline.

## Out Of Scope

- multi-user sync,
- account-level privacy controls,
- semantic deduplication,
- cross-document knowledge graph UI.

## Acceptance Criteria

- Saving an AI answer or reading card can enqueue memory ingest.
- The memory payload includes source refs and grounded citation metadata.
- The UI distinguishes raw document ingest from user-confirmed memory ingest.
- Failure does not block saving the card locally.
- Browser smoke verifies the visible saved-memory status.
