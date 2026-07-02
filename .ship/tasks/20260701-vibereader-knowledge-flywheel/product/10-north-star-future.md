# North Star Future

Date: 2026-07-01

## The Future We Want

In the future, reading a difficult document will feel less like pushing through pages and more like entering a private study session with a sharp research partner who remembers everything that mattered.

The user opens a PDF, article, report, or book chapter. Within seconds, the product shows where attention should go first, which claims deserve skepticism, what is worth saving, and how this new material connects to what the user has already learned.

The user is not asked to prompt well. The product watches the reading state, the selected paragraph, the current page, the user's saved notes, and the prior knowledge base. It quietly prepares useful actions:

- "This paragraph is probably the hinge of the argument."
- "This looks like a definition worth turning into a card."
- "This claim conflicts with a note you saved last week."
- "You have three prior sources that make this section easier."
- "If you only have five minutes, read these two pages."

The product should make the user feel:

- clearer after reading,
- less alone with dense material,
- more capable of judging what matters,
- more confident that saved knowledge will return when needed,
- and less dependent on remembering where something came from.

## The Eye-Opening Feature

The first feature that can make the product feel different is:

> A living reading companion that turns the current document into an attention route, source-grounded answers, and reusable knowledge memory without making the user manage the system.

This is not "chat with PDF." Chat is only one surface.

The product should actively generate and maintain a reading state:

1. What the document is about.
2. What the user should inspect first.
3. What claims, definitions, and examples are worth saving.
4. What has already been understood.
5. What remains confusing or unsupported.
6. How this document connects to prior saved knowledge.
7. Where every important answer came from.

## Signature Moment

The signature moment should look like this:

1. The user opens a difficult report.
2. The reader immediately creates a route through the document.
3. The user highlights or selects a dense paragraph.
4. The side panel does not merely explain it. It says:

   - why this paragraph matters,
   - what concept it depends on,
   - what source evidence supports it,
   - which prior saved note connects to it,
   - and offers one-click actions to save the insight as a note or card.

5. Later, in a different document, that saved insight returns with citation and page provenance.

The user's feeling should be:

> "I am not collecting notes. I am building a mind that comes back to help me read."

## Product Shape

The product is not a generic knowledge base.

It is a reader-first knowledge workbench:

- The Reader is where the user thinks.
- UniRAG is the memory and retrieval engine.
- Notes and cards are not passive artifacts. They are confirmed pieces of user knowledge.
- Agents are not mascots. They perform narrow, inspectable reading work.

## What Must Be Avoided

The product will become mediocre if it turns into:

- a PDF viewer with a chat box,
- a RAG demo with citations,
- a note app with AI garnish,
- a dashboard full of generated summaries,
- an agent system that feels busy but not trustworthy.

The product only becomes special if it changes the user's reading behavior.

## North Star Product Principle

Do not optimize for how intelligent the product looks.

Optimize for moments where the user feels:

> "I understand better, I remember better, and I can return to the source."

## First Product Bet

The first major product bet is:

> Attention Route + Source-Grounded Memory

This is stronger than building broad RAG features first.

Reason:

- Attention route gives immediate value before any large knowledge base exists.
- Source-grounded memory makes saved notes trustworthy.
- UniRAG becomes valuable as a hidden engine, not as a separate destination.
- The product can improve from the user's real reading actions.

## Strategic Consequence

The next engineering work should not be "wire every UniRAG API."

The next engineering work should be:

1. ingest the current document reliably,
2. map citations back to the Reader,
3. save user-confirmed reading artifacts into knowledge memory,
4. make prior knowledge reappear in context during future reading.

Everything else is support work.
