# VibeReader Project Index

Updated: 2026-09-04

## Canonical Local Root

```text
/Users/mahaoxuan/Desktop/AI产品经理/vibereader
```

Open this directory first when continuing the product.

## Current Layout

```text
vibereader/
  apps/
    reader/          # active VibeReader app
  services/
    uni-rag/         # local RAG backend / knowledge module
  docs/
  .ship/
```

## Project Roles

| Path | Role | Git Remote | Current Use |
| --- | --- | --- | --- |
| 仓库根（含 `apps/reader`、`services/uni-rag`） | 单一公开产品仓库：代码 + 契约 + 文档 | `https://github.com/yishu-ziyu/vibereader.git` | **唯一活跃开发入口（DEC-0005，2026-08-31 起）** |
| `apps/vibereader-macos` | VibeReader for Mac: native macOS edition, PageFlow fork (Apache-2.0) + UniRAG AI | 本地独立仓（DEC-0009，M1/M2 稳定后并入单仓） | Native edition bootstrap |

Author Vibero local copies were deleted on 2026-08-13 (`legacy/vibero`, `黑客松/_apps`, `黑客松/_downloads`). Do not restore them. Independent development continues on Reader + UniRAG only.

## Canonical Entry

旧 Reader 入口 `/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone` 已移除。统一从本仓库进入。

`/Users/mahaoxuan/Desktop/AI产品经理/uni-rag` 已于 2026-08-31 恢复为**独立项目副本**（不再是软链）：从 `services/uni-rag` 复制最新代码 + 从 `~/vibereader-git-backups/unirag-git-20260831.tar.gz` 恢复 `.git` 历史，remote 仍指向 `uni-rag.git`。它是独立演进的实验项目，不属于 workbench 工程；workbench 的 canonical 代码仍是 `services/uni-rag`。

Treat the new paths as canonical in new docs, prompts, scripts, and future commits.

## Git State Notes

- `apps/reader` Reading Agent Wave 17 已并入本仓库；handoff 为 `docs/AGENT_CONTINUE.md`。Prior contract: `4ec8191`.
- `services/uni-rag` is clean after commit `b093749 feat: stabilize reader memory contract` and push to `https://github.com/yishu-ziyu/uni-rag.git`.
- The workbench root is now a separate Phase C.0 repository for lifecycle docs, scripts, and shared contracts. It intentionally ignores nested code repositories during the gradual migration.
- Author Vibero is gone from disk. Ignore leftover mentions of `legacy/vibero` in older ship notes.

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

Current cloud state (after DEC-0005 cutover, 2026-08-31):

| Local path | Current remote | Role |
| --- | --- | --- |
| repository root | `https://github.com/yishu-ziyu/vibereader.git` | **唯一活跃仓库**：全部代码 + 契约 + 文档 |
| `services/uni-rag`（历史） | `https://github.com/yishu-ziyu/uni-rag.git` | 只读归档（cutover 前已完整推送） |

Repository retention policy:

- 原 Reader 单体仓已由本仓库接管 `vibereader` 名称并删除；
- `uni-rag.git` 冻结为只读归档，不再推送；
- 不创建更多分散的产品远程；
- `apps/vibereader-macos` 并入本仓时沿用 squash import（见 DEC-0005）。

Durable decisions: `docs/decisions/DEC-0004-retain-subrepos-until-monorepo-cutover.md`（已被 DEC-0005 取代）、`docs/decisions/DEC-0005-monorepo-squash-import.md`。

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
- Keep `apps/reader` and `services/uni-rag` ignored as nested repositories until a later subtree/submodule/flatten decision.
- Root remote is created and tracks `origin/main`; continue with the later subtree/submodule/flatten decision only after the nested repositories are reviewed.

Phase C.1: done (2026-08-31, DEC-0005).

- Audited both child repositories: clean worktrees, fully pushed to their remotes.
- Cutover method chosen and executed: **squash import**（子仓历史由归档远程承载，根仓收一份快照）。
- Nested `.git` 备份于 `~/vibereader-git-backups/` 后移除；根仓已拥有全部 app/service 代码。
- 旧远程冻结为只读归档。

Phase C.2: no longer needed — the layout below is now the real single-repo layout:

```text
apps/reader
services/uni-rag
apps/vibereader-macos   # 嵌套本地仓，M1/M2 后并入
packages/shared-contracts
packages/model-providers  # 规划中
```
