# DEC-0001: Use yishuship For Product Lifecycle

Date: 2026-07-01

## Status

Accepted

## Context

VibeReader and UniRAG are related product surfaces but currently live in separate folders and have separate development histories. The product direction is now broader than either repo alone: VibeReader is the reading entrance, UniRAG is the long-term local knowledge memory.

Without one lifecycle system, product decisions, research, PRD, technical plans, and delivery evidence will remain scattered across chat, docs, and repo-specific files.

## Decision

Use yishuship V2 product lifecycle as the management layer for VibeReader Knowledge Workbench.

The lifecycle source of truth is:

```text
.ship/tasks/20260701-vibereader-knowledge-flywheel/
  input/
  product/
  delivery/
  growth/
  control/
  plan/
```

Long-lived narrative docs may still exist under `docs/`, but lifecycle gates and handoffs should originate from `.ship/tasks/<task_id>/`.

## Consequences

- New product ideas should first become yishuship lifecycle tasks.
- Engineering work should start from `delivery/design-spec.md` or `plan/spec.md`.
- Product strategy, PRD, technical plan, and acceptance criteria stay connected.
- Repo migration is deferred until the integration seam is proven.

## Non-Decisions

- This does not move VibeReader or UniRAG into a monorepo yet.
- This does not require every small bug fix to go through full PM intake.
- This does not replace project-specific README or code wiki documents.
