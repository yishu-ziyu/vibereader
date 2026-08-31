# VibeReader QA Checklist

Date: 2026-06-11

## Command Checks

Run before claiming a PRD implementation slice is complete:

```bash
npm run test
npm run build
cd src-tauri && cargo test
```

Run when UI behavior changes:

```bash
npm run test:e2e
```

Run when browser smoke behavior changes:

```bash
npm run qa:smoke
```

## Phase 0 Acceptance

- `docs/current-state.md` exists and matches the live architecture.
- `docs/data-model-draft.md` defines the first durable data model slice.
- `docs/qa-checklist.md` defines command and manual checks.
- No source behavior is changed by the documentation pass.

## Phase 1 Rust-backed Data Layer Acceptance

Automated:

- SQLite schema initializes in a temporary DB.
- Running initialization twice is safe.
- Document insert/list works.
- Annotation insert/list works.
- VibeCard insert/list works.
- Invalid insert returns a structured error.
- `cd src-tauri && cargo test` passes.

Product:

- Existing browser/localStorage path still works.
- Tauri path has a stable command contract.
- Frontend does not need to know SQL.
- Sensitive values are not written to logs.

## Manual Reading QA

Use at least these materials before release-quality claims:

- one English text-layer PDF
- one Chinese text-layer PDF
- one scanned or no-text-layer PDF
- one 100+ page PDF
- one Markdown document
- one safe HTML document

Manual checklist:

- open document
- verify reader displays content
- select text
- ask AI or inject into Chat
- create highlight
- create note
- create card or artifact
- switch document and verify state isolation
- reload/restart and verify durable data returns when persistence is enabled

## Explicit User-facing Acceptance Points

The PRD is not complete until these product outcomes are true:

1. Recent documents survive restart.
2. Highlights and notes survive restart.
3. VibeCards survive restart and link back to source text.
4. Chat answers can carry clickable source references for supported contexts.
5. Attention insights persist and can become cards.
6. Notes export produces clean Markdown without secrets.
7. Long-document chat no longer depends on default whole-document context injection.
8. Reading-agent tasks have state, retry, cancel, and persisted outputs.
