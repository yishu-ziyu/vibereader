# Model, Flow, And Role

## Business Data Model

Core objects:

- `Document`: original source file or URL.
- `DocumentIdentity`: stable mapping between VibeReader document and UniRAG source.
- `SourceChunk`: retrievable piece of a document.
- `SourceRef`: pointer to document, page, paragraph, span, and text.
- `Citation`: evidence attached to AI answer.
- `Note`: user-authored or user-confirmed reading note.
- `Card`: reusable learning or insight card.
- `Question`: user query in a reading session.
- `Answer`: AI response with citations.
- `KnowledgeLibrary`: future collection of indexed documents and user-confirmed artifacts.

## Object Relationships

- A `Document` has many `SourceChunk`s.
- A `SourceChunk` maps back to one or more `SourceRef`s.
- An `Answer` has many `Citation`s.
- A `Citation` references a `SourceRef`.
- A `Note` or `Card` may reference source evidence and may also become a retrievable object.
- A `KnowledgeLibrary` contains documents, notes, cards, and generated artifacts.

## Workflow

1. Reader opens document.
2. Reader computes or requests `DocumentIdentity`.
3. Knowledge Module ingests and indexes.
4. Reader asks query through `RagEngineAdapter`.
5. Adapter returns answer, chunks, and citations.
6. Reader renders answer and citations.
7. User saves artifacts.
8. Saved artifacts enter Knowledge Module with source provenance.

## Roles and Handoffs

Initial product role:

- Single user owns reading, saving, and retrieval.

System roles:

- Reader Module owns reading interaction and user intent.
- Knowledge Module owns indexing and retrieval.
- Model Provider Adapter owns model-specific request differences.
- Storage adapters own persistence details.
