"""SQLite-backed session store."""
from __future__ import annotations
import sqlite3
import uuid
from pathlib import Path


class SessionStore:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    session_id TEXT NOT NULL,
                    seq INTEGER NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    PRIMARY KEY (session_id, seq)
                )
            """)

    def create(self) -> str:
        return uuid.uuid4().hex

    def append(self, session_id: str, role: str, content: str) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO messages (session_id, seq, role, content) VALUES (?, ?, ?, ?)",
                (session_id, self._next_seq(session_id), role, content),
            )

    def _next_seq(self, session_id: str) -> int:
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(seq), -1) + 1 FROM messages WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            return row[0]

    def get(self, session_id: str) -> list[dict]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT role, content FROM messages WHERE session_id = ? ORDER BY seq",
                (session_id,),
            ).fetchall()
        return [{"role": r[0], "content": r[1]} for r in rows]

    def clear(self, session_id: str) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))

    def get_recent(self, session_id: str, limit: int) -> list[dict]:
        """Return the last `limit` messages for a session, ordered by seq ASC.

        If history has fewer than `limit` messages, returns all of them.
        Uses seq DESC LIMIT N inside a subquery, then re-sorts ASC externally
        so the LLM sees messages in chronological order.
        """
        if limit <= 0:
            return []
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT role, content FROM (
                    SELECT role, content, seq FROM messages
                    WHERE session_id = ?
                    ORDER BY seq DESC
                    LIMIT ?
                ) ORDER BY seq ASC
                """,
                (session_id, limit),
            ).fetchall()
        return [{"role": r[0], "content": r[1]} for r in rows]
