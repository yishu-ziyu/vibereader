"""BM25 keyword index, persisted to disk."""
from __future__ import annotations
import json
import threading
from pathlib import Path
from rank_bm25 import BM25Okapi
import jieba  # 中文分词

# 模块级保存锁：ingest job 在工作线程里并发跑，save() 是对 docs.json
# 的全量重写，不加锁会出现 last-writer-wins（后写者覆盖先写者的条目）。
# 同进程内所有 BM25Index 实例共享这把锁，保证"读内存 → 重建 → 落盘"
# 序列化执行。
_SAVE_LOCK = threading.Lock()


class BM25Index:
    """BM25 index with jieba Chinese tokenization."""

    def __init__(self, index_dir: Path):
        self.index_dir = Path(index_dir)
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self.docs: list[tuple[str, str, dict]] = []  # (id, text, meta)
        self._index: BM25Okapi | None = None

    def add(self, chunk_id: str, text: str, metadata: dict) -> None:
        self.docs.append((chunk_id, text, metadata))
        self._index = None  # 标记为脏

    def remove_source(self, source_id: str) -> int:
        """按 source_id 删除该来源的全部条目（chunk_id 形如 "<source_id>:<offset>"）。

        返回删除的条目数。供幂等重入 / 删除端点使用：重建索引前先清掉
        同 source 的旧条目，避免重复 chunk 或删除后残留。
        """
        prefix = f"{source_id}:"
        before = len(self.docs)
        self.docs = [d for d in self.docs if not str(d[0]).startswith(prefix)]
        removed = before - len(self.docs)
        if removed:
            self._index = None  # 标记为脏
        return removed

    def _build(self) -> None:
        if not self.docs:
            self._index = None
            return
        tokenized = [list(jieba.cut_for_search(t)) for _, t, _ in self.docs]
        self._index = BM25Okapi(tokenized)

    def save(self) -> None:
        # 全量重写 docs.json 前先拿模块级锁，串行化并发 job 的落盘，
        # 消除 last-writer-wins（文件内容不会互相覆盖撕裂）。
        # 注意：docs 为空时也要写（写入 []），否则删除最后一个来源后
        # 旧文件残留，重启加载时已删条目会"复活"。
        with _SAVE_LOCK:
            self._build()
            with open(self.index_dir / "docs.json", "w", encoding="utf-8") as f:
                json.dump(self.docs, f, ensure_ascii=False)

    @classmethod
    def load(cls, index_dir: Path) -> "BM25Index":
        idx = cls(index_dir)
        # 支持旧版 .pkl 和新版 .json
        json_path = index_dir / "docs.json"
        pkl_path = index_dir / "docs.pkl"
        if json_path.exists():
            with open(json_path, "r", encoding="utf-8") as f:
                idx.docs = [tuple(d) for d in json.load(f)]
            idx._build()
        elif pkl_path.exists():
            # 一次性迁移：读旧 pickle，写新 JSON，删旧文件
            import pickle as _pkl
            with open(pkl_path, "rb") as f:
                idx.docs = _pkl.load(f)
            idx.save()
            pkl_path.unlink()
        return idx

    def query(self, text: str, top_k: int = 5) -> list[dict]:
        if not self._index or not self.docs:
            return []
        tokens = list(jieba.cut_for_search(text))
        scores = self._index.get_scores(tokens)
        ranked = sorted(enumerate(scores), key=lambda x: -x[1])[:top_k]
        out = []
        for i, score in ranked:
            if score <= 0:
                continue
            chunk_id, doc_text, meta = self.docs[i]
            out.append({"id": chunk_id, "score": float(score), "metadata": meta, "document": doc_text})
        return out
