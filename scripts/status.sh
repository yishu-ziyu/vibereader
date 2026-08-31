#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== Workbench =="
echo "$ROOT"
echo

echo "== Reader =="
cd "$ROOT/apps/reader"
git status --short
git log -1 --oneline
echo

echo "== UniRAG =="
cd "$ROOT/services/uni-rag"
git status --short
git log -1 --oneline
