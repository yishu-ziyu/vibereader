#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/reader"

npm run dev -- --port "${VIBEREADER_PORT:-3217}"
