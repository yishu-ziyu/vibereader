"""End-to-end BDD verification for v0.3 export + multi-KB behavior.

Each test maps to a PM-facing behavior:
  B8: 问答结果可以导出为 Markdown / PDF。
  B10: 多知识库的上传、检索、原文侧栏内容互不串库。

LLM is mocked via monkeypatch on `LLMClient.complete` to avoid real API calls.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from uni_rag.api.app import create_app


FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"
SAMPLE_PDF = FIXTURES_DIR / "sample.pdf"


def _weasyprint_renders() -> bool:
    try:
        from weasyprint import HTML

        HTML(string="<html><body>ok</body></html>").write_pdf()
        return True
    except Exception:
        return False


_pdf_required = pytest.mark.skipif(
    not _weasyprint_renders(),
    reason="weasyprint native deps not loadable on this host",
)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    from uni_rag import config as config_module

    config_module._settings = None
    app = create_app()
    return TestClient(app)


def test_b8_export_answer_markdown(client, monkeypatch):
    """B8: Given 一次文档问答，When 下载 .md，Then 文件含问题和答案。"""
    monkeypatch.setattr(
        "uni_rag.llm.client.LLMClient.complete",
        lambda *a, **kw: "answer with citation",
    )
    with open(SAMPLE_PDF, "rb") as f:
        r = client.post("/api/ingest", files={"file": ("sample.pdf", f, "application/pdf")})
    assert r.status_code == 200, r.text

    r = client.post("/api/query", json={"question": "what is supervised learning?"})
    assert r.status_code == 200, r.text
    sid = r.json()["session_id"]

    r = client.get(f"/api/sessions/{sid}/messages/2/export?format=md")
    assert r.status_code == 200, r.text
    assert "text/markdown" in r.headers["content-type"]
    assert "# 问答记录" in r.text
    assert "what is supervised learning?" in r.text
    assert "answer with citation" in r.text


@_pdf_required
def test_b8_export_answer_pdf(client, monkeypatch):
    """B8: Given 一次文档问答，When 下载 .pdf，Then 返回有效 PDF bytes。"""
    monkeypatch.setattr(
        "uni_rag.llm.client.LLMClient.complete",
        lambda *a, **kw: "answer with citation",
    )
    with open(SAMPLE_PDF, "rb") as f:
        r = client.post("/api/ingest", files={"file": ("sample.pdf", f, "application/pdf")})
    assert r.status_code == 200, r.text

    r = client.post("/api/query", json={"question": "what is supervised learning?"})
    assert r.status_code == 200, r.text
    sid = r.json()["session_id"]

    r = client.get(f"/api/sessions/{sid}/messages/2/export?format=pdf")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF-")


def test_b10_kb_isolation_end_to_end(client, monkeypatch):
    """B10: Given 两个 KB，When 分别上传文件，Then 文件、索引、侧栏 chunks 互不串库。"""
    monkeypatch.setattr(
        "uni_rag.llm.client.LLMClient.complete",
        lambda *a, **kw: "ok",
    )

    r = client.post("/api/kbs", json={"name": "ALPHA"})
    assert r.status_code == 200, r.text
    r = client.post("/api/kbs", json={"name": "BETA"})
    assert r.status_code == 200, r.text

    with open(SAMPLE_PDF, "rb") as f:
        r = client.post(
            "/api/kbs/alpha/ingest",
            files={"file": ("alpha.pdf", f, "application/pdf")},
        )
    assert r.status_code == 200, r.text

    with open(SAMPLE_PDF, "rb") as f:
        r = client.post(
            "/api/kbs/beta/ingest",
            files={"file": ("beta.pdf", f, "application/pdf")},
        )
    assert r.status_code == 200, r.text

    r = client.get("/api/kbs/alpha/documents/alpha.pdf/chunks")
    assert r.status_code == 200, r.text
    assert len(r.json()["chunks"]) > 0

    r = client.get("/api/kbs/alpha/documents/beta.pdf/chunks")
    assert r.status_code == 404

    from uni_rag.config import load_settings

    data_dir = load_settings().data_dir
    assert (data_dir / "kbs" / "alpha" / "uploads" / "alpha.pdf").exists()
    assert (data_dir / "kbs" / "beta" / "uploads" / "beta.pdf").exists()
    assert not (data_dir / "kbs" / "alpha" / "uploads" / "beta.pdf").exists()
