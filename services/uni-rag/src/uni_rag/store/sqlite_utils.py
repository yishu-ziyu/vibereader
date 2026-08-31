"""SQLite 连接小助手：统一开启 PRAGMA foreign_keys。

sqlite3 默认 foreign_keys=OFF，导致 KBStore 里 session_kbs 的
ON DELETE CASCADE 形同虚设（审计债 D12）。PRAGMA foreign_keys 是
per-connection 设置，必须在每个连接创建处执行，因此所有 store
统一改用本 helper 建连接。
"""
from __future__ import annotations

import sqlite3
from pathlib import Path


def connect(db_path: Path | str) -> sqlite3.Connection:
    """创建一个开启了 foreign_keys 的 SQLite 连接。

    用法与 sqlite3.connect 一致（支持 with conn: 上下文管理器，
    退出时自动 commit）。必须在建连后、执行其他语句前设置 PRAGMA，
    否则在事务内设置会静默失效。
    """
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn
