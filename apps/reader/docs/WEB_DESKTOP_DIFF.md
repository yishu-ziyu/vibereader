# Web Product vs Desktop/Rust Enhancement Boundary

## Purpose

Phase 11 treats the Web app as the current product proof. Tauri and Rust should strengthen the same React workbench after the Web reading loop is stable; they should not create a second product path.

## Release Boundary

Web can be considered demo-ready when these behaviors work in the browser:

- Open PDF, Markdown, text, and safe HTML through the Web file picker.
- Keep Reader, Skim Map, and Notes usable across desktop, 1024px, and tablet widths.
- Select PDF text and create source-grounded Lens Cards.
- Save artifacts and annotations by stable document id.
- Refresh and reopen the same file without leaking artifacts across documents.
- Show readable model configuration and request errors.
- Run the fallback demo without live AI.

Desktop/Rust work is not required to prove the Phase 11 Web demo.

## Capability Split

| Capability | Web product path now | Desktop/Rust enhancement later |
| --- | --- | --- |
| UI shell | React/Vite workbench | Same React workbench inside Tauri |
| File input | Browser File API | Tauri file dialog and filesystem plugin |
| PDF display | PDF.js visual renderer | Keep PDF.js renderer unless a measured replacement wins |
| PDF text and spans | PDF.js text layer, current-page OCR fallback | Rust/LiteParse benchmark for richer blocks, bbox quality, OCR orchestration |
| Local persistence | localStorage / browser fallback for metadata, artifacts, annotations | SQLite owned by Rust commands with migrations |
| Raw document storage | User reopens local files; do not put PDF binary or full text in localStorage | App data directory / file cache with explicit lifecycle |
| AI requests | Browser/proxy or configured provider path | Tauri/Rust HTTP proxy to avoid CORS and reduce frontend key exposure |
| API keys | Frontend config with redaction discipline | System keychain or Rust secure storage |
| Search | Lightweight in-memory or browser-side retrieval | Rust full-text index, then local vector index |
| Export | Browser-generated Markdown/JSON previews and downloads | Rust export commands with templates and filesystem save dialogs |
| Agent tasks | Conservative UI-triggered reading actions | Rust task queue, cancellable jobs, tool registry, durable task state |

## Non-Blocking Desktop Gaps

These gaps should be tracked, but they do not block the Web demo:

- Signed Tauri packaging.
- Rust-owned SQLite as the only durable source of truth.
- System keychain integration.
- Rust-owned AI request proxy.
- LiteParse or other Rust PDF parsing benchmark.
- Local vector search.
- Background task queue and cancellable agent runtime.
- Native save dialogs for export.

## Guardrails

- Do not fork the product workflow between Web and Tauri.
- Keep platform differences behind adapters.
- Do not move visual PDF rendering away from PDF.js without benchmark evidence.
- Do not store secrets, provider headers, raw PDFs, or full parsed document text in browser localStorage.
- Do not call a feature "Agent" unless it has tools, task state, retry/cancel behavior, and durable outputs.
