# Product Blueprint

## Product Solution

The product is a local-first AI reading and knowledge workbench.

The user-facing surface is VibeReader. The knowledge engine is UniRAG. The integration is hidden behind a RAG Engine Seam so the Reader can use different retrieval adapters without exposing implementation complexity.

## Positioning

Positioning:

> A reader-first local knowledge workbench. Every document you read, note you keep, and card you create becomes source-grounded memory you can ask later.

## Core Flow

1. Open document.
2. Index document.
3. Read with attention support.
4. Ask source-grounded questions.
5. Save notes, highlights, and cards.
6. Retrieve across saved knowledge.
7. Return to original source evidence.

## Evolution Blueprint

Phase 0: unified management and product lifecycle.

Phase 1: VibeReader calls UniRAG for document ingest and question answering.

Phase 2: citation jump from RAG result to Reader source location.

Phase 3: user-confirmed artifacts enter knowledge memory.

Phase 4: unified workspace or monorepo migration.

Phase 5: desktop sidecar and local lifecycle maturity.

## Scope Boundary

Inside scope:

- Reader-first UX.
- Local document ingestion.
- Grounded Q&A.
- Citation rendering and source jump.
- Saved notes/cards as knowledge.
- Model provider flexibility.

Outside scope for now:

- Team collaboration.
- Cloud account sync.
- Enterprise RBAC.
- Fully automated research agent.
- Public sharing platform.
