# DEC-0005: Monorepo Cutover via Squash Import

Date: 2026-08-31

## Decision

Execute the Phase C.1 monorepo cutover with the **squash import** method:

1. Remove the ignore entries for `apps/reader/` and `services/uni-rag/` in the root repository.
2. Import the two codebases into the root repository as a single snapshot commit (no child history).
3. Nested `.git` directories are archived to `~/vibereader-git-backups/` (outside the repo) before removal, then deleted from the working tree.
4. `apps/vibereader-macos/` keeps its own local repository for now (per DEC-0009); it will be imported the same way after M1/M2 stabilize.

## Why squash import

- Both child worktrees were clean and fully pushed to their remotes at cutover time (verified 2026-08-31), so no history is lost — the old remotes remain as read-only archives.
- History-preserving imports (subtree/filter-repo) add complexity with no payoff: the product narrative lives in the root repo's docs/ADRs, and agent collaboration works from snapshots + tests, not archaeology.
- One product, one repository, one PR surface. Future refactors (R2–R6) all land in a single repo.

## Consequences

- `apps/reader` and `services/uni-rag` were imported into this repository. The former Reader remote was later replaced by this repository at the `vibereader` slug; `uni-rag.git` remains a frozen archive.
- Nested `.gitignore` files continue to apply inside the root repo (`node_modules`, `.venv`, `data/`, `.env` are excluded — verified before import).
- `scripts/status.sh` is updated for the single-repo layout.
- Rollback path: restore archived `.git` directories from the backup tarball and re-ignore the directories.
