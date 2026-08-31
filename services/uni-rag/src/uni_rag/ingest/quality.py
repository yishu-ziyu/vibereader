"""Chunk quality filtering for the ingest pipeline."""
from __future__ import annotations

import re
from collections import Counter

from uni_rag.ingest.chunker import Chunk

# Sentence terminators: CJK (。！？) + EN (.!?)
_TERM_RE = re.compile(r"[.!?。！？]$")

# Stop patterns: page markers, nav links, copyright boilerplate
_STOP_RE = re.compile(
    r"(第\s*\d+\s*页|Page\s*\d+|返回顶部?|版权所有|Copyright|All rights reserved)"
)


def _is_cjk(ch: str) -> bool:
    """Return True if ch is a CJK character (Unified Ideographs, Hangul, Kana)."""
    cp = ord(ch)
    return (
        (0x3400 <= cp <= 0x4DBF)  # Ext-A
        or (0x4E00 <= cp <= 0x9FFF)  # Unified
        or (0xF900 <= cp <= 0xFAFF)  # Compat
        or (0x3040 <= cp <= 0x309F)  # Hiragana
        or (0x30A0 <= cp <= 0x30FF)  # Katakana
        or (0xAC00 <= cp <= 0xD7AF)  # Hangul
    )


class ChunkQualityFilter:
    """Drop low-quality chunks based on heuristic rules.

    Rules are applied in order; evaluation stops at the first match.
    """

    def __init__(
        self,
        min_chars: int = 30,
        max_symbol_ratio: float = 0.4,
        enabled: bool = True,
    ):
        self.min_chars = min_chars
        self.max_symbol_ratio = max_symbol_ratio
        self.enabled = enabled

    def filter(
        self, chunks: list[Chunk]
    ) -> tuple[list[Chunk], list[Chunk]]:
        """Return (kept, dropped) after applying all rules.

        If ``enabled`` is False every chunk is kept.
        """
        if not self.enabled:
            return list(chunks), []

        kept: list[Chunk] = []
        dropped: list[Chunk] = []

        for chunk in chunks:
            reason = self._evaluate(chunk.text)
            if reason is None:
                kept.append(chunk)
            else:
                dropped.append(chunk)

        return kept, dropped

    # ── rule evaluation ────────────────────────────────────────────

    def _evaluate(self, text: str) -> str | None:
        if len(text) < self.min_chars:
            return "too_short"

        if self._symbol_ratio(text) > self.max_symbol_ratio:
            return "symbol_heavy"

        if _STOP_RE.search(text):
            return "stop_pattern"

        if self._trailing_symbols(text):
            return "trailing_symbols"

        if len(text) >= 30 and self._repetition_ratio(text) > 0.3:
            return "repetition"

        return None

    @staticmethod
    def _symbol_ratio(text: str) -> float:
        """Fraction of chars that are NOT alphanumeric, CJK, or whitespace."""
        if not text:
            return 0.0
        symbols = sum(
            1 for ch in text
            if not (ch.isalnum() or _is_cjk(ch) or ch.isspace())
        )
        return symbols / len(text)

    @staticmethod
    def _trailing_symbols(text: str) -> bool:
        """Return True if text ends with 2+ consecutive non-alphanumeric, non-CJK, non-whitespace chars."""
        if len(text) < 2:
            return False
        # Check trailing run of symbols
        count = 0
        for ch in reversed(text):
            if ch.isalnum() or _is_cjk(ch) or ch.isspace():
                break
            count += 1
        return count >= 2

    @staticmethod
    def _repetition_ratio(text: str) -> float:
        """Ratio of the most frequent char-bigram to total bigrams."""
        if len(text) < 2:
            return 0.0
        bigrams = [text[i : i + 2] for i in range(len(text) - 1)]
        most_common_count = Counter(bigrams).most_common(1)[0][1]
        return most_common_count / len(bigrams)
