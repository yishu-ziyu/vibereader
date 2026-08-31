# BDD/TDD: Phase 12 Rust Source Index Bridge

## Scope

This slice connects the Rust source span index to the existing Chat retrieval path without changing PDF rendering or removing the browser JS retrieval fallback.

## Behaviors

### 1. Parsed chunks are indexable as source spans

Given a document has page-aware retrieval chunks
When the app prepares the Rust source index
Then those chunks are converted to source spans with document, page, paragraph, chunk, order, text, source type, and metadata fields.

Business rule: retrieval anchors must survive the move from frontend chunking into the local Rust index.

### 2. Tauri Chat retrieval prefers Rust search

Given Tauri persistent storage is available and Rust search returns matching spans
When the user asks a document-grounded question
Then Chat receives a retrieval prompt built from Rust search results and matching source refs.

Business rule: desktop Chat should start using the reliable local index when it exists.

### 3. Browser runtime keeps JS retrieval

Given the app runs without Tauri storage
When the user asks a document-grounded question
Then retrieval still uses the existing JS chunk search and does not call source span storage commands.

Business rule: Web development and smoke tests remain stable while Rust becomes a desktop enhancement.

### 4. Empty Rust search falls back to JS retrieval

Given Tauri storage is available but the Rust index has no matching spans
When the user asks a document-grounded question
Then the app falls back to the existing JS retrieval result.

Business rule: a missing or stale local index must not silently remove useful document context.

### 5. Same document version is indexed once per session

Given the current document has already been indexed in the current renderer session
When the user asks multiple Chat questions without changing the document content
Then the app searches Rust source spans without replacing the source span table again.

Business rule: Chat should not repeatedly rewrite the same source index in the hot path.

### 6. Changed document content rebuilds the source index

Given a document keeps the same `documentId` but its extracted text changes
When the user asks the next document-grounded question
Then the app replaces that document's source spans before searching.

Business rule: index caching must not keep stale source anchors after re-parse or version changes.

### 7. Source index freshness survives renderer restarts

Given a document's source spans were indexed and its `indexSignature` was saved in SQLite
When the renderer session cache is empty but the document text has not changed
Then Chat search can reuse the persisted index status without replacing source spans again.

Business rule: desktop indexing must not rebuild on every app restart when the stored index is already fresh.

### 8. Document open triggers indexing before Chat

Given a readable document is opened into the workspace
When parsing succeeds and the document is added to the document store
Then the app schedules source span indexing immediately instead of waiting for the first Chat question.

Business rule: retrieval indexing is part of document ingestion, not only Chat request handling.

## Boundary Conditions

- Empty documents produce no source spans.
- Rust search is used only when persistent storage is available.
- The retrieval prompt format and source ref fields stay compatible with existing source navigation.
- Non-relevant modes can use indexed spans when available, but must preserve current-page, current-section, and selected-paragraph behavior.
- Cache keys must include a document content/version signature, not only `documentId`.
- Explicit `indexDocumentSourceSpans()` remains a force-write operation for callers that intentionally rebuild an index.
- Persisted source index status must include `documentId`, `indexSignature`, `spanCount`, and `indexedAt`.
- Source indexing failures during document open are non-blocking and must not prevent the document from opening.

## TDD Mapping

- JS: `src/services/sourceIndexService.test.js`
  - chunk-to-source-span mapping
  - Tauri indexing and search contract
  - browser fallback to JS retrieval
  - empty Rust search fallback to JS retrieval
  - unchanged document version avoids repeat replace calls
  - changed document content invalidates the renderer-session index cache
  - persisted source index status avoids repeat replace after renderer cache is cleared
- JS: `src/services/persistentStorage.test.js`
  - Tauri command contract for source index status save/load
  - browser fallback returns null without invoking Tauri
- Rust: `src-tauri/tests/storage_core.rs`
  - source index status upsert/load by document
- App: `src/App.retrievalContext.test.jsx`
  - Chat uses the async indexed retrieval entrypoint while existing source-ref behavior remains unchanged.
- App: `src/WorkspaceLayout.test.jsx`
  - opening a readable document triggers source indexing after it enters the workspace.
