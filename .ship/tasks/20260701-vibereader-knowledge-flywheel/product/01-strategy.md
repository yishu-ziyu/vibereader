# Strategy

## BRD: Why This Is Worth Doing

Long-document readers do not only need summaries. They need to stay attentive, preserve evidence, build reusable knowledge, and return to exact source material later. VibeReader already owns the reading surface, while UniRAG already owns local retrieval and citation logic. Combining them creates a stronger product than either alone.

The product is worth doing because it turns reading from a one-off session into an accumulating knowledge loop:

1. Read a source.
2. Ask grounded questions.
3. Save useful notes, highlights, cards, and answers.
4. Reuse them in future reading and retrieval.
5. Strengthen the user's private knowledge base over time.

## MRD: Market, User, Competition

Primary users:

- Graduate students and researchers reading papers.
- AI product builders reading reports, docs, specs, and competitor material.
- Analysts who need source-grounded summaries and reusable evidence.
- Heavy readers who want attention support, not just document storage.

Existing alternatives:

- PDF readers with annotation but weak AI memory.
- Chat-with-PDF tools with shallow reading UX.
- RAG knowledge bases with weak document-reading surface.
- Note apps that store notes but do not preserve strong source grounding.

The switching reason is not "better chat." The switching reason is a tighter loop between reading, source evidence, and long-term memory.

## Switching Reason

Users should switch when they feel:

- They understand documents faster without losing source fidelity.
- Their saved notes become useful again later.
- The system remembers what they have read without making them manually organize everything.
- AI answers are inspectable, grounded, and jump back to the exact document location.

## Decision

- Do: Build VibeReader as the user-facing reading workspace and connect UniRAG as the local knowledge engine.
- Do not do: Merge both frontends or turn the product into a generic chat-first RAG app.
- Evidence: Local code inspection shows VibeReader has richer reading interaction, while UniRAG has deeper RAG infrastructure.
