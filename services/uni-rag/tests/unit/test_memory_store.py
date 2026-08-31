"""Unit tests for MemoryStore (SQLite-backed saved-memory store).

R5 记忆语义化：新增向量通道（BGE-M3 cosine）+ LIKE 补足 + 最近记录兜底
的检索语义测试。所有测试通过 monkeypatch 注入 fake embedder，绝不真实
下载/加载模型（参考 tests/unit/test_parsed_sidecar.py 的做法）。
"""
from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path

import numpy as np
import pytest

import uni_rag.store.memory as memory_module
from uni_rag.store.memory import MemoryStore, _tokenize


# ──────────────────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────────────────


class _KeywordEmbedder:
    """确定性桩 embedder：按关键词映射到正交单位向量，零模型开销。

    猫/cat → [1,0,0,0]，狗/dog → [0,1,0,0]，其余 → [0,0,1,0]，
    用于验证 cosine 排序、阈值过滤与三级通道顺序。
    """

    dim = 4

    def embed(self, texts):
        out = []
        for t in texts:
            if "猫" in t or "cat" in t:
                out.append([1.0, 0.0, 0.0, 0.0])
            elif "狗" in t or "dog" in t:
                out.append([0.0, 1.0, 0.0, 0.0])
            else:
                out.append([0.0, 0.0, 1.0, 0.0])
        return out


@pytest.fixture(autouse=True)
def _offline_embedder(monkeypatch):
    """默认把 get_embedder 替换为抛异常桩（模拟离线/模型未就绪）。

    R5 起 MemoryStore.add() 会在 store 内尝试嵌入；默认失败路径保证：
      1. 任何测试都不会触发真实 BGE-M3 下载；
      2. 嵌入失败 → embedding 留 NULL → 检索走 LIKE/兜底通道
        （「永不阻塞写入、检索永不抛异常」的降级语义被持续回归）。
    需要向量通道的测试在用例内自行覆盖为 _KeywordEmbedder。
    """

    def _raise():
        raise RuntimeError("embedder unavailable (offline test default)")

    monkeypatch.setattr(memory_module, "get_embedder", _raise)


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
        """Query with only punctuation/stopwords → LIKE 无词元，结果由
        recent 兜底通道补足并标注 retrieved_by='recent'。"""
        store.add(**_make_memory(title="alpha", text="alpha content"))
        result = store.search("...", 5)
        assert len(result) == 1
        assert result[0]["title"] == "alpha"
        assert result[0]["retrieved_by"] == "recent"

    def test_keyword_match_returns_matching_memory(self, store: MemoryStore):
        """R5：LIKE 通道命中的记录排最前；未命中记录由 recent 兜底补足
        且排最后（不再断言严格排除，兜底填充语义见 search 文档）。"""
        store.add(**_make_memory(
            memory_id="m1", title="RAG architecture notes",
            text="discusses retrieval augmented generation patterns",
            created_at="2026-07-02T10:00:00Z",
            saved_at="2026-07-02T10:00:01Z",
        ))
        store.add(**_make_memory(
            memory_id="m2", artifact_id="a2",
            title="unrelated cooking notes",
            text="how to bake bread at home",
            created_at="2026-07-01T10:00:00Z",
            saved_at="2026-07-01T10:00:01Z",
        ))
        result = store.search("RAG retrieval", 5)
        assert result[0]["memory_id"] == "m1"
        assert result[0]["retrieved_by"] == "like"
        # m2 未进向量（离线桩）/LIKE 通道，由 recent 兜底且排最后
        assert result[1]["memory_id"] == "m2"
        assert result[1]["retrieved_by"] == "recent"

    def test_chinese_keyword_match(self, store: MemoryStore):
        store.add(**_make_memory(
            memory_id="m1", title="记忆卡片",
            text="用户保存的关于阅读的记忆",
        ))
        result = store.search("记忆", 5)
        assert len(result) == 1
        assert result[0]["memory_id"] == "m1"

    def test_no_match_falls_back_to_recent(self, store: MemoryStore):
        """向量/LIKE 均无命中时，recent 兜底通道补足且排最后
        （R5：兜底不再是「唯一路径」，只作为第三级补足并显式标注）。"""
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
        # 无向量命中（默认离线桩）且无 token 匹配 → recent 兜底
        assert len(result) == 2
        assert result[0]["memory_id"] == "m2"  # most recent first
        assert all(m["retrieved_by"] == "recent" for m in result)

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
        """Search result dicts must have the same shape as get()（外加 R5
        的 retrieved_by 来源标注）。"""
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
            "retrieved_by",
        }
        assert set(mem.keys()) == expected_keys
        assert mem["retrieved_by"] in {"vector", "like", "recent"}
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


# ──────────────────────────────────────────────────────────────────────────
# R5: 写入时嵌入（fake embedder 注入，不真实下载模型）
# ──────────────────────────────────────────────────────────────────────────


class TestEmbeddingOnWrite:
    def test_add_with_embedder_persists_embedding_blob_and_model(
        self, store: MemoryStore, monkeypatch
    ):
        """嵌入成功：embedding 落 float32 LE BLOB，embedding_model 标注模型名。"""
        monkeypatch.setattr(memory_module, "get_embedder", lambda: _KeywordEmbedder())
        store.add(**_make_memory(text="猫喜欢晒太阳"))
        with sqlite3.connect(store.db_path) as conn:
            row = conn.execute(
                "SELECT embedding, embedding_model FROM saved_memories "
                "WHERE memory_id = 'mem-1'"
            ).fetchone()
        assert row[0] is not None
        assert np.frombuffer(row[0], dtype="<f4").tolist() == [1.0, 0.0, 0.0, 0.0]
        assert row[1] == "BAAI/bge-m3"

    def test_add_embedding_failure_keeps_null_and_warns(
        self, store: MemoryStore, caplog
    ):
        """嵌入失败（默认离线桩抛异常）不阻塞写入：embedding 留 NULL + warning。"""
        with caplog.at_level(logging.WARNING, logger="uni_rag.store.memory"):
            store.add(**_make_memory())  # 不应抛出
        with sqlite3.connect(store.db_path) as conn:
            row = conn.execute(
                "SELECT embedding, embedding_model FROM saved_memories "
                "WHERE memory_id = 'mem-1'"
            ).fetchone()
        assert row[0] is None
        assert row[1] is None
        assert any("记忆嵌入失败" in r.getMessage() for r in caplog.records)

    def test_add_with_embedder_returning_none_keeps_null(
        self, store: MemoryStore, monkeypatch
    ):
        """get_embedder() 返回 None（模型未就绪）同样降级为 NULL，不抛异常。"""
        monkeypatch.setattr(memory_module, "get_embedder", lambda: None)
        store.add(**_make_memory())  # 不应抛出
        got = store.get("mem-1")
        assert got is not None  # 写入成功


# ──────────────────────────────────────────────────────────────────────────
# R5: 向量语义检索（cosine 排序 / 阈值 / 三级通道顺序）
# ──────────────────────────────────────────────────────────────────────────


class TestSemanticSearch:
    def test_vector_channel_ranks_and_fallback_fills_behind(
        self, store: MemoryStore, monkeypatch
    ):
        """cosine 排序正确性：高相似向量命中排前；被阈值排除的记录只能由
        recent 兜底补足且排在最后。"""
        monkeypatch.setattr(memory_module, "get_embedder", lambda: _KeywordEmbedder())
        store.add(**_make_memory(
            memory_id="m-cat", title="猫的习性", text="猫喜欢晒太阳",
            created_at="2026-07-01T10:00:00Z", saved_at="2026-07-01T10:00:01Z",
        ))
        store.add(**_make_memory(
            memory_id="m-dog", artifact_id="a2", title="狗的训练", text="狗需要遛弯",
            created_at="2026-07-02T10:00:00Z", saved_at="2026-07-02T10:00:01Z",
        ))
        result = store.search("猫的习性", 5)
        # 猫：cos=1.0 命中向量通道；狗：cos=0 低于阈值被排除
        assert result[0]["memory_id"] == "m-cat"
        assert result[0]["retrieved_by"] == "vector"
        # 狗未进向量/LIKE 通道，由 recent 兜底且排最后
        assert result[1]["memory_id"] == "m-dog"
        assert result[1]["retrieved_by"] == "recent"

    def test_cosine_ordering_between_two_vector_hits(
        self, store: MemoryStore, monkeypatch
    ):
        """两条记录都过阈值时，必须按 cosine 相似度降序（而非 created_at）。"""

        class _RankedEmbedder:
            dim = 4

            def embed(self, texts):
                out = []
                for t in texts:
                    if "完全命中" in t:
                        out.append([1.0, 0.0, 0.0, 0.0])  # 与查询 cos=1.0
                    elif "部分相关" in t:
                        out.append([0.8, 0.6, 0.0, 0.0])  # 与查询 cos=0.8
                    else:
                        out.append([0.0, 0.0, 1.0, 0.0])
                return out

        monkeypatch.setattr(memory_module, "get_embedder", lambda: _RankedEmbedder())
        # 故意让弱相关记录更新（created_at 更晚），验证排序不被时间干扰
        store.add(**_make_memory(
            memory_id="m-strong", title="完全命中笔记", text="完全命中内容",
            created_at="2026-07-01T10:00:00Z", saved_at="2026-07-01T10:00:01Z",
        ))
        store.add(**_make_memory(
            memory_id="m-weak", artifact_id="a2", title="部分相关笔记", text="部分相关内容",
            created_at="2026-07-02T10:00:00Z", saved_at="2026-07-02T10:00:01Z",
        ))
        result = store.search("完全命中", 5)
        assert [m["memory_id"] for m in result] == ["m-strong", "m-weak"]
        assert all(m["retrieved_by"] == "vector" for m in result)

    def test_search_skips_null_embedding_rows_in_vector_channel(
        self, store: MemoryStore, monkeypatch
    ):
        """旧数据（embedding=NULL）跳过向量通道，但仍可被 LIKE 命中。"""
        # 默认离线桩写入 → embedding 为 NULL（模拟旧数据/补嵌入前状态）
        store.add(**_make_memory(memory_id="m-old", title="猫的习性", text="猫喜欢晒太阳"))
        # 切换到可用 embedder：向量通道可用，但旧行没有向量
        monkeypatch.setattr(memory_module, "get_embedder", lambda: _KeywordEmbedder())
        result = store.search("猫", 5)
        assert result, "旧行应仍可被检索"
        assert result[0]["memory_id"] == "m-old"
        # 无向量 → 不可能走 vector 通道，必然由 LIKE 命中
        assert result[0]["retrieved_by"] == "like"

    def test_search_embedding_failure_degrades_to_like(
        self, store: MemoryStore
    ):
        """嵌入全程失败（默认离线桩）→ 向量通道跳过，LIKE 通道正常补足。"""
        store.add(**_make_memory(
            memory_id="m1", title="RAG architecture notes",
            text="discusses retrieval augmented generation patterns",
        ))
        result = store.search("RAG retrieval", 5)
        assert len(result) == 1
        assert result[0]["memory_id"] == "m1"
        assert result[0]["retrieved_by"] == "like"

    def test_search_explicit_threshold_can_exclude_vector_hits(
        self, store: MemoryStore, monkeypatch
    ):
        """similarity_threshold 参数可调：阈值抬到 >1 强制清空向量通道，
        原本 cos=1.0 的命中降级为 LIKE 补足。"""
        monkeypatch.setattr(memory_module, "get_embedder", lambda: _KeywordEmbedder())
        store.add(**_make_memory(memory_id="m-cat", title="猫的习性", text="猫喜欢晒太阳"))
        result = store.search("猫", 5, similarity_threshold=1.1)
        assert result[0]["memory_id"] == "m-cat"
        assert result[0]["retrieved_by"] == "like"


# ──────────────────────────────────────────────────────────────────────────
# R5: backfill_embeddings（运维一次性补齐旧数据向量）
# ──────────────────────────────────────────────────────────────────────────


class TestBackfillEmbeddings:
    def test_backfill_fills_null_rows_and_enables_vector_search(
        self, store: MemoryStore, monkeypatch
    ):
        store.add(**_make_memory(
            memory_id="m-cat", title="猫的习性", text="猫喜欢晒太阳",
            created_at="2026-07-01T10:00:00Z", saved_at="2026-07-01T10:00:01Z",
        ))
        store.add(**_make_memory(
            memory_id="m-dog", artifact_id="a2", title="狗的训练", text="狗需要遛弯",
        ))
        monkeypatch.setattr(memory_module, "get_embedder", lambda: _KeywordEmbedder())
        updated = store.backfill_embeddings(batch_size=32)
        assert updated == 2

        with sqlite3.connect(store.db_path) as conn:
            rows = conn.execute(
                "SELECT memory_id, embedding, embedding_model FROM saved_memories"
            ).fetchall()
        by_id = {r[0]: r for r in rows}
        assert by_id["m-cat"][1] is not None
        assert by_id["m-cat"][2] == "BAAI/bge-m3"
        assert np.frombuffer(by_id["m-cat"][1], dtype="<f4").tolist() == [1.0, 0.0, 0.0, 0.0]
        assert by_id["m-dog"][1] is not None

        # 补齐后向量通道生效
        result = store.search("猫的习性", 5)
        assert result[0]["memory_id"] == "m-cat"
        assert result[0]["retrieved_by"] == "vector"

    def test_backfill_is_idempotent(self, store: MemoryStore, monkeypatch):
        store.add(**_make_memory())
        monkeypatch.setattr(memory_module, "get_embedder", lambda: _KeywordEmbedder())
        assert store.backfill_embeddings() == 1
        assert store.backfill_embeddings() == 0  # 无 NULL 行，二次运行为空转

    def test_backfill_raises_when_embedder_raises(self, store: MemoryStore):
        """运维命令应显式失败：embedder 抛异常时 backfill 向上传播 RuntimeError。"""
        store.add(**_make_memory())  # 默认离线桩写入 → embedding NULL
        with pytest.raises(RuntimeError):
            store.backfill_embeddings()

    def test_backfill_raises_when_embedder_returns_none(
        self, store: MemoryStore, monkeypatch
    ):
        store.add(**_make_memory())
        monkeypatch.setattr(memory_module, "get_embedder", lambda: None)
        with pytest.raises(RuntimeError):
            store.backfill_embeddings()


# ──────────────────────────────────────────────────────────────────────────
# R5: schema 迁移（旧库幂等补列）
# ──────────────────────────────────────────────────────────────────────────


class TestSchemaMigration:
    def test_legacy_db_gets_embedding_columns(self, tmp_path: Path):
        """R5 迁移：无 embedding 两列的旧库打开后自动补列，旧数据保持 NULL。"""
        db = tmp_path / "memory.db"
        with sqlite3.connect(db) as conn:
            conn.execute("""
                CREATE TABLE saved_memories (
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
            conn.execute(
                "INSERT INTO saved_memories (memory_id, artifact_id, artifact_type, "
                "title, text, created_at, saved_at) VALUES "
                "('legacy-1', 'a', 'note', 't', '旧数据文本', "
                "'2026-07-01T00:00:00Z', '2026-07-01T00:00:01Z')"
            )

        s = MemoryStore(db)  # 触发幂等迁移
        with sqlite3.connect(db) as conn:
            cols = {
                r[1] for r in conn.execute("PRAGMA table_info(saved_memories)")
            }
            row = conn.execute(
                "SELECT embedding, embedding_model FROM saved_memories "
                "WHERE memory_id = 'legacy-1'"
            ).fetchone()
        assert {"embedding", "embedding_model"} <= cols
        assert row[0] is None and row[1] is None
        # 旧数据仍可正常读取与兜底检索
        assert s.get("legacy-1") is not None

    def test_migration_is_idempotent_on_reopen(self, store: MemoryStore):
        """同一 db 重复初始化不重复加列、不报错。"""
        cols_before = sqlite3.connect(store.db_path).execute(
            "SELECT COUNT(*) FROM pragma_table_info('saved_memories') "
            "WHERE name IN ('embedding', 'embedding_model')"
        ).fetchone()[0]
        assert cols_before == 2
        MemoryStore(store.db_path)  # 再次打开
        cols_after = sqlite3.connect(store.db_path).execute(
            "SELECT COUNT(*) FROM pragma_table_info('saved_memories') "
            "WHERE name IN ('embedding', 'embedding_model')"
        ).fetchone()[0]
        assert cols_after == 2
