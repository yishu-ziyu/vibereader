"""Tests for the hybrid retriever (vector + BM25 + rerank)."""
import pytest
from pathlib import Path
from uni_rag.retrieve.retriever import HybridRetriever


@pytest.fixture
def retriever(tmp_path, monkeypatch):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    from uni_rag import config as cfg
    cfg._settings = None
    return HybridRetriever()


def test_hybrid_combines_vector_and_bm25(retriever):
    # 准备数据
    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    from uni_rag.ingest.pipeline import IngestPipeline
    IngestPipeline().ingest_file(pdf)
    results = retriever.retrieve("supervised learning", top_k=3)
    assert len(results) > 0
    assert all("metadata" in r for r in results)


def test_retrieve_supports_source_filter(retriever):
    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    from uni_rag.ingest.pipeline import IngestPipeline
    IngestPipeline().ingest_file(pdf)
    results = retriever.retrieve("learning", top_k=5, source_filter="sample.pdf")
    assert all(r["metadata"].get("source") == "sample.pdf" for r in results)
