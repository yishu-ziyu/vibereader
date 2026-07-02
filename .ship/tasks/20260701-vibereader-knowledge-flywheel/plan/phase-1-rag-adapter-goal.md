# Phase 1 Goal: RAG Adapter Seam

Date: 2026-07-01

## Goal

VibeReader can route reading Q&A through a `RagEngineAdapter` seam, using the existing local retrieval as a reliable fallback and preparing for UniRAG HTTP integration.

## Accepted Product Decision

`DEC-0002` is accepted:

> Keep Reader-first positioning. UniRAG is the Knowledge Module behind an adapter seam.

## Scope

Implement the smallest stable Phase 1 foundation:

1. Define `RagEngineAdapter` Interface in VibeReader.
2. Wrap current local retrieval as `LocalKeywordRagAdapter`.
3. Add `UniRagHttpAdapter` health check skeleton.
4. Add adapter selection/fallback logic.
5. Add tests for fallback and health-state behavior.

## Out of Scope

- Full UniRAG ingest.
- Full citation jump.
- Repository migration.
- Database unification.
- Tauri sidecar packaging.

## Verification Environment

Reader:

- `/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone`
- Vite dev server.
- Real browser session.
- Fixed test PDF.

UniRAG:

- `/Users/mahaoxuan/Desktop/AI产品经理/uni-rag`
- FastAPI local server when testing health.
- Also test the failure path with UniRAG stopped.

## Acceptance Criteria

- Existing reading Q&A still works without UniRAG.
- Adapter Interface is used by the retrieval path.
- `LocalKeywordRagAdapter` returns the current local retrieval behavior.
- `UniRagHttpAdapter.health()` can detect available/unavailable UniRAG.
- UI or state layer can represent degraded fallback mode.
- Unit tests cover adapter fallback.

## Required Loop

Follow:

```text
Intake -> Plan -> Design -> Implement -> Verify -> Record -> Decide Next
```

Record results in:

```text
.ship/tasks/20260701-vibereader-knowledge-flywheel/delivery/
.ship/tasks/20260701-vibereader-knowledge-flywheel/e2e/
```
