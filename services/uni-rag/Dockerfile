# syntax=docker/dockerfile:1.6
FROM python:3.13-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/usr/local

# System deps: build tools for hnsw/lz4/snappy, libpango for weasyprint
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv (single binary)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
RUN chmod +x /usr/local/bin/uv

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --no-install-project

# Copy source
COPY src/ ./src/
COPY cli/ ./cli/
RUN uv sync --no-dev

# Pre-download models at build time so first request isn't slow
# Uses a small Python one-liner; models are cached in /root/.cache/huggingface
RUN uv run python -c "\
from sentence_transformers import SentenceTransformer, CrossEncoder; \
SentenceTransformer('BAAI/bge-m3'); \
CrossEncoder('BAAI/bge-reranker-base')"

# Static web files
COPY src/uni_rag/web/ /app/web/

EXPOSE 8766

# Data lives in /data (mount a volume here for persistence)
# 注意：config.py 的 Settings 字段是 data_dir_path，按 pydantic 命名规则
# 对应环境变量 UNI_RAG_DATA_DIR_PATH（不能写成 UNI_RAG_DATA_DIR，会被
# extra="ignore" 静默吞掉导致数据落到镜像层 ./data）。
# host/port 无对应 Settings 字段，由下方 CMD 显式指定；对外只暴露 loopback
# 由 docker-compose 的 127.0.0.1:8766:8766 端口映射保证（容器内须绑 0.0.0.0）。
ENV UNI_RAG_DATA_DIR_PATH=/data

CMD ["uv", "run", "uvicorn", "uni_rag.api.app:create_app", \
     "--factory", "--host", "0.0.0.0", "--port", "8766"]
