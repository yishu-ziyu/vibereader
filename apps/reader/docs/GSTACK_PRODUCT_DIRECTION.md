# VibeReader Product Direction Through GStack

Date: 2026-06-01

This document records how VibeReader should use the local gstack methodology. It is not a plan to import gstack runtime code into VibeReader. gstack is the development operating system: it tells us how to decide, plan, verify, review, and preserve work.

## Product North Star

VibeReader is a local-first AI reading workbench.

Its core value is not "PDF plus chat". Its core value is:

```text
read source material
-> preserve source spans
-> ask grounded questions
-> generate editable reading artifacts
-> verify every claim against the document
```

The product should make AI reading more traceable, not more magical. When the app explains, summarizes, critiques, or generates cards, the user should be able to see which document span supports the output and where the model is making an inference.

## How GStack Guides This Project

Use gstack as a governance layer:

- `/office-hours` mindset: challenge whether a proposed feature improves the reading loop or just adds surface area.
- `/plan-ceo-review` mindset: keep the product wedge narrow enough to demo and remember.
- `/plan-eng-review` mindset: lock data flow, state ownership, failure modes, and test matrix before touching shared behavior.
- `/plan-design-review` mindset: keep the workbench quiet, scannable, and evidence-oriented.
- `/review` mindset: look for bugs that pass tests but break real reading workflows.
- `/qa` mindset: prove features in the real reader surface, not only in unit tests.
- `/learn` and session-intelligence mindset: write durable decisions into `tasks/`, `DEVLOG.md`, and docs so the next session does not rediscover them.

Do not import:

- gstack skill-generation machinery;
- gstack daemon state directories;
- automatic ship or deploy behavior;
- browser automation runtime as a VibeReader dependency;
- Claude-specific prompt behavior.

## Current Product Boundary

VibeReader should stay inside this boundary for the next product cycle:

- local PDF, Markdown, Text, and safe HTML reading;
- left reader and right AI workbench;
- selection and paragraph-level grounding;
- local annotations and reading artifacts;
- Tauri desktop shell;
- Rust/native code only for heavy or platform-specific work.

The project should not expand into these areas yet:

- pure Rust GUI rewrite;
- full Zotero replacement;
- cloud sync;
- unrestricted autonomous research agent;
- web-search agent;
- PDF write-back annotations;
- multi-user collaboration;
- general-purpose coding or browsing agent.

These can be backlog items, but they should not shape the next implementation slice.

## Architecture Direction

Keep the C path:

```text
React + Vite
  UI, reading workbench, panels, selection UX

Tauri + Rust
  native HTTP, local file access, future PDF/text indexing, SQLite, vector search

Reading Agent Runtime
  bounded loop, reading-only tools, context packing, source-grounded artifacts
```

This preserves the existing React surface: Ant Design X chat, PDF.js rendering, Slate input, and current Zustand stores. Rust should strengthen the system where JavaScript is weak, not replace the frontend.

## Platform Priority

Build Web first, then strengthen the desktop app.

The product should eventually support two platforms:

```text
Web app
  Same reading workbench, fastest iteration loop, broadest access.

Tauri desktop app
  Same React workbench, stronger local file, storage, HTTP, parsing, and indexing capabilities.
```

The active implementation priority is Web parity first:

- the Web app must carry the core reading loop by itself;
- the desktop app should reuse the same React UI instead of becoming a fork;
- platform differences should live behind adapters, not inside product workflows;
- Rust, SQLite, LiteParse, and local vector index work should wait until the Web reading loop is stable.

Use this platform split for planning:

```text
────────────────────────────────────────────────────────────
Ability         Web app                Desktop app
────────────────────────────────────────────────────────────
UI              React                  React
PDF display      PDF.js                 PDF.js
PDF structure    PDF.js / WASM later     Rust / LiteParse later
File input       File API               Tauri FS
Storage          IndexedDB/localStorage  SQLite / Rust later
AI request       Proxy / browser path    Tauri HTTP
Vector index     Lightweight later       Rust local index later
────────────────────────────────────────────────────────────
```

## Reading Agent Boundary

The first agent runtime should be conservative. It should not act like a general autonomous agent.

Allowed tool categories:

- read current selection;
- read current paragraph and nearby paragraphs;
- get document metadata;
- get outline;
- search current document;
- create local annotation;
- create summary, flashcards, mind map, critique, or evidence table;
- export a reading artifact.

Disallowed in the first runtime:

- arbitrary filesystem access;
- arbitrary shell commands;
- background web browsing;
- automatic modification of source documents;
- sending whole documents to external providers without an explicit mode boundary;
- multi-document synthesis before single-document grounding is stable.

## Artifact Model

Generated outputs should be treated as reading artifacts, not loose chat messages.

Each artifact should eventually carry:

```text
artifact id
document id
artifact type
user goal
source span ids
model id
created time
original generated content
current edited content
verification status
```

First useful artifact types:

- Lens Card for a selected span;
- Claim Map for a document section;
- Evidence Table for a critique question;
- Flashcards with source spans;
- Reading Note draft.

## Source Span Rule

Grounding should default to paragraph-level source spans. Page-only citations are not enough for the product shape.

For every user-visible generated claim:

- cite a source span when it is document-supported;
- mark model inference when it is not directly supported;
- keep enough metadata for click-through navigation back to the reader.

This is the main product quality bar.

## Phase Direction

### Phase 9 Completion: Nonlinear Reading Integration

Goal: finish the already-started nonlinear reading pieces.

Scope:

- connect bidirectional anchor core into PDF, Thinking Tree, and UI state;
- connect Attention Navigator panel and entry point;
- keep drag-to-inject no-auto-send behavior stable.

Verification:

- targeted unit tests for anchor and attention behavior;
- `npm run test`;
- `npm run build`;
- browser smoke with demo assets;
- update `tasks/todo.md` and `DEVLOG.md`.

### Phase 10: Reading Agent Runtime Skeleton

Goal: create the minimal runtime shape without pretending the agent is smart yet.

Scope:

- define reading tool registry in JavaScript;
- define context packer input and output contract;
- define artifact schema;
- build one deterministic "explain selected span" path using existing AI transport;
- require source span ids in the result contract.

Verification:

- BDD behavior notes in `tasks/bdd-tdd-reading-agent.md`;
- tests for context packing and artifact validation;
- browser smoke for selected text -> Lens Card artifact;
- no new unrestricted agent permissions.

### Phase 11: Web Product Closure

Goal: make the Web app feel like the real product, not only a dev fallback.

Scope:

- preserve the left-reader/right-workbench layout across common browser viewports;
- harden PDF upload, Fit Width, page navigation, selection, Lens Card generation, artifact save, and source return;
- make browser-side model configuration, missing-key errors, and provider/proxy behavior understandable;
- keep the Web favicon, branding, and demo assets aligned with the desktop app;
- document any capability that is intentionally desktop-only later.

Verification:

- BDD behavior notes for the Web reading loop;
- targeted unit tests for changed behavior;
- `npm run test`;
- `npm run build`;
- Playwright browser smoke on demo PDF and a real exported PDF;
- update `tasks/todo.md` and `DEVLOG.md`.

### Phase 12: Rust Local Index Foundation

Goal: start moving heavy local retrieval into Rust only after the source span contract is stable.

Scope:

- SQLite document metadata and source span table;
- local text index for current document;
- JS bridge functions for search and span lookup;
- keep PDF rendering in React/PDF.js for now.

Verification:

- Rust unit tests where practical;
- JS integration tests for bridge contracts;
- `cd src-tauri && cargo check`;
- migration or compatibility note for existing localStorage annotations.

## Feature Admission Test

Before adding a feature, answer these questions:

1. Does it improve source-grounded reading?
2. Does it preserve or strengthen local-first behavior?
3. Does it fit the left-reader/right-AI workbench?
4. Can it be verified with a document fixture and a visible reader workflow?
5. Can its output become a durable artifact rather than only chat text?

If the answer is "no" to most of these, the feature belongs in backlog, not the active build.

## Standard Development Gate

For non-trivial product changes:

```text
1. Write or update BDD behavior notes.
2. Add a failing test where practical.
3. Implement the smallest production change.
4. Run targeted tests.
5. Run project-level checks proportional to risk.
6. Use browser or Tauri QA for UI behavior.
7. Update tasks/todo.md and DEVLOG.md.
```

Default verification:

```bash
npm run test
npm run build
cd src-tauri && cargo check
git diff --check
```

Use Playwright or browser inspection when UI behavior changes.

## Immediate Next Slice

Recommended next implementation slice:

```text
Phase 10.1 - Reading Agent Runtime Skeleton
```

Definition of done:

- BDD doc exists for the reading-agent skeleton;
- context packer module exists and is tested;
- artifact schema module exists and is tested;
- one UI entry can generate a source-grounded Lens Card from a selected span;
- no arbitrary tool execution exists;
- results are recorded in `tasks/todo.md` and `DEVLOG.md`.

This slice is small enough to verify, but it sets the architecture for the larger reading agent.
