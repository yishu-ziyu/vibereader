# VibeReader Data Model Draft

Date: 2026-06-11

## Goal

Move long-term reading data out of scattered frontend-only state and into a durable local model.

Zustand should remain the UI state layer. Rust-backed SQLite should become the source of truth for document-scoped records.

## Data Boundary

```text
────────────────────────────────────────────────────────────
Data                         Runtime state        Durable target
────────────────────────────────────────────────────────────
sidebar collapsed            Zustand              none / setting later
active tab                   Zustand              optional setting
current PDF page / zoom      Zustand              document setting later
open document list           documentStore         SQLite
parsed text / chunks         pdfStore/vibeStore    SQLite / file cache
annotations                  localStorage          SQLite
artifacts / Lens Cards       localStorage          SQLite
flashcards                   flashcardStore        SQLite
summaries                    panel state           SQLite
attention insights           panel state           SQLite
chat sessions/messages       browser storage       SQLite
model API keys               frontend config       secure storage
────────────────────────────────────────────────────────────
```

## Core Tables

### documents

Durable record for an opened document.

Fields:

- `id`
- `name`
- `kind`
- `source`
- `path`
- `mime_type`
- `size`
- `fingerprint`
- `opened_at`
- `updated_at`
- `parse_status`

Rules:

- `id` is app-generated and stable.
- `path` may be null for browser uploads.
- `fingerprint` is optional in the first slice.
- `parse_status` starts as `pending`, `parsed`, `failed`, or `unknown`.

### annotations

User-created highlight or note tied to a document.

Fields:

- `id`
- `document_id`
- `page`
- `paragraph_id`
- `selected_text`
- `note`
- `color`
- `rect_json`
- `created_at`
- `updated_at`

Rules:

- `document_id` is required.
- `selected_text` is required for highlights created from a selection.
- `rect_json` stores viewer coordinates until a normalized source-span layer replaces it.

### vibecards

Unified reading card model. Flashcards are one VibeCard mode, not a separate product primitive.

Fields:

- `id`
- `document_id`
- `type`
- `title`
- `source_text`
- `ai_content`
- `user_note`
- `page`
- `paragraph_id`
- `tags_json`
- `source_json`
- `created_at`
- `updated_at`
- `verification_status`

Rules:

- Every card must have either source metadata or `verification_status = 'ungrounded'`.
- Source-backed cards should include page and paragraph id when available.

### conversations

Document-scoped conversation container.

Fields:

- `id`
- `document_id`
- `title`
- `created_at`
- `updated_at`

### messages

Chat message record.

Fields:

- `id`
- `conversation_id`
- `role`
- `content_json`
- `source_refs_json`
- `model_id`
- `created_at`

### summaries

Generated or user-edited summary outputs.

Fields:

- `id`
- `document_id`
- `scope`
- `scope_id`
- `title`
- `content_json`
- `model_id`
- `created_at`
- `updated_at`

### thinking_trees

Persisted structural reading tree.

Fields:

- `id`
- `document_id`
- `tree_json`
- `source`
- `created_at`
- `updated_at`

### attention_insights

Key reading locations.

Fields:

- `id`
- `document_id`
- `type`
- `description`
- `page`
- `paragraph_id`
- `source`
- `read_at`
- `created_at`
- `updated_at`

## First Implementation Slice

Implement only the smallest reliable Rust-backed substrate:

1. SQLite initialization and schema migration version.
2. Documents CRUD.
3. Annotations CRUD.
4. VibeCards CRUD.
5. Unified storage error shape.

Do not migrate every frontend panel at once. Each panel should move to this data layer only when its behavior is covered by tests and browser fallback remains intact.

## Acceptance

- A test can create a temporary database and initialize schema.
- Schema initialization is idempotent.
- A document can be inserted and listed newest-first.
- An annotation can be inserted and listed by document.
- A VibeCard can be inserted and listed by document.
- Invalid records return structured errors instead of panics.
