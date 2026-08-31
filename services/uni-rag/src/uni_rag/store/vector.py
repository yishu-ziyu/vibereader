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
            metadatas=[metadata],
            documents=[document] if document else None,
        )

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
