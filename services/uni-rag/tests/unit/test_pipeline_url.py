"""Tests for ingest_url in IngestPipeline."""
from __future__ import annotations
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from uni_rag.ingest.pipeline import IngestPipeline
from uni_rag.ingest.link_extractors import LinkExtractionResult
from uni_rag.ingest.quality import ChunkQualityFilter


class _FakeResult:
    def __init__(self):
        self.text = "# Title\n\nHello world content here."
        self.title = "Article Title"
        self.source_url = "https://example.com/article"
        self.platform = "web"
        self.content_type = "article"
        self.metadata = {}


@pytest.fixture()
def pipeline(tmp_path):
    """IngestPipeline with isolated data dirs."""
    chroma = tmp_path / "chroma"
    bm25 = tmp_path / "bm25"
    uploads = tmp_path / "uploads"
    for d in (chroma, bm25, uploads):
        d.mkdir()
    with patch("uni_rag.ingest.pipeline.VectorStore") as MockVec, \
         patch("uni_rag.ingest.pipeline.BM25Index") as MockBM25, \
         patch("uni_rag.ingest.pipeline.get_embedder") as mock_embed:
        mock_embed.return_value = MagicMock()
        mock_embed.return_value.embed.return_value = [[0.1] * 384]
        p = IngestPipeline.__new__(IngestPipeline)
        p.kb_id = None
        p.embedder = mock_embed.return_value
        p.vector = MockVec.return_value
        p.bm25 = MockBM25.return_value
        p.uploads_dir = uploads
        p.quality_filter = ChunkQualityFilter()
        yield p


class TestIngestUrl:
    def test_returns_dict_with_keys(self, pipeline):
        fake = _FakeResult()
        with patch("uni_rag.ingest.link_extractors.extract", return_value=fake), \
             patch("uni_rag.ingest.pipeline.parse_url_result") as mock_parse:
            from uni_rag.ingest.parsers import ParsedDocument
            mock_parse.return_value = ParsedDocument(
                text=fake.text, format="url", source_path=fake.source_url
            )
            with patch("uni_rag.ingest.pipeline.chunk_document") as mock_chunk:
                from uni_rag.ingest.chunker import Chunk
                mock_chunk.return_value = [
                    Chunk(text="Hello world content here.", source_id="abc123",
                          section_title=None, start_offset=8, end_offset=30)
                ]
                result = pipeline.ingest_url("https://example.com/article")
        assert "source_id" in result
        assert "chunks" in result
        assert "format" in result
        assert result["format"] == "url"

    def test_source_id_stable(self, pipeline):
        fake = _FakeResult()
        with patch("uni_rag.ingest.link_extractors.extract", return_value=fake), \
             patch("uni_rag.ingest.pipeline.parse_url_result") as mock_parse, \
             patch("uni_rag.ingest.pipeline.chunk_document", return_value=[]):
            from uni_rag.ingest.parsers import ParsedDocument
            mock_parse.return_value = ParsedDocument(
                text=fake.text, format="url", source_path=fake.source_url
            )
            r1 = pipeline.ingest_url("https://example.com/article")
            r2 = pipeline.ingest_url("https://example.com/article")
        assert r1["source_id"] == r2["source_id"]

    def test_different_urls_different_source_id(self, pipeline):
        fake1 = _FakeResult()
        fake2 = _FakeResult()
        fake2.source_url = "https://example.com/other"
        fake2.text = "# Other\n\nDifferent content."
        with patch("uni_rag.ingest.link_extractors.extract", side_effect=[fake1, fake2]), \
             patch("uni_rag.ingest.pipeline.parse_url_result") as mock_parse, \
             patch("uni_rag.ingest.pipeline.chunk_document", return_value=[]):
            from uni_rag.ingest.parsers import ParsedDocument
            def make_doc(text, url):
                return ParsedDocument(text=text, format="url", source_path=url)
            mock_parse.side_effect = [
                make_doc(fake1.text, fake1.source_url),
                make_doc(fake2.text, fake2.source_url),
            ]
            r1 = pipeline.ingest_url("https://example.com/a")
            r2 = pipeline.ingest_url("https://example.com/b")
        assert r1["source_id"] != r2["source_id"]
