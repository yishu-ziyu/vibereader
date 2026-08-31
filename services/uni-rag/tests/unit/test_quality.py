from __future__ import annotations

import pytest

from uni_rag.ingest.chunker import Chunk


def _chunk(text: str, source_id: str = "src") -> Chunk:
    return Chunk(
        text=text,
        source_id=source_id,
        section_title=None,
        start_offset=0,
        end_offset=len(text),
    )


# ── filter() 导入 ────────────────────────────────────────────────

from uni_rag.ingest.quality import ChunkQualityFilter  # noqa: E402


# ── Tests ────────────────────────────────────────────────────────


def test_short_chunk_filtered():
    """10-char chunk 应该在 min_chars=30 时被丢弃。"""
    c = _chunk("a" * 10)
    kept, dropped = ChunkQualityFilter(min_chars=30).filter([c])
    assert c in dropped
    assert c not in kept


def test_symbol_heavy_chunk_filtered():
    """符号/标点占比 50%+ 的文本应被丢弃。"""
    c = _chunk("!@#$$%^&*()_+-=[]{}|;:',.<>?/  ~` " * 5)
    kept, dropped = ChunkQualityFilter().filter([c])
    assert c in dropped


def test_normal_chunk_preserved():
    """正常 200 字符段落应通过过滤。"""
    text = (
        "RAG（Retrieval-Augmented Generation）将检索与生成结合，"
        "让大语言模型在回答前先从外部知识库拉取相关上下文，"
        "从而减少幻觉并提升事实准确率。"
        "这一范式由 Lewis 等人在 2020 年的论文中系统提出，"
        "此后成为构建企业知识助手的主流架构之一。"
        "与纯 Prompt 方式相比，RAG 的核心优势在于知识可更新、"
        "来源可追溯、且不占用模型上下文窗口的长期记忆。"
    )
    c = _chunk(text)
    kept, dropped = ChunkQualityFilter().filter([c])
    assert c in kept
    assert c not in dropped


def test_stop_pattern_caught():
    """匹配「第 3 页」「返回顶部」等停用模式的块应被丢弃。"""
    for pattern in ("第 3 页", "返回顶部"):
        c = _chunk(f"正文内容 {pattern} 更多文字")
        kept, dropped = ChunkQualityFilter().filter([c])
        assert c in dropped, f"expected drop for pattern: {pattern!r}"


def test_filter_returns_both_lists():
    """filter() 返回 (kept, dropped) 二元组，且均为 list。"""
    result = ChunkQualityFilter().filter([])
    assert isinstance(result, tuple)
    assert len(result) == 2
    kept, dropped = result
    assert isinstance(kept, list)
    assert isinstance(dropped, list)


def test_empty_chunks_returns_empty():
    """空输入应返回 ([], [])。"""
    kept, dropped = ChunkQualityFilter().filter([])
    assert kept == []
    assert dropped == []


def test_configurable_min_chars():
    """设置 min_chars=10 后，15 字符的块应通过过滤。"""
    c = _chunk("hello world!!")  # 13 chars — 不够
    c2 = _chunk("a" * 15)  # 15 chars
    kept, dropped = ChunkQualityFilter(min_chars=10).filter([c, c2])
    assert c2 in kept
    assert c in dropped
