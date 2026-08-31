"""SQLite-backed saved-memory store for VibeReader saved_artifact payloads.

Persists user-confirmed memories (saved answer cards, notes, etc.) so later
`/api/query` with `include_memory=true` can return them as `saved_memory`
citations.

R5 记忆语义化：检索升级为 BGE-M3 向量余弦相似度为主通道，LIKE 关键字
匹配降级为补足通道，最近记录兜底排最后；每条结果标注 retrieved_by 来源
（'vector' | 'like' | 'recent'）。写入时同步生成向量，嵌入失败不阻塞写入
（embedding 留 NULL，走 LIKE / 兜底），保证 Reader fast-path 永不失败。
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from pathlib import Path

import numpy as np

from uni_rag.config import load_settings
from uni_rag.ingest.embedder import get_embedder
from uni_rag.store.sqlite_utils import connect

logger = logging.getLogger(__name__)

# 写入 embedding_model 列的模型标识（与 ingest/embedder.py 的 BGE-M3 对应）
_EMBEDDING_MODEL_NAME = "BAAI/bge-m3"

# 向量存取统一使用 float32 little-endian
_EMBEDDING_DTYPE = "<f4"

# load_settings() 不可用（如无 LLM_API_KEY 的单测环境）时的阈值兜底值
_DEFAULT_SIMILARITY_THRESHOLD = 0.30


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
            contract_version TEXT NOT NULL DEFAULT 'reader-unirag-memory-v1',
            embedding BLOB,              -- R5: float32 little-endian 向量，可为 NULL
            embedding_model TEXT         -- R5: 生成向量的模型名，如 BAAI/bge-m3
        )

    R5 检索：向量语义（cosine ≥ memory_similarity_threshold）→ LIKE 关键字
    → 最近记录兜底，三级依次补足到 top_k，结果带 retrieved_by 标注。
    旧数据（embedding 为 NULL）自动跳过向量通道，仍可被 LIKE / 兜底命中。
    """

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with connect(self.db_path) as conn:
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
                    contract_version TEXT NOT NULL DEFAULT 'reader-unirag-memory-v1',
                    embedding BLOB,
                    embedding_model TEXT
                )
            """)
            # Backfill columns for databases created before contract_version
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
            # R5 迁移（幂等）：为旧库补 embedding / embedding_model 两列。
            # 已有行 embedding 为 NULL，查询时跳过向量通道，可用
            # backfill_embeddings() 一次性补齐。
            if "embedding" not in existing_cols:
                conn.execute(
                    "ALTER TABLE saved_memories ADD COLUMN embedding BLOB"
                )
            if "embedding_model" not in existing_cols:
                conn.execute(
                    "ALTER TABLE saved_memories ADD COLUMN embedding_model TEXT"
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
        """Insert a new memory. Raises sqlite3.IntegrityError on duplicate memory_id.

        R5：写入前对 `text` 生成 BGE-M3 向量一并落库。嵌入失败（模型未就绪/
        离线/异常）只记 warning、embedding 留 NULL，绝不阻塞写入——
        POST /api/memory/jobs 的 Reader fast-path（同步 completed）语义不变。
        """
        source_refs_json = json.dumps(source_refs or [], ensure_ascii=False)
        # R5：向量在 store 层生成（不放 routes），失败降级为 NULL
        embedding_blob, embedding_model = self._try_embed(text)
        with connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO saved_memories (
                    memory_id, artifact_id, artifact_type, title, text,
                    document_id, document_name, source_refs_json,
                    verification_status, created_at, saved_at,
                    contract_version, embedding, embedding_model
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    memory_id, artifact_id, artifact_type, title, text,
                    document_id, document_name, source_refs_json,
                    verification_status, created_at, saved_at,
                    contract_version, embedding_blob, embedding_model,
                ),
            )

    def get(self, memory_id: str) -> dict | None:
        """Return one memory by id, or None if not found."""
        with connect(self.db_path) as conn:
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
        with connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT memory_id, artifact_id, artifact_type, title, text, "
                "document_id, document_name, source_refs_json, "
                "verification_status, created_at, saved_at, contract_version "
                "FROM saved_memories ORDER BY created_at DESC LIMIT ?",
                (top_k,),
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def search(
        self,
        query: str,
        top_k: int,
        similarity_threshold: float | None = None,
    ) -> list[dict]:
        """R5 语义检索：向量 cosine 主通道 + LIKE 补足 + 最近记录兜底。

        三级通道依次补足到 top_k，已命中的 memory_id 跨通道去重：
          1. vector —— 查询向量与全表 embedding 做 cosine 相似度
             （numpy 暴力全表扫，本地单用户量级无需向量索引），
             取相似度 ≥ 阈值（config: memory_similarity_threshold，
             可用 similarity_threshold 参数覆盖）的 top_k 条；
          2. like   —— 结果不足 top_k 时，用原 LIKE 关键字匹配补足；
          3. recent —— 仍不足时按 created_at DESC 用最近记录补足
             （保留兜底但排最后）。

        每条结果附加 `retrieved_by` 字段（'vector' | 'like' | 'recent'），
        不改动 _row_to_dict 的既有字段。任一通道失败（嵌入不可用、向量
        维度不齐等）只记 warning 并跳过该通道，检索永不抛异常。
        """
        if top_k <= 0:
            return []

        threshold = self._resolve_threshold(similarity_threshold)
        results: list[dict] = []
        seen: set[str] = set()

        def _take(candidates: list[dict], label: str) -> None:
            """把候选结果并入 results（去重、标注来源、截断到 top_k）。"""
            for m in candidates:
                if len(results) >= top_k:
                    return
                mid = m["memory_id"]
                if mid in seen:
                    continue
                seen.add(mid)
                m["retrieved_by"] = label
                results.append(m)

        # 1) 向量语义通道（嵌入不可用时静默跳过）
        query_vec = self._try_embed_query(query)
        if query_vec is not None:
            _take(self._vector_search(query_vec, top_k, threshold), "vector")

        # 2) LIKE 关键字补足
        if len(results) < top_k:
            _take(self._like_search(query, top_k), "like")

        # 3) 最近记录兜底（排最后）
        if len(results) < top_k:
            _take(self.list_recent(top_k), "recent")

        return results

    def _resolve_threshold(self, explicit: float | None) -> float:
        """阈值解析：显式参数 > config.memory_similarity_threshold > 0.30。

        load_settings() 在缺少必填环境变量的场景（如纯单测）会抛
        ValidationError，这里兜底为模块常量，保证检索永不因配置失败。
        """
        if explicit is not None:
            return float(explicit)
        try:
            return float(load_settings().memory_similarity_threshold)
        except Exception:
            return _DEFAULT_SIMILARITY_THRESHOLD

    def _try_embed(self, text: str) -> tuple[bytes | None, str | None]:
        """为文本生成 BGE-M3 嵌入，返回 (float32 LE BLOB, 模型名)。

        get_embedder() 返回 None 或抛异常（离线/模型未就绪）时返回
        (None, None)，由调用方落 NULL 并走 LIKE/兜底通道，绝不向上抛。
        """
        try:
            embedder = get_embedder()
            if embedder is None:
                logger.warning("embedder 未就绪，记忆写入跳过向量（embedding=NULL）")
                return None, None
            vec = embedder.embed([text])[0]
            return np.asarray(vec, dtype=_EMBEDDING_DTYPE).tobytes(), _EMBEDDING_MODEL_NAME
        except Exception as e:  # noqa: BLE001 — 任何嵌入失败都不阻塞写入
            logger.warning("记忆嵌入失败，embedding 留 NULL: %s", e)
            return None, None

    def _try_embed_query(self, query: str) -> np.ndarray | None:
        """生成查询向量；失败返回 None，向量通道整体跳过。"""
        try:
            embedder = get_embedder()
            if embedder is None:
                logger.warning("embedder 未就绪，记忆检索跳过向量通道")
                return None
            vec = embedder.embed([query])[0]
            return np.asarray(vec, dtype="float32")
        except Exception as e:  # noqa: BLE001 — 检索降级 LIKE，不抛
            logger.warning("查询嵌入失败，记忆检索降级 LIKE: %s", e)
            return None

    def _vector_search(
        self,
        query_vec: np.ndarray,
        top_k: int,
        threshold: float,
    ) -> list[dict]:
        """查询向量 vs 全表 embedding 的 cosine 暴力检索。

        只取 embedding_model 与当前模型一致的行；维度不齐（历史模型混入）
        时跳过整个向量通道。返回按相似度降序的完整记忆 dict（不含 retrieved_by，
        由 search 统一标注）。
        """
        with connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT memory_id, artifact_id, artifact_type, title, text, "
                "document_id, document_name, source_refs_json, "
                "verification_status, created_at, saved_at, contract_version, "
                "embedding, embedding_model "
                "FROM saved_memories WHERE embedding IS NOT NULL"
            ).fetchall()
        kept_rows: list[tuple] = []
        vectors: list[np.ndarray] = []
        for row in rows:
            # 模型不一致的旧向量不参与比较，避免跨模型分数失真
            if row[13] != _EMBEDDING_MODEL_NAME:
                continue
            vectors.append(np.frombuffer(row[12], dtype=_EMBEDDING_DTYPE))
            kept_rows.append(row)
        if not kept_rows:
            return []

        try:
            mat = np.stack(vectors)
        except ValueError:
            logger.warning("记忆向量维度不一致，向量通道跳过")
            return []
        if mat.shape[1] != query_vec.shape[0]:
            logger.warning(
                "查询向量维度(%d)与库内向量维度(%d)不一致，向量通道跳过",
                query_vec.shape[0], mat.shape[1],
            )
            return []

        # 余弦相似度；写入/查询向量未必单位化（fake embedder 场景），显式归一
        norms = np.linalg.norm(mat, axis=1)
        norms[norms == 0] = 1.0
        q_norm = float(np.linalg.norm(query_vec)) or 1.0
        sims = (mat @ query_vec) / (norms * q_norm)

        order = np.argsort(-sims, kind="stable")[:top_k]
        out: list[dict] = []
        for idx in order:
            if float(sims[idx]) < threshold:
                break  # 降序排列，后面只会更低
            out.append(self._row_to_dict(kept_rows[idx][:12]))
        return out

    def _like_search(self, query: str, top_k: int) -> list[dict]:
        """原 phase-1 LIKE 关键字匹配（作为向量通道的补足，不含兜底）。

        Tokenize `query` → LIKE %kw% on (title || text)，按 created_at DESC
        返回至多 top_k 条；无内容词元或无命中时返回空列表（兜底由 search
        统一处理）。
        """
        tokens = _tokenize(query)
        if not tokens:
            return []

        matched_ids: list[str] = []
        seen: set[str] = set()
        with connect(self.db_path) as conn:
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
            return []

        # Fetch full rows for matched_ids, preserving matched order, limit top_k.
        matched_ids = matched_ids[:top_k]
        placeholders = ",".join("?" for _ in matched_ids)
        with connect(self.db_path) as conn:
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

    def backfill_embeddings(self, batch_size: int = 32) -> int:
        """为 embedding 为 NULL 的历史记忆批量补齐 BGE-M3 向量（运维用）。

        按 created_at 无关的表序分批 embed(text)，逐批提交；返回补写行数。
        与写入/检索路径不同，embedder 不可用（None/异常）时抛 RuntimeError——
        这是显式运维动作，失败应当可见，已成功批次保留、可重跑续传。
        """
        with connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT memory_id, text FROM saved_memories "
                "WHERE embedding IS NULL"
            ).fetchall()
        if not rows:
            return 0

        embedder = get_embedder()
        if embedder is None:
            raise RuntimeError("embedder 未就绪，无法补齐记忆向量（模型加载失败或离线）")

        updated = 0
        for i in range(0, len(rows), max(batch_size, 1)):
            batch = rows[i:i + batch_size]
            vecs = embedder.embed([r[1] for r in batch])
            with connect(self.db_path) as conn:
                for (memory_id, _), vec in zip(batch, vecs):
                    conn.execute(
                        "UPDATE saved_memories "
                        "SET embedding = ?, embedding_model = ? "
                        "WHERE memory_id = ?",
                        (
                            np.asarray(vec, dtype=_EMBEDDING_DTYPE).tobytes(),
                            _EMBEDDING_MODEL_NAME,
                            memory_id,
                        ),
                    )
            updated += len(batch)
        return updated

    def count(self) -> int:
        with connect(self.db_path) as conn:
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
