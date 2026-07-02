# Phase 1 Delivery: Citation Grounding And Jump

Date: 2026-07-01

## Goal

Make UniRAG citations trustworthy in the Reader: clicking an AI answer citation should navigate back to the closest available source location instead of relying on remote chunk ids that the Reader cannot understand.

## Implemented

Project:

```text
/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone
```

Files changed:

- `src/App.jsx`
- `src/DocumentReader.jsx`
- `src/DocumentReader.test.jsx`
- `src/PdfViewer.jsx`
- `src/App.retrievalContext.test.jsx`
- `src/services/sourceIndexService.js`
- `src/services/sourceIndexService.test.js`

## Behavior

### Grounding

Added `groundSourceRefsForDocument(sourceRefs, document)` in `sourceIndexService`.

It maps UniRAG citations back to local Reader source spans:

1. If a citation text matches a local source chunk, it becomes paragraph-level evidence.
2. If text does not match but a page exists, it becomes page-level evidence.
3. If neither page nor text can be mapped, it becomes document-level evidence.

Each grounded source ref now carries:

```js
{
  documentId,
  documentName,
  page,
  paragraphId,
  originalDocumentId,
  originalParagraphId,
  grounding: {
    precision: 'paragraph' | 'page' | 'document',
    matchedBy,
    score
  }
}
```

### UI

Paragraph-level citations keep the familiar label:

```text
P2
```

Degraded evidence is visible:

```text
P2 · 页级
来源 1 · 文档级
```

This prevents the UI from pretending a page/document-level citation is an exact paragraph citation.

### Navigation

- Paragraph-level citations dispatch `vibereader:navigate-paragraph`.
- Page-level citations dispatch `vibereader:navigate-source-span`.
- `PdfViewer` now navigates to a page even when a source span has no rectangle.
- `DocumentReader` now falls back to citation text when local paragraph ids use a different naming scheme than source index ids.

This fixes the previous failure mode where UniRAG `chunk_id` was treated as a Reader `paragraphId`, causing clicks to silently miss the document.

## Verification

### Focused Tests

Command:

```bash
npm test -- src/services/sourceIndexService.test.js src/DocumentReader.test.jsx src/App.retrievalContext.test.jsx -t "grounds UniRAG|page-level grounding|document-level evidence|falls back to citation text|grounded UniRAG|routes text-only chat"
```

Result:

```text
Test Files  3 passed (3)
Tests       6 passed | 24 skipped (30)
```

### Adapter And Ingest Tests

Command:

```bash
npm test -- src/services/ragEngineAdapter.test.js src/services/documentKnowledgeService.test.js
```

Result:

```text
Test Files  2 passed (2)
Tests       14 passed (14)
```

### Phase Regression

Command:

```bash
npm test -- src/services/documentKnowledgeService.test.js src/services/ragEngineAdapter.test.js src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx src/WorkspaceLayout.test.jsx src/DocumentReader.test.jsx
```

Result:

```text
Test Files  6 passed (6)
Tests       61 passed (61)
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

Observed:

```text
CITATION_GROUNDING_JUMP_SMOKE_OK {"health":2,"ingest":1,"status":1,"query":1}
```

The smoke uploaded `demo-assets/sample.md`, waited for `知识入库：已完成`, asked a real chat question, clicked the UniRAG `P1` citation, and verified the left Reader highlighted the paragraph containing:

```text
reader and assistant are visible at the same time
```

## Acceptance Status

- UniRAG citations with matching text jump to closest Reader paragraph: satisfied.
- Citations with only page metadata can jump to page in PDF Reader: satisfied.
- Lower precision citations render as page/document-level: satisfied.
- Citation clicks no longer rely on remote chunk ids as local paragraph ids: satisfied.
- Browser smoke verifies a clicked UniRAG citation changes visible Reader context: satisfied.

## Next Increment

Saved note/card memory ingestion:

1. When users save verified AI answers or reading cards, write them into the knowledge flywheel.
2. Preserve source refs and grounding precision in the saved memory.
3. Let future UniRAG answers retrieve user-confirmed notes in addition to raw document chunks.
