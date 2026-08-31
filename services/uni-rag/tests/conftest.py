"""Test configuration."""
import sys
import os
from pathlib import Path

# Ensure src is on the path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

# Ensure env vars are set for tests
os.environ.setdefault("UNI_RAG_LLM_API_KEY", "test-key-for-unit-tests")
