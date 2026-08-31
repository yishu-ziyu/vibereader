"""文档列表 API 和 chunk 预览的行为验证。"""
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from uni_rag.api.app import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    from uni_rag import config as config_module
    from uni_rag.api import routes as routes_module
    config_module._settings = None
    routes_module._pipeline = None
    app = create_app()
    return TestClient(app)


class TestDocumentList:
    def test_sources_empty_initially(self, client):
        """初始状态 sources 列表为空。"""
        r = client.get("/api/sources")
        assert r.status_code == 200
        assert r.json()["documents"] == []

    def test_chunks_nonexistent_file_returns_empty(self, client):
        """查询不存在的文件应返回空 chunks 而非 500。"""
        r = client.get("/api/documents/nonexistent.pdf/chunks")
        assert r.status_code == 200
        assert r.json()["chunks"] == []

    def test_query_empty_question_accepted(self, client):
        """空问题字符串通过 Pydantic 验证（schema 无 min_length），不会被拦截。

        这是当前行为的记录：空字符串会被传给 pipeline，pipeline 层决定
        如何处理。如果业务需要拦截空问题，应在 QueryRequest schema 加
        min_length=1 约束。
        """
        def fake_complete(self, system, max_tokens=1024):
            return "empty"
        from unittest.mock import patch
        with patch("uni_rag.llm.client.LLMClient.complete", fake_complete):
            r = client.post("/api/query", json={"question": ""})
        # 当前 schema 无 min_length，空字符串通过验证
        assert r.status_code == 200
