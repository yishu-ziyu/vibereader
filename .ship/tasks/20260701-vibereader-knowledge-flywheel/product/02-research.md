# Research

## Scenario Research

The target scene is a long reading session with a high cognitive load. The user is not merely looking for a quick answer. They need to maintain attention, identify structure, mark meaningful passages, ask follow-up questions, and preserve reusable knowledge.

C-side behavior loop:

1. Start: user opens a paper, report, spec, webpage, or book excerpt.
2. Continue: Reader helps them stay oriented through structure, attention route, summaries, and source-grounded Q&A.
3. Reuse: saved notes and cards become searchable knowledge.
4. Share or pay: future value comes from accumulated personal knowledge, not one-time AI output.
5. Drop-off risk: poor PDF interaction, weak citation jump, confusing model setup, or untrustworthy AI outputs.
6. Core behavior loop: read -> ask -> save -> retrieve -> read better next time.

B-side/hybrid considerations:

- Future teams may need shared libraries, permission controls, export, audit, and collaboration.
- The first version should remain single-user local-first to preserve privacy and shipping speed.

## Current Workflow

Current user workflow is fragmented:

- Read in one tool.
- Ask AI in another tool.
- Save notes in a note app.
- Build RAG or knowledge base separately.
- Lose citation fidelity across tools.

Current project workflow is also fragmented:

- VibeReader and UniRAG live in separate folders.
- Their product narratives are related but not yet managed as one lifecycle.
- Model configuration, source identity, and retrieval contracts are not yet unified.

## Existing Alternatives

- Zotero-style reference managers: strong library, weaker active AI reading loop.
- Notebook/RAG products: strong retrieval, weaker PDF-native reading and annotation.
- Browser/chat tools: fast but less durable and less source-grounded.
- Local PDF readers: good direct reading, weak long-term AI memory.

## Evidence

- VibeReader project docs position it as local-first AI reading workspace.
- UniRAG project docs position it as local private RAG knowledge station.
- User feedback has repeatedly emphasized real browser testing, model config reliability, source-grounded rendering, and product language quality.
