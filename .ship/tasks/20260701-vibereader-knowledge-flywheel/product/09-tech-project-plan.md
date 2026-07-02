# Technical And Project Plan

## Technical Plan

Architecture choice:

- Keep VibeReader and UniRAG in their current folders for now.
- Manage lifecycle from `vibereader-knowledge-workbench`.
- Add an adapter seam in VibeReader.
- Use UniRAG over local HTTP for the first spike.
- Do not merge frontends.
- Do not unify databases yet.

Initial Interface:

```ts
interface RagEngineAdapter {
  ingestDocument(input: IngestDocumentInput): Promise<IngestJob>;
  getIngestStatus(jobId: string): Promise<IngestStatus>;
  retrieve(input: RetrieveInput): Promise<SourceChunk[]>;
  query(input: QueryInput): Promise<QueryResult>;
}
```

Initial adapters:

- `LocalKeywordRagAdapter`: wraps existing VibeReader retrieval.
- `UniRagHttpAdapter`: calls UniRAG FastAPI.

## Architecture Decision

Decision: integrate through an adapter seam before repository migration.

Reason:

- VibeReader has active uncommitted development work.
- UniRAG is currently clean and can be treated as a stable local engine.
- Direct repo movement would create git and path risk before product value is proven.
- Adapter-first integration creates leverage and locality: callers learn one Interface while implementation details stay behind adapters.

## Project Plan

Milestone 0: lifecycle setup

- Create yishuship lifecycle task.
- Create product and engineering artifacts.
- Update project docs to point to `.ship`.

Milestone 1: RAG adapter spike

- Add `RagEngineAdapter`.
- Add local fallback adapter.
- Add UniRAG HTTP adapter.
- Add health check.

Milestone 2: ingest and query loop

- Send document to UniRAG.
- Query through UniRAG.
- Render citations.

Milestone 3: citation jump

- Add document identity mapping.
- Map citations to Reader source refs.
- Support page-level jump first.

Milestone 4: knowledge flywheel

- Save user-confirmed notes and cards into Knowledge Module.
- Retrieve saved artifacts in future Q&A.

## Milestones

1. yishuship lifecycle initialized.
2. Product vision and integration strategy completed.
3. Adapter interface created.
4. UniRAG spike working.
5. Citation jump working.
6. Notes/cards entering knowledge memory.
7. Unified workspace migration planned and executed.

## Risks and Mitigations

- Risk: document identity mismatch.
  - Mitigation: introduce `DocumentIdentity` before precise citation jump.
- Risk: UniRAG service unavailable.
  - Mitigation: health check plus local fallback adapter.
- Risk: model provider configuration divergence.
  - Mitigation: Reader owns model config; UniRAG receives per-request provider config or shared adapter config.
- Risk: desktop packaging complexity.
  - Mitigation: keep UniRAG as sidecar during early development.
- Risk: product becomes two tools glued together.
  - Mitigation: UI remains Reader-first; RAG appears as background knowledge capability.
