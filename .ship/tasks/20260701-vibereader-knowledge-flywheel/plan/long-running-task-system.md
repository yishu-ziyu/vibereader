# Long-Running Task System

Date: 2026-07-01

## Purpose

The user should not need to manage every implementation detail.

Codex should use this task system to keep work moving through yishuship:

```text
Vision -> Backcast -> Phase Goal -> Implementation Loop -> Verification -> Record -> Next Decision
```

The user is asked only for product-level decisions that materially change direction.

## Autonomy Contract

Codex should handle without asking:

- repo inspection,
- implementation details,
- test selection,
- local browser verification,
- delivery notes,
- E2E evidence,
- updating run state,
- documenting tradeoffs,
- creating small follow-up tasks,
- cleaning up local dev servers after verification.

Codex should ask the user when:

- the product direction changes,
- a visible UX principle changes,
- data/privacy boundary changes,
- an irreversible migration is proposed,
- a scope tradeoff affects the signature product moment,
- credentials or external services are required and cannot be inferred from local configuration.

## Long-Running Workstreams

### W1: Signature Reading Moment

Goal:

Create the moment where selecting or reading a dense paragraph produces grounded interpretation, importance, source evidence, and save actions.

Milestones:

1. Current document ingest to UniRAG.
2. Current question answers through UniRAG with citations.
3. Citation display in Reader.
4. Page-level citation jump.
5. Paragraph interpretation action.
6. Save as note/card with source provenance.

Primary verification:

- real browser,
- fixed PDF,
- visible citation,
- saved artifact includes source ref,
- citation jump works or shows honest unavailable state.

### W2: Knowledge Flywheel

Goal:

Make saved notes/cards reappear in future reading sessions.

Milestones:

1. Persist user-confirmed artifacts with source provenance.
2. Ingest saved artifacts into Knowledge Module.
3. Retrieve prior artifacts alongside source chunks.
4. Show "related prior knowledge" while reading.
5. Add feedback signal: useful / not useful.

Primary verification:

- read document A,
- save one note,
- open document B,
- ask or select related passage,
- prior note appears with provenance.

### W3: Evidence And Trust

Goal:

Make source grounding visible, honest, and usable.

Milestones:

1. Normalize UniRAG citations to Reader `sourceRefs`.
2. Distinguish source citation, user note citation, and uncertain citation.
3. Add page-level jump.
4. Add span-level jump if source mapping supports it.
5. Add degraded states for missing citation, missing source, and fallback retrieval.

Primary verification:

- answer citation is visible,
- user can click source,
- failed jump is explained plainly,
- fallback mode is visible.

### W4: Local Engine Reliability

Goal:

Make UniRAG feel like part of the product, not a fragile side process.

Milestones:

1. Dedicated port and health status.
2. Query adapter.
3. Ingest adapter.
4. Ingest job status in UI.
5. Retry failed ingest.
6. Later: sidecar lifecycle.

Primary verification:

- UniRAG running state visible,
- stopped state falls back,
- no orphan dev processes after tests.

## Current Priority

The current priority is W1 + W4:

> Current document ingest to UniRAG, then controlled query with citations.

This is the shortest path from the existing adapter work to the signature reading moment.

## Active Next Task

Create:

```text
phase-1-document-ingest-handoff
```

Goal:

VibeReader can send the currently opened document to UniRAG and track ingest status without blocking reading.

Acceptance:

- `UniRagHttpAdapter.ingestDocument()` exists.
- `UniRagHttpAdapter.getIngestStatus()` exists.
- tests cover upload payload and job status mapping.
- real UniRAG `/api/ingest/jobs` contract is verified.
- document identity mapping decision is recorded.

Out of scope:

- full chat routing through UniRAG,
- citation jump,
- saved notes memory.

## Execution Loop

For each increment:

1. Write or update phase goal.
2. Implement the smallest Module change.
3. Verify with unit tests.
4. Verify with browser or HTTP contract when relevant.
5. Record delivery and E2E evidence.
6. Update `run_state.yaml`.
7. Continue unless a user-level decision is needed.
