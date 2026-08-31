"""Generate test PDF fixture."""
import fitz  # PyMuPDF
from pathlib import Path

pdf = fitz.open()
page = pdf.new_page()
text = """Chapter 1: Introduction

This is the first paragraph about machine learning. It introduces basic concepts.

Section 1.1: Supervised Learning

Supervised learning uses labeled data. The model learns from input-output pairs. Common algorithms: linear regression, decision trees, neural networks.

Section 1.2: Unsupervised Learning

Unsupervised learning finds patterns in unlabeled data. Clustering and dimensionality reduction are typical tasks.
"""
page.insert_text((50, 50), text)
out = Path(__file__).parent.parent / "tests" / "fixtures" / "sample.pdf"
out.parent.mkdir(parents=True, exist_ok=True)
pdf.save(str(out))
pdf.close()
print(f"Wrote {out}")
