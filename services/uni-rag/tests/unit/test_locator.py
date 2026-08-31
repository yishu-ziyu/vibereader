"""Tests for the citation span locator."""
from uni_rag.cite.locator import locate_citation


SAMPLE = """# Chapter 1

Machine learning is a subfield of AI. It has many applications.

# Chapter 2

Deep learning uses neural networks.
"""


def test_locate_finds_offset():
    text, span = locate_citation(SAMPLE, "neural networks")
    assert text == "neural networks"
    assert span is not None
    start, end = span
    assert SAMPLE[start:end] == "neural networks"


def test_locate_returns_none_for_missing():
    text, span = locate_citation(SAMPLE, "nonexistent term")
    assert span is None
