"""Integration test: FastAPI app end-to-end."""
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from uni_rag.api.app import create_app


def _weasyprint_renders() -> bool:
    try:
        from weasyprint import HTML
        HTML(string="<html><body>ok</body></html>").write_pdf()
        return True
    except Exception:
        return False


_pdf_required = pytest.mark.skipif(
    not _weasyprint_renders(),
    reason="weasyprint native deps not loadable on this host",
)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    import uni_rag.config as config_module
    import uni_rag.api.routes as routes_module

    # We must explicitly wipe singletons because FastAPI's app state persists across test runs
    config_module._settings = None
    routes_module._pipeline = None
    if hasattr(routes_module, '_kb_store_instance'):
        routes_module._kb_store_instance = None
    if hasattr(routes_module, '_pipeline_instances'):
        routes_module._pipeline_instances.clear()

    # The store instances cache might be in store modules
    import uni_rag.store.kb

    app = create_app()
    return TestClient(app)


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_ingest_job_reports_progress(client):
    """POST /api/ingest/jobs 后可轮询进度，用户不会在解析和向量化阶段空等。"""
    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    with open(pdf, "rb") as f:
        r = client.post(
            "/api/ingest/jobs",
            files={"file": ("sample.pdf", f, "application/pdf")},
        )
    assert r.status_code == 200, r.text
    status_url = r.json()["status_url"]

    import time
    seen = []
    for _ in range(180):
        time.sleep(0.2)
        r = client.get(status_url)
        assert r.status_code == 200, r.text
        data = r.json()
        seen.append(data["status"])
        assert 0 <= data["percent"] <= 100
        assert data["message"]
        if data["status"] == "completed":
            assert data["result"]["chunks"] > 0
            break
    else:
        raise AssertionError(f"ingest job did not complete; seen={seen[-5:]}")


def test_ingest_sanitizes_uploaded_filename(client, tmp_path):
    """上传文件名包含 ../ 时，应该被 sanitize。"""
    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    with open(pdf, "rb") as f:
        r = client.post(
            "/api/ingest",
            files={"file": ("../escape.pdf", f, "application/pdf")},
        )
    assert r.status_code == 200, r.text

    assert "../" not in r.json()["filename"]
    assert "escape.pdf" in r.json()["filename"]

def test_upload_and_query(client, tmp_path, monkeypatch):
    def fake_complete(self, system, max_tokens=1024):
        return "answer with [src]"
    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)

    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    with open(pdf, "rb") as f:
        r = client.post("/api/ingest", files={"file": ("sample.pdf", f, "application/pdf")})
    assert r.status_code == 200
    assert r.json()["chunks"] > 0

    r = client.post("/api/query", json={"question": "what is supervised learning?"})
    assert r.status_code == 200
    assert "answer" in r.json()


def test_query_llm_failure_returns_user_friendly_error(client, monkeypatch):
    """调用失败时，应看到可理解的错误。"""
    def boom(self, system, max_tokens=1024):
        raise RuntimeError("provider exploded")

    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", boom)
    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    with open(pdf, "rb") as f:
        r = client.post("/api/ingest", files={"file": ("sample.pdf", f, "application/pdf")})
    assert r.status_code == 200

    r = client.post("/api/query", json={"question": "what is supervised learning?"})
    assert r.status_code == 502
    assert "失败" in r.json()["detail"]

def test_get_document_chunks(client, tmp_path, monkeypatch):
    """GET /api/documents/{filename}/chunks returns the file's chunks."""
    def fake_complete(self, system, max_tokens=1024):
        return "ok"
    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)

    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    with open(pdf, "rb") as f:
        r = client.post("/api/ingest", files={"file": ("sample.pdf", f, "application/pdf")})
    assert r.status_code == 200

    r = client.get("/api/documents/sample.pdf/chunks")
    assert r.status_code == 200
    data = r.json()
    assert "chunks" in data
    assert len(data["chunks"]) > 0
    first = data["chunks"][0]
    assert {"id", "text", "span"} <= set(first.keys())


def test_export_message_markdown(client, tmp_path, monkeypatch):
    """GET .../export?format=md 返回 markdown 文件下载。"""
    def fake_complete(self, system, max_tokens=1024):
        return "answer with [src]"
    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)

    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    with open(pdf, "rb") as f:
        r = client.post("/api/ingest", files={"file": ("sample.pdf", f, "application/pdf")})
    assert r.status_code == 200

    # 发一个问题
    r = client.post("/api/query", json={"question": "what is supervised learning?"})
    assert r.status_code == 200

    # 从 SessionStore 拿到 session_id 和 message seq
    from uni_rag.config import load_settings
    from uni_rag.session.store import SessionStore
    sess = SessionStore(load_settings().sessions_db_path)
    # 找任意一个非空 session
    import sqlite3
    with sqlite3.connect(load_settings().sessions_db_path) as conn:
        rows = conn.execute("SELECT DISTINCT session_id FROM messages LIMIT 1").fetchall()
    assert rows
    sid = rows[0][0]
    # 第一个 assistant message 是 seq=2（user 是 seq=1）
    r = client.get(f"/api/sessions/{sid}/messages/2/export?format=md")
    assert r.status_code == 200
    assert "text/markdown" in r.headers["content-type"]
    body = r.text
    assert "# 问答记录" in body
    assert "## 问题" in body


def test_export_message_pdf(client, tmp_path, monkeypatch):
    """GET .../export?format=pdf 返回 application/pdf bytes。"""
    def fake_complete(self, system, max_tokens=1024):
        return "answer with [src]"
    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)

    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    with open(pdf, "rb") as f:
        client.post("/api/ingest", files={"file": ("sample.pdf", f, "application/pdf")})
    client.post("/api/query", json={"question": "q"})

    from uni_rag.config import load_settings
    import sqlite3
    with sqlite3.connect(load_settings().sessions_db_path) as conn:
        rows = conn.execute("SELECT DISTINCT session_id FROM messages LIMIT 1").fetchall()
    sid = rows[0][0]
    r = client.get(f"/api/sessions/{sid}/messages/2/export?format=pdf")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF-")


@_pdf_required
def test_export_message_pdf(client, tmp_path, monkeypatch):
    """GET .../export?format=pdf 返回 application/pdf bytes。"""
    def fake_complete(self, system, max_tokens=1024):
        return "answer with [src]"
    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)

    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    with open(pdf, "rb") as f:
        client.post("/api/ingest", files={"file": ("sample.pdf", f, "application/pdf")})
    client.post("/api/query", json={"question": "q"})

    from uni_rag.config import load_settings
    import sqlite3
    with sqlite3.connect(load_settings().sessions_db_path) as conn:
        rows = conn.execute("SELECT DISTINCT session_id FROM messages LIMIT 1").fetchall()
    sid = rows[0][0]
    r = client.get(f"/api/sessions/{sid}/messages/2/export?format=pdf")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF-")


def test_export_message_invalid_format(client, tmp_path):
    from uni_rag.config import load_settings
    from uni_rag.session.store import SessionStore
    sid = SessionStore(load_settings().sessions_db_path).create()
    SessionStore(load_settings().sessions_db_path).append(sid, "user", "q")
    SessionStore(load_settings().sessions_db_path).append(sid, "assistant", "a")
    r = client.get(f"/api/sessions/{sid}/messages/1/export?format=docx")
    assert r.status_code == 400


def test_app_startup_ensures_default_kb(client):
    """启动 Web 服务时自动创建 default KB，老用户升级无需手动迁移。"""
    from uni_rag.config import load_settings
    from uni_rag.store.kb import KBStore

    default = KBStore(load_settings().kb_db_path).get("default")
    assert default is not None


def test_kb_crud_via_api(client):
    """POST /api/kbs 创建，GET /api/kbs 列出，GET /api/kbs/{id} 详情，DELETE 删除。"""
    client.delete("/api/kbs/cs101")  # Clear it just in case

    r = client.post("/api/kbs", json={"name": "CS101", "description": "课程笔记"})
    assert r.status_code == 200, r.text
    kb = r.json()
    assert kb["id"] == "cs101"
    assert kb["name"] == "CS101"

    r = client.get("/api/kbs")
    assert r.status_code == 200
    kbs = r.json()["kbs"]
    assert any(k["id"] == "cs101" for k in kbs)

    r = client.get("/api/kbs/cs101")
    assert r.status_code == 200
    assert r.json()["id"] == "cs101"

    r = client.delete("/api/kbs/cs101")
    assert r.status_code == 200
    assert r.json()["deleted"] is True

    r = client.get("/api/kbs/cs101")
    assert r.status_code == 404


def test_kb_document_list_survives_page_refresh(client):
    """已入库文档应能被重新列出，避免刷新页面后用户以为资料丢失。"""
    client.delete("/api/kbs/cs101_refresh")  # Clear it just in case

    r = client.post("/api/kbs", json={"id": "cs101_refresh", "name": "CS101", "description": "课程笔记"})
    assert r.status_code == 200, r.text

    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    with open(pdf, "rb") as f:
        r = client.post(
            "/api/kbs/cs101_refresh/ingest",
            files={"file": ("sample.pdf", f, "application/pdf")},
        )
    assert r.status_code == 200, r.text

    r = client.get("/api/kbs/cs101_refresh/documents")
    assert r.status_code == 200, r.text
    documents = r.json()["documents"]
    assert len(documents) == 1
    assert documents[0]["filename"] == "sample.pdf"
    assert documents[0]["chunks"] > 0
def test_kb_ingest_uses_kb_scoped_collection(client, tmp_path, monkeypatch):
    """POST /api/kbs/{id}/ingest 入库到该 KB 的 collection。"""
    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete",
                        lambda *a, **kw: "ok")
    client.delete("/api/kbs/cs101_scoped")

    r = client.post("/api/kbs", json={"id": "cs101_scoped", "name": "CS101"})
    assert r.status_code == 200

    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    with open(pdf, "rb") as f:
        r = client.post(
            "/api/kbs/cs101_scoped/ingest",
            files={"file": ("sample.pdf", f, "application/pdf")},
        )
    assert r.status_code == 200, r.text
    assert r.json()["chunks"] > 0

    # 验证 KB-scoped document chunks API 能支撑 citation side panel
    r = client.get("/api/kbs/cs101_scoped/documents/sample.pdf/chunks")
    assert r.status_code == 200, r.text
    assert len(r.json()["chunks"]) > 0

    r = client.post(
        "/api/kbs/cs101_scoped/query",
        json={"question": "what is supervised learning?"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["session_id"]


def test_kb_query_export_uses_same_kb_citations(client, monkeypatch):
    """KB 问答导出应沿用该 KB 的引用，而不是回落到 default KB。"""
    import re

    def fake_complete(self, system, max_tokens=1024):
        prompt = self.messages[-1]["content"]
        m = re.search(r"([a-f0-9]{16}:\d+)", prompt)
        return f"answer [{m.group(1)}]" if m else "answer"

    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)
    client.delete("/api/kbs/cs101_export")

    r = client.post("/api/kbs", json={"id": "cs101_export", "name": "CS101"})
    assert r.status_code == 200, r.text

    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    with open(pdf, "rb") as f:
        r = client.post(
            "/api/kbs/cs101_export/ingest",
            files={"file": ("sample.pdf", f, "application/pdf")},
        )
    assert r.status_code == 200, r.text

    r = client.post("/api/kbs/cs101_export/query", json={"question": "what is supervised learning?"})
    assert r.status_code == 200, r.text
    sid = r.json()["session_id"]
    assert r.json()["citations"]

    r = client.get(f"/api/sessions/{sid}/messages/2/export?format=md")
    assert r.status_code == 200, r.text
    assert "**sample.pdf**" in r.text
    assert "（无引用）" not in r.text


def test_session_kb_binding_via_api(client):
    r = client.post("/api/kbs", json={"name": "A"})
    r = client.post("/api/kbs", json={"name": "B"})

    sid = "test-sess-1"
    r = client.post(
        f"/api/sessions/{sid}/kbs",
        json={"kb_ids": ["a", "b"]},
    )
    assert r.status_code == 200, r.text

    r = client.get(f"/api/sessions/{sid}/kbs")
    assert r.status_code == 200
    bound = r.json()["kbs"]
    assert {k["id"] for k in bound} == {"a", "b"}


def test_ingest_url_job_reports_progress(client, monkeypatch):
    """POST /api/ingest/url 返回 job_id，轮询到 completed。"""
    from uni_rag.ingest.link_extractors import LinkExtractionResult
    fake_result = LinkExtractionResult(
        text="# Hello\n\nThis is extracted content from a webpage.",
        title="Hello",
        source_url="https://example.com/article",
        platform="web",
        content_type="article",
    )
    # pipeline.py uses module-level access (link_extractors.extract),
    # so patching the function on the module works correctly.
    import uni_rag.ingest.link_extractors as _link_mod
    monkeypatch.setattr(_link_mod, "extract", lambda url: fake_result)

    r = client.post("/api/ingest/url", json={"url": "https://example.com/article"})
    assert r.status_code == 200, r.text
    status_url = r.json()["status_url"]

    import time
    for _ in range(180):
        time.sleep(0.2)
        r = client.get(status_url)
        assert r.status_code == 200, r.text
        data = r.json()
        if data["status"] == "completed":
            assert data["result"]["chunks"] > 0
            assert data["result"]["format"] == "url"
            return
        if data["status"] == "failed":
            raise AssertionError(f"job failed: {data}")
    raise AssertionError("ingest url job did not complete in time")


def test_ingest_url_invalid_url_returns_400(client):
    """空 URL 或非 http URL 应返回 400。"""
    r = client.post("/api/ingest/url", json={"url": ""})
    assert r.status_code == 400

    r = client.post("/api/ingest/url", json={"url": "ftp://example.com"})
    assert r.status_code == 400


# ── providers 和 session 持久化测试 ──


def test_providers_endpoint(client):
    """GET /api/providers 应返回 3 个 provider。"""
    r = client.get("/api/providers")
    assert r.status_code == 200
    data = r.json()
    assert "providers" in data
    ids = [p["id"] for p in data["providers"]]
    assert "minimax" in ids
    assert "stepfun" in ids
    assert "local" in ids


def test_session_persist_after_restart(tmp_path, monkeypatch):
    """Session 写入后重新打开 SessionStore，历史不丢失。"""
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    from uni_rag import config as cfg
    cfg._settings = None

    from uni_rag.session.store import SessionStore
    db = tmp_path / "test_sessions.db"
    store1 = SessionStore(db)
    sid = store1.create()
    store1.append(sid, "user", "你好")
    store1.append(sid, "assistant", "你好！有什么可以帮你的？")
    # 模拟服务重启：新建 SessionStore 实例
    store2 = SessionStore(db)
    history = store2.get(sid)
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[0]["content"] == "你好"
    assert history[1]["role"] == "assistant"


def test_llm_receives_session_history(tmp_path, monkeypatch):
    """验证 LLM 收到的 system prompt 构造中包含历史消息。"""
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    from uni_rag import config as cfg
    cfg._settings = None

    from uni_rag.session.store import SessionStore
    from uni_rag.rag.pipeline import RAGPipeline
    from unittest.mock import MagicMock

    # 手动写入历史
    db = tmp_path / "sessions.db"
    store = SessionStore(db)
    sid = store.create()
    store.append(sid, "user", "什么是机器学习？")
    store.append(sid, "assistant", "机器学习是AI的一个分支。")

    # 构造 pipeline，mock retriever 和 LLM
    pipeline = RAGPipeline.__new__(RAGPipeline)
    pipeline.uploads_dir = tmp_path
    pipeline.retriever = MagicMock()
    pipeline.retriever.retrieve.return_value = []
    pipeline.session_store = store
    pipeline.llm = MagicMock()
    pipeline.llm.complete.return_value = "好的。"
    pipeline.llm.clear_messages = MagicMock()
    pipeline.llm.add_user_message = MagicMock()
    pipeline.llm.add_assistant_message = MagicMock()

    # 查询
    pipeline.query("那深度学习呢？", session_id=sid)

    # 验证 LLM 收到了历史消息
    user_calls = [c[0][0] for c in pipeline.llm.add_user_message.call_args_list]
    assistant_calls = [c[0][0] for c in pipeline.llm.add_assistant_message.call_args_list]
    assert "什么是机器学习？" in user_calls
    assert "机器学习是AI的一个分支。" in assistant_calls
