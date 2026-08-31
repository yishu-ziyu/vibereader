import pytest
from pathlib import Path
from uni_rag.store.bm25 import BM25Index


@pytest.fixture
def index(tmp_path):
    idx = BM25Index(tmp_path)
    idx.add("c1", "machine learning is a subfield of AI", {"source": "a"})
    idx.add("c2", "deep learning uses neural networks", {"source": "a"})
    idx.add("c3", "pizza recipe with cheese", {"source": "b"})
    idx.save()
    return BM25Index.load(tmp_path)


def test_query_keyword_match(index):
    results = index.query("neural networks", top_k=3)
    assert results[0]["id"] == "c2"


def test_query_filters_irrelevant(index):
    results = index.query("neural networks", top_k=3)
    ids = [r["id"] for r in results]
    assert "c3" not in ids[:1]
