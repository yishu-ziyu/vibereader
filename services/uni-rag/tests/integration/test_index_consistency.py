"""R4 索引一致性（审计债 D12）集成测试。

覆盖任务要求：
  1. 幂等重入：同一文件 ingest 两次，chunk 数不翻倍（Chroma + BM25）；
  2. 删除端点：删后检索不再命中该 source、上传文件与解析 sidecar 被清理，
     重复删除返回 404；
  3. KB 版删除端点与 KB 级删除的落盘目录级联清理（含 session 绑定级联）。

全程使用确定性桩 embedder（文本哈希向量），不加载/下载 BGE-M3、
reranker 等本地模型，离线可跑。
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from uni_rag.api.app import create_app


class _FakeEmbedder:
    """确定性桩 embedder：按文本 sha256 生成 8 维向量，同文本恒同向量。"""

    dim = 8

    def embed(self, texts):
        return [
            [b / 255.0 for b in hashlib.sha256(t.encode("utf-8")).digest()[:8]]
            for t in texts
        ]


@pytest.fixture
def client(tmp_path, monkeypatch):
    """隔离的 FastAPI TestClient，桩掉全部本地模型组件。"""
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    import uni_rag.config as config_module
    import uni_rag.api.routes as routes_module

    config_module._settings = None
    routes_module._pipeline = None
    # 桩 embedder：ingest 通道 + 检索通道各有一份 import
    monkeypatch.setattr(
        "uni_rag.ingest.pipeline.get_embedder", lambda: _FakeEmbedder()
    )
    monkeypatch.setattr(
        "uni_rag.retrieve.retriever.get_embedder", lambda: _FakeEmbedder()
    )
    # reranker 构造时会下载 CrossEncoder；删除/幂等测试不依赖重排，置空即可
    monkeypatch.setattr(
        "uni_rag.retrieve.reranker.Reranker.__init__",
        lambda self, model_name=None: None,
    )

    app = create_app()
    return TestClient(app)


def _sample_md() -> Path:
    return Path(__file__).resolve().parents[1] / "fixtures" / "sample.md"


def _ingest_md(client, name="sample.md"):
    with open(_sample_md(), "rb") as f:
        r = client.post("/api/ingest", files={"file": (name, f, "text/markdown")})
    assert r.status_code == 200, r.text
    return r.json()


def test_ingest_same_file_twice_does_not_duplicate_chunks(client, tmp_path):
    """幂等重入：同文件重复入库，source_id 稳定且 chunk 数不翻倍。"""
    from uni_rag.ingest.pipeline import IngestPipeline
    from uni_rag.store.bm25 import BM25Index

    first = _ingest_md(client)
    second = _ingest_md(client)

    assert second["source_id"] == first["source_id"]
    assert second["chunks"] == first["chunks"] > 0

    pipeline = IngestPipeline(kb_id=None)
    sid = first["source_id"]
    # Chroma：该 source 的向量数 == 单次入库的 chunk 数（不是 2 倍）
    assert pipeline.vector.count_source(sid) == first["chunks"]
    assert pipeline.vector.collection.count() == first["chunks"]
    # BM25：全库条目数 == 单次入库的 chunk 数
    bm25 = BM25Index.load(pipeline.bm25.index_dir)
    assert len(bm25.docs) == first["chunks"]
    assert all(str(cid).startswith(f"{sid}:") for cid, _, _ in bm25.docs)


def test_delete_document_removes_index_files_and_sidecar(client):
    """DELETE /api/documents/{source_id}：删向量/BM25/文件/sidecar，返回统计。"""
    from uni_rag.ingest.pipeline import IngestPipeline
    from uni_rag.store.bm25 import BM25Index
    from uni_rag.config import load_settings

    result = _ingest_md(client)
    sid = result["source_id"]
    filename = result["filename"]

    pipeline = IngestPipeline(kb_id=None)
    settings = load_settings()
    upload = settings.uploads_dir / filename
    sidecar = settings.parsed_dir / f"{sid}.md"
    assert upload.exists()
    assert sidecar.exists()
    assert pipeline.vector.count_source(sid) == result["chunks"]

    # 删除前检索能命中该 source
    hits = pipeline.search("supervised learning", top_k=5)
    assert any(h["metadata"].get("source_id") == sid for h in hits)

    r = client.delete(f"/api/documents/{sid}")
    assert r.status_code == 200, r.text
    stats = r.json()
    assert stats["deleted"] is True
    assert stats["source_id"] == sid
    assert stats["chunks_deleted"] == result["chunks"]
    assert stats["bm25_removed"] == result["chunks"]
    assert filename in stats["files_deleted"]
    assert stats["sidecar_deleted"] is True

    # 删后：文件与 sidecar 被清理
    assert not upload.exists()
    assert not sidecar.exists()
    # 删后：检索不再命中该 source（Chroma 空 + BM25 空）
    pipeline_after = IngestPipeline(kb_id=None)
    assert pipeline_after.vector.count_source(sid) == 0
    assert pipeline_after.vector.collection.count() == 0
    assert all(
        not str(cid).startswith(f"{sid}:")
        for cid, _, _ in BM25Index.load(pipeline_after.bm25.index_dir).docs
    )
    assert pipeline_after.search("supervised learning", top_k=5) == []

    # 重复删除 → 404
    r = client.delete(f"/api/documents/{sid}")
    assert r.status_code == 404


def test_delete_unknown_source_returns_404(client):
    r = client.delete("/api/documents/deadbeef00000000")
    assert r.status_code == 404


def test_duplicate_start_offsets_do_not_lose_vectors(client, monkeypatch):
    """回归：chunk_id 必须唯一，否则 Chroma.add 静默覆盖导致向量成片丢失。

    真实 PDF 每页 offset 从 0 重排，会有大量 chunk 的 start_offset 相同
    （实测 wonderland 75/81 个都是 0）。这里桩 chunk_document 强制造出三个
    offset 全为 0 的 chunk，断言入库后向量条数 == chunk 条数（旧实现会只剩 1 条）。
    """
    from uni_rag.ingest import pipeline as ingest_module
    from uni_rag.ingest.chunker import Chunk
    from uni_rag.ingest.pipeline import IngestPipeline

    texts = [
        "The quick brown fox jumps over the lazy dog near the riverbank.",
        "A journey of a thousand miles begins with a single steady step.",
        "Practice makes perfect when you repeat the drill with full intent.",
    ]

    def _fake_chunk(text, source_id, **kwargs):
        return [
            Chunk(text=t, source_id=source_id, section_title=None,
                  start_offset=0, end_offset=len(t), page_number=None)
            for t in texts
        ]

    monkeypatch.setattr(ingest_module, "chunk_document", _fake_chunk)

    with open(_sample_md(), "rb") as f:
        r = client.post("/api/ingest", files={"file": ("dup.md", f, "text/markdown")})
    assert r.status_code == 200, r.text
    result = r.json()
    sid = result["source_id"]

    pipeline = IngestPipeline(kb_id=None)
    # 三个 offset 相同的 chunk 必须各自成一条向量，不能被覆盖。
    assert pipeline.vector.collection.count() == len(texts)
    assert pipeline.vector.count_source(sid) == len(texts)
    assert len(pipeline.bm25.docs) == len(texts)


def test_delete_kb_document_endpoint(client):
    """KB 版删除端点：只删该 KB 内的 source，未知 KB 返回 404。"""
    from uni_rag.ingest.pipeline import IngestPipeline
    from uni_rag.config import load_settings

    r = client.post("/api/kbs", json={"name": "demo1", "description": "测试库"})
    assert r.status_code == 200, r.text

    with open(_sample_md(), "rb") as f:
        r = client.post(
            "/api/kbs/demo1/ingest",
            files={"file": ("sample.md", f, "text/markdown")},
        )
    assert r.status_code == 200, r.text
    result = r.json()
    sid = result["source_id"]

    r = client.delete(f"/api/kbs/demo1/documents/{sid}")
    assert r.status_code == 200, r.text
    stats = r.json()
    assert stats["chunks_deleted"] == result["chunks"]
    assert "sample.md" in stats["files_deleted"]

    settings = load_settings()
    pipeline = IngestPipeline(kb_id="demo1")
    assert pipeline.vector.count_source(sid) == 0
    assert not (settings.data_dir / "kbs" / "demo1" / "uploads" / "sample.md").exists()

    # 未知 KB → 404
    r = client.delete("/api/kbs/no_such_kb/documents/" + "0" * 16)
    assert r.status_code == 404


def test_delete_kb_cascades_files_and_session_bindings(client):
    """KB 级删除：data/kbs/<id>/ 目录被级联清理，session_kbs 无孤儿。"""
    from uni_rag.config import load_settings

    r = client.post("/api/kbs", json={"name": "demo2"})
    assert r.status_code == 200, r.text

    with open(_sample_md(), "rb") as f:
        r = client.post(
            "/api/kbs/demo2/ingest",
            files={"file": ("sample.md", f, "text/markdown")},
        )
    assert r.status_code == 200, r.text

    # 绑定一个 session
    r = client.post("/api/sessions/sess-r4/kbs", json={"kb_ids": ["demo2"]})
    assert r.status_code == 200, r.text

    kb_dir = load_settings().data_dir / "kbs" / "demo2"
    assert kb_dir.exists()

    r = client.delete("/api/kbs/demo2")
    assert r.status_code == 200, r.text
    assert not kb_dir.exists()  # 落盘目录级联清理

    # foreign_keys=ON：session 绑定随 KB 删除级联清空
    r = client.get("/api/sessions/sess-r4/kbs")
    assert r.status_code == 200
    assert r.json()["kbs"] == []
