# Phase 1 Goal: Visible Ingest Status

Date: 2026-07-01

## Goal

When a document is opened, VibeReader can start UniRAG ingest through the Adapter and show ingest status without blocking reading.

## Why This Matters

The product cannot route user questions through UniRAG honestly until the current document has a visible, trackable ingest state.

This moves the product from backend capability to user-visible reliability.

## Scope

Implement:

1. a lightweight `DocumentKnowledgeLink` persistence seam,
2. document-open ingest trigger behind UniRAG health,
3. ingest status polling,
4. visible status in the Reader workspace,
5. retry behavior for failed ingest,
6. tests for status transitions.

## Out Of Scope

- switching all chat to UniRAG,
- citation jump,
- saved note/card memory,
- sidecar lifecycle,
- repository migration.

## Acceptance Criteria

- Opening a document can start ingest when UniRAG is available.
- Reading remains usable while ingest runs.
- UI distinguishes:
  - not started,
  - queued,
  - running,
  - completed,
  - failed,
  - fallback/no UniRAG.
- Completed ingest stores enough identity data for later query routing.
- Failed ingest can be retried.
- Browser smoke verifies status is visible.

## Verification

Use:

- unit tests for Adapter/status state,
- fake fetch for UI tests,
- real browser smoke for visible status,
- UniRAG contract smoke when needed.
