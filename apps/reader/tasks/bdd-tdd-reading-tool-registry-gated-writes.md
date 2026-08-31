# Phase 18 BDD/TDD: Permission-gated Registry Write Tools

## Scope

This slice registers the remaining PRD first-batch tools behind explicit permissions. It does not make them available to the default reading agent.

## Behaviors

### 1. Registry includes PRD write/export tool definitions

Given the reading agent creates its local tool registry
When the registry is inspected
Then it includes `create_vibecard`, `create_annotation`, `list_attention_insights`, and `export_note`
And each tool declares whether it is read-only.

Business rule: the Agent runtime needs a stable registry contract before planner work begins.

### 2. Default permissions hide mutation and export tools

Given default reading agent permissions
When the full registry is filtered
Then `list_attention_insights` remains available
But `create_vibecard`, `create_annotation`, and `export_note` are removed.

Business rule: expanding the registry must not silently grant data mutation or file export authority.

### 3. Write tools require adapters

Given a write/export tool is explicitly allowed by permissions
When it runs
Then it delegates to the provided local adapter
And it returns a bounded result containing the current `documentId` and created/exported target.

Business rule: production writes should go through the existing persistence/export boundary, not direct in-tool state mutation.

## Boundary Conditions

- `create_vibecard` requires an adapter-provided `createVibeCard`.
- `create_annotation` requires an adapter-provided `createAnnotation`.
- `export_note` requires an adapter-provided `exportNote`.
- Missing adapters throw clear errors instead of silently succeeding.
