"""bge-reranker-base cross-encoder reranker."""
from __future__ import annotations
from sentence_transformers import CrossEncoder


class Reranker:
    def __init__(self, model_name: str = "BAAI/bge-reranker-base"):
        self.model = CrossEncoder(model_name)

    def rerank(self, query: str, docs: list[dict], top_k: int = 5) -> list[dict]:
        if not docs:
            return []
        pairs = []
        valid_idx = []
        for i, d in enumerate(docs):
            text = d.get("document") or d.get("text") or ""
            if text:
                pairs.append((query, text))
                valid_idx.append(i)
        if not pairs:
            return docs[:top_k]
        scores = self.model.predict(pairs)
        scored = [(valid_idx[j], float(scores[j])) for j in range(len(pairs))]
        scored.sort(key=lambda x: -x[1])
        out = []
        for orig_i, score in scored[:top_k]:
            entry = dict(docs[orig_i])
            entry["rerank_score"] = score
            out.append(entry)
        return out
