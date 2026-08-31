import pytest
from pathlib import Path
from uni_rag.config import load_settings
from uni_rag.store.vector import VectorStore


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    from uni_rag import config as cfg
    cfg._settings = None
    return VectorStore()


def test_add_and_query(store):
    store.add("src1", "chunk1", [0.1] * 1024, {"source": "a"})
    store.add("src1", "chunk2", [0.2] * 1024, {"source": "a"})
    results = store.query([0.1] * 1024, top_k=2)
    assert len(results) == 2
    assert results[0]["id"] in ("chunk1", "chunk2")


def test_query_with_filter(store):
    store.add("src1", "c1", [0.1] * 1024, {"source": "a"})
    store.add("src1", "c2", [0.2] * 1024, {"source": "b"})
    results = store.query([0.1] * 1024, top_k=10, where={"source": "a"})
    assert all(r["metadata"]["source"] == "a" for r in results)


def test_vector_store_isolates_collections(tmp_path, monkeypatch):
    """两个 collection 互不污染。"""
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    from uni_rag import config as cfg
    cfg._settings = None
    a = VectorStore(collection_name="kb_a")
    b = VectorStore(collection_name="kb_b")
    a.add("src", "c1", [0.1] * 1024, {"source": "a.txt"}, document="alpha content")
    b.add("src", "c2", [0.2] * 1024, {"source": "b.txt"}, document="beta content")
    # A 查不到 B 的 chunk
    a_results = a.query([0.1] * 1024, top_k=5)
    assert all(r["metadata"].get("source") == "a.txt" for r in a_results)
    b_results = b.query([0.2] * 1024, top_k=5)
    assert all(r["metadata"].get("source") == "b.txt" for r in b_results)
