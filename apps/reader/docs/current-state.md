# VibeReader Current State

Date: 2026-06-11

## Mainline

The current implementation mainline is this standalone VibeReader app, not the historical Zotero fork.

- Product name: `VibeReader`
- Runtime label: `VibeReader Standalone Dev`
- NPM package: `vibereader-desktop`
- Tauri package: `vibereader`
- Dev server: `http://127.0.0.1:3217`

Author Vibero was deleted locally on 2026-08-13. This standalone app is the only implementation mainline.

## Current Architecture

```text
React + Vite frontend
  Reader UI, PDF.js rendering, document panels, chat, cards, notes

Zustand stores
  UI state and current in-memory reading state

Browser/localStorage services
  Current persistence for annotations and artifacts

Tauri v2 shell
  File dialog, file system access, HTTP, debug logging
```

Rust currently registers Tauri plugins only. It does not yet own SQLite, document records, durable annotations, cards, export, secure key storage, indexing, or agent task execution.

## Working Product Surface

Current document support:

- PDF
- Markdown
- Text
- safe HTML text extraction

Current reader capabilities:

- PDF.js canvas rendering
- text layer selection
- page navigation
- zoom and fit width
- outline parsing
- annotations and highlights
- drag selected text into AI input
- paragraph navigation events
- OCR current-page workflow for pages without selectable text

Current AI capabilities:

- OpenAI-compatible and Anthropic-compatible provider families
- model presets
- streaming output
- stop generation
- model capability checks
- multimodal guardrails
- Tauri HTTP path for desktop requests
- visible thinking handling where providers expose it

Current right-side reading tools:

- Chat
- Summary
- Flashcards / card-like learning surface
- Thinking Tree
- Attention Navigator
- Notes / artifact panel

## Known Product Gaps

The current product gap is not more UI surface. The gap is durable reading state.

Important gaps:

- document list is in-memory only
- annotations and artifacts currently use frontend storage
- Flashcard, Summary, Thinking Tree, and Attention results need unified document-scoped persistence
- AI answers need source refs and click-back
- long documents should move away from default whole-document context injection
- API keys should move out of frontend storage in desktop mode
- exports need a durable source model

## Development Method

Work should start from product behavior and BDD, then move into implementation.

Default workflow for feature work:

1. Define user behavior and acceptance criteria.
2. Write failing tests for the smallest durable slice.
3. Implement the minimal production code.
4. Run targeted tests.
5. Run broader verification proportional to risk.
6. Record changed files, verification, and residual risk.

## Immediate Execution Boundary

The first PRD implementation slice is:

```text
Phase 0 documentation baseline
-> Phase 1 minimal Rust-backed local data layer
```

Phase 1 should not rewrite the UI. It should introduce the Rust-backed persistence substrate while preserving existing browser fallback paths.
