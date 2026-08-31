from pathlib import Path
import pytest
from uni_rag.ingest.parsers import parse_document, ParsedDocument, _parse_pdf_pymupdf


def test_parse_pdf_uses_mineru_if_available(monkeypatch):
    calls = []
    def mock_is_available():
        return True
    def mock_parse_mineru(path):
        calls.append(path)
        return "mineru text"
    monkeypatch.setattr("uni_rag.ingest.parsers.is_mineru_available", mock_is_available)
    monkeypatch.setattr("uni_rag.ingest.parsers.parse_file_via_api", mock_parse_mineru)

    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        res = parse_document(f.name)
        assert res.text == "mineru text"
        assert len(calls) == 1
        # MinerU path: no visual tiles
        assert res.visual_tiles is None


def test_parse_pdf_falls_back_to_pymupdf_if_mineru_unavailable(monkeypatch):
    calls = []
    def mock_is_available():
        return False
    monkeypatch.setattr("uni_rag.ingest.parsers.is_mineru_available", mock_is_available)

    def mock_parse_pdf_pymupdf(path, visual_tiles_dir=None):
        calls.append(path)
        return ParsedDocument(text="pymupdf text", format="pdf", source_path=str(path),
                              visual_tiles=[])
    monkeypatch.setattr("uni_rag.ingest.parsers._parse_pdf_pymupdf", mock_parse_pdf_pymupdf)

    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        res = parse_document(f.name)
        assert res.text == "pymupdf text"
        assert len(calls) == 1


def test_parse_pdf_falls_back_to_pymupdf_on_mineru_failure(monkeypatch):
    calls = []
    def mock_is_available():
        return True
    def mock_parse_mineru(path):
        raise RuntimeError("MinerU API error")
    monkeypatch.setattr("uni_rag.ingest.parsers.is_mineru_available", mock_is_available)
    monkeypatch.setattr("uni_rag.ingest.parsers.parse_file_via_api", mock_parse_mineru)

    def mock_parse_pdf_pymupdf(path, visual_tiles_dir=None):
        calls.append(path)
        return ParsedDocument(text="pymupdf fallback text", format="pdf", source_path=str(path),
                              visual_tiles=[])
    monkeypatch.setattr("uni_rag.ingest.parsers._parse_pdf_pymupdf", mock_parse_pdf_pymupdf)

    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        res = parse_document(f.name)
        assert res.text == "pymupdf fallback text"
        assert len(calls) == 1


def test_parse_pdf_passes_visual_tiles_dir_to_pymupdf(monkeypatch):
    """When visual_tiles_dir is provided, _parse_pdf_pymupdf should receive it."""
    captured = []
    def mock_parse_pdf_pymupdf(path, visual_tiles_dir=None):
        captured.append(visual_tiles_dir)
        return ParsedDocument(text="test", format="pdf", source_path=str(path),
                              visual_tiles=[])
    monkeypatch.setattr("uni_rag.ingest.parsers.is_mineru_available", lambda: False)
    monkeypatch.setattr("uni_rag.ingest.parsers._parse_pdf_pymupdf", mock_parse_pdf_pymupdf)

    import tempfile
    tiles_dir = Path("/tmp/test_tiles")
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        res = parse_document(f.name, visual_tiles_dir=tiles_dir)
        assert len(captured) == 1
        assert captured[0] == tiles_dir


def test_parsed_document_has_visual_tiles_field():
    """ParsedDocument should accept visual_tiles field."""
    tiles = [Path("/tmp/tile_1.png")]
    doc = ParsedDocument(
        text="hello",
        format="pdf",
        source_path="/tmp/test.pdf",
        pages=[(1, "page 1")],
        visual_tiles=tiles,
    )
    assert doc.visual_tiles == tiles
