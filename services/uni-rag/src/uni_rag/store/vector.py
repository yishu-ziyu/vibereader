"""Chroma wrapper for vector storage. Each KB = one collection."""
from __future__ import annotations
from pathlib import Path
import chromadb
from chromadb.config import Settings as ChromaSettings
from uni_rag.config import load_settings


class VectorStore:
    """Persistent Chroma collection wrapper.

    `data_dir` = base directory; `collection_name` = unique per KB.
    v0.2 default collection name was 'chunks'; v0.3 KB collections are 'kb_<id>'.
    """

    def __init__(
        self,
        data_dir: Path | None = None,
        collection_name: str = "chunks",
    ):
        if data_dir is None:
            data_dir = load_settings().chroma_dir
        self.client = chromadb.PersistentClient(
            path=str(data_dir),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def add(
        self,
        source_id: str,
        chunk_id: str,
        embedding: list[float],
        metadata: dict,
        document: str | None = None,
    ) -> None:
        self.collection.add(
            ids=[chunk_id],
            embeddings=[embedding],
            metadatas=[{**metadata, "source_id": source_id}],
            documents=[document] if document else None,
        )

    def _match_source_ids(self, source_id: str) -> set[str]:
        """汇集某来源的全部 chunk id（去重）。

        新数据：metadata 带 source_id，走 where 过滤；
        旧数据：只有 "<source_id>:<offset>" 形式的 id，按前缀兜底匹配。
        两条路径可能命中同一行，用 id 集合取并集。
        """
        matched: set[str] = set()
        try:
            res = self.collection.get(where={"source_id": source_id}, include=[])
            matched.update(res.get("ids") or [])
        except Exception:
            pass  # where 里的 metadata 键不存在等异常交给前缀兜底
        prefix = f"{source_id}:"
        all_ids = self.collection.get(include=[]).get("ids") or []
        matched.update(cid for cid in all_ids if str(cid).startswith(prefix))
        return matched

    def delete_source(self, source_id: str) -> int:
        """删除一个来源（source_id）的全部向量，返回删除的条数。"""
        ids = self._match_source_ids(source_id)
        if ids:
            self.collection.delete(ids=list(ids))
        return len(ids)

    def count_source(self, source_id: str) -> int:
        """统计某来源当前的向量条数（含无 source_id 元数据的旧条目）。"""
        return len(self._match_source_ids(source_id))

    def query(
        self,
        embedding: list[float],
        top_k: int = 5,
        where: dict | None = None,
    ) -> list[dict]:
        res = self.collection.query(
            query_embeddings=[embedding],
            n_results=top_k,
            where=where,
        )
        out = []
        for i, chunk_id in enumerate(res["ids"][0]):
            out.append({
                "id": chunk_id,
                "score": 1 - res["distances"][0][i],  # cosine distance → similarity
                "metadata": res["metadatas"][0][i] if res["metadatas"] else {},
                "document": res["documents"][0][i] if res["documents"] else None,
            })
        return out
