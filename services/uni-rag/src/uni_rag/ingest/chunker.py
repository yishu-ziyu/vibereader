"""Semantic chunker: split on headers, then by size."""
from __future__ import annotations
from dataclasses import dataclass
import re


@dataclass
class Chunk:
    text: str
    source_id: str
    section_title: str | None
    start_offset: int  # 相对于原始 text
    end_offset: int
    page_number: int | None = None  # PDF 页码（1-based），非 PDF 为 None


_HEADER_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)


def _split_by_headers(text: str) -> list[tuple[str | None, str]]:
    """Return [(title, body), ...] 按 markdown header 切分。"""
    matches = list(_HEADER_RE.finditer(text))
    if not matches:
        return [(None, text)]
    sections = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        title = m.group(2).strip()
        body = text[start:end].strip()
        if body:
            sections.append((title, body))
    return sections


def _split_long_body(body: str, max_chars: int) -> list[str]:
    """长段按句子边界切分。"""
    if len(body) <= max_chars:
        return [body]
    sentences = re.split(r"(?<=[.!?。！？])\s+", body)
    chunks = []
    current = []
    cur_len = 0
    for s in sentences:
        if cur_len + len(s) > max_chars and current:
            chunks.append(" ".join(current).strip())
            current = [s]
            cur_len = len(s)
        else:
            current.append(s)
            cur_len += len(s) + 1
    if current:
        chunks.append(" ".join(current).strip())
    return chunks


def chunk_document(
    text: str,
    source_id: str,
    max_chars: int = 1000,
    pages: list[tuple[int, str]] | None = None,
) -> list[Chunk]:
    """按 header 切，再按 max_chars 切长段。

    Args:
        text: 完整文本
        source_id: 文档标识
        max_chars: 每块最大字符数
        pages: [(page_no, text), ...] 可选，用于给 PDF chunk 标页码
    """
    sections = _split_by_headers(text)
    chunks = []
    cursor = 0

    # 构建 page offset 索引：(page_no, start_offset, end_offset)
    page_index = []
    if pages:
        offset = 0
        for page_no, page_text in pages:
            page_index.append((page_no, offset, offset + len(page_text)))
            offset += len(page_text) + 2  # +2 for "\n\n" join

    for title, body in sections:
        idx = text.find(body, cursor)
        if idx < 0:
            idx = cursor
        cursor = idx + len(body)
        for piece in _split_long_body(body, max_chars):
            piece_start = text.find(piece, idx)
            if piece_start < 0:
                piece_start = idx
            piece_end = piece_start + len(piece)

            # 查找页码
            page_no = None
            if page_index:
                for pno, pstart, pend in page_index:
                    if pstart <= piece_start < pend:
                        page_no = pno
                        break

            chunks.append(Chunk(
                text=piece,
                source_id=source_id,
                section_title=title,
                start_offset=piece_start,
                end_offset=piece_end,
                page_number=page_no,
            ))
    return chunks
