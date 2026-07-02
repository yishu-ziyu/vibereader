# Experience Specification

## Key Screens

- Reader workspace: central document, side panels, model status, source-grounded AI workspace.
- Knowledge panel: saved notes, cards, and retrieval results.
- Model configuration: provider, model, API style, base URL, connection test.
- Source citation view: citations rendered as readable source cards with jump actions.
- Lifecycle/dev panel: internal status for indexing, adapter health, and test evidence.

## Core States

- No document opened.
- Document opened but not indexed.
- Indexing in progress.
- Indexed and ready for grounded Q&A.
- Query running.
- Answer with citations.
- Citation jump available.
- Citation source visible but exact jump unavailable.
- Saved note/card.
- RAG engine unavailable, fallback retrieval active.

## Empty, Loading, Error States

Empty:

- Explain the next direct action: open a document or import a source.

Loading:

- Show indexing progress and avoid blocking reading.

Error:

- Distinguish model connection failure, RAG engine failure, document parse failure, and citation mapping failure.
- Provide fallback behavior where possible.

## Golden Journeys

Journey 1: First document

1. User opens PDF.
2. Reader displays PDF immediately.
3. Indexing starts in background.
4. User asks a question.
5. Answer returns with citations.
6. User clicks citation and jumps to page.
7. User saves a note.

Journey 2: Knowledge flywheel

1. User reads second document.
2. User asks a question that benefits from prior notes/cards.
3. Answer cites both original source and user-confirmed artifact.
4. User creates a new card from the answer.

Journey 3: Failure-resilient reading

1. UniRAG is unavailable.
2. Reader shows fallback local retrieval mode.
3. User can continue reading and saving notes.
4. System can retry full RAG later.
