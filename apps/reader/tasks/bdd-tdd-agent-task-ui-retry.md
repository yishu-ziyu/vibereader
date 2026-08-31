# Phase 21 BDD/TDD: Agent Task UI Retry

## Scope

This slice connects failed/cancelled Agent task records to the existing Tasks panel retry path. It does not add a planner button or new Agent task types.

## Behaviors

### 1. Failed Agent tasks expose Retry in Tasks

Given the current document has a failed `paper_overview_agent` task
When the Tasks panel renders
Then the task shows a `Retry` action
And clicking it passes the full task record to `onRetryTask`.

Business rule: PRD Agent tasks must be retryable from the visible task history, not only from tests or internal helpers.

### 2. App dispatches Agent retries to the Agent task runner

Given the user is viewing the same document as a failed Agent task
When the Tasks panel requests retry
Then App calls `retryReadingAgentTask(task)`
And it does not run source indexing for that Agent task.

Business rule: source-index retry and Agent retry are different execution paths.

## Boundary Conditions

- `source_index` retry continues to call `indexDocumentSourceSpans(currentDocument)`.
- Agent retry is accepted for task types ending with `_agent`.
- Tasks for other documents remain ignored.
- This slice does not reconstruct missing payloads; `retryReadingAgentTask` owns that validation.
