# BDD/TDD: Phase 13 Rust Task State Foundation

## Scope

This slice adds a persistent task state layer for long-running local work. It does not implement a full background queue yet; it creates the durable contract that source indexing, summary generation, Attention analysis, and later Agent tasks can share.

## Behaviors

### 1. Task records are persisted by document

Given a document has a long-running local task
When the task is saved with `pending`, `running`, `succeeded`, `failed`, or `cancelled` status
Then SQLite can load that task by id and list recent tasks for the same document.

Business rule: task progress must survive app restart and remain scoped to the current document.

### 2. Task updates preserve lifecycle timestamps

Given a task was created as `pending`
When the same task is updated to `running` and then `succeeded`
Then the saved record includes stable `createdAt`, later `updatedAt`, and the latest result payload.

Business rule: Agent and ingestion work needs resumable state, not only transient UI spinners.

### 3. Invalid task status is rejected

Given a caller sends an unsupported task status
When storage tries to save it
Then the command fails with a validation error.

Business rule: downstream UI can rely on a closed task status set.

### 4. Browser runtime keeps a safe no-op bridge

Given the app runs without Tauri persistent storage
When frontend code saves, loads, or lists task records
Then it returns safe fallback values and does not call Tauri commands.

Business rule: Web-first development remains stable while desktop gets durable task state.

### 5. Source indexing records task state

Given Tauri persistent storage is available
When source indexing starts for a document
Then the app records a `source_index` task as `running` and updates it to `succeeded` with span count after indexing completes.

Business rule: document ingestion work must be visible and recoverable before the full Agent task runner exists.

## Boundary Conditions

- Task statuses are limited to `pending`, `running`, `succeeded`, `failed`, and `cancelled`.
- Task records may have no `documentId` for future app-level tasks, but document ingestion tasks must include it.
- `payloadJson`, `resultJson`, and `errorMessage` must never contain API keys or request headers.
- This slice does not add UI progress rendering or true cancellation yet.
- Source indexing task failures should be recorded as `failed` and must not prevent the document from opening.

## TDD Mapping

- Rust: `src-tauri/tests/storage_core.rs`
  - upsert/load/list task records by document
  - reject invalid status
- JS: `src/services/persistentStorage.test.js`
  - Tauri command contract for save/load/list task records
  - browser fallback returns safe no-op values
- JS: `src/services/sourceIndexService.test.js`
  - successful source indexing writes running and succeeded task states
  - failed source indexing writes failed task state before rethrowing
