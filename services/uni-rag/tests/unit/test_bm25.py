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


def test_remove_source_deletes_only_matching_prefix(tmp_path):
    """R4：remove_source 按 "<source_id>:" 前缀删除，其余来源不受影响。"""
    idx = BM25Index(tmp_path)
    idx.add("src_a:0", "alpha document text", {"source": "a"})
    idx.add("src_a:120", "alpha second chunk", {"source": "a"})
    idx.add("src_b:0", "beta document text", {"source": "b"})
    removed = idx.remove_source("src_a")
    assert removed == 2
    assert [d[0] for d in idx.docs] == ["src_b:0"]
    # 再次删除同 source 是幂等的
    assert idx.remove_source("src_a") == 0
    # 删除后 save/load 往返一致
    idx.save()
    reloaded = BM25Index.load(tmp_path)
    assert [d[0] for d in reloaded.docs] == ["src_b:0"]
