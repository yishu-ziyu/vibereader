"""各 query mode 的行为验证 -- 验证非 chat 模式不返回 citations。"""
import pytest
from unittest.mock import MagicMock
from uni_rag.rag.pipeline import RAGPipeline


@pytest.fixture
def pipeline_with_chunks(tmp_path, monkeypatch):
    """带 mock chunks 的 pipeline。"""
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    from uni_rag import config as cfg
    cfg._settings = None

    pipeline = RAGPipeline.__new__(RAGPipeline)
    pipeline.uploads_dir = tmp_path
    pipeline.retriever = MagicMock()
    pipeline.retriever.retrieve.return_value = [
        {"id": "abc:0", "document": "Test text.", "metadata": {"source": "test.pdf", "section": "", "page": 1}}
    ]
    pipeline.session_store = MagicMock()
    pipeline.session_store.get_recent.return_value = []
    pipeline.llm = MagicMock()
    pipeline.llm.complete.return_value = "Answer with citation [abc:0]."
    pipeline.llm.clear_messages = MagicMock()
    pipeline.llm.add_user_message = MagicMock()
    pipeline.llm.add_assistant_message = MagicMock()
    pipeline.llm.with_provider = MagicMock(return_value=pipeline.llm)
    pipeline.llm.with_api_key = MagicMock(return_value=pipeline.llm)
    return pipeline


class TestModeCitations:
    """非 chat 模式不应返回 citations（pipeline.py 第 82 行逻辑）。"""

    def test_chat_mode_extracts_citations(self, pipeline_with_chunks):
        """chat 模式应该提取 citations。"""
        result = pipeline_with_chunks.query("test", mode="chat")
        assert isinstance(result["citations"], list)

    def test_flashcards_mode_no_citations(self, pipeline_with_chunks):
        """闪卡模式不应提取 citations。"""
        result = pipeline_with_chunks.query("test", mode="flashcards")
        assert result["citations"] == []

    def test_quiz_mode_no_citations(self, pipeline_with_chunks):
        """测验模式不应提取 citations。"""
        result = pipeline_with_chunks.query("test", mode="quiz")
        assert result["citations"] == []

    def test_graph_mode_no_citations(self, pipeline_with_chunks):
        """知识图谱模式不应提取 citations。"""
        result = pipeline_with_chunks.query("test", mode="graph")
        assert result["citations"] == []

    def test_translate_mode_no_citations(self, pipeline_with_chunks):
        """翻译模式不应提取 citations。"""
        result = pipeline_with_chunks.query("test", mode="translate")
        assert result["citations"] == []
