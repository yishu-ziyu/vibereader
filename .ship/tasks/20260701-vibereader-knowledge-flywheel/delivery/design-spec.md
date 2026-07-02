# Engineering Handoff

## Engineering Goal

Prepare VibeReader to use UniRAG as a local knowledge engine through a small, durable adapter seam, without directly merging the two frontends or storage systems.

## Product Context

The user experience should remain Reader-first. UniRAG should make the Reader more powerful by adding indexing, retrieval, citation, and long-term knowledge memory.

## Requirements

1. Add a `RagEngineAdapter` Interface in VibeReader.
2. Implement current local retrieval as one Adapter.
3. Implement UniRAG HTTP access as another Adapter.
4. Add health and failure state handling.
5. Keep citation rendering readable and source-grounded.
6. Preserve fallback behavior if UniRAG is unavailable.

## Acceptance Criteria

- A test PDF can be opened in VibeReader.
- The document can be indexed by UniRAG.
- A question can be sent from VibeReader through UniRAG.
- The answer returns with citations.
- Citations render in VibeReader.
- UniRAG failure triggers visible fallback, not silent breakage.

## Constraints

- Do not move repository folders in the first spike.
- Do not merge frontend applications.
- Do not commit API keys.
- Do not remove existing local retrieval.
- Do not hide citation mapping failure.

## Source Artifacts

- `.ship/tasks/20260701-vibereader-knowledge-flywheel/product/08-prd.md`
- `.ship/tasks/20260701-vibereader-knowledge-flywheel/product/09-tech-project-plan.md`
- `.ship/tasks/20260701-vibereader-knowledge-flywheel/product/02a-competitive-analysis-plan.md`
- `docs/PROJECT_DEVELOPMENT_PLAN.md`
- `docs/PRODUCT_VISION.md`
- `docs/UNI_RAG_INTEGRATION_STRATEGY.md`
- `docs/OPERATING_MODEL.md`
- `docs/COMPETITIVE_ANALYSIS_AND_PRODUCT_PLANNING.md`
