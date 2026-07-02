# Competitive Analysis Handoff Amendment

Date: 2026-07-01

## Completed

First-round competitive analysis completed and written to:

```text
.ship/tasks/20260701-vibereader-knowledge-flywheel/product/02a-competitive-analysis.md
docs/COMPETITIVE_ANALYSIS_SUMMARY.md
```

Roadmap amendment written to:

```text
.ship/tasks/20260701-vibereader-knowledge-flywheel/product/02b-roadmap-amendment-from-competitive-analysis.md
```

Decision record written to:

```text
docs/decisions/DEC-0002-keep-reader-first-after-competitive-analysis.md
```

## Product Impact

The project should keep Reader-first positioning.

Immediate P0 is now sharper:

1. `RagEngineAdapter` seam.
2. `LocalKeywordRagAdapter` fallback.
3. `UniRagHttpAdapter` health + query.
4. Citation rendering with mapping status.
5. Low-friction document Q&A.
6. Save note/card with source provenance.

## Engineering Next Step

Start Phase 1 with the smallest stable seam:

```text
RagEngineAdapter
  -> LocalKeywordRagAdapter
  -> UniRagHttpAdapter
```

Do not start by moving repositories, merging databases, or packaging UniRAG into Tauri.

## Verification Environment For Phase 1

Reader:

- VibeReader dev server.
- Real browser session.
- Fixed test PDF.

UniRAG:

- Local FastAPI server.
- Health endpoint.
- Query endpoint.

Required failure path:

- UniRAG not running -> Reader uses local fallback and communicates degraded state.
