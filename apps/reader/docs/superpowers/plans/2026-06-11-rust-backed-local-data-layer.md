# Rust-backed Local Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Rust-backed SQLite substrate for VibeReader documents, annotations, and VibeCards without rewriting the existing React UI.

**Architecture:** Rust owns SQLite initialization, schema migration, record validation, and CRUD primitives. Tauri commands expose a stable JSON-friendly contract. The frontend keeps Zustand for UI state and uses a small adapter so browser/localStorage fallback remains available.

**Tech Stack:** Tauri v2, Rust 2021, `rusqlite`, React/Vite, Vitest.

---

## Files

- Create: `src-tauri/src/core/error.rs`
- Create: `src-tauri/src/core/mod.rs`
- Create: `src-tauri/src/core/storage.rs`
- Create: `src-tauri/src/commands/storage.rs`
- Create: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Create: `src/services/persistentStorage.js`
- Test: `src-tauri/src/core/storage.rs` unit tests
- Test: `src/services/persistentStorage.test.js`

## Task 1: Rust storage core

- [ ] **Step 1: Write failing Rust tests**

Add tests in `src-tauri/src/core/storage.rs` for:

- schema initializes
- schema initializes twice
- document insert/list newest-first
- annotation insert/list by document
- VibeCard insert/list by document
- missing required document id returns validation error

Run:

```bash
cd src-tauri && cargo test storage
```

Expected: fail because the module does not exist yet.

- [ ] **Step 2: Add dependencies**

Add `rusqlite` with bundled SQLite to `src-tauri/Cargo.toml`.

- [ ] **Step 3: Implement minimal storage core**

Create typed structs and methods:

- `Storage::open(path)`
- `Storage::open_memory()`
- `Storage::init_schema()`
- `Storage::upsert_document(input)`
- `Storage::list_documents()`
- `Storage::create_annotation(input)`
- `Storage::list_annotations(document_id)`
- `Storage::create_vibecard(input)`
- `Storage::list_vibecards(document_id)`

- [ ] **Step 4: Verify Rust tests**

Run:

```bash
cd src-tauri && cargo test storage
```

Expected: pass.

## Task 2: Tauri command surface

- [ ] **Step 1: Write command-level tests where pure functions are available**

Keep command wrappers thin. Unit-test reusable path/state helpers if introduced.

- [ ] **Step 2: Add storage commands**

Expose:

- `storage_init`
- `storage_upsert_document`
- `storage_list_documents`
- `storage_create_annotation`
- `storage_list_annotations`
- `storage_create_vibecard`
- `storage_list_vibecards`

- [ ] **Step 3: Register commands in `lib.rs`**

Use `tauri::generate_handler!`.

- [ ] **Step 4: Verify Rust build**

Run:

```bash
cd src-tauri && cargo test
```

Expected: pass.

## Task 3: Frontend adapter

- [ ] **Step 1: Write failing Vitest tests**

Create `src/services/persistentStorage.test.js` verifying:

- browser runtime reports persistence unavailable and uses fallback shape
- Tauri runtime calls `invoke('storage_list_documents')`
- adapter maps command errors into readable messages

Run:

```bash
npm run test -- src/services/persistentStorage.test.js
```

Expected: fail because adapter does not exist.

- [ ] **Step 2: Implement adapter**

Create `src/services/persistentStorage.js` with:

- `isPersistentStorageAvailable()`
- `listPersistentDocuments()`
- `savePersistentDocument(document)`
- `createPersistentAnnotation(annotation)`
- `listPersistentAnnotations(documentId)`
- `createPersistentVibeCard(card)`
- `listPersistentVibeCards(documentId)`

- [ ] **Step 3: Verify adapter tests**

Run:

```bash
npm run test -- src/services/persistentStorage.test.js
```

Expected: pass.

## Task 4: Integration checkpoint

- [ ] **Step 1: Run full tests**

```bash
npm run test
cd src-tauri && cargo test
```

- [ ] **Step 2: Build**

```bash
npm run build
```

- [ ] **Step 3: Report**

Update `tasks/todo.md` review section with:

- changed files
- verification
- remaining risks

## Acceptance Points

- Rust SQLite schema is initialized and idempotent.
- Document records can be saved and listed.
- Annotation records can be saved and listed by document.
- VibeCard records can be saved and listed by document.
- Frontend has a Tauri-aware persistence adapter.
- Browser fallback remains available.
- Tests pass for Rust storage and frontend adapter.
