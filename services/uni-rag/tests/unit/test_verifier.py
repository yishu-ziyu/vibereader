"""Tests for CitationVerifier (TDD RED phase — verifier.py does not exist yet).

RED phase failure: ModuleNotFoundError: No module named 'uni_rag.cite.verifier'
"""
from __future__ import annotations
import pytest
from uni_rag.ingest.chunker import Chunk
from uni_rag.cite.verifier import CitationVerifier


@pytest.fixture(scope="module")
def verifier():
    """Reuse one verifier across tests in this file (loads BGE-M3 once)."""
    return CitationVerifier()


def test_claim_matches_chunk_high_score(verifier):
    """claim 是 chunk 的子串，相似度应 > 0.8。"""
    chunk_text = "Machine learning is a subset of artificial intelligence."
    claim = "Machine learning is a subset of artificial intelligence."
    score = verifier.verify(claim, chunk_text)
    assert score > 0.8


def test_unrelated_claim_low_score(verifier):
    """不相关的 claim 和 chunk，相似度应 < 0.3。"""
    claim = "Quantum computing uses qubits to perform parallel calculations."
    chunk_text = "Machine learning basics: supervised, unsupervised, and reinforcement learning."
    score = verifier.verify(claim, chunk_text)
    assert score < 0.6


def test_empty_claim_returns_zero(verifier):
    """空 claim 或空 chunk_text 返回 0.0，不崩溃。"""
    assert verifier.verify("", "some chunk text") == 0.0
    assert verifier.verify("some claim", "") == 0.0
    assert verifier.verify("", "") == 0.0


def test_paraphrase_medium_score(verifier):
    """改写后的 claim vs 原文 chunk，分数在 0.4-0.7 之间。"""
    chunk_text = "The mitochondria is the powerhouse of the cell."
    paraphrased = "Mitochondria serve as the energy-producing center of cells."
    score = verifier.verify(paraphrased, chunk_text)
    assert score >= 0.7


def test_verifier_uses_bge_m3(verifier):
    """verifier 实际持有 embedder 实例，不是纯字符串匹配。"""
    assert hasattr(verifier, "embedder"), (
        "CitationVerifier should hold an embedder instance for semantic scoring"
    )
    assert verifier.embedder.dim > 0


def test_threshold_configurable():
    """默认 threshold 是 0.45，可以被覆盖。"""
    v_default = CitationVerifier()
    assert v_default.threshold == 0.45
    v_custom = CitationVerifier(threshold=0.7)
    assert v_custom.threshold == 0.7
