# Phase 1 Goal: Controlled UniRAG Query

Date: 2026-07-01

## Goal

After the current document has completed UniRAG ingest, route a controlled text-only reading question through UniRAG and render the answer with citations in VibeReader.

## Scope

Implement:

1. Query eligibility from `DocumentKnowledgeLink`.
2. A guarded UniRAG query path for current-document chat.
3. Citation rendering through existing `sourceRefs`.
4. Fallback to current local retrieval/LLM path when UniRAG is unavailable or ingest is incomplete.
5. Tests for eligible, ineligible, and fallback paths.
6. Browser smoke showing a UniRAG-cited answer.

## Out Of Scope

- precise citation jump,
- saved notes/cards memory,
- multi-document retrieval,
- sidecar lifecycle,
- monorepo migration.

## Acceptance Criteria

- If current document ingest is completed, text-only chat can use UniRAG.
- If ingest is missing/running/failed, chat uses existing fallback path.
- UniRAG citations appear as source refs in the assistant message.
- The UI does not pretend citation jump precision that does not exist yet.
- Browser smoke verifies visible cited answer.

## Verification

Use mocked UniRAG endpoints for deterministic browser smoke first. Real full retrieval quality can be validated after citation mapping is wired.
