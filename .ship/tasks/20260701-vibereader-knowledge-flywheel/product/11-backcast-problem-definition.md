# Backcast Problem Definition

Date: 2026-07-01

## Starting From The Desired Future

If the desired future is a reader-first knowledge workbench that helps the user understand better, remember better, and return to source evidence, then the real problem is not:

> "How do we add RAG to the reader?"

The real problem is:

> "How do we make every reading action become durable, source-grounded knowledge that can actively help the next reading session?"

## The Problem Behind The Feature

Dense reading breaks down in four places:

1. The user does not know where to spend attention.
2. The user asks questions but cannot trust answers unless evidence is visible.
3. The user saves notes, but notes rarely come back at the right moment.
4. The user forgets why a saved idea mattered and where it came from.

Current AI reading tools often solve only the second problem: they answer questions.

The product must solve all four.

## Backcast From Signature Moment

Signature moment:

> The user selects a dense paragraph and receives a grounded explanation, a reason this paragraph matters, a connection to prior saved knowledge, and one-click save actions with source provenance.

To make this possible, the system must know:

- current document identity,
- current page and paragraph,
- document chunks and source spans,
- current selection text,
- user-confirmed notes and cards,
- prior source provenance,
- which knowledge engine is available,
- whether citations can jump back to the Reader.

## The Real Interface

The real Interface is not the chat API.

The real Interface is:

```text
ReadingState -> GroundedInterpretation -> UserConfirmedKnowledge -> FutureReadingContext
```

This should guide module design.

## Required Modules

### Reader Module

Owns:

- current document,
- page and paragraph state,
- selection,
- highlights,
- reading route,
- citation jump UI.

### Knowledge Module

Owns:

- ingest,
- retrieval,
- cross-document memory,
- citation records,
- source-grounded saved artifacts.

### Agent Module

Owns:

- attention route generation,
- paragraph interpretation,
- card/note suggestion,
- conflict or connection detection.

Agents should not own the source of truth. They propose. The user confirms.

### Evidence Module

Owns:

- source refs,
- citation confidence,
- jump availability,
- degraded state.

This module is necessary because trust is a product feature, not an implementation detail.

## Problem Priorities

P0:

- Current document can enter the Knowledge Module.
- A question can be answered with source citations.
- Citations can be displayed in the Reader.
- The system visibly distinguishes UniRAG mode from local fallback.

P1:

- Citation can jump to at least page-level source.
- User can save a note/card with source provenance.
- Saved artifacts can be ingested as knowledge.

P2:

- Prior saved knowledge can appear while reading a new document.
- Attention route can use both current document and prior knowledge.
- The product can explain why a connection is relevant.

## What Not To Build Yet

Do not prioritize:

- general knowledge library UI,
- full monorepo migration,
- elaborate settings,
- multi-agent theatrics,
- broad provider abstraction beyond what our own testing requires,
- cloud sync,
- sharing.

These may become useful later, but they do not create the signature moment first.

## Decision Rule

When choosing between two tasks, prefer the one that brings us closer to:

> current reading state becoming source-grounded future memory.

If a task does not support that, it is support work and should be scheduled behind the main path.
