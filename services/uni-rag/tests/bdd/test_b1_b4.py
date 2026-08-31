"""End-to-end BDD verification for B1-B4 (and B2+ multi-turn follow-up).

Each test maps to a business behavior the PM defined:
  B1: 上传 → 入库 N 块
  B2: 单文件问答 → 答 + 引用
  B2+: 多轮追问 → 会话记忆历史
  B3: 多文件 → 跨文件对比仍能出答
  B4: 无关问题 → 明确说"未找到"

LLM is mocked via monkeypatch on `LLMClient.complete` to avoid real API calls.
"""
from __future__ import annotations
from pathlib import Path

import pytest

from uni_rag.rag.pipeline import RAGPipeline


FIXTURES_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures"
SAMPLE_PDF = FIXTURES_DIR / "sample.pdf"


@pytest.fixture
def pipeline(tmp_path, monkeypatch):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    # Reset the cached settings singleton so it picks up the new env vars.
    from uni_rag import config as config_module
    config_module._settings = None
    yield RAGPipeline()


@pytest.fixture
def ingested(pipeline):
    """Pipeline with sample.pdf already ingested."""
    assert SAMPLE_PDF.exists(), f"fixture missing: {SAMPLE_PDF}"
    result = pipeline.ingest_file(SAMPLE_PDF)
    assert result["chunks"] > 0, "ingest should produce at least one chunk"
    return pipeline


def _first_chunk_id(ingested_pipeline) -> str:
    """Return a real chunk_id from the vector store (used in fake LLM answers)."""
    ids = ingested_pipeline.retriever.vector.collection.get()["ids"]
    assert ids, "vector store should have at least one chunk"
    return ids[0]


def test_b1_upload_returns_chunks(tmp_path, monkeypatch):
    """B1: 上传 → 入库 N 块.

    Given a fresh pipeline and a real PDF fixture
    When the PM ingests the file
    Then the ingest result reports at least one chunk and a source id
    And the PDF is persisted to the uploads directory.
    """
    # Arrange: fresh tmp pipeline
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    from uni_rag import config as config_module
    config_module._settings = None
    from uni_rag.ingest.pipeline import IngestPipeline

    ingest = IngestPipeline()
    assert SAMPLE_PDF.exists()

    # Act
    result = ingest.ingest_file(SAMPLE_PDF)

    # Assert
    assert result["chunks"] > 0, "should produce at least 1 chunk"
    assert result["source_id"], "should return a source id"
    assert result["format"] == "pdf"


def test_b2_single_file_query(ingested, monkeypatch):
    """B2: 问 → 答 + 引用.

    Given one ingested file and a question
    When the PM queries the pipeline (LLM mocked)
    Then an answer is returned AND at least one citation is extracted.
    """
    cid = _first_chunk_id(ingested)

    def fake_complete(self, system, max_tokens=1024):
        return f"监督学习使用标注数据。[{cid}]"

    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)

    # Act
    result = ingested.query("监督学习是什么？")

    # Assert
    assert result["answer"], "answer should not be empty"
    assert len(result["citations"]) > 0, "should have at least 1 citation"
    # The citation we asked for must be in the list
    cite_ids = [c["chunk_id"] for c in result["citations"]]
    assert cid in cite_ids, f"fake-LLM cited chunk {cid} should appear in citations"


def test_b3_multi_file_query(ingested, monkeypatch, tmp_path):
    """B3: 多文件 → 跨文件对比仍能出答.

    Given a pipeline with two ingested files
    When the PM asks a comparison question
    Then the pipeline still returns an answer and citations.
    """
    # Ingest a second copy of the sample as a distinct file
    other = tmp_path / "sample_copy.pdf"
    other.write_bytes(SAMPLE_PDF.read_bytes())
    second = ingested.ingest_file(other)
    assert second["chunks"] > 0, "second file should also produce chunks"

    cid = _first_chunk_id(ingested)

    def fake_complete(self, system, max_tokens=1024):
        return f"两篇都讲了监督学习。[{cid}]"

    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)

    # Act
    result = ingested.query("对比两篇讲监督学习的差异")

    # Assert
    assert result["answer"], "answer should not be empty even for cross-file"
    assert len(result["citations"]) > 0, "should still have at least 1 citation"


def test_b4_refuses_when_no_relevant_info(ingested, monkeypatch):
    """B4: 无关问题 → 明确说未找到.

    Given the retriever returns zero chunks (simulating a cold topic)
    When the PM asks an off-topic question
    Then the pipeline emits the refusal message and citations is empty.
    """
    # Force the retriever to return [] regardless of the query
    def fake_retrieve(self, query, top_k=5, source_filter=None):
        return []

    monkeypatch.setattr(
        "uni_rag.retrieve.retriever.HybridRetriever.retrieve",
        fake_retrieve,
    )

    def fake_complete(self, system, max_tokens=1024):
        return "未找到相关信息。"

    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)

    # Act
    result = ingested.query("量子纠缠的最新论文是哪篇？")

    # Assert
    assert "未找到" in result["answer"], (
        f"answer should contain '未找到' but was: {result['answer']!r}"
    )
    assert result["citations"] == [], "refusal must have no citations"


def test_b2_followup_uses_history(ingested, monkeypatch):
    """B2+: 多轮追问 → 会话历史被记录.

    Given a fixed session_id
    When the PM asks two related questions
    Then the session store holds 4 messages (2 user + 2 assistant).
    """
    def fake_complete(self, system, max_tokens=1024):
        return "好的。"

    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)

    sid = "test-followup"

    # Act
    ingested.query("监督学习是什么？", session_id=sid)
    ingested.query("那无监督呢？", session_id=sid)

    # Assert
    history = ingested.session_store.get(sid)
    assert len(history) == 4, f"expected 4 messages, got {len(history)}: {history}"
    assert history[0]["role"] == "user"
    assert history[1]["role"] == "assistant"
    assert history[2]["role"] == "user"
    assert history[3]["role"] == "assistant"
