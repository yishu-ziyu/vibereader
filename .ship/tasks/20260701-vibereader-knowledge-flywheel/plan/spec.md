# Engineering Spec

Build the first integration seam between VibeReader and UniRAG.

## Scope

- Define adapter Interface.
- Keep existing local retrieval as fallback Adapter.
- Add UniRAG HTTP Adapter.
- Add health check and degraded state.
- Render citations returned by UniRAG.

Detailed integration rules live in `docs/UNI_RAG_INTEGRATION_STRATEGY.md`.

## Acceptance Criteria

- Reader can use local retrieval with no UniRAG process.
- Reader can use UniRAG when local UniRAG is running.
- Failure is visible and recoverable.
- No repo movement is required.
