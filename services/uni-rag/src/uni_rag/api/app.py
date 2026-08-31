"""FastAPI app factory."""
from __future__ import annotations
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from uni_rag.api.routes import router
from uni_rag.config import load_settings
from uni_rag.logging_setup import setup_logging
from uni_rag.store.kb import KBStore
from uni_rag.store.jobs import JobStore


logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    setup_logging()
    settings = load_settings()
    # 启动时打印最终解析出的数据目录，便于发现 env 名称错位
    # （如误设 UNI_RAG_DATA_DIR 而实际读取 UNI_RAG_DATA_DIR_PATH）。
    logger.info(
        "uni-rag 数据目录 data_dir=%s（UNI_RAG_DATA_DIR_PATH=%r）",
        settings.data_dir,
        settings.data_dir_path,
    )
    app = FastAPI(title="uni-rag", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^http://(127\.0\.0\.1|localhost):\d+$",
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    KBStore(settings.kb_db_path).ensure_default()
    # R6：job 表启动维护（audit D11）。
    # 1) 重启后 queued/running 的工作线程已丢失，一次性标记为 failed，
    #    让 Reader 轮询立即得到明确终态；
    # 2) 清理超过 24h 的终态 job（completed/failed），防止表无限增长。
    jobs = JobStore(settings.jobs_db_path)
    recovered = jobs.recover_interrupted()
    cleaned = jobs.cleanup_terminal(max_age_hours=24)
    if recovered or cleaned:
        logger.info("job 表启动维护：中断任务标记 failed=%d，过期终态清理=%d", recovered, cleaned)
    app.include_router(router)

    # 静态前端
    web_dir = Path(__file__).resolve().parents[1] / "web"
    if web_dir.exists():
        app.mount("/static", StaticFiles(directory=str(web_dir)), name="static")

        @app.get("/")
        def index():
            return FileResponse(str(web_dir / "index.html"))

    return app
