"""SQLite-backed store for knowledge bases (KBs) and session↔KB bindings."""
from __future__ import annotations
import re
import sqlite3
import time
from pathlib import Path
from typing import TypedDict


class KbRecord(TypedDict):
    id: str
    name: str
    description: str
    created_at: str  # ISO 8601


_ID_RE = re.compile(r"^[a-z0-9_]{1,32}$")


def _slugify(s: str) -> str:
    """Derive a kb_id from a name. Raises ValueError if no valid slug can be made.

    Rules:
    - name is lowercased
    - must already match `^[a-z0-9_]{1,32}$` after lowercase (no mangling)
    - a name like "CS-101" (hyphen) or "CS 101" (space)
      fails rather than silently mangling
    """
    s = s.strip().lower()
    if not _ID_RE.match(s):
        raise ValueError(
            f"invalid kb id from name {s!r}: must match {_ID_RE.pattern} "
            "(1-32 chars, a-z0-9_)"
        )
    return s[:32]


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _validate_id(kb_id: str) -> None:
    if not _ID_RE.match(kb_id):
        raise ValueError(
            f"invalid kb id {kb_id!r}: must match {_ID_RE.pattern} (1-32 chars, a-z0-9_)"
        )


class KBStore:
    """CRUD for KBs + session↔KB associations."""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS knowledge_bases (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS session_kbs (
                    session_id TEXT NOT NULL,
                    kb_id TEXT NOT NULL,
                    PRIMARY KEY (session_id, kb_id),
                    FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_session_kbs_session
                ON session_kbs(session_id)
            """)

    # --- KB CRUD ---

    def create(self, name: str, description: str = "", kb_id: str | None = None) -> KbRecord:
        """Create a KB. kb_id auto-derived from name if not given. Raises if id exists/invalid."""
        if kb_id is None:
            kb_id = _slugify(name)
        _validate_id(kb_id)
        now = _now()
        with sqlite3.connect(self.db_path) as conn:
            try:
                conn.execute(
                    "INSERT INTO knowledge_bases (id, name, description, created_at) "
                    "VALUES (?, ?, ?, ?)",
                    (kb_id, name, description, now),
                )
            except sqlite3.IntegrityError as e:
                raise ValueError(f"kb {kb_id!r} already exists") from e
        return KbRecord(id=kb_id, name=name, description=description, created_at=now)

    def get(self, kb_id: str) -> KbRecord | None:
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT id, name, description, created_at FROM knowledge_bases WHERE id = ?",
                (kb_id,),
            ).fetchone()
        if not row:
            return None
        return KbRecord(id=row[0], name=row[1], description=row[2], created_at=row[3])

    def list(self) -> list[KbRecord]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT id, name, description, created_at FROM knowledge_bases ORDER BY created_at"
            ).fetchall()
        return [
            KbRecord(id=r[0], name=r[1], description=r[2], created_at=r[3]) for r in rows
        ]

    def delete(self, kb_id: str) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.execute("DELETE FROM knowledge_bases WHERE id = ?", (kb_id,))
            return cur.rowcount > 0

    def ensure_default(self) -> KbRecord:
        """Return the 'default' KB, creating it if missing. Idempotent."""
        existing = self.get("default")
        if existing:
            return existing
        return self.create("default", "默认知识库（v0.2 兼容）", kb_id="default")

    # --- session binding ---

    def bind_session(self, session_id: str, kb_ids: list[str]) -> None:
        """Replace the session's KB binding with the given list. Empty list = unbind."""
        # 验证所有 KB 都存在
        for kid in kb_ids:
            if self.get(kid) is None:
                raise ValueError(f"kb {kid!r} not found")
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM session_kbs WHERE session_id = ?", (session_id,))
            for kid in kb_ids:
                conn.execute(
                    "INSERT INTO session_kbs (session_id, kb_id) VALUES (?, ?)",
                    (session_id, kid),
                )

    def get_session_kbs(self, session_id: str) -> list[KbRecord]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT kb.id, kb.name, kb.description, kb.created_at
                FROM session_kbs sk
                JOIN knowledge_bases kb ON kb.id = sk.kb_id
                WHERE sk.session_id = ?
                ORDER BY kb.created_at
                """,
                (session_id,),
            ).fetchall()
        return [
            KbRecord(id=r[0], name=r[1], description=r[2], created_at=r[3]) for r in rows
        ]