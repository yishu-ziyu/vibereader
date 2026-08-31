"""R6 Job 落库（审计债 D11）单元测试：JobStore 往返 / 清理 / 重启模拟。

覆盖任务要求的三类场景：
  1. job 创建/更新/查询往返（内存字典字段全量容纳，含 payload 字段保留）；
  2. 旧 job 清理（仅删超期终态，running 不受影响）；
  3. 重启模拟（新 JobStore 实例读同一个库，历史 job 仍可查询）。
"""
from __future__ import annotations

import sqlite3

import pytest

from uni_rag.store.jobs import JobStore


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "jobs.db"


def _make_job(store: JobStore, job_id: str = "job-1") -> None:
    """按 routes 创建 ingest job 的真实字段构造初始记录。"""
    store.create(
        job_id,
        "ingest",
        {
            "job_id": job_id,
            "status": "queued",
            "step": "queued",
            "percent": 1,
            "message": "已收到文件，准备开始解析。",
            "filename": "sample.pdf",
            "result": None,
            "error": None,
        },
    )


def test_job_create_update_get_roundtrip(db_path):
    store = JobStore(db_path)
    _make_job(store)

    job = store.get("job-1")
    assert job is not None
    assert job["job_id"] == "job-1"
    assert job["status"] == "queued"
    assert job["percent"] == 1
    assert job["step"] == "queued"
    assert job["message"] == "已收到文件，准备开始解析。"
    assert job["filename"] == "sample.pdf"  # payload 字段
    assert job["result"] is None
    assert job["error"] is None

    # 部分更新（等价旧内存字典的 merge 语义）：payload 字段必须保留
    store.update(
        "job-1", "ingest",
        status="running", percent=42, step="parsing", message="正在解析文档内容",
    )
    job = store.get("job-1")
    assert job["status"] == "running"
    assert job["percent"] == 42
    assert job["filename"] == "sample.pdf"

    # 终态更新：result 落 payload，error 列为 NULL
    store.update(
        "job-1", "ingest",
        status="completed", percent=100, step="done",
        message="入库完成，可以开始提问。", result={"source_id": "abc", "chunks": 3},
    )
    job = store.get("job-1")
    assert job["status"] == "completed"
    assert job["result"] == {"source_id": "abc", "chunks": 3}
    assert job["error"] is None


def test_job_update_missing_row_creates(db_path):
    """旧 _set_*_job 对新 id 直接落一条记录；update 应保持该语义。"""
    store = JobStore(db_path)
    store.update("job-x", "memory", status="failed", percent=100,
                 step="failed", message="记忆持久化失败", error="boom")
    job = store.get("job-x")
    assert job["status"] == "failed"
    assert job["error"] == "boom"


def test_get_missing_job_returns_none(db_path):
    store = JobStore(db_path)
    assert store.get("nope") is None


def test_recover_interrupted_marks_running_and_queued_failed(db_path):
    store = JobStore(db_path)
    _make_job(store, "job-q")  # queued
    store.create("job-r", "ingest", {"status": "running", "percent": 50, "step": "parsing"})
    store.create("job-c", "ingest", {"status": "completed", "percent": 100})
    store.create("job-f", "ingest", {"status": "failed", "percent": 100})

    recovered = store.recover_interrupted()
    assert recovered == 2  # 只处理 queued/running

    assert store.get("job-q")["status"] == "failed"
    assert store.get("job-r")["status"] == "failed"
    assert "重启" in store.get("job-r")["message"]
    # 终态不受影响
    assert store.get("job-c")["status"] == "completed"
    assert store.get("job-f")["status"] == "failed"


def test_cleanup_terminal_removes_only_expired_terminal_jobs(db_path):
    store = JobStore(db_path)
    _make_job(store)
    store.update("job-1", "ingest", status="completed", percent=100, step="done", message="ok")
    store.create("job-old", "ingest", {"status": "completed", "percent": 100})
    store.create("job-old-failed", "memory", {"status": "failed", "percent": 100})
    store.create("job-running", "ingest", {"status": "running", "percent": 10})

    # 用原始 SQL 把两个 job 回拨成 25h 前的终态
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "UPDATE jobs SET updated_at = '2020-01-01T00:00:00Z' "
            "WHERE job_id IN ('job-old', 'job-old-failed')"
        )

    deleted = store.cleanup_terminal(max_age_hours=24)
    assert deleted == 2
    assert store.get("job-old") is None
    assert store.get("job-old-failed") is None
    # 新终态（24h 内）与运行中的 job 都保留
    assert store.get("job-1") is not None
    assert store.get("job-running") is not None


def test_restart_simulation_new_store_instance_reads_same_db(db_path):
    """重启模拟：旧实例写入后，新实例读同一个库文件应看到全部状态。"""
    store1 = JobStore(db_path)
    _make_job(store1)
    store1.update("job-1", "ingest", status="completed", percent=100,
                  step="done", message="ok", result={"chunks": 7})

    # 模拟重启：全新实例指向同一 db
    store2 = JobStore(db_path)
    job = store2.get("job-1")
    assert job is not None
    assert job["status"] == "completed"
    assert job["percent"] == 100
    assert job["filename"] == "sample.pdf"
    assert job["result"] == {"chunks": 7}

    # 新实例继续可写（重启后新的 job 更新照常落库）
    store2.update("job-2", "ingest", status="queued", percent=1, step="queued")
    assert store1.get("job-2")["status"] == "queued"
