# Phase 1 Delivery: Controlled UniRAG Query

Date: 2026-07-01

## Goal

After the current document has completed UniRAG ingest, route a controlled text-only reading question through UniRAG and render the answer with citations in VibeReader.

## Implemented

Project:

```text
/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone
```

Files changed:

- `src/App.jsx`
- `src/App.retrievalContext.test.jsx`
- `src/services/documentKnowledgeService.js`

## Behavior

Text-only chat now checks the current document's `DocumentKnowledgeLink` before choosing the query path.

UniRAG is used only when all conditions are true:

- there is a current document id,
- no image attachments are being sent,
- the user did not explicitly inject selected document context,
- UniRAG health is available,
- the current document's knowledge link is completed and has a UniRAG source or filename.

When eligible, VibeReader calls `UniRagHttpAdapter.query()` with:

```js
{
  question,
  sessionId,
  topK: 5,
  providerKey,
  provider,
  apiKey,
  mode: 'chat'
}
```

The response is written into the existing assistant message and its citations are normalized into existing `sourceRefs`, so the UI can render the same `原文依据` surface used by local retrieval.

If UniRAG query fails, the app logs the failure and falls back to the existing local retrieval plus configured model chat path. If the document is not yet ingested, the fallback path is used directly.

## Verification

### Focused Query Path Test

Command:

```bash
npm test -- src/App.retrievalContext.test.jsx -t "routes text-only chat through UniRAG|sends retrieved source excerpts"
```

Result:

```text
Test Files  1 passed (1)
Tests       2 passed | 8 skipped (10)
```

### Phase Regression

Command:

```bash
npm test -- src/services/documentKnowledgeService.test.js src/services/ragEngineAdapter.test.js src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx src/WorkspaceLayout.test.jsx
```

Result:

```text
Test Files  5 passed (5)
Tests       51 passed (51)
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

### Browser Smoke

Dev server:

```text
http://127.0.0.1:3322/
```

Observed UniRAG call counts:

```json
{
  "health": 2,
  "ingest": 1,
  "status": 1,
  "query": 1
}
```

The browser smoke uploaded `demo-assets/sample.md`, waited for `知识入库：已完成`, sent a real chat message through the Slate input, and verified the visible UniRAG answer plus `原文依据` citation button.

## Acceptance Status

- Completed ingest enables current-document UniRAG chat: satisfied.
- Missing/ineligible ingest keeps existing fallback behavior: satisfied by regression test.
- UniRAG citations render through `sourceRefs`: satisfied.
- UI does not claim precise citation jump yet: satisfied; citations show existing source reference surface.
- Browser smoke verifies visible cited answer: satisfied.

## Next Increment

Citation precision and jump behavior:

1. Map UniRAG citation chunks back to Reader source spans when possible.
2. Make source buttons navigate to the closest page/paragraph.
3. Display degraded citation state when UniRAG only returns filename/page-level evidence.
4. Keep citation confidence visible so users understand whether the answer is grounded at paragraph or document level.
