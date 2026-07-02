# Codex Review: Phase-1 Contract Stabilization + Visual RAG Experiment

Date: 2026-07-02

## Status

`phase-1-contract-stabilization`: **codex-reviewed-partial**

Meaning:

- Reader ↔ UniRAG `reader-unirag-memory-v1` contract is technically acceptable at the schema/fixture/adapter/API test level.
- Full Reader Chat UI flywheel is still pending because GLM did not complete the actual UI path: ask → save card → query memory → click 「我的记忆」 → jump.
- Claude's visual RAG experiment was reviewed and locally fixed so it no longer breaks focused tests, but it remains an experiment and should not be treated as part of the contract stabilization acceptance.

## What Codex Verified

### GLM Contract Stabilization

Verified:

- Shared fixtures originally existed at `contracts/reader-unirag-memory/v1/`; Phase C.0 moved them to `packages/shared-contracts/reader-unirag-memory/v1/`.
- UniRAG `tests/integration/test_contract_v1.py` loads those fixtures via `_contracts_dir()`.
- Reader `src/services/contract.v1.test.js` loads the same fixtures via `import.meta.url` path search.
- UniRAG accepts `contractVersion` camelCase and persists `contract_version`.
- Reader normalizes `contract_version || contractVersion || "reader-unirag-memory-v1"`.
- Old payloads without `contractVersion` default to v1.

Commands:

```bash
cd services/uni-rag
uv run python -m pytest tests/unit/test_memory_store.py tests/integration/test_memory_api.py tests/integration/test_contract_v1.py tests/integration/test_query_pipeline.py tests/unit/test_config.py
```

Result:

```text
61 passed
```

```bash
cd apps/reader
npm test -- --run src/services/contract.v1.test.js
npm test
```

Result:

```text
contract.v1.test.js: 6 passed
full Reader suite: 323 passed
```

### Claude Visual RAG Experiment

Initial review found these issues:

- `visual_search()` called `self.visual_embedder.embed(...)`, but `VisualEmbedder` had no `embed` method.
- `ingest_file()` accessed `self.visual_embedder.available` without checking whether `get_visual_embedder()` returned `None`.
- `pipeline.py` used `logger.warning(...)` without defining `logger`.
- Existing `test_ingest_emits_user_visible_progress` failed because the new `visual-embedding` step changed the progress sequence.
- `data/visual_tiles/` was not ignored.

Codex local fixes:

- Added `VisualEmbedder.embed_text()`.
- Changed `visual_search()` to use `embed_text()`.
- Added missing logger.
- Guarded visual channel with `self.visual_embedder and self.visual_embedder.available`.
- Updated ingest progress test to allow optional `visual-embedding`.
- Added `tests/unit/test_pipeline_visual.py`.
- Added `data/visual_tiles/*` to `.gitignore`.

Commands:

```bash
cd services/uni-rag
uv run python -m pytest tests/unit/test_visual_embedder.py tests/unit/test_pipeline_visual.py tests/unit/test_parsers.py tests/integration/test_ingest_pipeline.py
```

Result:

```text
23 passed
```

Combined key suite after fixes:

```bash
uv run python -m pytest tests/unit/test_memory_store.py tests/integration/test_memory_api.py tests/integration/test_contract_v1.py tests/integration/test_query_pipeline.py tests/unit/test_config.py tests/unit/test_visual_embedder.py tests/unit/test_pipeline_visual.py tests/unit/test_parsers.py tests/integration/test_ingest_pipeline.py
```

Result:

```text
84 passed
```

## Remaining Risks

1. `packages/shared-contracts/reader-unirag-memory/v1/` must be versioned by the top-level workbench repo before Reader/UniRAG contract tests are considered portable.
2. Full Reader Chat UI flywheel is not verified. GLM used browser fetch + unit tests instead of the actual UI save/click path.
3. Visual RAG loads CLIP during `IngestPipeline` construction, which can add overhead to paths that only need text RAG. This should be revisited before making visual search part of normal query.
4. Visual RAG is not connected to `RAGPipeline.query()` yet; it is not a user-facing feature.
5. Current changes are uncommitted in both `apps/reader` and `services/uni-rag`.

## Recommendation

Accept GLM's contract stabilization as an engineering contract milestone, not as a full product-flow milestone.

Do not move to cloud monorepo only because the contract tests pass. Move to Phase C only after deciding how to version `contracts/` and after either:

- completing the full Reader Chat UI flywheel manually or with stronger Playwright automation, or
- explicitly accepting browser-fetch + unit tests as sufficient for the contract layer.

Keep Claude visual RAG as a separate experimental track. If it continues, make the next phase an architecture/design task for visual retrieval fusion and lazy model loading.
