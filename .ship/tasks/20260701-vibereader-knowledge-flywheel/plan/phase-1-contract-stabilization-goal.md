# Phase 1 Goal: Reader-UniRAG Contract Stabilization

Date: 2026-07-02

## Goal

Make the Reader ↔ UniRAG memory/citation contract stable enough that future development can safely move toward a unified cloud repository.

Stable means:

```text
fixed schema
shared fixtures
Reader contract tests
UniRAG contract tests
real browser E2E
failure fallback
contract version
```

## Why This Matters

Reader and UniRAG are now colocated locally, but still live in separate Git remotes. They should not be merged into one cloud repository until the boundary between them is explicit, tested, and versioned.

The critical product loop is:

```text
Reader opens document
→ user asks AI
→ user saves answer/card/note
→ Reader sends memory to UniRAG
→ UniRAG stores and retrieves memory
→ later query returns saved_memory citation
→ Reader renders 我的记忆
→ click jumps back to the saved card or source location
```

## Scope

1. Define `reader-unirag-memory-v1` contract.
2. Add shared JSON fixtures for saved artifacts and citations.
3. Add UniRAG contract tests against the shared fixtures.
4. Add Reader contract tests against the same fixtures.
5. Add browser E2E for the full memory/citation jump loop.
6. Add failure-path coverage for missing memory target / unavailable UniRAG.
7. Write contract documentation and yishuship delivery/e2e reports.

## Out Of Scope

- Full monorepo migration.
- New UI redesign.
- Memory deduplication/editing/versioning.
- Cloud sync or accounts.
- Changing model provider configuration.
- Replacing existing Reader or UniRAG architecture.

## Verification Environment

Local canonical root:

```text
/Users/mahaoxuan/Desktop/AI产品经理/vibereader
```

Reader:

```text
apps/reader
npm run dev -- --port 3217
```

UniRAG:

```text
services/uni-rag
uv run uni-rag serve --port 8766
```

Use project venv for UniRAG tests:

```bash
uv run python -m pytest ...
```

Do not use plain `uv run pytest`; it can hit a stale pytest entry after folder moves.

## Acceptance Criteria

- Shared fixtures exist and are documented.
- UniRAG accepts fixture payloads for all supported artifact types.
- UniRAG returns `saved_memory` citations with stable fields.
- Reader can construct memory payloads that match the fixture/schema.
- Reader can normalize and render UniRAG `saved_memory` citations.
- Reader can click a memory citation and jump to the nearest saved card/source target.
- Browser E2E verifies the loop with real Reader + real UniRAG, not only route mocks.
- Failure state is explicit when a citation cannot be jumped to.
- Contract version appears in fixtures, docs, and relevant payload/normalization logic.

## User Confirmation Needed

No product direction confirmation is needed for this phase. This is a stabilization task for an already accepted direction.

User confirmation is required only if implementation would:

- rename user-visible core concepts;
- break current saved cards/notes;
- change data privacy/storage strategy;
- force immediate monorepo migration.
