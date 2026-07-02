# Phase 1 Goal: Citation Grounding And Jump

Date: 2026-07-01

## Goal

Turn UniRAG answer citations from "visible evidence chips" into trustworthy Reader navigation: when the user clicks a citation, VibeReader should jump to the best available source location and make the confidence level clear.

## Why This Matters

The product promise is not just "AI answers with sources"; it is "I can immediately return to the exact reading context and judge the answer myself."

Without this, UniRAG improves recall but not user trust. With it, the reading flywheel becomes concrete:

```text
read -> ask -> verify source -> save durable memory
```

## Scope

Implement:

1. Normalize UniRAG citation fields into richer `sourceRefs`.
2. Match citation filename/page/text back to local Reader source spans when possible.
3. Route citation clicks to existing paragraph navigation events.
4. Display degraded citation labels when only page-level or document-level evidence is available.
5. Test exact-span, page-level fallback, and degraded citation rendering.
6. Browser smoke showing a clicked UniRAG citation navigates the Reader.

## Out Of Scope

- multi-document RAG search UI,
- saved note/card memory ingestion,
- sidecar lifecycle,
- citation scoring beyond deterministic local matching,
- cross-device account sync.

## Acceptance Criteria

- UniRAG citations with matching text can jump to the closest Reader paragraph.
- Citations with only page metadata jump to that page when available.
- Citations without reliable local mapping still render, but visibly as lower precision.
- Clicking a citation never silently fails; it either navigates or explains degraded evidence.
- Browser smoke verifies at least one UniRAG citation click changes visible Reader context.

## Verification

Use deterministic mocked UniRAG citations first. Real UniRAG quality can be validated after the matching surface is reliable.
