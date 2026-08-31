"""Unit tests for the export module (Markdown + PDF)."""
import pytest


def test_weasyprint_installed():
    """Sanity check: weasyprint installed and version meets the floor.
    We use importlib.metadata to avoid triggering native lib load at import
    time on systems where pango/gobject aren't on the dynamic loader path
    (e.g. some macOS dev envs). The actual PDF render is exercised in
    test_render_pdf_returns_valid_pdf_bytes which is skipped if deps missing.
    """
    from importlib.metadata import version
    v = version("weasyprint")
    # version is a string like '69.0'; compare as tuple of ints
    parts = tuple(int(p) for p in v.split(".")[:2])
    assert parts >= (60, 0)


from uni_rag.export.md_exporter import render_markdown


def test_render_markdown_includes_question_and_answer():
    payload = {
        "question": "什么是监督学习？",
        "answer": "监督学习使用标注数据 [abc123:100]。",
        "citations": [
            {
                "chunk_id": "abc123:100",
                "source": "chapter1.pdf",
                "section": "1.1",
                "text": "Supervised learning uses labeled data.",
            }
        ],
    }
    md = render_markdown(payload)
    assert "# 问答记录" in md
    assert "## 问题" in md
    assert "什么是监督学习？" in md
    assert "## 答案" in md
    assert "监督学习使用标注数据" in md
    assert "## 引用" in md
    assert "chapter1.pdf" in md
    assert "1.1" in md
    assert "Supervised learning uses labeled data." in md


def test_render_markdown_handles_no_citations():
    payload = {"question": "q", "answer": "a", "citations": []}
    md = render_markdown(payload)
    assert "（无引用）" in md or "无引用" in md


def test_render_markdown_escapes_md_special_chars_in_citation_text():
    payload = {
        "question": "q",
        "answer": "a",
        "citations": [
            {
                "chunk_id": "x:0",
                "source": "f.md",
                "section": "",
                "text": "# header | pipe *italic*",
            }
        ],
    }
    md = render_markdown(payload)
    # 引用文本应被包到 code block 避免 markdown 注入
    assert "```" in md
    assert "# header | pipe *italic*" in md


def _weasyprint_works() -> bool:
    """Best-effort: try a 1-page render; if native libs are missing, return False."""
    try:
        from weasyprint import HTML
        HTML(string="<html><body>ok</body></html>").write_pdf()
        return True
    except Exception:
        return False


_pdf_required = pytest.mark.skipif(
    not _weasyprint_works(), reason="weasyprint native deps not loadable on this host"
)


@_pdf_required
def test_render_pdf_returns_valid_pdf_bytes():
    from uni_rag.export.pdf_exporter import render_pdf
    payload = {
        "question": "什么是监督学习？",
        "answer": "监督学习使用标注数据。",
        "citations": [
            {
                "chunk_id": "x:0",
                "source": "chapter1.pdf",
                "section": "1.1",
                "text": "supervised",
            }
        ],
    }
    pdf_bytes = render_pdf(payload)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 100
    assert pdf_bytes.startswith(b"%PDF-")
    assert pdf_bytes.rstrip().endswith(b"%%EOF") or b"%%EOF" in pdf_bytes[-1024:]


@_pdf_required
def test_render_pdf_handles_chinese_text():
    from uni_rag.export.pdf_exporter import render_pdf
    payload = {
        "question": "中文问题",
        "answer": "中文答案包含引用 [x:0]",
        "citations": [
            {"chunk_id": "x:0", "source": "s.pdf", "section": "1", "text": "中文 chunk"}
        ],
    }
    pdf_bytes = render_pdf(payload)
    assert pdf_bytes.startswith(b"%PDF-")
    # PDF 内文字符存为字节流，无法直接 assert 文本，但 bytes 长度 > 500
    assert len(pdf_bytes) > 500
