#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== Workbench（单一仓库，DEC-0005）=="
echo "$ROOT"
echo

cd "$ROOT"
echo "-- git status --"
git status --short
echo
echo "-- 最近提交 --"
git log -5 --oneline
echo

echo "== 各模块（同一仓库内目录）=="
for dir in apps/reader services/uni-rag apps/vibereader-macos; do
    if [ -d "$ROOT/$dir" ]; then
        echo "- $dir"
    fi
done
echo
echo "vibereader-macos 仍是嵌套独立仓（DEC-0009），其状态："
if git -C "$ROOT/apps/vibereader-macos" rev-parse --git-dir >/dev/null 2>&1; then
    git -C "$ROOT/apps/vibereader-macos" status --short | head -5
    git -C "$ROOT/apps/vibereader-macos" log -1 --oneline
else
    echo "（无本地仓库）"
fi
