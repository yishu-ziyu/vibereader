"""Session store: persists multi-turn Q&A for follow-up context."""
import pytest
from uni_rag.session.store import SessionStore


@pytest.fixture
def store(tmp_path):
    db = tmp_path / "sessions.db"
    return SessionStore(db)


def test_create_and_get(store):
    sid = store.create()
    assert store.get(sid) == []


def test_append_messages(store):
    sid = store.create()
    store.append(sid, "user", "hi")
    store.append(sid, "assistant", "hello")
    msgs = store.get(sid)
    assert len(msgs) == 2
    assert msgs[0] == {"role": "user", "content": "hi"}
    assert msgs[1] == {"role": "assistant", "content": "hello"}


def test_clear(store):
    sid = store.create()
    store.append(sid, "user", "x")
    store.clear(sid)
    assert store.get(sid) == []


def test_get_recent_returns_last_n(store):
    """get_recent 返回按时间正序排列的最近 N 条；超过 limit 只留尾部。"""
    sid = store.create()
    for i in range(5):
        store.append(sid, "user", f"q{i}")
        store.append(sid, "assistant", f"a{i}")
    # 总 10 条，取最后 4 条
    recent = store.get_recent(sid, limit=4)
    assert len(recent) == 4
    assert recent[0]["content"] == "q3"
    assert recent[-1]["content"] == "a4"


def test_get_recent_handles_smaller_history(store):
    """不足 limit 时返回全部。"""
    sid = store.create()
    store.append(sid, "user", "only")
    recent = store.get_recent(sid, limit=10)
    assert len(recent) == 1
    assert recent[0] == {"role": "user", "content": "only"}
