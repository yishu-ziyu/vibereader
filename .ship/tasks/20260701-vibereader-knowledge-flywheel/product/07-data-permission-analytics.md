# Data, Permission, And Analytics

## Report Design

Formal reporting is optional in the first phase. Useful future reports:

- Reading session summary.
- Knowledge growth summary.
- Source coverage report.
- Citation reliability report.
- Model usage and failure report.

## Tracking Plan

Local analytics should support product improvement without exposing private document content.

Events:

- `document_opened`
- `document_index_started`
- `document_index_completed`
- `query_submitted`
- `answer_received`
- `citation_clicked`
- `citation_jump_failed`
- `note_saved`
- `card_created`
- `rag_fallback_used`
- `model_connection_failed`

Metrics:

- Time from open to readable.
- Time from open to indexed.
- Citation click-through rate.
- Citation jump success rate.
- Notes/cards saved per reading session.
- Fallback frequency.
- Reuse rate of prior saved artifacts.

## Permission Model

Initial model:

- Single local user.
- Local documents remain local.
- API keys are user-owned and not committed to repo.
- AI-generated artifacts are labeled separately from original source text.

Future model:

- Workspace-level libraries.
- Shared collections.
- Role-based source access.
- Audit trail for shared knowledge.

## Risk Controls

- Never silently treat AI-generated content as original evidence.
- Do not send private text to remote models unless the user has configured a provider and explicitly runs an AI action.
- Store citations with provenance.
- Keep model keys out of git.
- Provide fallback if the RAG engine is unavailable.
