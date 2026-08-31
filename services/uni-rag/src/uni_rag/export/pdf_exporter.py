"""Render a query payload to PDF bytes using weasyprint."""
from __future__ import annotations
from markdown_it import MarkdownIt
from weasyprint import HTML
from uni_rag.export.md_exporter import render_markdown, ExportPayload


_PDF_CSS = """
@page { size: A4; margin: 2cm; }
body { font-family: 'Noto Serif CJK SC', 'Songti SC', 'STSong', serif;
       line-height: 1.7; color: #1a1a1a; }
h1 { font-size: 1.8rem; border-bottom: 1px solid #d4cfc5; padding-bottom: 0.3em; }
h2 { font-size: 1.2rem; color: #6b4f3a; margin-top: 1.5em; }
blockquote { color: #6b4f3a; font-style: italic; }
pre { background: #f5f1e8; padding: 0.5em; border-left: 3px solid #6b4f3a;
      white-space: pre-wrap; }
code { font-family: 'JetBrains Mono', 'Menlo', monospace; font-size: 0.9em; }
"""


def render_pdf(payload: ExportPayload) -> bytes:
    """Convert a Q&A payload to PDF bytes via Markdown → HTML → PDF."""
    md_text = render_markdown(payload)
    md = MarkdownIt()
    html_body = md.render(md_text)
    html_doc = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<style>{_PDF_CSS}</style></head><body>{html_body}</body></html>"
    )
    return HTML(string=html_doc).write_pdf()
