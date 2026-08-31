"""SQLite-backed job store（审计债 D11：内存字典 _ingest_jobs/_memory_jobs 重启即失）。

以 data/jobs.db 持久化 ingest / memory 两类 job 的状态，重启后
Reader 仍可查询历史 job。响应 schema 与状态机保持不变：
GET /api/ingest/jobs/{id}、GET /api/memory/jobs/{id} 的字段照旧。

表结构（jobs）：
    job_id      主键
    kind        'ingest' | 'memory'
    status      queued / running / completed / failed（TEXT，保留既有 queued 态）
    progress    0-100（对应响应里的 percent 字段）
    step        当前阶段名
    message     用户可见文案
    error       失败原因（可空）
    created_at / updated_at   ISO 8601 UTC
    payload_json              其余字段的 JSON（filename、result 等），
                              保证内存字典既有字段全量容纳

重启语义：
  - 终态 job（completed/failed）保留 24h，过期由 cleanup_terminal 清理；
  - 进行中的 job（queued/running）重启后工作线程已不存在，属于自然丢失，
    在应用启动时由 recover_interrupted 一次性标记为 failed（附提示文案），
    而不是留给清理逻辑静默蒸发——Reader 轮询能立即得到明确终态。
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from uni_rag.store.sqlite_utils import connect

# 写入列的固定字段；其余字段进 payload_json。
# 旧内存字典用 "percent" 键，表列叫 progress，两者等价映射。
_COLUMN_FIELDS = {"status", "progress", "step", "message", "error"}
# 不落入 payload_json 的冗余键：列字段 + percent 别名 + job_id/kind（已有列）
_NON_PAYLOAD_FIELDS = _COLUMN_FIELDS | {"percent", "job_id", "kind"}


def _read_progress(fields: dict) -> int:
    return int(fields.get("progress", fields.get("percent", 0)))


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class JobStore:
    """持久化 job 状态。kind 区分 'ingest' 与 'memory' 两类 job。"""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    progress INTEGER NOT NULL DEFAULT 0,
                    step TEXT NOT NULL DEFAULT '',
                    message TEXT NOT NULL DEFAULT '',
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL DEFAULT '{}'
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_jobs_status_updated "
                "ON jobs(status, updated_at)"
            )

    def create(self, job_id: str, kind: str, fields: dict | None = None, /) -> None:
        """新建 job 记录（已存在则整体覆盖，语义与旧内存字典 setdefault 一致）。

        参数为 positional-only：调用方会把 job_id 等同名键塞进 fields，
        不能让它们与方法形参冲突。
        """
        fields = dict(fields or {})
        now = _now()
        payload = {k: v for k, v in fields.items() if k not in _NON_PAYLOAD_FIELDS}
        with connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO jobs (job_id, kind, status, progress, step, message,
                                  error, created_at, updated_at, payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    kind=excluded.kind, status=excluded.status,
                    progress=excluded.progress, step=excluded.step,
                    message=excluded.message, error=excluded.error,
                    updated_at=excluded.updated_at, payload_json=excluded.payload_json
                """,
                (
                    job_id,
                    kind,
                    str(fields.get("status", "queued")),
                    _read_progress(fields),
                    str(fields.get("step", "")),
                    str(fields.get("message", "")),
                    fields.get("error"),
                    now,
                    now,
                    json.dumps(payload, ensure_ascii=False),
                ),
            )

    def update(self, job_id: str, kind: str, /, **updates) -> None:
        """合并更新 job 字段（等价于旧内存字典的 {**current, **updates}）。

        固定列字段直接写列；其余字段合并进 payload_json。
        job 不存在时按 create 语义落库（与旧 _set_*_job 行为一致）。
        参数为 positional-only：updates 里可能带同名 job_id 键。
        """
        with connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT payload_json FROM jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
        if row is None:
            self.create(job_id, kind, updates)
            return
        payload = json.loads(row[0]) if row[0] else {}
        for key, value in updates.items():
            if key in _NON_PAYLOAD_FIELDS:
                continue
            payload[key] = value
        with connect(self.db_path) as conn:
            conn.execute(
                """
                UPDATE jobs
                SET status = ?, progress = ?, step = ?, message = ?, error = ?,
                    updated_at = ?, payload_json = ?
                WHERE job_id = ?
                """,
                (
                    str(updates.get("status", "queued")),
                    _read_progress(updates),
                    str(updates.get("step", "")),
                    str(updates.get("message", "")),
                    updates.get("error"),
                    _now(),
                    json.dumps(payload, ensure_ascii=False),
                    job_id,
                ),
            )

    def get(self, job_id: str, /) -> dict | None:
        """还原为一个与旧内存字典同构的 dict（progress 列映射 percent）。"""
        with connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT job_id, status, progress, step, message, error, payload_json "
                "FROM jobs WHERE job_id = ?",
                (job_id,),
            ).fetchone()
        if row is None:
            return None
        payload = json.loads(row[6]) if row[6] else {}
        job = {"job_id": row[0]}
        job.update(payload)
        job.update({
            "status": row[1],
            "percent": row[2],
            "step": row[3],
            "message": row[4],
            "error": row[5],
        })
        return job

    def recover_interrupted(self) -> int:
        """应用启动时一次性把 queued/running job 标记为 failed。

        重启后工作线程已丢失，这些 job 永远不会推进；给 Reader 一个
        明确的失败终态而不是让轮询悬挂。返回被标记的 job 数。
        """
        with connect(self.db_path) as conn:
            cur = conn.execute(
                """
                UPDATE jobs
                SET status = 'failed', step = 'failed', progress = 100,
                    message = '服务重启导致任务中断，请重新提交。',
                    error = 'interrupted by service restart',
                    updated_at = ?
                WHERE status IN ('queued', 'running')
                """,
                (_now(),),
            )
            return cur.rowcount

    def cleanup_terminal(self, max_age_hours: int = 24) -> int:
        """删除超过 max_age_hours 的终态 job（completed/failed），返回删除数。"""
        cutoff = time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - max_age_hours * 3600)
        )
        with connect(self.db_path) as conn:
            cur = conn.execute(
                "DELETE FROM jobs "
                "WHERE status IN ('completed', 'failed') AND updated_at < ?",
                (cutoff,),
            )
            return cur.rowcount
