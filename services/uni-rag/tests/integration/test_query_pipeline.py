"""Integration test: end-to-end query with mocked LLM."""
import pytest
from pathlib import Path
from uni_rag.rag.pipeline import RAGPipeline


@pytest.fixture
def pipeline(tmp_path, monkeypatch):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    import uni_rag.config as cfg
    cfg._settings = None
    p = RAGPipeline()
    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    p.ingest_file(pdf)
    return p


def test_query_returns_answer_and_citations(pipeline, monkeypatch):
    """Mock the LLM call to avoid network in unit test."""
    def fake_complete(self, system, max_tokens=1024):
        return "Supervised learning uses labeled data. [src1:100] [src1:200]"
    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)

    result = pipeline.query("What is supervised learning?")
    assert "answer" in result
    assert "citations" in result
    assert len(result["citations"]) > 0


def test_query_with_session_uses_history(pipeline, monkeypatch):
    def fake_complete(self, system, max_tokens=1024):
        return "ok"
    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)

    sid = "test-session"
    pipeline.query("first question", session_id=sid)
    pipeline.query("follow up", session_id=sid)
    history = pipeline.session_store.get(sid)
    assert len(history) == 4  # 2 user + 2 assistant


def test_long_session_uses_only_recent_history(pipeline, monkeypatch):
    """30+ 轮 session，query() 注入到 LLM 的 history 不应超过 max_session_messages。"""
    captured: list[int] = []

    def fake_complete(self, system, max_tokens=1024):
        # 记录 LLM 当前持有的 message 数（不含 system prompt）
        captured.append(len(self._messages))
        return "ok"

    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)

    from uni_rag.config import load_settings
    settings = load_settings()
    original = settings.max_session_messages
    settings.max_session_messages = 6  # 临时调小方便测试

    try:
        sid = "long-session"
        # 30 轮 = 60 条消息
        for i in range(30):
            pipeline.query(f"q{i}", session_id=sid)

        # 每次 query() 注入的 message 数（含本轮 user）必须 <= cap
        assert all(n <= settings.max_session_messages for n in captured), (
            f"some calls exceeded cap: {captured}"
        )
    finally:
        settings.max_session_messages = original


def test_multi_kb_isolation(tmp_path, monkeypatch):
    """上传到 KB A 的内容，不应在 KB B 的检索中出现。"""
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    import uni_rag.config as cfg
    cfg._settings = None

    from uni_rag.store.kb import KBStore
    kb_store = KBStore(tmp_path / "kbs.db")
    kb_store.create("alpha", "alpha 课", kb_id="alpha")
    kb_store.create("beta", "beta 课", kb_id="beta")

    # 准备两份 fixture
    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    other = tmp_path / "beta.pdf"
    other.write_bytes(pdf.read_bytes())

    # 入库到两个 KB
    p_alpha = RAGPipeline(kb_id="alpha")
    p_alpha.ingest_file(pdf, original_name="alpha.pdf")
    p_beta = RAGPipeline(kb_id="beta")
    p_beta.ingest_file(other, original_name="beta.pdf")

    # alpha pipeline 检索，只能看到 alpha
    a_results = p_alpha.retriever.retrieve("supervised learning", top_k=10)
    assert all(r["metadata"].get("source") == "alpha.pdf" for r in a_results)

    # beta pipeline 检索，只能看到 beta
    b_results = p_beta.retriever.retrieve("supervised learning", top_k=10)
    assert all(r["metadata"].get("source") == "beta.pdf" for r in b_results)
