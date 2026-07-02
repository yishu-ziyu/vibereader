#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/services/uni-rag"

uv run uni-rag serve --port "${UNIRAG_PORT:-8766}"
