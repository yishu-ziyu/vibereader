# Phase 35: Reading Agent Skill Registry

## Business Rule

Reading agents should be modeled as stable task skills before more planner UI is added. A skill records the workflow contract: task type, human title, skill document path, bounded tools, output artifact type, and retry-safe task payload.

## BDD

### Scenario 1: Stable reading skill list

Given VibeReader exposes the first reading agent skills
When the app lists reading agent skills
Then the list includes paper overview, attention route, card generation, and note export in a stable order.

Business rule: future UI can discover available reading tasks without hardcoding each contract in `App.jsx`.

### Scenario 2: Serializable paper overview task

Given the current document has an id
When the Tasks panel starts `paper_overview_agent`
Then the created task payload includes document id, skill path, required tools, max iterations, and output artifact type
And the payload can be serialized without model functions or tool closures.

Business rule: task records remain recoverable after restart and can be retried safely.

### Scenario 3: Unknown skill rejection

Given an unknown task type
When code tries to build a task for that type
Then the registry throws a clear error.

Business rule: the app should fail loudly instead of creating ambiguous task records.

## Boundary Conditions

- This slice registers task contracts, not a general planner.
- Only `paper_overview_agent` is wired to a runnable local model in the UI.
- Skill markdown files are product/runtime guidance, not executable code.

## Tests

- `src/agent/skills.test.js`
- `src/WorkspaceLayout.test.jsx`
