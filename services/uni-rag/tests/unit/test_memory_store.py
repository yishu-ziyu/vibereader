"""Unit tests for MemoryStore (SQLite-backed saved-memory store)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from uni_rag.store.memory import MemoryStore, _tokenize


# ──────────────────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────────────────


@pytest.fixture
def store(tmp_path: Path) -> MemoryStore:
    return MemoryStore(tmp_path / "memory.db")


def _make_memory(
    *,
    memory_id: str = "mem-1",
    artifact_id: str = "artifact-1",
    artifact_type: str = "explain_card",
    title: str = "VibeReader memory smoke first answer",
    text: str = "VibeReader memory smoke first answer text",
    document_id: str = "doc-1",
    document_name: str = "sample.md",
    source_refs: list | None = None,
    verification_status: str = "grounded",
    created_at: str = "2026-07-02T10:00:00Z",
    saved_at: str = "2026-07-02T10:00:01Z",
) -> dict:
    return {
        "memory_id": memory_id,
        "artifact_id": artifact_id,
        "artifact_type": artifact_type,
        "title": title,
        "text": text,
        "document_id": document_id,
        "document_name": document_name,
        "source_refs": source_refs
        if source_refs is not None
        else [
            {
                "documentId": "doc-1",
                "documentName": "sample.md",
                "page": 1,
                "paragraphId": "p-1",
                "chunkId": "chunk-1",
                "label": "P1",
                "text": "original source text",
                "grounding": {"precision": "paragraph", "matchedBy": "text", "score": 0.9},
            }
        ],
        "verification_status": verification_status,
        "created_at": created_at,
        "saved_at": saved_at,
    }


# ──────────────────────────────────────────────────────────────────────────
# _tokenize
# ──────────────────────────────────────────────────────────────────────────


class TestTokenize:
    def test_english_lowercased_and_stopwords_dropped(self):
        toks = _tokenize("What should I remember about RAG?")
        assert "rag" in toks
        assert "what" not in toks  # stopword
        assert "i" not in toks  # stopword
        assert "remember" in toks

    def test_chinese_single_chars_kept(self):
        toks = _tokenize("我的记忆说了什么")
        # particles dropped, content chars kept
        assert "记" in toks
        assert "忆" in toks
        assert "的" not in toks  # stopword

    def test_empty_string_returns_empty_list(self):
        assert _tokenize("") == []

    def test_punctuation_only_returns_empty_list(self):
        assert _tokenize("...!!!???") == []


# ──────────────────────────────────────────────────────────────────────────
# MemoryStore CRUD
# ──────────────────────────────────────────────────────────────────────────


class TestMemoryStoreCRUD:
    def test_init_creates_db_file(self, tmp_path: Path):
        db = tmp_path / "memory.db"
        assert not db.exists()
        MemoryStore(db)
        assert db.exists()

    def test_init_creates_table_and_indexes(self, store: MemoryStore):
        import sqlite3

        with sqlite3.connect(store.db_path) as conn:
            tables = {
                r[0] for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            }
            assert "saved_memories" in tables

            indexes = {
                r[0] for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='index'"
                ).fetchall()
            }
            assert "idx_memories_artifact" in indexes
            assert "idx_memories_created" in indexes

    def test_add_and_get_round_trip(self, store: MemoryStore):
        mem = _make_memory()
        store.add(**mem)

        got = store.get(mem["memory_id"])
        assert got is not None
        assert got["memory_id"] == mem["memory_id"]
        assert got["artifact_id"] == mem["artifact_id"]
        assert got["artifact_type"] == mem["artifact_type"]
        assert got["title"] == mem["title"]
        assert got["text"] == mem["text"]
        assert got["document_id"] == mem["document_id"]
        assert got["document_name"] == mem["document_name"]
        assert got["verification_status"] == mem["verification_status"]
        assert got["created_at"] == mem["created_at"]
        assert got["saved_at"] == mem["saved_at"]
        # source_refs JSON round-trips back to list
        assert isinstance(got["source_refs"], list)
        assert got["source_refs"][0]["documentId"] == "doc-1"
        assert got["source_refs"][0]["grounding"]["precision"] == "paragraph"

    def test_get_missing_returns_none(self, store: MemoryStore):
        assert store.get("does-not-exist") is None

    def test_add_duplicate_memory_id_raises(self, store: MemoryStore):
        mem = _make_memory()
        store.add(**mem)
        with pytest.raises(Exception):  # sqlite3.IntegrityError
            store.add(**mem)

    def test_add_with_empty_source_refs(self, store: MemoryStore):
        mem = _make_memory(source_refs=[])
        store.add(**mem)
        got = store.get(mem["memory_id"])
        assert got["source_refs"] == []

    def test_add_with_none_source_refs(self, store: MemoryStore):
        """MemoryStore.add must coerce None → [] (defensive)."""
        # Bypass _make_memory helper (which auto-fills defaults) and call add
        # directly with source_refs=None.
        store.add(
            memory_id="mem-none",
            artifact_id="artifact-1",
            artifact_type="explain_card",
            title="t",
            text="x",
            document_id="d",
            document_name="n",
            source_refs=None,
            verification_status="ungrounded",
            created_at="2026-07-02T10:00:00Z",
            saved_at="2026-07-02T10:00:01Z",
        )
        got = store.get("mem-none")
        assert got is not None
        assert got["source_refs"] == []

    def test_count_empty_returns_zero(self, store: MemoryStore):
        assert store.count() == 0

    def test_count_increments(self, store: MemoryStore):
        store.add(**_make_memory(memory_id="m1"))
        assert store.count() == 1
        store.add(**_make_memory(memory_id="m2", artifact_id="a2"))
        assert store.count() == 2

    def test_generate_memory_id_returns_unique_hex(self):
        id1 = MemoryStore.generate_memory_id()
        id2 = MemoryStore.generate_memory_id()
        assert id1 != id2
        assert len(id1) == 32  # uuid4 hex
        assert all(c in "0123456789abcdef" for c in id1)


# ──────────────────────────────────────────────────────────────────────────
# list_recent
# ──────────────────────────────────────────────────────────────────────────


class TestListRecent:
    def test_empty_store_returns_empty_list(self, store: MemoryStore):
        assert store.list_recent(5) == []

    def test_zero_top_k_returns_empty(self, store: MemoryStore):
        store.add(**_make_memory())
        assert store.list_recent(0) == []

    def test_negative_top_k_returns_empty(self, store: MemoryStore):
        store.add(**_make_memory())
        assert store.list_recent(-1) == []

    def test_returns_in_created_at_desc_order(self, store: MemoryStore):
        store.add(**_make_memory(
            memory_id="old", created_at="2026-07-01T10:00:00Z",
            saved_at="2026-07-01T10:00:01Z",
        ))
        store.add(**_make_memory(
            memory_id="new", artifact_id="a-new",
            created_at="2026-07-02T10:00:00Z",
            saved_at="2026-07-02T10:00:01Z",
        ))
        result = store.list_recent(10)
        assert len(result) == 2
        assert result[0]["memory_id"] == "new"
        assert result[1]["memory_id"] == "old"

    def test_respects_top_k_limit(self, store: MemoryStore):
        for i in range(5):
            store.add(**_make_memory(
                memory_id=f"m{i}", artifact_id=f"a{i}",
                created_at=f"2026-07-0{i+1}T10:00:00Z",
                saved_at=f"2026-07-0{i+1}T10:00:01Z",
            ))
        result = store.list_recent(3)
        assert len(result) == 3
        # Most recent first
        assert result[0]["memory_id"] == "m4"
        assert result[2]["memory_id"] == "m2"


# ──────────────────────────────────────────────────────────────────────────
# search (LIKE + fallback)
# ──────────────────────────────────────────────────────────────────────────


class TestSearch:
    def test_empty_store_returns_empty(self, store: MemoryStore):
        assert store.search("anything", 5) == []

    def test_zero_top_k_returns_empty(self, store: MemoryStore):
        store.add(**_make_memory())
        assert store.search("anything", 0) == []

    def test_no_tokens_falls_back_to_recent(self, store: MemoryStore):
        """Query with only punctuation/stopwords → fallback to list_recent."""
        store.add(**_make_memory(title="alpha", text="alpha content"))
        result = store.search("...", 5)
        assert len(result) == 1
        assert result[0]["title"] == "alpha"

    def test_keyword_match_returns_matching_memory(self, store: MemoryStore):
        store.add(**_make_memory(
            memory_id="m1", title="RAG architecture notes",
            text="discusses retrieval augmented generation patterns",
        ))
        store.add(**_make_memory(
            memory_id="m2", artifact_id="a2",
            title="unrelated cooking notes",
            text="how to bake bread at home",
        ))
        result = store.search("RAG retrieval", 5)
        ids = {m["memory_id"] for m in result}
        assert "m1" in ids
        assert "m2" not in ids

    def test_chinese_keyword_match(self, store: MemoryStore):
        store.add(**_make_memory(
            memory_id="m1", title="记忆卡片",
            text="用户保存的关于阅读的记忆",
        ))
        result = store.search("记忆", 5)
        assert len(result) == 1
        assert result[0]["memory_id"] == "m1"

    def test_no_match_falls_back_to_recent(self, store: MemoryStore):
        """Smoke guarantee: if memory exists but no keyword hit, still return recent."""
        store.add(**_make_memory(
            memory_id="m1", title="alpha", text="alpha content",
            created_at="2026-07-01T10:00:00Z",
            saved_at="2026-07-01T10:00:01Z",
        ))
        store.add(**_make_memory(
            memory_id="m2", artifact_id="a2",
            title="beta", text="beta content",
            created_at="2026-07-02T10:00:00Z",
            saved_at="2026-07-02T10:00:01Z",
        ))
        result = store.search("zzzzz nonexistent", 5)
        # No token matches → fallback to list_recent
        assert len(result) == 2
        assert result[0]["memory_id"] == "m2"  # most recent first

    def test_respects_top_k_limit(self, store: MemoryStore):
        for i in range(5):
            store.add(**_make_memory(
                memory_id=f"m{i}", artifact_id=f"a{i}",
                title=f"RAG note {i}", text=f"RAG content {i}",
                created_at=f"2026-07-0{i+1}T10:00:00Z",
                saved_at=f"2026-07-0{i+1}T10:00:01Z",
            ))
        result = store.search("RAG", 3)
        assert len(result) == 3
        # Most recent first
        assert result[0]["memory_id"] == "m4"

    def test_dedupes_when_multiple_tokens_match_same_memory(self, store: MemoryStore):
        store.add(**_make_memory(
            memory_id="m1", title="RAG retrieval", text="retrieval content",
        ))
        result = store.search("RAG retrieval", 5)
        assert len(result) == 1
        assert result[0]["memory_id"] == "m1"

    def test_returns_full_dict_shape(self, store: MemoryStore):
        """Search result dicts must have the same shape as get()."""
        store.add(**_make_memory(source_refs=[{"documentId": "d1", "page": 1}]))
        result = store.search("vibereader", 5)
        assert len(result) == 1
        mem = result[0]
        # All expected keys present
        expected_keys = {
            "memory_id", "artifact_id", "artifact_type", "title", "text",
            "document_id", "document_name", "source_refs",
            "verification_status", "created_at", "saved_at",
            "contract_version",
        }
        assert set(mem.keys()) == expected_keys
        assert isinstance(mem["source_refs"], list)
        assert mem["source_refs"][0]["documentId"] == "d1"


# ──────────────────────────────────────────────────────────────────────────
# Persistence across instances (same db file)
# ──────────────────────────────────────────────────────────────────────────


class TestPersistence:
    def test_reopen_same_db_retains_data(self, tmp_path: Path):
        db = tmp_path / "memory.db"
        s1 = MemoryStore(db)
        s1.add(**_make_memory(memory_id="persist-1"))
        # Simulate service restart by creating a new instance pointing at same file
        s2 = MemoryStore(db)
        assert s2.count() == 1
        got = s2.get("persist-1")
        assert got is not None
        assert got["artifact_id"] == "artifact-1"
