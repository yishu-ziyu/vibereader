# Phase C.1 Plan: Monorepo Cutover Preparation

Date: 2026-07-03

## Objective

Prepare the workbench root to become the single source of truth without losing Reader/UniRAG history or breaking the current development loop.

This phase does not immediately delete or archive child repositories. It creates the evidence needed to decide the cutover method.

## Current Source Of Truth

| Layer | Current Source | Transition Role |
| --- | --- | --- |
| Product lifecycle, yishuship, contracts, root scripts | `yishu-ziyu/vibereader-knowledge-workbench` | Canonical management home |
| Reader frontend | `yishu-ziyu/VibeReader` | Active code remote until cutover |
| UniRAG backend | `yishu-ziyu/uni-rag` | Active code remote until cutover |
| Vibero legacy | `chenyu-xjtu/Vibero` | Reference only unless explicitly revived |

## Phase C.1 Slices

### C1.1 Repository State Audit

Goal: know exactly what can move.

- Verify root, Reader, UniRAG, and Vibero git statuses.
- Record latest local commit and remote commit for each.
- Identify uncommitted or ahead/behind changes.
- Decide whether Vibero's dirty work should be archived, imported, or ignored.

Deliverable:

- `.ship/tasks/20260701-vibereader-knowledge-flywheel/qa/phase-c1-repository-state-audit.md`

### C1.2 Root Workflow Smoke

Goal: prove the workbench can operate as the daily entry point.

- Run root scripts for Reader start/test.
- Run root scripts for UniRAG start/test.
- Verify shared contract fixtures are loaded by both sides.
- Note any script gaps that force developers to enter nested folders manually.

Deliverable:

- `.ship/tasks/20260701-vibereader-knowledge-flywheel/e2e/phase-c1-root-workflow-smoke.md`

### C1.3 Migration Method Decision

Goal: choose the least painful route to one code home.

Compare:

- subtree import: preserves separate history while making root workflows simple;
- submodule: preserves remotes but adds daily friction;
- history-preserving monorepo import: strongest long-term shape but highest migration cost;
- squash import: simplest but loses local file history inside the root.

Decision criteria:

- daily developer simplicity;
- rollback safety;
- history preservation;
- compatibility with GLM/Claude/Codex handoffs;
- ability to archive child repos cleanly after cutover.

Deliverable:

- `docs/decisions/DEC-0005-monorepo-cutover-method.md`

### C1.4 Trial Cutover Branch

Goal: test the chosen method without disturbing current remotes.

- Create a temporary branch in the workbench root.
- Import Reader and UniRAG according to DEC-0005.
- Run contract tests and focused regression tests.
- Confirm `.gitignore`, root scripts, and package paths still behave.
- Delete or keep the branch only after documenting the result.

Deliverable:

- `.ship/tasks/20260701-vibereader-knowledge-flywheel/delivery/phase-c1-trial-cutover.md`

### C1.5 Archive Plan For Child Repos

Goal: define exactly when the old remotes stop being active.

- Add README banners to old repos after successful cutover.
- Mark old repos archived/read-only only after the root repo has passed tests and at least one normal development slice.
- Keep release tags or backup branches if needed.

Deliverable:

- `.ship/tasks/20260701-vibereader-knowledge-flywheel/plan/phase-c1-child-repo-archive-plan.md`

## Acceptance Criteria

Phase C.1 is complete when:

- repository state audit is written;
- root workflow smoke is written;
- DEC-0005 chooses a migration method;
- trial cutover proves the method or documents why it failed;
- child repo archive policy is explicit;
- no child repository is deleted before root source-of-truth cutover is verified.

## Non-Goals

- No immediate deletion of `VibeReader` or `uni-rag`.
- No history rewrite on `main`.
- No migration of secrets or runtime data into Git.
- No revival of Vibero without a new product decision.
