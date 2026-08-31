"""Tests for link extractors."""
from __future__ import annotations
import pytest
from unittest.mock import patch, MagicMock
from uni_rag.ingest.link_extractors import (
    LinkExtractionResult,
    LinkExtractionError,
    LinkExtractor,
    WebExtractor,
    EXTRACTORS,
    extract,
)


class TestLinkExtractionError:
    def test_fields(self):
        err = LinkExtractionError("web", "timeout", "请重试")
        assert err.platform == "web"
        assert err.reason == "timeout"
        assert err.hint == "请重试"
        assert "web" in str(err)
        assert "timeout" in str(err)


class TestWebExtractor:
    def test_can_handle_http(self):
        e = WebExtractor()
        assert e.can_handle("http://example.com")
        assert e.can_handle("https://example.com")
        assert not e.can_handle("ftp://example.com")
        assert not e.can_handle("not-a-url")

    def test_extract_success(self):
        e = WebExtractor()
        html = "<html><body><p>First line</p><p>Second paragraph here.</p></body></html>"
        with patch("uni_rag.ingest.link_extractors.trafilatura.fetch_url", return_value=html.encode()), \
             patch("uni_rag.ingest.link_extractors.httpx.get", return_value="content"), \
             patch("uni_rag.ingest.link_extractors.trafilatura.extract", return_value="First line\n\nSecond paragraph here."):
            result = e.extract("https://example.com/article")
        assert result.title == "https://example.com/article"
        assert result.text == "First line\n\nSecond paragraph here."
        assert result.source_url == "https://example.com/article"
        assert result.platform == "web"
        assert result.content_type == "article"

    def test_extract_title_truncated(self):
        e = WebExtractor()
        long_title = "A" * 100
        html = b"<html></html>"
        with patch("uni_rag.ingest.link_extractors.httpx.get", return_value="content"), \
             patch("uni_rag.ingest.link_extractors.trafilatura.fetch_url", return_value=html), \
             patch("uni_rag.ingest.link_extractors.trafilatura.extract", return_value=long_title + "\n\nbody"):
            result = e.extract("https://example.com")
        assert len(result.title) <= 80

    def test_extract_no_title(self):
        """当提取结果第一行很长（被当 title），body 也是全文（无换行时）"""
        e = WebExtractor()
        html = b"<html></html>"
        with patch("uni_rag.ingest.link_extractors.trafilatura.fetch_url", return_value=html), \
             patch("uni_rag.ingest.link_extractors.httpx.get", return_value="content"), \
             patch("uni_rag.ingest.link_extractors.trafilatura.extract", return_value="A very long title line without newline"):
            result = e.extract("https://example.com")
        # 无换行：整段当 title，body 也保留全文
        assert result.title == "https://example.com"
        assert result.text == "A very long title line without newline"

    def test_extract_fetch_failure(self):
        e = WebExtractor()
        with patch("uni_rag.ingest.link_extractors.httpx.get", side_effect=Exception("network error")):
            with pytest.raises(LinkExtractionError) as exc_info:
                e.extract("https://example.com")
            assert exc_info.value.reason == "network"

    def test_extract_too_short(self):
        e = WebExtractor()
        with patch("uni_rag.ingest.link_extractors.httpx.get", return_value="content"), \
             patch("uni_rag.ingest.link_extractors.trafilatura.fetch_url", return_value=b"<html></html>"), \
             patch("uni_rag.ingest.link_extractors.trafilatura.extract", return_value="hi"):
            with pytest.raises(LinkExtractionError) as exc_info:
                e.extract("https://example.com")
            assert exc_info.value.reason == "no_content"

    def test_extract_empty(self):
        e = WebExtractor()
        with patch("uni_rag.ingest.link_extractors.httpx.get", return_value="content"), \
             patch("uni_rag.ingest.link_extractors.trafilatura.fetch_url", return_value=b"x"), \
             patch("uni_rag.ingest.link_extractors.trafilatura.extract", return_value=None):
            with pytest.raises(LinkExtractionError) as exc_info:
                e.extract("https://example.com")
            assert exc_info.value.reason == "no_content"


class TestRegistry:
    def test_extractors_contains_web(self):
        assert any(isinstance(e, WebExtractor) for e in EXTRACTORS)

    def test_extract_dispatches(self):
        html = b"<html></html>"
        with patch("uni_rag.ingest.link_extractors.httpx.get", return_value="content"), \
             patch("uni_rag.ingest.link_extractors.trafilatura.fetch_url", return_value=html), \
             patch("uni_rag.ingest.link_extractors.trafilatura.extract", return_value="hello world this is a longer text"):
            result = extract("https://example.com/page")
        assert result.platform == "web"
        assert result.text == "hello world this is a longer text"

    def test_extract_no_match(self):
        with pytest.raises(LinkExtractionError) as exc_info:
            extract("ftp://example.com")
        assert exc_info.value.reason == "unsupported"
