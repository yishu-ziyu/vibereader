# Delivery: Local Workspace Consolidation

Date: 2026-07-01

## Goal

Reduce ADHD/friction risk by making one local directory the default entry point for VibeReader + UniRAG development.

## Result

Canonical root:

```text
/Users/mahaoxuan/Desktop/AI产品经理/vibereader
```

Canonical project layout:

```text
apps/reader
services/uni-rag
legacy/vibero
```

## What Changed

Moved physically:

- `/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone`
  -> `apps/reader`
- `/Users/mahaoxuan/Desktop/AI产品经理/uni-rag`
  -> `services/uni-rag`
- `/Users/mahaoxuan/Desktop/黑客松/阅读器/Vibero`
  -> `legacy/vibero`

Added compatibility symlinks at the old locations.

Added root scripts:

- `scripts/status.sh`
- `scripts/dev-reader.sh`
- `scripts/dev-unirag.sh`

Updated:

- `README.md`
- `PROJECTS.md`
- `docs/PROJECT_DEVELOPMENT_PLAN.md`
- `docs/UNI_RAG_INTEGRATION_STRATEGY.md`

## Git Boundary

This is a local workspace consolidation, not a Git history flatten.

Each project keeps its own `.git`:

- `apps/reader`: clean at `66b952a feat: advance reader knowledge flywheel`
- `services/uni-rag`: dirty worktree preserved
- `legacy/vibero`: dirty worktree preserved

Do not convert to one true monorepo until dirty worktrees are reviewed.

## Verification

Command:

```bash
scripts/status.sh
```

Result:

- Reader repository recognized.
- UniRAG repository recognized with existing dirty files.
- Vibero repository recognized with existing dirty files.
- Old paths are symlinks to the canonical locations.

## Next

Use this directory as the only human-facing entry point.

Next consolidation step:

1. Review dirty UniRAG and Vibero changes.
2. Add integration smoke script from workbench root.
3. Decide whether workbench becomes a true top-level Git repository or stays a local management workspace with nested repos.
