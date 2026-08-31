"""SQLite-backed saved-memory store for VibeReader saved_artifact payloads.

Persists user-confirmed memories (saved answer cards, notes, etc.) so later
`/api/query` with `include_memory=true` can return them as `saved_memory`
citations.

Phase-1 narrow slice: simple LIKE keyword search on (title, text), fallback
to most-recent when no keyword match. No embeddings / BM25 / dedup.
"""
from __future__ import annotations

import json
import re
import sqlite3
import uuid
from pathlib import Path


# Minimal Chinese + English stopword set. Kept tiny to avoid over-filtering.
# Goal: skip very common tokens so LIKE queries focus on content-bearing words.
_STOPWORDS = {
    # EN
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "of", "in", "on", "at", "to", "for", "with", "by", "and", "or", "not",
    "this", "that", "these", "those", "it", "its", "as", "from", "do",
    "does", "did", "what", "which", "who", "whom", "how", "why", "when",
    "where", "should", "would", "could", "can", "may", "might", "will",
    "shall", "must", "have", "has", "had", "i", "you", "he", "she", "we",
    "they", "them", "my", "your", "his", "her", "our", "their",
    # CN (single-char particles / fillers)
    "的", "了", "是", "在", "我", "你", "他", "她", "它", "们", "这", "那",
    "有", "和", "与", "或", "但", "而", "也", "都", "就", "还", "又", "才",
    "吧", "呢", "吗", "啊", "呀", "么", "个", "上", "下", "中", "里", "外",
    "为", "以", "及", "或", "其", "之", "于", "把", "被", "让", "给", "向",
}

# Token pattern: English words (2+ chars) or CJK chars
_TOKEN_RE = re.compile(r"[A-Za-z]{2,}|[\u4e00-\u9fff]")


def _tokenize(query: str) -> list[str]:
    """Extract content-bearing tokens from a query string.

    Splits on non-alphanumeric+CJK boundaries, lowercases English, drops
    stopwords and single-char English tokens. Keeps individual CJK chars
    (they may combine into meaningful words via LIKE concat).
    """
    raw = _TOKEN_RE.findall(query)
    tokens: list[str] = []
    for tok in raw:
        low = tok.lower()
        if low in _STOPWORDS:
            continue
        # Keep CJK single chars (will be matched via LIKE concat)
        tokens.append(low)
    return tokens


class MemoryStore:
    """SQLite-backed store for VibeReader saved_artifact memories.

    Schema:
        saved_memories(
            memory_id TEXT PRIMARY KEY,
            artifact_id TEXT NOT NULL,
            artifact_type TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            text TEXT NOT NULL,
            document_id TEXT NOT NULL DEFAULT '',
            document_name TEXT NOT NULL DEFAULT '',
            source_refs_json TEXT NOT NULL DEFAULT '[]',
            verification_status TEXT NOT NULL DEFAULT 'ungrounded',
            created_at TEXT NOT NULL,
            saved_at TEXT NOT NULL,
            contract_version TEXT NOT NULL DEFAULT 'reader-unirag-memory-v1'
        )

    Phase-1 search: tokenize query → LIKE %kw% on (title || text), fallback
    to list_recent(top_k) when no hits. Guarantees a citation appears once
    at least one memory exists, so smoke tests pass reliably.
    """

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS saved_memories (
                    memory_id TEXT PRIMARY KEY,
                    artifact_id TEXT NOT NULL,
                    artifact_type TEXT NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    text TEXT NOT NULL,
                    document_id TEXT NOT NULL DEFAULT '',
                    document_name TEXT NOT NULL DEFAULT '',
                    source_refs_json TEXT NOT NULL DEFAULT '[]',
                    verification_status TEXT NOT NULL DEFAULT 'ungrounded',
                    created_at TEXT NOT NULL,
                    saved_at TEXT NOT NULL,
                    contract_version TEXT NOT NULL DEFAULT 'reader-unirag-memory-v1'
                )
            """)
            # Backfill column for databases created before contract_version
            # existed (phase-1-contract-stabilization). SQLite cannot IF NOT
            # EXISTS on ADD COLUMN, so introspect PRAGMA table_info first.
            existing_cols = {
                row[1]
                for row in conn.execute("PRAGMA table_info(saved_memories)")
            }
            if "contract_version" not in existing_cols:
                conn.execute(
                    "ALTER TABLE saved_memories ADD COLUMN "
                    "contract_version TEXT NOT NULL "
                    "DEFAULT 'reader-unirag-memory-v1'"
                )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_memories_artifact "
                "ON saved_memories(artifact_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_memories_created "
                "ON saved_memories(created_at DESC)"
            )

    @staticmethod
    def generate_memory_id() -> str:
        """Generate a new memory_id (uuid4 hex, no dashes)."""
        return uuid.uuid4().hex

    def add(
        self,
        *,
        memory_id: str,
        artifact_id: str,
        artifact_type: str,
        title: str = "",
        text: str,
        document_id: str = "",
        document_name: str = "",
        source_refs: list | None = None,
        verification_status: str = "ungrounded",
        created_at: str,
        saved_at: str,
        contract_version: str = "reader-unirag-memory-v1",
    ) -> None:
        """Insert a new memory. Raises sqlite3.IntegrityError on duplicate memory_id."""
        source_refs_json = json.dumps(source_refs or [], ensure_ascii=False)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO saved_memories (
                    memory_id, artifact_id, artifact_type, title, text,
                    document_id, document_name, source_refs_json,
                    verification_status, created_at, saved_at,
                    contract_version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    memory_id, artifact_id, artifact_type, title, text,
                    document_id, document_name, source_refs_json,
                    verification_status, created_at, saved_at,
                    contract_version,
                ),
            )

    def get(self, memory_id: str) -> dict | None:
        """Return one memory by id, or None if not found."""
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT memory_id, artifact_id, artifact_type, title, text, "
                "document_id, document_name, source_refs_json, "
                "verification_status, created_at, saved_at, contract_version "
                "FROM saved_memories WHERE memory_id = ?",
                (memory_id,),
            ).fetchone()
        return self._row_to_dict(row) if row else None

    def list_recent(self, top_k: int) -> list[dict]:
        """Return the most recent `top_k` memories (by created_at DESC)."""
        if top_k <= 0:
            return []
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT memory_id, artifact_id, artifact_type, title, text, "
                "document_id, document_name, source_refs_json, "
                "verification_status, created_at, saved_at, contract_version "
                "FROM saved_memories ORDER BY created_at DESC LIMIT ?",
                (top_k,),
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def search(self, query: str, top_k: int) -> list[dict]:
        """Tokenize `query` and LIKE-match against (title || text).

        Falls back to `list_recent(top_k)` when:
          - top_k <= 0, or
          - no content-bearing tokens could be extracted, or
          - no rows matched any token.

        Matching rows are ranked by created_at DESC and limited to top_k.
        Each token contributes rows independently; duplicates are deduped by
        memory_id, keeping the first (most recent) occurrence.
        """
        if top_k <= 0:
            return []

        tokens = _tokenize(query)
        if not tokens:
            return self.list_recent(top_k)

        matched_ids: list[str] = []
        seen: set[str] = set()
        with sqlite3.connect(self.db_path) as conn:
            for tok in tokens:
                like = f"%{tok}%"
                rows = conn.execute(
                    "SELECT memory_id FROM saved_memories "
                    "WHERE title LIKE ? OR text LIKE ? "
                    "ORDER BY created_at DESC LIMIT ?",
                    (like, like, top_k),
                ).fetchall()
                for r in rows:
                    mid = r[0]
                    if mid not in seen:
                        seen.add(mid)
                        matched_ids.append(mid)

        if not matched_ids:
            return self.list_recent(top_k)

        # Fetch full rows for matched_ids, preserving matched order, limit top_k.
        matched_ids = matched_ids[:top_k]
        placeholders = ",".join("?" for _ in matched_ids)
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                f"SELECT memory_id, artifact_id, artifact_type, title, text, "
                f"document_id, document_name, source_refs_json, "
                f"verification_status, created_at, saved_at, contract_version "
                f"FROM saved_memories WHERE memory_id IN ({placeholders})",
                matched_ids,
            ).fetchall()
        # Re-sort by created_at DESC (token loop may have shuffled order)
        result = [self._row_to_dict(r) for r in rows]
        result.sort(key=lambda m: m["created_at"], reverse=True)
        return result[:top_k]

    def count(self) -> int:
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM saved_memories"
            ).fetchone()
        return int(row[0]) if row else 0

    @staticmethod
    def _row_to_dict(row: tuple) -> dict:
        return {
            "memory_id": row[0],
            "artifact_id": row[1],
            "artifact_type": row[2],
            "title": row[3],
            "text": row[4],
            "document_id": row[5],
            "document_name": row[6],
            "source_refs": json.loads(row[7]) if row[7] else [],
            "verification_status": row[8],
            "created_at": row[9],
            "saved_at": row[10],
            "contract_version": row[11] if len(row) > 11 else "reader-unirag-memory-v1",
        }
