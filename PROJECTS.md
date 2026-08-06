# VibeReader Knowledge Workbench Project Index

Updated: 2026-07-03

## Canonical Local Root

```text
/Users/mahaoxuan/Desktop/AI产品经理/vibereader-knowledge-workbench
```

Open this directory first when continuing the product.

## Current Layout

```text
vibereader-knowledge-workbench/
  apps/
    reader/          # active VibeReader app
  services/
    uni-rag/         # local RAG backend / knowledge module
  legacy/
    vibero/          # historical/reference Vibero repository
  docs/
  .ship/
```

## Project Roles

| Path | Role | Git Remote | Current Use |
| --- | --- | --- | --- |
| `apps/reader` | Reader-first app, desktop/web UI, notes/cards/citations | `https://github.com/yishu-ziyu/VibeReader.git` | Main active development |
| `services/uni-rag` | Local RAG backend, ingest/query/citations/memory backend | `https://github.com/yishu-ziyu/uni-rag.git` | Active backend integration |
| `legacy/vibero` | Original/reference Vibero/Zotero-style codebase | `https://github.com/chenyu-xjtu/Vibero.git` | Reference only unless explicitly revived |

## Compatibility Symlinks

The old paths are retained as symlinks so existing scripts, shells, and muscle memory do not break immediately:

```text
/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone
  -> /Users/mahaoxuan/Desktop/AI产品经理/vibereader-knowledge-workbench/apps/reader

/Users/mahaoxuan/Desktop/AI产品经理/uni-rag
  -> /Users/mahaoxuan/Desktop/AI产品经理/vibereader-knowledge-workbench/services/uni-rag

/Users/mahaoxuan/Desktop/黑客松/阅读器/Vibero
  -> /Users/mahaoxuan/Desktop/AI产品经理/vibereader-knowledge-workbench/legacy/vibero
```

Treat the new paths as canonical in new docs, prompts, scripts, and future commits.

## Git State Notes

- `apps/reader` Reading Agent Wave 17 shipped: commit on VibeReader `main` (feat agent harness); handoff `docs/AGENT_CONTINUE.md`. Prior contract: `4ec8191`.
- `services/uni-rag` is clean after commit `b093749 feat: stabilize reader memory contract` and push to `https://github.com/yishu-ziyu/uni-rag.git`.
- The workbench root is now a separate Phase C.0 repository for lifecycle docs, scripts, and shared contracts. It intentionally ignores nested code repositories during the gradual migration.
- `legacy/vibero` currently has uncommitted changes under `ai-chat/`.

Do not flatten these repositories into a single Git history until dirty worktrees are reviewed and either committed or intentionally archived. Current review record: `.ship/tasks/20260701-vibereader-knowledge-flywheel/qa/codex-review-phase-1-contract-stabilization.md`.

## Agent Collaboration

GLM may produce implementation slices, tests, and local delivery notes. Codex is responsible for gatekeeping before the work becomes project truth:

- verify the changed files and contracts instead of trusting a text summary;
- run the relevant unit/integration/smoke tests with the project venv;
- remove generated runtime artifacts from Git;
- commit and push accepted code to the current remote;
- record durable decisions in this workbench, not only in chat.

For UniRAG Python tests, prefer:

```bash
uv run python -m pytest ...
```

The plain `uv run pytest` entry can hit a stale pytest script after local folder moves.

## Cloud Repository Strategy

Current cloud state:

| Local path | Current remote | Role |
| --- | --- | --- |
| workbench root | `https://github.com/yishu-ziyu/vibereader-knowledge-workbench.git` | product lifecycle docs, shared contracts, scripts |
| `apps/reader` | `https://github.com/yishu-ziyu/VibeReader.git` | active Reader app |
| `services/uni-rag` | `https://github.com/yishu-ziyu/uni-rag.git` | active Knowledge/RAG service |
| `legacy/vibero` | `https://github.com/chenyu-xjtu/Vibero.git` | legacy reference |

Target direction: one product should eventually have one cloud project home. Do not create more scattered remotes for new modules.

The workbench root is private, pushed, and tracks `origin/main`. It is the canonical product management home, but Reader and UniRAG still remain the active code remotes until monorepo cutover is verified.

Repository retention policy:

- keep `VibeReader.git` and `uni-rag.git` during Phase C.0/C.1;
- do not delete or archive child remotes before their code is intentionally imported into the workbench root;
- after cutover, archive/read-only the old remotes and point their READMEs to the workbench root;
- do not create additional scattered product remotes.

Durable decision: `docs/decisions/DEC-0004-retain-subrepos-until-monorepo-cutover.md`.

Migration trigger:

- Reader and UniRAG both have clean worktrees;
- the Reader ↔ UniRAG memory/citation contracts are stable enough to version together;
- root-level scripts can start/test the combined workspace;
- the user confirms the repository strategy.

Recommended cloud consolidation path:

1. Keep the top-level `vibereader-knowledge-workbench` repository as the management home.
2. Audit nested repository states before importing code.
3. Choose a migration method in DEC-0005: subtree, submodule, history-preserving import, or squash import.
4. Trial the chosen cutover method on a branch.
5. After verified cutover, make the top-level repo the active code source and archive/read-only the old Reader/UniRAG remotes.

## Consolidation Plan

Phase A: done.

- Physically colocate the three project directories under this workbench.
- Preserve old paths as symlinks.
- Keep each repository's own `.git` intact.

Phase B: done.

- Add root-level scripts for common workflows:
  - start Reader,
  - start UniRAG,
  - run Reader tests,
  - run UniRAG tests,
  - run integration smoke.
- Shared contracts now live at `packages/shared-contracts/reader-unirag-memory/v1/`. Reader and UniRAG contract tests both reference these fixtures via relative path lookup, with temporary compatibility for the old `contracts/` path.

Phase C.0: done.

- Initialize the workbench root as a Git repository for product-level assets.
- Track `packages/shared-contracts`, `docs`, `.ship`, root scripts, `README.md`, and `PROJECTS.md`.
- Keep `apps/reader`, `services/uni-rag`, and `legacy/vibero` ignored as nested repositories until a later subtree/submodule/flatten decision.
- Root remote is created and tracks `origin/main`; continue with the later subtree/submodule/flatten decision only after the nested repositories are reviewed.

Phase C.1: planned.

- Audit root, Reader, UniRAG, and Vibero repository states.
- Verify root scripts can run the daily Reader + UniRAG workflow.
- Choose the monorepo cutover method in DEC-0005.
- Run a trial cutover branch before changing the source of truth.
- Keep old child repositories active until the root repo fully owns verified app/service code.

Plan: `.ship/tasks/20260701-vibereader-knowledge-flywheel/plan/phase-c1-monorepo-cutover-plan.md`.

Phase C.2: later.

- Convert to a true monorepo only after the active Reader and UniRAG dirty states are resolved.
- Candidate layout:

```text
apps/reader
services/uni-rag
packages/shared-contracts
packages/model-providers
legacy/vibero
```

The goal is fewer places to remember, not a risky history rewrite.
