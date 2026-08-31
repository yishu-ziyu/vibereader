# Phase 36: Attention Agent Entry

## Business Rule

`attention_agent` should be the second runnable reading task after `paper_overview_agent`. It uses only read tools, starts from the Tasks panel, writes the same persisted task lifecycle, and keeps a serializable retry payload.

## BDD

### Scenario 1: Tasks panel starts configured reading skills

Given the current document is open
And the Tasks panel receives runnable reading agent skills
When the user clicks `Attention route`
Then the panel calls `onStartAgentTask("attention_agent")`.

Business rule: the Tasks panel should render runnable task contracts instead of hardcoding one button forever.

### Scenario 2: App starts attention route from registry payload

Given the current document is open
When the Tasks panel starts `attention_agent`
Then App calls `runReadingAgentTask`
And the task payload includes `skillPath`, `requiredTools`, `documentId`, and `taskType`
And the runtime options include a model and reading tools.

Business rule: `attention_agent` must be recoverable and retry-safe just like paper overview.

## Boundary Conditions

- This slice does not build a planner or cloud-model agent.
- `attention_agent` uses a deterministic local model and read-only tools.
- The Tasks panel only receives runnable skills: `paper_overview_agent` and `attention_agent`.
- `card_generation_agent` and `note_export_agent` remain registry contracts until write/export permission UX is ready.

## Tests

- `src/TaskStatusPanel.test.jsx`
- `src/WorkspaceLayout.test.jsx`
