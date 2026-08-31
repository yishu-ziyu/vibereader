# Create VibeCard Acceptance Sample

## Problem

The paper asks whether a reading workspace can help users keep their attention anchored in the source document while still using AI for explanation, synthesis, and review. The problem is that long documents often become disconnected from chat answers, so users lose track of where an answer came from.

## Method

The proposed method is to keep the reader, source-grounded tasks, and saved reading artifacts in one local-first workspace. A reading agent should only use bounded document chunks, create cards with source references, and write results into the document's Notes and VibeCards area.

## Evidence

The useful evidence for this workflow is visible product behavior: after the user confirms Create VibeCard, at least three saved cards appear in the Notes area. Each card should include a title, original source text, AI explanation, and a page or paragraph reference that can be used to return to the document.

## Limitation

The current implementation is a deterministic local reading-agent path, not a cloud planner. It is enough for validating the product loop, but future versions still need card quality ranking, richer source references, spaced repetition, and full agent task recovery.
