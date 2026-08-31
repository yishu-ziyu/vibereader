"""parsed sidecar（解析全文）与 citation span 定位测试。

说明：IngestPipeline/RAGPipeline 正常初始化会加载 BGE-M3（首次需下载模型），
为避免测试依赖模型下载，这里：
  1. 用 monkeypatch 把 uni_rag.ingest.pipeline.get_embedder 替换为轻量桩
     （仅纯函数级，不触发任何模型加载），验证 ingest 后 sidecar 存在；
  2. 直接调用 rag/pipeline.resolve_source_text 纯函数，验证 span 定位
     优先读 sidecar、回退 uploads 原文。
"""
import pytest
from pathlib import Path

import uni_rag.config as cfg
import uni_rag.ingest.pipeline as ingest_pipeline_module
from uni_rag.rag.pipeline import resolve_source_text
from uni_rag.cite.locator import locate_citation


FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


class _FakeEmbedder:
    """零维开销的桩 embedder，避免测试触发 BGE-M3 模型下载。"""

    dim = 4

    def embed(self, texts):
        return [[0.1, 0.2, 0.3, 0.4] for _ in texts]


def _reset_settings(monkeypatch, tmp_path):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    cfg._settings = None


def test_ingest_writes_parsed_sidecar(tmp_path, monkeypatch):
    """ingest 完成后必须留有解析全文 sidecar <data_dir>/parsed/<source_id>.md。"""
    _reset_settings(monkeypatch, tmp_path)
    monkeypatch.setattr(
        ingest_pipeline_module, "get_embedder", lambda: _FakeEmbedder()
    )
    pipeline = ingest_pipeline_module.IngestPipeline()

    result = pipeline.ingest_file(FIXTURES_DIR / "sample.md")

    source_id = result["source_id"]
    sidecar = cfg.load_settings().parsed_dir / f"{source_id}.md"
    assert sidecar.exists(), "ingest 后应生成解析全文 sidecar"
    content = sidecar.read_text(encoding="utf-8")
    assert content.strip()
    # sidecar 是解析后的全文，应包含 fixture 的关键内容
    assert "Supervised learning" in content


def test_resolve_source_text_prefers_sidecar_and_locates_span(tmp_path):
    """sidecar 存在时优先使用；PDF 二进制原文不应导致 span 定位失败。"""
    parsed_dir = tmp_path / "parsed"
    uploads_dir = tmp_path / "uploads"
    parsed_dir.mkdir()
    uploads_dir.mkdir()

    full_text = (
        "# Chapter 1\n\n"
        "Supervised learning uses labeled data. "
        "The model learns from input-output pairs.\n"
    )
    source_id = "abc123def4567890"
    (parsed_dir / f"{source_id}.md").write_text(full_text, encoding="utf-8")
    # uploads 里的同名原文是二进制（模拟 PDF 乱码场景）
    (uploads_dir / "sample.pdf").write_bytes(b"%PDF-1.7 \x00\x01\x02 binary garbage")

    full = resolve_source_text(parsed_dir, uploads_dir, f"{source_id}:0", "sample.pdf")
    assert full == full_text, "应读取 sidecar 而非 uploads 里的二进制原文"

    phrase, span = locate_citation(full, "Supervised learning uses labeled data.")
    assert span is not None, "基于 sidecar 全文应能命中 span"
    start, end = span
    assert full[start:end] == phrase


def test_resolve_source_text_falls_back_to_uploads(tmp_path):
    """sidecar 不存在时（旧数据）回退读 uploads 原文，保持旧行为。"""
    parsed_dir = tmp_path / "parsed"
    uploads_dir = tmp_path / "uploads"
    uploads_dir.mkdir(parents=True)

    (uploads_dir / "note.md").write_text("plain fallback text", encoding="utf-8")
    full = resolve_source_text(parsed_dir, uploads_dir, "deadbeef00000000:12", "note.md")
    assert full == "plain fallback text"

    # 两侧都不存在 → None，不抛异常
    assert resolve_source_text(parsed_dir, uploads_dir, "ffffffff00000000:0", "ghost.md") is None
