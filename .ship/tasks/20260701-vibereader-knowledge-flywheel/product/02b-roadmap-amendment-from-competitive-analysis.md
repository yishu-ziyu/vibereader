# Roadmap Amendment From Competitive Analysis

Date: 2026-07-01

## Trigger

First-round competitive analysis was completed in:

```text
.ship/tasks/20260701-vibereader-knowledge-flywheel/product/02a-competitive-analysis.md
docs/COMPETITIVE_ANALYSIS_SUMMARY.md
```

## Decision

Keep the product direction:

> Reader-first + Local Knowledge Flywheel + Source-grounded AI.

Do not reposition as:

- ChatPDF clone.
- Generic RAG dashboard.
- Zotero replacement.
- Obsidian replacement.

## Roadmap Amendment

## P0

1. `RagEngineAdapter` seam.
2. `LocalKeywordRagAdapter` fallback.
3. `UniRagHttpAdapter` health + query.
4. Citation rendering with mapping status.
5. First-run document Q&A with very low friction.
6. Save note/card with source provenance.

## P1

1. Page-level citation jump.
2. Document identity and duplicate filename handling.
3. User-confirmed note/card/highlight ingestion into UniRAG.
4. Obsidian-compatible Markdown export.
5. Model provider configuration stabilization.

## P2

1. Knowledge Library.
2. Cross-document retrieval.
3. NotebookLM/Readwise-style study artifacts.
4. Optional Zotero import/export.
5. Desktop sidecar packaging.

## Engineering Impact

The next engineering task remains:

> In VibeReader, create the `RagEngineAdapter` seam and wrap current local retrieval as `LocalKeywordRagAdapter`.

Do this before full UniRAG integration. The local adapter gives the seam a stable first implementation and provides fallback when UniRAG is unavailable.

## User Confirmation Needed

Before implementation begins, confirm:

1. Keep Reader-first as top-level posture.
2. Make `RagEngineAdapter + citation rendering` immediate P0.
3. Treat Readwise Reader and ChatPDF as UX references, not product shapes to copy.
4. Treat Zotero and Obsidian as integration/export references, not replacement targets.
