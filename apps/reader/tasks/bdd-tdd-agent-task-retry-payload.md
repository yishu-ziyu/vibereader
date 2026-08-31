# Phase 20 BDD/TDD: Retryable Agent Task Payload

## Scope

This slice makes agent task records retryable by preserving the agent execution options in task payloads and adding a retry helper. It does not add UI retry controls.

## Behaviors

### 1. Agent tasks persist execution options

Given an agent task is started with `agentOptions`
When the task lifecycle is saved
Then each saved task record includes `payload.agentOptions`
And existing task payload fields are preserved.

Business rule: task records need enough information to rerun an Agent task after failure or restart.

### 2. Persisted agent tasks can be retried

Given a failed persisted agent task has `payloadJson.agentOptions`
When `retryReadingAgentTask` is called
Then it reruns `runReadingAgentTask` with the same task id, document id, type, title, and agent options.

Business rule: retry should execute the same reading task, not create a disconnected new task.

### 3. Retry fails clearly without execution options

Given a persisted task lacks agent options
When retry is requested
Then the helper throws a clear error.

Business rule: retry must not guess missing model/tool/context parameters.

## Boundary Conditions

- Payload may arrive as an object or as `payloadJson`.
- Explicit retry-time `agentOptions` can override payload-provided options.
- This slice does not implement task cancellation or UI retry wiring.
