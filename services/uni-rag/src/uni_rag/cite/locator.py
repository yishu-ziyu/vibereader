"""Locate citation span in source document."""
from __future__ import annotations
import re


def locate_citation(source_text: str, cited_phrase: str) -> tuple[str, tuple[int, int] | None]:
    """Find cited phrase in source text. Returns (phrase, (start, end)) or (phrase, None)."""
    if not cited_phrase or not source_text:
        return cited_phrase, None
    # 直接匹配
    idx = source_text.find(cited_phrase)
    if idx >= 0:
        return cited_phrase, (idx, idx + len(cited_phrase))
    # 模糊：取 cited_phrase 的前 30 字符
    snippet = cited_phrase[:30].strip()
    if not snippet:
        return cited_phrase, None
    # 去掉标点
    snippet_clean = re.sub(r"[\s\W]+", " ", snippet).strip()
    pattern = re.escape(snippet_clean[:20])
    m = re.search(pattern, source_text)
    if m:
        return cited_phrase, (m.start(), m.start() + len(snippet))
    return cited_phrase, None
