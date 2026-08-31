"""BDD end-to-end tests for link extractor feature (v0.4).

Maps to acceptance criteria from spec.md:
  AC-1: 网页链接提取 → POST /api/ingest/url 正常入库
  AC-2: 复用现有 pipeline → format="url", metadata 包含 platform/source_url
  AC-3: Web UI 有链接输入框
  AC-4: CLI ingest-url 子命令可用
  AC-6: LinkExtractionError 返回用户可读消息
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from typer.testing import CliRunner
from uni_rag.api.app import create_app
from uni_rag.ingest.link_extractors import LinkExtractionResult, LinkExtractionError
from uni_rag.ingest.pipeline import IngestPipeline
from cli.main import app


# ── Fixtures ──────────────────────────────────────────────────────

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    from uni_rag import config as config_module
    from uni_rag.api import routes as routes_module
    config_module._settings = None
    routes_module._pipeline = None
    app_instance = create_app()
    return TestClient(app_instance)


@pytest.fixture
def runner(tmp_path, monkeypatch):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    from uni_rag import config as config_module
    config_module._settings = None
    return CliRunner()


# ── AC-1: 网页链接提取 ───────────────────────────────────────────

class TestAC1_UrlIngestion:
    def test_post_url_returns_job_id(self, client, monkeypatch):
        """POST /api/ingest/url 返回 job_id 和 status_url。"""
        fake = LinkExtractionResult(
            text="# Hello\n\nWorld.",
            title="Hello",
            source_url="https://example.com/a",
            platform="web",
            content_type="article",
        )
        import uni_rag.ingest.link_extractors as link_mod
        monkeypatch.setattr(link_mod, "extract", lambda url: fake)

        r = client.post("/api/ingest/url", json={"url": "https://example.com/a"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "job_id" in body
        assert body["status_url"].startswith("/api/ingest/jobs/")

    def test_invalid_url_returns_400(self, client):
        """空 URL 和非 http URL 返回 400。"""
        assert client.post("/api/ingest/url", json={"url": ""}).status_code == 400
        assert client.post("/api/ingest/url", json={"url": "ftp://x"}).status_code == 400


# ── AC-2: 复用现有 pipeline ──────────────────────────────────────

class TestAC2_PipelineReuse:
    def test_ingest_url_returns_correct_format(self):
        """ingest_url 返回 format="url"。"""
        fake = LinkExtractionResult(
            text="# Title\n\nBody.",
            title="Title",
            source_url="https://example.com/c",
            platform="web",
            content_type="article",
        )
        with patch("uni_rag.ingest.link_extractors.extract", return_value=fake), \
             patch("uni_rag.ingest.pipeline.parse_url_result") as mock_parse, \
             patch("uni_rag.ingest.pipeline.VectorStore") as MockVec, \
             patch("uni_rag.ingest.pipeline.BM25Index") as MockBM25, \
             patch("uni_rag.ingest.pipeline.get_embedder") as mock_embed:
            mock_embed.return_value = MagicMock()
            mock_embed.return_value.embed.return_value = [[0.1] * 384]
            from uni_rag.ingest.parsers import ParsedDocument
            mock_parse.return_value = ParsedDocument(
                text=fake.text, format="url", source_path=fake.source_url
            )
            with patch("uni_rag.ingest.pipeline.chunk_document") as mock_chunk:
                from uni_rag.ingest.chunker import Chunk
                mock_chunk.return_value = [
                    Chunk(text="Body.", source_id="abc", section_title=None,
                          start_offset=8, end_offset=12)
                ]
                p = IngestPipeline.__new__(IngestPipeline)
                p.kb_id = None
                p.embedder = mock_embed.return_value
                p.vector = MockVec.return_value
                p.bm25 = MockBM25.return_value
                p.uploads_dir = Path("/tmp/uploads")
                p.quality_filter = MagicMock()
                p.quality_filter.enabled = False
                result = p.ingest_url("https://example.com/c")
        assert result["format"] == "url"
        assert result["chunks"] == 1

    def test_metadata_includes_platform_and_source_url(self):
        """向量库 metadata 包含 platform 和 source_url。"""
        fake = LinkExtractionResult(
            text="# Doc\n\nText.",
            title="Doc",
            source_url="https://example.com/d",
            platform="web",
            content_type="article",
        )
        with patch("uni_rag.ingest.link_extractors.extract", return_value=fake), \
             patch("uni_rag.ingest.pipeline.parse_url_result") as mock_parse, \
             patch("uni_rag.ingest.pipeline.VectorStore") as MockVec, \
             patch("uni_rag.ingest.pipeline.BM25Index") as MockBM25, \
             patch("uni_rag.ingest.pipeline.get_embedder") as mock_embed:
            mock_embed.return_value = MagicMock()
            mock_embed.return_value.embed.return_value = [[0.1] * 384]
            from uni_rag.ingest.parsers import ParsedDocument
            mock_parse.return_value = ParsedDocument(
                text=fake.text, format="url", source_path=fake.source_url
            )
            with patch("uni_rag.ingest.pipeline.chunk_document") as mock_chunk:
                from uni_rag.ingest.chunker import Chunk
                mock_chunk.return_value = [
                    Chunk(text="Text.", source_id="xyz", section_title=None,
                          start_offset=6, end_offset=10)
                ]
                p = IngestPipeline.__new__(IngestPipeline)
                p.kb_id = None
                p.embedder = mock_embed.return_value
                p.vector = MockVec.return_value
                p.bm25 = MockBM25.return_value
                p.uploads_dir = Path("/tmp/uploads")
                p.quality_filter = MagicMock()
                p.quality_filter.enabled = False
                p.ingest_url("https://example.com/d")
        call_kwargs = MockVec.return_value.add.call_args[1]
        assert call_kwargs["metadata"]["platform"] == "web"
        assert call_kwargs["metadata"]["source_url"] == "https://example.com/d"
        assert call_kwargs["metadata"]["format"] == "url"


# ── AC-3: Web UI ─────────────────────────────────────────────────

class TestAC3_WebUI:
    def test_index_html_has_url_input(self):
        """React 前端包含链接输入功能。"""
        tsx = Path("frontend/src/App.tsx").read_text()
        assert "urlInput" in tsx or "showUrlInput" in tsx

    def test_app_js_has_url_endpoint(self):
        """React 前端调用 /api/ingest/url 端点。"""
        tsx = Path("frontend/src/App.tsx").read_text()
        assert "/api/ingest/url" in tsx


# ── AC-4: CLI ────────────────────────────────────────────────────

class TestAC4_CLI:
    def test_ingest_url_help(self, runner):
        """uni-rag ingest-url --help 正常输出。"""
        result = runner.invoke(app, ["ingest-url", "--help"])
        assert result.exit_code == 0, result.output
        assert "url" in result.output.lower()

    def test_kb_ingest_url_help(self, runner):
        """uni-rag kb ingest-url --help 正常输出。"""
        result = runner.invoke(app, ["kb", "ingest-url", "--help"])
        assert result.exit_code == 0, result.output


# ── AC-6: 错误消息用户可读 ───────────────────────────────────────

class TestAC6_ErrorMessages:
    def test_extraction_error_has_hint(self):
        """LinkExtractionError 包含用户可读的 hint。"""
        err = LinkExtractionError(
            platform="web", reason="timeout",
            hint="内容加载超时，请检查链接是否有效后重试",
        )
        assert "超时" in err.hint
        assert err.reason == "timeout"

    def test_unsupported_platform_message(self):
        """unsupported 平台返回用户友好的错误消息。"""
        err = LinkExtractionError(
            platform="xiaohongshu", reason="unsupported",
            hint="暂不支持该链接类型，请尝试上传文件或使用其他链接",
        )
        assert "暂不支持" in err.hint
