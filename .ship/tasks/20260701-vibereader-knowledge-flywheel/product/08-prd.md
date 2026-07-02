# PRD

## Product Requirements

P0 requirements:

1. Create unified project management workspace using yishuship lifecycle.
2. Define VibeReader as Reader Module and UniRAG as Knowledge Module.
3. Define `RagEngineAdapter` seam.
4. Add a minimal UniRAG adapter spike from VibeReader.
5. Support document ingest from Reader to UniRAG.
6. Support grounded question answering through UniRAG.
7. Render answer citations in Reader.
8. Preserve fallback to existing local retrieval.

P1 requirements:

1. Map citations back to Reader page-level source locations.
2. Save notes and cards into Knowledge Module.
3. Unify model provider configuration.
4. Add browser-based E2E test for the golden journey.

P2 requirements:

1. Move to unified workspace structure.
2. Add sidecar lifecycle for local UniRAG.
3. Add Knowledge Library view.
4. Add cross-document retrieval over saved artifacts.

## Acceptance Criteria

Phase 1 acceptance:

- Reader can detect whether UniRAG is available.
- Reader can send an opened document to UniRAG for indexing.
- Reader can submit a question to UniRAG.
- Response includes answer and citations.
- Citations are visible in Reader UI.
- If UniRAG fails, Reader falls back to current local retrieval and shows the degraded state.

Phase 2 acceptance:

- At least page-level citation jump works for PDF.
- Failed jump is visible and does not pretend precision.
- Saved notes/cards retain source provenance.

## Edge Cases

- Duplicate filename with different content.
- Same document opened from different paths.
- UniRAG running on another port.
- Model key missing or invalid.
- Citation page exists but span cannot be mapped.
- User saves AI answer without source citation.
- Large PDF indexing takes longer than reading start.

## Out of Scope

- Cloud account system.
- Multi-user permission.
- Full desktop packaging of UniRAG.
- Public sharing.
- Team collaboration.
