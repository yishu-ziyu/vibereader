"""Tests for url_parser."""
from __future__ import annotations
import pytest
from uni_rag.ingest.url_parser import parse_url_result
from uni_rag.ingest.link_extractors import LinkExtractionResult


def _make_result(text: str = "body text", title: str = "Test Title", url: str = "https://example.com") -> LinkExtractionResult:
    return LinkExtractionResult(
        text=text,
        title=title,
        source_url=url,
        platform="web",
        content_type="article",
    )


class TestParseUrlResult:
    def test_basic_fields(self):
        r = _make_result()
        doc = parse_url_result(r)
        assert doc.format == "url"
        assert doc.source_path == "https://example.com"
        assert doc.pages is None

    def test_title_in_text(self):
        r = _make_result(title="My Title", text="Body content")
        doc = parse_url_result(r)
        assert doc.text.startswith("# My Title")
        assert "Body content" in doc.text

    def test_empty_text(self):
        r = _make_result(text="")
        doc = parse_url_result(r)
        assert doc.format == "url"
        assert doc.text == "# Test Title\n\n"

    def test_long_title(self):
        r = _make_result(title="A" * 200)
        doc = parse_url_result(r)
        # title should still be included
        assert "A" * 200 in doc.text
