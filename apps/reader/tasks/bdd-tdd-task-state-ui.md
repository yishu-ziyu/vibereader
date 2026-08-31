# BDD/TDD: Phase 14 Task State UI and Reading Task Adoption

## Scope

This slice connects the persistent task state foundation to visible reader workflows. It does not implement a full queue, cancellation runtime, or retry executor yet.

## Behaviors

### 1. Section summary generation records task state

Given a document-bound section summary is generated
When the summary task starts, succeeds, or fails
Then the app persists a `section_summary` task with `running`, `succeeded`, or `failed` status.

Business rule: Summary generation is a reading task and must be recoverable, not only a component spinner.

### 2. Attention analysis records task state

Given a document-bound Attention Navigator analysis is run
When the analysis starts, succeeds, or fails
Then the app persists an `attention_analysis` task with document id, status, progress, and result/error metadata.

Business rule: Attention Navigator is one of the product's differentiators, so its task state should be visible and auditable.

### 3. Current document tasks are visible in the right tool area

Given a document has persisted task records
When the user opens the Tasks panel
Then tasks are listed newest first with title, task type, status, progress, and failure reason if present.

Business rule: users need to see what background reading work has happened before Agent task orchestration is complete.

### 4. Browser runtime remains safe

Given Tauri persistent storage is unavailable
When Summary, Attention, or the Tasks panel attempts to read or write task records
Then calls return safe no-op values and the UI still renders.

Business rule: Web-first development must not be blocked by desktop-only task persistence.

## Boundary Conditions

- This slice uses persisted snapshots, not live progress events.
- Failed tasks record the user-safe error message only.
- Task payloads/results must not include API keys or provider headers.
- No cancellation or retry button is added until an executor exists.

## TDD Mapping

- JS: `src/SummaryCard.test.jsx`
  - generated summary writes `section_summary` running and succeeded states
  - failed summary writes `section_summary` failed state
- JS: `src/AttentionNavigatorPanel.test.jsx`
  - analysis writes `attention_analysis` running and succeeded states
  - failed analysis writes `attention_analysis` failed state
- JS: `src/TaskStatusPanel.test.jsx`
  - lists current document tasks and failure reasons
  - handles browser/no task fallback
