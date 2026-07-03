# DEC-0004: Retain Subrepos Until Monorepo Cutover

Date: 2026-07-03

## Decision

Keep the existing Reader and UniRAG cloud repositories during the transition:

- `https://github.com/yishu-ziyu/VibeReader.git`
- `https://github.com/yishu-ziyu/uni-rag.git`

Use `https://github.com/yishu-ziyu/vibereader-knowledge-workbench.git` as the product-level cloud home for lifecycle docs, yishuship artifacts, shared contracts, root scripts, and migration records.

Do not delete, archive, or mark Reader/UniRAG read-only until their code histories are intentionally imported into the workbench root and the root repository becomes the tested source of truth.

## Why

The workbench root currently tracks management and shared-contract assets, not the full app/service code. Reader and UniRAG still own the product code histories and cloud backups.

Deleting or archiving the subrepos now would create avoidable risk:

- the cloud source for active frontend/backend code would disappear;
- open local work in nested repositories would become harder to reconcile;
- rollback and history inspection would be weaker during the migration;
- GLM/Claude/Codex handoffs would have no stable code remote for the active modules.

The product goal is still one project home. The difference is timing: keep the current code remotes as transitional sources until the workbench root can fully replace them.

## Operating Rule

During Phase C.0 and C.1:

- create no new scattered product repositories;
- commit product lifecycle/docs/shared contracts to the workbench root;
- commit active Reader code to `VibeReader.git`;
- commit active UniRAG code to `uni-rag.git`;
- reference the workbench root as the canonical local and planning entry point.

After monorepo cutover:

- make the workbench root the only active development remote;
- archive or lock the old Reader/UniRAG repositories;
- update each old repository README to point to the workbench root;
- stop pushing feature work to the old remotes unless a deliberate release branch requires it.

## Cutover Gates

Reader and UniRAG may move into the workbench root only after all gates pass:

1. `apps/reader` and `services/uni-rag` are clean against their current remotes.
2. The root workbench can start Reader and UniRAG from documented scripts.
3. Shared contracts are versioned under `packages/shared-contracts/` and both sides test against them.
4. Reader contract/full tests and UniRAG focused regression tests pass from the root workflow.
5. The migration method is chosen and documented: subtree import, submodule, or history flatten.
6. Legacy Vibero is explicitly classified as reference-only, archived, or imported under `legacy/`.
7. A rollback plan exists before changing the active source of truth.

## Not Chosen

- Delete child remotes now: rejected because the root repo does not yet contain the app/service code.
- Continue indefinitely with three active product remotes: rejected because it recreates the user's ADHD management problem.
- Add Git submodules immediately: deferred until we decide whether submodule friction is worth preserving histories separately.

## Next Decision

DEC-0005 should choose the actual migration mechanism:

- Git subtree import;
- Git submodule;
- true history-preserving monorepo import;
- squash import with old repos archived.
