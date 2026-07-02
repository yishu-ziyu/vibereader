# Problem And Solution

## Problem Summary

Users lose value across the reading lifecycle:

- Reading tools help view documents but do not build long-term knowledge.
- RAG tools answer questions but do not support deep reading behavior.
- Notes and highlights often become isolated fragments.
- AI answers are hard to trust when they do not jump back to source evidence.
- Separate projects create cognitive overhead for development and product planning.

## Severity and Frequency

Severity is high for long-document users because source loss creates real work: rereading, rechecking, reorganizing, and rebuilding context. Frequency is high because every serious reading session produces material the user may want later.

## Solution Idea

Use VibeReader as the reading entrance and UniRAG as the local knowledge engine.

The first shippable loop:

1. User opens a document in VibeReader.
2. VibeReader sends the document to UniRAG for indexing.
3. User asks a question in the Reader workspace.
4. UniRAG returns grounded answer and citations.
5. VibeReader renders citations and jumps back to source location.
6. User saves useful answer, note, highlight, or card.
7. Saved artifacts become retrievable knowledge.

## Evidence

Local code and docs already show complementary strengths:

- VibeReader owns reading UI, PDF viewer, annotations, cards, tasks, and AI workbench.
- UniRAG owns ingestion, retrieval, local vector storage, and citation response structure.

## Non-goals

- Do not build a generic AI chat app.
- Do not merge both frontends.
- Do not force cloud sync in the first version.
- Do not unify storage before identity mapping and citation jump are reliable.
- Do not package the heavy UniRAG stack into desktop before the sidecar path is proven.
