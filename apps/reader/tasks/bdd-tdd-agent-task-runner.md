# Phase 19 BDD/TDD: Agent Task Runner

## Scope

This slice gives the reading agent a durable task lifecycle wrapper. It does not add a planner, UI retry controls, or streaming progress events.

## Behaviors

### 1. Agent tasks record lifecycle state

Given an agent task is started for the current document
When the underlying reading agent completes successfully
Then the task is saved as `pending`, then `running`, then `succeeded`
And the final task contains the agent result in `result`.

Business rule: Agent runs must be visible as recoverable reading tasks instead of invisible function calls.

### 2. Non-completed agent results are failed tasks

Given an agent task is started
When the agent runtime returns a non-completed status such as `permission_denied`
Then the task is saved as `failed`
And the task error message is human-readable.

Business rule: permission and tool failures should remain in task history and be retryable later.

### 3. Thrown agent errors are failed tasks

Given an agent task is started
When the underlying agent runner throws
Then the task is saved as `failed`
And the original error message is preserved.

Business rule: hard failures must not silently disappear from the reading workflow.

## Boundary Conditions

- Missing task ids are generated deterministically enough for a single task run.
- `documentId`, `type`, `title`, and `payload` are preserved across lifecycle writes.
- This slice does not implement cancellation tokens or retry UI.
