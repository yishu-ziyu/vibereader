"""Hybrid retriever: vector + BM25 + rerank. Per-KB isolation via kb_id."""
from __future__ import annotations
from uni_rag.ingest.embedder import get_embedder
from uni_rag.store.vector import VectorStore
from uni_rag.store.bm25 import BM25Index
from uni_rag.retrieve.reranker import Reranker
from uni_rag.config import load_settings


class HybridRetriever:
    """kb_id=None = legacy v0.2 mode (single global collection + BM25 dir)."""

    def __init__(self, kb_id: str | None = None):
        self.embedder = get_embedder()
        self.kb_id = kb_id
        if kb_id is None:
            self.vector = VectorStore()
            self.bm25 = BM25Index.load(load_settings().bm25_dir)
        else:
            data_dir = load_settings().data_dir
            kb_base = data_dir / "kbs" / kb_id
            chroma_dir = kb_base / "chroma"
            bm25_dir = kb_base / "bm25"
            self.vector = VectorStore(data_dir=chroma_dir, collection_name=f"kb_{kb_id}")
            self.bm25 = BM25Index.load(bm25_dir)
        self.reranker = Reranker()

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        source_filter: str | None = None,
    ) -> list[dict]:
        where = {"source": source_filter} if source_filter else None
        vec = self.embedder.embed([query])[0]
        vec_results = self.vector.query(vec, top_k=top_k * 3, where=where)
        bm25_results = self.bm25.query(query, top_k=top_k * 3)
        if source_filter:
            bm25_results = [r for r in bm25_results if r["metadata"].get("source") == source_filter]
        merged: dict[str, dict] = {}
        for r in vec_results:
            merged[r["id"]] = r
        for r in bm25_results:
            if r["id"] not in merged:
                merged[r["id"]] = r
        docs = list(merged.values())
        return self.reranker.rerank(query, docs, top_k=top_k)