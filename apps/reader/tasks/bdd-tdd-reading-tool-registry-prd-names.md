# Phase 17 BDD/TDD: PRD Reading Tool Registry

## Scope

This slice aligns the Agent Tool Registry with the PRD's first read-only document tools. It does not add write tools, export tools, or an agent planner.

## Behaviors

### 1. Registry exposes PRD read tool names

Given the reading agent creates its local tool registry
When the registry is inspected
Then it includes `get_current_document`, `get_page_text`, `search_document`, and `get_document_chunks`
And the existing legacy tools remain available for current runtime compatibility.

Business rule: PRD-facing agent steps need stable tool names, but existing callers must not break during migration.

### 2. Current document tool returns metadata only

Given the current document contains full text or page text
When `get_current_document` runs
Then it returns safe metadata such as id, name, kind, page count, source, opened time, and parse status
And it does not return full document content.

Business rule: Agent planning can inspect the active document without leaking the whole paper into every step.

### 3. Search tools use bounded local document results

Given a document has page or content text
When `search_document` or `get_document_chunks` runs with a query
Then results are scoped to the current document
And each returned match/chunk is bounded and source-locatable.

Business rule: Retrieval-style chat needs source refs without defaulting to full-text context injection.

### 4. Default permissions stay read-only

Given default reading agent permissions
When PRD read tools are checked
Then they are allowed
But write/export tools such as `create_vibecard`, `create_annotation`, and `export_note` remain denied.

Business rule: Tool registry expansion must not silently grant mutation or file export authority.

## Boundary Conditions

- `get_page_text` requires a positive page number.
- Search with an empty query returns no matches instead of full document text.
- Adapter-provided search/chunk functions are allowed, but browser fallback remains deterministic.
- This slice does not implement VibeCard creation, annotation writes, note export, or external web tools.
