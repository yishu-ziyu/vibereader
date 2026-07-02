# Signature Feature Acceptance

Date: 2026-07-01

## Accepted Decision

The first product signature feature is:

> Attention Route + Source-Grounded Memory

## Meaning

The product should not optimize for being a generic PDF chat tool or a visible RAG demo.

It should optimize for:

- helping the user know where to spend attention,
- explaining dense passages with source evidence,
- saving user-confirmed notes/cards as durable knowledge,
- bringing prior knowledge back during future reading,
- making every important answer returnable to source.

## Consequence For Current Work

The engineering priority is now:

1. Current document ingest to UniRAG.
2. Controlled query through UniRAG with citations.
3. Citation display and honest jump state.
4. User-confirmed notes/cards entering knowledge memory.

Support work should stay behind this path unless it is necessary for reliability or verification.

## User Confirmation

Accepted by user on 2026-07-01.
