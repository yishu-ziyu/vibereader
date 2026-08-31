#!/usr/bin/env python3
import json
import subprocess
import sys
import os
from pathlib import Path

def run_evaluation():
    print("Starting UniRag Looper Evaluation...")
    
    # Add src to PYTHONPATH
    env = os.environ.copy()
    src_path = str(Path(__file__).parent.parent.parent / "src")
    if "PYTHONPATH" in env:
        env["PYTHONPATH"] = f"{src_path}:{env['PYTHONPATH']}"
    else:
        env["PYTHONPATH"] = src_path
        
    print("\n--- Baseline Test ---")
    try:
        baseline = subprocess.check_output(
            ["python", "-c", "import asyncio; from uni_rag.rag.pipeline import RAGPipeline; p = RAGPipeline('test_kb'); r = asyncio.run(p.query('解释一下什么是量子计算', style='academic')); print(r['answer'])"],
            text=True,
            env=env
        )
        print(f"Current Output:\n{baseline}")
    except Exception as e:
        print(f"Failed to run baseline: {e}")

    print("\n[Mock] Looper would now invoke the council, grade the response, and if FAIL, use Agent to modify tunable_files.")
    print("See loop.yaml for configuration.")

if __name__ == "__main__":
    run_evaluation()
