"""Sidecar entry point: python -m uni_rag.server --port 8766.

Bundled builds launch the service through a plain interpreter inside the
.app, where no console-script shims (which carry absolute venv paths) exist.
The venv-based dev path keeps using `uni-rag serve` from the CLI.
"""
from __future__ import annotations

import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(prog="uni-rag-server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    uvicorn.run(
        "uni_rag.api.app:create_app", factory=True, host=args.host, port=args.port
    )


if __name__ == "__main__":
    main()
