"""Configuration loading from environment variables."""
from __future__ import annotations
import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        env_prefix="UNI_RAG_",
        protected_namespaces=(),
    )

    # LLM 默认配置（MiniMax 是默认 provider）
    llm_base_url: str = "https://api.minimaxi.com/anthropic"
    llm_api_key: str
    llm_model: str = "MiniMax-M3"

    # 数据目录（用 _path 后缀避免和 @property data_dir 冲突）
    data_dir_path: str = "./data"

    # 解析全文 sidecar 目录（ingest 时写入 <parsed_dir>/<source_id>.md）。
    # 留空则跟随 data_dir/parsed，保证 Docker 单卷部署下路径一致。
    parsed_dir_path: str = ""

    # Session 长度上限
    max_session_messages: int = 20

    # Citation verification
    cite_similarity_threshold: float = 0.45

    # R5 记忆语义检索：saved_memories 向量命中的 cosine 相似度阈值，
    # 低于该值不进入向量结果，检索降级 LIKE / 最近记录兜底。
    memory_similarity_threshold: float = 0.30

    # LlamaCloud (LlamaParse)
    llama_cloud_api_key: str | None = None

    # MinerU API (替代本地 LlamaParse)
    mineru_api_token: str | None = None
    mineru_api_base: str = "https://mineru.net/api/v4"

    # ── Provider registry ──
    stepfun_base_url: str = "https://api.stepfun.com/step_plan"
    stepfun_api_key: str | None = None
    stepfun_model: str = "step-3.7-flash"

    cli_proxy_base_url: str = "http://127.0.0.1:8317"
    cli_proxy_api_key: str | None = None
    cli_proxy_model: str = "gpt-4o"

    PROVIDERS: dict[str, tuple[str, str, str]] = {}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.PROVIDERS = {
            "minimax": (self.llm_base_url, self.llm_api_key, self.llm_model),
            "stepfun": (self.stepfun_base_url, self.stepfun_api_key or "", self.stepfun_model),
            "local": (self.cli_proxy_base_url, self.cli_proxy_api_key or "", self.cli_proxy_model),
        }

    @property
    def data_dir(self) -> Path:
        return Path(self.data_dir_path).expanduser().resolve()

    @property
    def uploads_dir(self) -> Path:
        p = self.data_dir / "uploads"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def parsed_dir(self) -> Path:
        """解析全文 sidecar 目录：<data_dir>/parsed/<source_id>.md。"""
        if self.parsed_dir_path:
            p = Path(self.parsed_dir_path).expanduser().resolve()
        else:
            p = self.data_dir / "parsed"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def chroma_dir(self) -> Path:
        p = self.data_dir / "chroma"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def bm25_dir(self) -> Path:
        p = self.data_dir / "bm25"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def sessions_db_path(self) -> Path:
        return self.data_dir / "sessions.db"

    @property
    def kb_db_path(self) -> Path:
        return self.data_dir / "kbs.db"

    @property
    def memory_db_path(self) -> Path:
        return self.data_dir / "memory.db"

    @property
    def jobs_db_path(self) -> Path:
        # R6：job 状态落库（审计债 D11）。沿用 sessions/kbs/memory
        # 每库一文件的既有风格：job 更新频率高（工作线程轮写进度），
        # 独立文件避免与 KB CRUD / 会话读写争锁。
        return self.data_dir / "jobs.db"

    @property
    def kb_dir(self) -> Path:
        """Base dir for per-KB subdirectories (chroma/, bm25/, uploads/)."""
        p = self.data_dir / "kbs"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def visual_tiles_dir(self) -> Path:
        """Base dir for PDF page screenshot tiles used by visual RAG."""
        p = self.data_dir / "visual_tiles"
        p.mkdir(parents=True, exist_ok=True)
        return p


_settings: Settings | None = None


def load_settings() -> Settings:
    """Load settings (singleton)."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
