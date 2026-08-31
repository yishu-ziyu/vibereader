# PDF Parse Chain and LiteParse Evaluation

Date: 2026-06-02

Scope: sidecar evaluation only. This document does not change runtime code.

## Summary

VibeReader currently uses `pdfjs-dist` for both PDF text extraction and PDF visual rendering. The extraction path is browser-side JavaScript; the Tauri/Rust side currently provides file dialog, file read, HTTP, and logging plugins, but no PDF parser command or Rust parsing crate.

LiteParse v2 is worth evaluating because its Rust/PDFium-based parser may improve extraction speed, bounding-box quality, OCR handling, and future source-span generation. It should not replace `PdfViewer` rendering first. The conservative path is: keep PDF.js for visual rendering, add a Rust/Tauri parsing POC that produces normalized text blocks and source spans, then compare it against the current PDF.js extraction on project-owned benchmark PDFs.

The public LiteParse speed and accuracy claims were checked against official LlamaIndex/GitHub pages, but were not reproduced locally in this repository.

## Current PDF Chain

### File Opening

- Browser upload and drag/drop flow goes through `src/App.jsx`.
- Tauri local file opening goes through `src/services/documentService.js`.
- Supported extensions are `pdf`, `md`, `markdown`, `txt`, `html`, and `htm`.
- For a PDF selected through Tauri, `openTauriDocument()` uses `@tauri-apps/plugin-fs` `readFile()` to read bytes, wraps those bytes in a browser `File`, and returns both `file` and `binary`.
- Non-PDF documents are read as text and sanitized when HTML.

### Text Extraction

- `src/pdfService.js` owns PDF text extraction.
- It imports `pdfjs-dist`, configures the bundled PDF.js worker through `src/pdfWorker.js`, then calls `pdfjsLib.getDocument({ data: parserBytes }).promise`.
- For each page, it calls `page.getTextContent()`, maps every text item to `item.str`, joins those strings with spaces, and appends a page delimiter like `--- 第 1 页 ---`.
- It returns `{ text, pages }`, writes parse progress through `useProgressStore`, and stores a separate byte copy in `usePdfStore.setPdfFile(viewerBytes)` for rendering.
- Current extraction output is a plain text string plus page count. It does not persist structured text blocks, bounding boxes, source-span IDs, or OCR confidence.

### Visual Rendering

- `src/PdfViewer.jsx` owns visual rendering.
- It also imports `pdfjs-dist`, configures the same local worker, loads `pdfFile` from `usePdfStore`, and renders the active page to canvas with `page.render({ canvasContext, viewport })`.
- It builds a selectable transparent text layer from `page.getTextContent()`.
- It uses `src/paragraphExtractor.js` to group text items into paragraph-like blocks for current-page interactions.
- The viewer supports page navigation, zoom, outline navigation, selection injection, highlight/note annotations, drag-inject payloads, paragraph selection events, and attention markers.
- This rendering path is UI-critical and should remain PDF.js-backed until an alternative proves it can preserve selection, text layer alignment, annotations, and page navigation.

### Paragraph and Source-Adjacent State

- `src/paragraphExtractor.js` sorts PDF.js text items by coordinates, groups lines, and returns paragraph objects shaped like `{ id, text, page, y, fontName, fontSize }`.
- Paragraph IDs use the local convention `page-{pageNum}-para-{index}`.
- Current paragraph extraction is derived from PDF.js `getTextContent()` and is not a durable source-span index yet.
- Downstream panels such as Attention Navigator, Thinking Tree, Summary, Mind Map, and Flashcards consume `pdfText` or paragraph-like projections from `pdfText`.

### Tauri/Rust State

- `src-tauri/src/lib.rs` registers `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-http`, and debug logging.
- `src-tauri/Cargo.toml` has Tauri, serde, log, and the plugin dependencies. It does not include LiteParse, PDFium, OCR, SQLite, vector, or custom parser crates.
- `src-tauri/capabilities/default.json` permits dialog, file stat/read/readTextFile, and HTTP.
- There is no `#[tauri::command]` for PDF parsing today.

## LiteParse v2 Signals

Verified from official sources on 2026-06-02:

- GitHub README describes LiteParse as an open-source local PDF parsing tool with spatial text parsing, bounding boxes, no proprietary LLM features, and no cloud dependency.
- Official docs say it is written in Rust, runs locally, parses spatial layout and bounding boxes, supports OCR, screenshots, PDFs, Office documents, images, and bindings for Node/TypeScript, Python, Rust, and WASM.
- The v2 blog says the project was rewritten in Rust; available packages include Rust, Node, Python, and WASM; small documents are claimed to see 5-100x speedups and large documents around 3x speedups; the cited benchmark claims 0.777s for a 457-page 100MB document.
- The README says the CLI supports `lit parse`, JSON/text output, target pages, `--no-ocr`, batch parse, screenshots, Tesseract OCR, optional HTTP OCR, and `TESSDATA_PREFIX`/`--tessdata-path` for offline OCR language data.
- The README also warns that complex documents such as dense tables, multi-column layouts, charts, handwritten text, or scanned PDFs may need LlamaParse, the cloud product.

Official sources:

- https://github.com/run-llama/liteparse
- https://developers.llamaindex.ai/liteparse/
- https://www.llamaindex.ai/blog/liteparse-v2-0-runs-everywhere

Not locally verified:

- The 0.777s benchmark.
- The comparative accuracy claim against PyMuPDF, pypdf, MarkItDown, or other tools.
- Runtime behavior on this repo's actual PDFs.
- Bundle size and startup impact in a Tauri desktop app.
- Whether the Rust crate API is stable enough for direct embedding rather than CLI or Node binding use.

## Possible Value for VibeReader

LiteParse fits the product direction if treated as a local parsing backend, not as a viewer replacement.

Potential wins:

- Faster cold parse for large PDFs, especially when Reading Agent needs source spans before user interaction.
- Structured JSON and bounding boxes could become the source-span substrate: page, block, line, bbox, text, and parser confidence.
- Built-in screenshots could support multimodal checks for charts, equations, or visually important pages.
- OCR support could expand beyond text-selectable PDFs, provided OCR language data and accuracy are benchmarked.
- A Rust core aligns with the Tauri hybrid direction: React stays responsible for UI; Rust handles CPU-heavy parsing, indexing, and local persistence.

Things it does not solve by itself:

- It does not replace the current canvas/text-layer viewer UX.
- It does not guarantee correct semantic reading order for every academic paper without local benchmark evidence.
- It does not define VibeReader's artifact model, claim grounding rules, or reading-agent tool boundaries.
- It does not remove the need for source-span normalization and validation inside VibeReader.

## Relationship to Phase 10 Reading Agent

This evaluation does not conflict with Phase 10.

Phase 10 needs bounded reading-agent infrastructure: context packing, reading-only tools, source-grounded artifacts, and Lens Card generation. LiteParse can support that work later by producing better source-span inputs, but Phase 10 should not wait for LiteParse.

Recommended separation:

- Phase 10 continues using the existing PDF.js-derived text and paragraph IDs as the initial source-span surface.
- LiteParse POC runs as a parallel backend parsing experiment.
- Only after benchmark evidence should LiteParse output become an optional source-span provider.
- The Reading Agent contract should accept normalized source spans regardless of parser origin: `pdfjs`, `liteparse`, or future parser.

## Recommended Strategy

Do not replace the current PDF.js renderer.

Recommended staged approach:

1. Keep `PdfViewer.jsx` on PDF.js for canvas rendering, text selection, annotation overlays, outline navigation, and page controls.
2. Define a parser-neutral source-span schema first:
   - `documentId`
   - `parser`
   - `page`
   - `spanId`
   - `kind` such as `line`, `block`, or `paragraph`
   - `text`
   - `bbox` in PDF/page coordinates
   - `readingOrder`
   - optional `confidence`
   - optional `raw`
3. Build a non-invasive POC under Tauri/Rust or a temporary benchmark script, not in the production UI path first.
4. Compare current PDF.js extraction with LiteParse on the same files.
5. If LiteParse wins on speed and span quality, add a Tauri command that returns normalized source spans while preserving PDF.js bytes for the viewer.
6. Gate production adoption behind tests and benchmark thresholds.

Preferred integration shape:

- Frontend: still opens PDFs and renders with PDF.js.
- Tauri Rust backend: parses local PDF bytes/path into structured source spans.
- Store/index layer: persists normalized source spans and raw parser metadata.
- Reading Agent: consumes normalized source spans, not LiteParse-specific objects.

Avoid for now:

- Replacing `PdfViewer.jsx` rendering.
- Sending whole documents to cloud parsers by default.
- Adding LiteParse directly to the browser bundle before measuring size and WASM behavior.
- Building a generic file conversion pipeline for Office/images before PDF source spans are stable.
- Relying on `npx skills add` as project runtime integration. Agent skills are useful for development workflow, not app runtime.

## First POC Acceptance Criteria

Use three to five representative local PDFs:

- A small single-column text-selectable PDF.
- A double-column academic paper.
- A PDF with figures/equations.
- A larger PDF over 100 pages if available.
- Optional scanned/OCR-heavy PDF if OCR is in scope.

POC must report:

- Current PDF.js parse time from `extractTextFromPDF` equivalent.
- LiteParse parse time with OCR disabled and enabled where applicable.
- Page count agreement.
- Extracted text length and obvious missing-page checks.
- Reading-order spot checks on at least three pages per document.
- Source-span coverage: number of spans/blocks/lines, page numbers, bbox availability.
- Whether selected visible text in `PdfViewer` can be mapped to a LiteParse span on the same page.
- Binary size, dependency footprint, and Tauri build impact.

Minimum pass bar before production integration:

- Does not regress PDF.js rendering or selection UX.
- Produces deterministic normalized source-span IDs.
- Provides page and bbox data for text spans.
- Beats current PDF.js extraction on at least one meaningful large-document benchmark or provides materially better source-span quality.
- Handles parse failure without breaking document open/render.
- Can run offline with documented OCR language-data setup, or OCR is explicitly disabled for v1.

## Risks

- Benchmark risk: vendor speed claims may not reproduce on this machine or this project's documents.
- API stability risk: LiteParse v2 is moving quickly; direct Rust embedding may be less stable than CLI/Node usage.
- Packaging risk: PDFium, Tesseract, tessdata, and platform-specific binaries may increase Tauri build complexity.
- OCR risk: built-in OCR may require language data management; WASM does not include built-in OCR and needs callback-based OCR.
- UX risk: if parsing moves backend-side too early, selection/text-layer alignment may diverge from the PDF.js viewer.
- Data-model risk: adopting LiteParse-specific structures directly would couple the Reading Agent to one parser.
- Scope risk: Office/image conversion is attractive but outside the current PDF reading-agent milestone.

## Decision

Proceed with a benchmark/POC only. Treat LiteParse as a candidate source-span backend for Rust/Tauri, while keeping PDF.js as the visual renderer and keeping Phase 10 focused on parser-neutral Reading Agent contracts.
