"""Tests for the bge-reranker-base cross-encoder."""
import pytest
from uni_rag.retrieve.reranker import Reranker


@pytest.fixture(scope="module")
def reranker():
    return Reranker()


def test_rerank_reorders_by_relevance(reranker):
    docs = [
        {"id": "a", "document": "Pizza with cheese and tomato sauce."},
        {"id": "b", "document": "Machine learning is a subfield of AI."},
        {"id": "c", "document": "Deep learning uses neural networks with many layers."},
    ]
    ranked = reranker.rerank("neural networks", docs, top_k=3)
    ids = [r["id"] for r in ranked]
    assert "c" in ids[:1] or "b" in ids[:1]  # ML/Neural 相关应排在第一
    assert "a" == ids[-1]  # 披萨最不相关


def test_rerank_handles_missing_doc(reranker):
    docs = [{"id": "a", "document": None}]
    ranked = reranker.rerank("query", docs, top_k=1)
    assert len(ranked) == 1
