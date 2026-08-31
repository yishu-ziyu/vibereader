# BDD/TDD: Phase 12 Rust Source Index Foundation

## Scope

Phase 12 starts moving retrieval primitives into Rust after the Web source-span loop is stable. This slice does not replace React/PDF.js rendering and does not switch Chat to Rust retrieval by default.

## Behaviors

### 1. Replace source spans by document

Given a parsed document has page-aware source spans
When the app saves those spans through Rust storage
Then SQLite replaces the old span set for that document and keeps other documents' spans untouched.

Business rule: a document re-parse must not leave stale source anchors in the local index.

### 2. Search only within the current document

Given two documents contain different source spans
When the app searches source spans for one document
Then results are limited to that document, sorted by relevance first and reading order second.

Business rule: Chat source refs must not leak content from another document.

### 3. JS bridge remains platform-safe

Given the app runs in a browser without Tauri storage
When source spans are saved, listed, or searched
Then bridge functions return safe empty results and do not call Tauri.

Business rule: Web-first product behavior keeps working while Rust indexing becomes a desktop enhancement.

## Boundary Conditions

- Source span `documentId`, `id`, `text`, and `orderIndex` are required.
- Search with an empty query returns an empty list.
- Search limit must be bounded to avoid returning the full document accidentally.
- Stored spans should preserve `page`, `paragraphId`, `chunkId`, `sourceType`, and `metadataJson` for future source navigation.

## TDD Mapping

- Rust: `src-tauri/tests/storage_core.rs`
  - replace/list source spans by document
  - search source spans by query, relevance, limit, and document isolation
- JS: `src/services/persistentStorage.test.js`
  - Tauri command contract for replace/list/search source spans
  - browser fallback returns empty arrays without invoking Tauri
