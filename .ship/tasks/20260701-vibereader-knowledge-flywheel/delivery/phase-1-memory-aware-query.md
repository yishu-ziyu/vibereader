# Phase 1 Delivery: Memory-Aware Reader Query

Date: 2026-07-01

## Goal

After a user saves an answer card into memory, later Reader chat queries should proactively ask UniRAG to include saved user memory and should render memory evidence differently from raw document evidence.

## Implemented

Project:

```text
/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone
```

Files changed:

- `src/services/ragEngineAdapter.js`
- `src/services/ragEngineAdapter.test.js`
- `src/App.jsx`
- `src/App.retrievalContext.test.jsx`
- `src/ArtifactPanel.jsx`
- `src/ArtifactPanel.test.jsx`
- `src/styles.css`

## Behavior

### Query Contract

When the current document is ready for UniRAG query, Reader now sends:

```json
{
  "include_memory": true,
  "memory_top_k": 3
}
```

alongside the existing question/session/provider payload.

### Citation Normalization

`UniRagHttpAdapter` distinguishes two evidence classes:

- raw document evidence:
  - `evidenceType: "source"`
  - `sourceType: "document"`
- saved user memory:
  - `evidenceType: "memory"`
  - `sourceType: "saved_memory"`
  - preserves `artifactId`, `artifactType`, `memoryId`, `memoryTitle`, and nested original `sourceRefs`.

Memory citations are detected from `source_type`, `sourceType`, `evidence_type`, `kind`, or the presence of `artifact_id` / `memory_id`.

### Reader UI

Assistant citations are now grouped:

- `原文依据`
- `我的记忆`

Raw document citations still go through local grounding and can jump to paragraph/page/document evidence.

Memory citations are not falsely grounded as raw text. Clicking a memory citation:

1. switches the right pane to Notes,
2. dispatches `vibereader:navigate-artifact`,
3. scrolls to and highlights the saved card.

The saved card still retains its original source refs, so the user can then click `回到原文` for source verification.

## Explicit Boundary

This delivery implements the Reader-side query contract and UI behavior. The real UniRAG backend still needs a dedicated memory store/retrieval implementation for `/api/memory/jobs` and `include_memory`.

The browser smoke below uses Playwright route interception to verify Reader behavior against the intended API contract. It does not prove that the current UniRAG backend can retrieve saved memory yet.

## Verification

### Focused Tests

Command:

```bash
npm test -- --run src/services/ragEngineAdapter.test.js src/App.retrievalContext.test.jsx src/ArtifactPanel.test.jsx
```

Result:

```text
Test Files  3 passed (3)
Tests       44 passed (44)
```

### Phase Regression

Command:

```bash
npm test -- --run src/services/sourceIndexService.test.js src/services/documentKnowledgeService.test.js src/services/savedMemoryService.test.js src/services/ragEngineAdapter.test.js src/TaskStatusPanel.test.jsx src/ArtifactPanel.test.jsx src/DocumentReader.test.jsx src/App.retrievalContext.test.jsx
```

Result:

```text
Test Files  8 passed (8)
Tests       83 passed (83)
```

### Full Test Suite

Command:

```bash
npm test
```

Result:

```text
Test Files  57 passed (57)
Tests       317 passed (317)
```

### Build

Command:

```bash
npm run build
```

Result:

```text
Build passed.
```

Vite emitted existing large chunk warnings; no build errors.

### Diff Check

Command:

```bash
git diff --check
```

Result:

```text
Passed.
```

### Browser Smoke

Dev server:

```text
http://127.0.0.1:3322/
```

Observed:

```json
{
  "ok": true,
  "queryPayloads": [
    {
      "question": "What should I remember?",
      "include_memory": true,
      "memory_top_k": 3
    },
    {
      "question": "What did my saved memory say?",
      "include_memory": true,
      "memory_top_k": 3
    }
  ],
  "memoryPayloadArtifactType": "explain_card"
}
```

Smoke path:

1. Upload `demo-assets/sample.md`.
2. Wait for `知识入库：已完成`.
3. Ask a UniRAG-backed question.
4. Save the assistant answer card.
5. Verify `/api/memory/jobs` receives an `explain_card` memory payload.
6. Ask a second question.
7. Mock a `saved_memory` citation.
8. Verify the assistant message shows `我的记忆`.
9. Click the memory citation.
10. Verify Notes is active and the saved card has `.artifact-pulse-highlight`.

## Acceptance Status

- Reader proactively asks UniRAG to include saved memory: satisfied.
- Assistant UI distinguishes raw source evidence from saved memory evidence: satisfied.
- Memory citation click returns to the saved Notes card: satisfied.
- Existing raw citation grounding/jump remains intact: satisfied.
- Failure to use memory does not remove normal fallback behavior: structurally preserved; backend failure path still falls back through existing UniRAG catch.
- Real UniRAG backend memory retrieval: not satisfied in this delivery; next phase.

## Next Increment

Implement the real UniRAG memory backend:

1. Persist saved memory payloads received at `/api/memory/jobs`.
2. Retrieve saved memories when `/api/query` receives `include_memory: true`.
3. Return `saved_memory` citations with `artifact_id`, `memory_id`, `title`, `text`, and nested `source_refs`.
4. Add a real service-level smoke without Playwright route mocks.
