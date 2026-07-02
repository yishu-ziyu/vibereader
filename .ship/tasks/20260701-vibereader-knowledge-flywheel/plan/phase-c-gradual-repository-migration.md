# Phase C Plan: Gradual Repository Migration

Date: 2026-07-02

## Goal

Start migrating VibeReader + UniRAG into one product workspace without rewriting or flattening active Git histories.

## Scope

1. Move shared contracts into `packages/shared-contracts/`.
2. Update Reader and UniRAG tests to read shared contracts from the new path.
3. Commit and push the verified Reader/UniRAG changes in their current repositories.
4. Initialize a top-level workbench Git repo for docs, lifecycle artifacts, scripts, and shared contracts.
5. Record the repository strategy decision in `docs/decisions/`.

## Out Of Scope

- Full monorepo flatten.
- Git subtree/submodule conversion.
- Moving Reader or UniRAG code out of their existing Git repositories.
- Changing the remote repository names.
- Reviving Vibero as an active development line.

## Verification

Reader:

```bash
cd apps/reader
npm test -- --run src/services/contract.v1.test.js
npm test
```

UniRAG:

```bash
cd services/uni-rag
uv run python -m pytest tests/integration/test_contract_v1.py
uv run python -m pytest tests/unit/test_memory_store.py tests/integration/test_memory_api.py tests/integration/test_contract_v1.py tests/integration/test_query_pipeline.py tests/unit/test_config.py tests/unit/test_visual_embedder.py tests/unit/test_pipeline_visual.py tests/unit/test_parsers.py tests/integration/test_ingest_pipeline.py
```

Top-level:

```bash
git status --short
git diff --check
```

## Acceptance Criteria

- `packages/shared-contracts/reader-unirag-memory/v1/` exists and contains v1 fixtures.
- Reader and UniRAG contract tests pass against the new path.
- Reader and UniRAG commits are pushed to their current remotes.
- Top-level workbench repo exists and tracks shared contracts and lifecycle docs, not nested app/service code.
- `PROJECTS.md` reflects the new repository model.
