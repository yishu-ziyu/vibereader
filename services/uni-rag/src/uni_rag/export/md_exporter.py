"""Render a query payload (question + answer + citations) to Markdown."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import TypedDict


class CitationPayload(TypedDict):
    chunk_id: str
    source: str
    section: str
    text: str
    span: tuple[int, int] | None


class ExportPayload(TypedDict):
    question: str
    answer: str
    citations: list[CitationPayload]


def render_markdown(payload: ExportPayload) -> str:
    """Return a clean Markdown string of the Q&A + citations."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    parts: list[str] = []
    parts.append("# 问答记录")
    parts.append(f"\n_导出时间：{now}_\n")
    parts.append("## 问题\n")
    parts.append(payload["question"].strip() + "\n")
    parts.append("## 答案\n")
    parts.append(payload["answer"].strip() + "\n")
    citations = payload.get("citations") or []
    if not citations:
        parts.append("## 引用\n\n（无引用）\n")
        return "\n".join(parts)
    parts.append("## 引用\n")
    for i, c in enumerate(citations, 1):
        src = c.get("source", "unknown")
        section = c.get("section", "")
        chunk_id = c.get("chunk_id", "")
        text = c.get("text", "")
        header = f"{i}. **{src}**"
        if section:
            header += f" — {section}"
        if chunk_id:
            header += f"  \n_chunk: `{chunk_id}`_"
        parts.append(header)
        parts.append("")
        # 引用原文包到 code block，避免 markdown 特殊字符（# | * _ 等）被错误渲染
        parts.append("```")
        parts.append(text.strip())
        parts.append("```")
        parts.append("")
    return "\n".join(parts)
