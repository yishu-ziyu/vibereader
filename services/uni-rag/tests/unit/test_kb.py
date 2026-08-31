"""Unit tests for KBStore (SQLite-backed knowledge base CRUD + session binding)."""
import pytest
from uni_rag.store.kb import KBStore


@pytest.fixture
def store(tmp_path):
    return KBStore(tmp_path / "kbs.db")


def test_kbstore_create_and_get(store):
    kb = store.create("CS101", "课程笔记")
    assert kb["id"] == "cs101"
    assert kb["name"] == "CS101"
    assert kb["description"] == "课程笔记"
    assert "created_at" in kb
    assert store.get("cs101") == kb


def test_kbstore_list(store):
    store.create("CS101", "课程笔记")
    store.create("KAOYAN", "考研真题")
    kbs = store.list()
    ids = {k["id"] for k in kbs}
    assert ids == {"cs101", "kaoyan"}


def test_kbstore_duplicate_id_raises(store):
    store.create("CS101", "x")
    with pytest.raises(ValueError, match="exists"):
        store.create("CS101", "y")


def test_kbstore_invalid_id_raises(store):
    with pytest.raises(ValueError, match="invalid"):
        store.create("", "bad")  # 空 ID 没有可绑定的知识库标识
    with pytest.raises(ValueError, match="invalid"):
        store.create("CS 101", "bad")  # 含空格
    with pytest.raises(ValueError, match="invalid"):
        store.create("CS-101", "bad")  # 含连字符


def test_kbstore_delete(store):
    store.create("CS101", "x")
    assert store.delete("cs101") is True
    assert store.get("cs101") is None
    assert store.delete("cs101") is False


def test_kbstore_ensure_default_creates_if_missing(tmp_path):
    db_path = tmp_path / "kbs.db"
    store = KBStore(db_path)
    default = store.ensure_default()
    assert default["id"] == "default"
    # 再次调用幂等
    default2 = store.ensure_default()
    assert default2["id"] == "default"
    assert default["created_at"] == default2["created_at"]


def test_kbstore_session_binding(store):
    store.create("CS101", "x")
    store.create("KAOYAN", "y")
    store.bind_session("sess-1", ["cs101", "kaoyan"])
    bound = store.get_session_kbs("sess-1")
    assert {k["id"] for k in bound} == {"cs101", "kaoyan"}


def test_kbstore_session_binding_empty(store):
    store.bind_session("sess-2", [])
    assert store.get_session_kbs("sess-2") == []


def test_kbstore_session_binding_rejects_unknown_kb(store):
    with pytest.raises(ValueError, match="not found"):
        store.bind_session("sess-3", ["nonexistent"])