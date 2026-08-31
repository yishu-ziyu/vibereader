"""Integration test: fabricated citation detection (TDD RED phase).

RED phase: pipeline._extract_citations() doesn't verify claims, so citation["verified"]
field won't exist → AssertionError.

NOTE: This test instantiates RAGPipeline which triggers BGE-M3 model download.
The SOCKS proxy blocks HF downloads (socksio not installed) — same pre-existing
issue as existing test_query_pipeline.py on this machine.
"""
from __future__ import annotations
import pytest
from pathlib import Path
from uni_rag.rag.pipeline import RAGPipeline


@pytest.fixture
def pipeline(tmp_path, monkeypatch):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    import uni_rag.config as cfg
    cfg._settings = None

    p = RAGPipeline()
    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    p.ingest_file(pdf)
    return p


def test_fabricated_citation_detected(pipeline, monkeypatch):
    """LLM 输出伪造引用时，pipeline 的 citation 应标记 verified=False。"""
    def fake_complete(self, system, max_tokens=1024):
        return (
            "According to the document, quantum teleportation was achieved in 2025. "
            "[chunk_000:0]"
        )

    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)

    result = pipeline.query("What does the document say about quantum teleportation?")
    assert "citations" in result
    assert len(result["citations"]) > 0
    # 每个 citation 必须带 verified 字段，且伪造引用应标记为未验证
    for citation in result["citations"]:
        assert "verified" in citation, (
            "citation dict must contain 'verified' field after citation verification"
        )
        if citation.get("text"):
            assert citation["verified"] is False, (
                f"fabricated claim should be marked unverified, got verified={citation['verified']}"
            )
