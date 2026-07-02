# DEC-0002: Keep Reader-First Positioning After Competitive Analysis

Date: 2026-07-01

## Status

Accepted.

Accepted by user on 2026-07-01.

## Context

The first-round competitive analysis reviewed NotebookLM, Zotero, Readwise Reader, ChatPDF-style PDF chat products, Obsidian, and AnythingLLM/local RAG products.

The analysis found that competitors are strong in separate slices:

- NotebookLM: source-grounded AI synthesis and study artifacts.
- Zotero: research library, PDF annotation, citation management.
- Readwise Reader: active reading, highlights, saved reading memory.
- ChatPDF products: low-friction document Q&A.
- Obsidian: local durable knowledge.
- AnythingLLM: local/private RAG infrastructure.

No reviewed product fully owns Reader-first + local knowledge flywheel + source-grounded citation jump.

## Decision

Keep VibeReader as the user-facing Reader Module.

Keep UniRAG as the Knowledge Module behind an adapter seam.

Do not reposition the product as a generic document-chat tool, a note app clone, a Zotero replacement, or a RAG admin dashboard.

## Consequences

- P0 focuses on `RagEngineAdapter`, local fallback, UniRAG health/query, citation rendering, and source-provenance saving.
- Citation UX becomes product infrastructure, not polish.
- First-run Q&A must be simple like ChatPDF, but the interface remains Reader-first.
- Obsidian and Zotero become integration/export references.
- AnythingLLM validates local RAG infrastructure but not the main UI shape.

## Verification Needed

The next implementation phase should verify:

- Reader works with no UniRAG process.
- Reader detects UniRAG health when available.
- Reader can query through UniRAG.
- Citations are rendered with mapping status.
- Fallback behavior is visible and reliable.
