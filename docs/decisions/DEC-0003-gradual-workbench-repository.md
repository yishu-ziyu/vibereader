# DEC-0003: Gradual Workbench Repository

Date: 2026-07-02

## Decision

Create a top-level `vibereader-knowledge-workbench` Git repository as the product workspace repository, but do not flatten Reader, UniRAG, or Vibero histories yet.

The top-level repository tracks:

- product and lifecycle docs;
- yishuship artifacts;
- root scripts;
- shared contracts under `packages/shared-contracts/`;
- migration records.

The nested repositories continue to own their existing code histories during the transition:

- `apps/reader` -> `https://github.com/yishu-ziyu/VibeReader.git`
- `services/uni-rag` -> `https://github.com/yishu-ziyu/uni-rag.git`
- `legacy/vibero` -> `https://github.com/chenyu-xjtu/Vibero.git`

## Why

The product now needs one local and cloud home, but the codebase still has active dirty worktrees and independent histories. A one-step history flatten would make it harder to recover, review, or push ongoing work.

The immediate pain is shared contracts: Reader and UniRAG both need `reader-unirag-memory-v1` fixtures, and those fixtures must not remain only as unversioned files in chat or local disk.

## Consequences

- Shared contracts move to `packages/shared-contracts/reader-unirag-memory/v1/`.
- Reader and UniRAG tests look up shared contracts from the workbench root, with temporary compatibility for the old `contracts/` path.
- The top-level repo initially ignores nested app/service/legacy code directories to avoid accidentally adding embedded `.git` repositories.
- Future Phase C can choose between subtree import, submodules, or true flattening after the current code lines are clean.

## Not Chosen

- Immediate monorepo flatten: rejected for now because it would mix unrelated dirty work and active remotes.
- Keeping only separate repos: rejected because shared contracts and lifecycle docs would remain scattered or unversioned.
- Duplicating fixtures into both Reader and UniRAG: rejected because it creates drift.

## Next Steps

1. Commit Reader contract changes to `VibeReader.git`.
2. Commit UniRAG contract/visual-fix changes to `uni-rag.git`.
3. Initialize top-level workbench Git repository.
4. Track `packages/shared-contracts`, `docs`, `.ship`, root scripts, and root README/index.
5. Create top-level cloud remote when ready.
