# Phase 1 Delivery: Saved Memory Ingest

Date: 2026-07-01

## Goal

When a user saves a verified AI answer, reading card, or reading note, VibeReader should submit that user-confirmed artifact to the knowledge flywheel without blocking local save.

## Implemented

Project:

```text
/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone
```

Files changed:

- `src/App.jsx`
- `src/TaskStatusPanel.jsx`
- `src/App.retrievalContext.test.jsx`
- `src/TaskStatusPanel.test.jsx`
- `src/services/ragEngineAdapter.js`
- `src/services/ragEngineAdapter.test.js`
- `src/services/savedMemoryService.js`
- `src/services/savedMemoryService.test.js`

## Behavior

### Memory API Contract

`UniRagHttpAdapter` now supports:

- `POST /api/memory/jobs`
- `GET /api/memory/jobs/{job_id}`

The memory job payload is JSON, not file upload:

```js
{
  memory: {
    source: 'vibereader',
    kind: 'saved_artifact',
    artifactId,
    artifactType,
    title,
    document,
    verificationStatus,
    sourceRefs,
    content,
    text,
    createdAt,
    savedAt
  }
}
```

### Saved Memory Service

Added `savedMemoryService`:

- `SAVED_MEMORY_INGEST_TASK_TYPE = 'saved_memory_ingest'`
- `canIngestSavedMemoryArtifact(artifact)`
- `buildSavedMemoryPayload(artifact, document)`
- `startSavedMemoryIngest({ artifact, document, adapter, onStatus })`

It records a `记忆沉淀` task in persistent task storage when available.

### Reader Integration

The following saved artifacts now enqueue memory ingest:

- saved assistant answer cards (`explain_card`),
- generated Lens Cards (`lens_card`),
- route/evidence/concept cards received through `onArtifactCreated`,
- saved agent task results / reading notes (`reading_note`).

The local artifact save still completes even if memory ingest fails.

### Visible State

The workspace header can show:

- `记忆沉淀：等待 UniRAG`
- `记忆沉淀：排队中`
- `记忆沉淀：{percent}%`
- `记忆沉淀：已完成`
- `记忆沉淀：失败`

`TaskStatusPanel` recognizes `saved_memory_ingest` as:

```text
记忆沉淀
```

## Verification

### Focused Tests

Command:

```bash
npm test -- src/services/savedMemoryService.test.js src/services/ragEngineAdapter.test.js src/App.retrievalContext.test.jsx src/TaskStatusPanel.test.jsx
```

Result:

```text
Test Files  4 passed (4)
Tests       41 passed (41)
```

### Supporting Tests

Command:

```bash
npm test -- src/services/documentKnowledgeService.test.js src/services/sourceIndexService.test.js src/DocumentReader.test.jsx
```

Result:

```text
Test Files  3 passed (3)
Tests       22 passed (22)
```

### Phase Regression

Command:

```bash
npm test -- src/services/documentKnowledgeService.test.js src/services/ragEngineAdapter.test.js src/services/savedMemoryService.test.js src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx src/WorkspaceLayout.test.jsx src/DocumentReader.test.jsx src/TaskStatusPanel.test.jsx
```

Result:

```text
Test Files  8 passed (8)
Tests       80 passed (80)
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
SAVED_MEMORY_INGEST_SMOKE_OK {"health":2,"ingest":1,"status":1,"query":1,"memory":1,"memoryStatus":1}
```

The smoke uploaded `sample.md`, waited for document ingest, asked a UniRAG-backed question, saved the assistant answer card, verified `/api/memory/jobs` received a grounded saved artifact payload, and verified visible `记忆沉淀：已完成`.

## Acceptance Status

- Saving an AI answer can enqueue memory ingest: satisfied.
- Reading cards and notes use the same memory pipeline: satisfied through `onArtifactCreated`, Lens Card, and reading note save paths.
- Payload includes source refs and grounding precision: satisfied.
- UI distinguishes raw document ingest from saved memory ingest: satisfied.
- Failure does not block local save: satisfied by non-blocking enqueue and catch path.
- Browser smoke verifies visible saved-memory status: satisfied.

## Next Increment

Memory-aware query:

1. Include saved user memory in future retrieval answers.
2. Distinguish raw document evidence from user-confirmed memory evidence.
3. Verify a saved answer can influence a later query while preserving source grounding.
