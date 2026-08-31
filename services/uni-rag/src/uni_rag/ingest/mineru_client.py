"""MinerU v4 REST API client for cloud PDF parsing.

流程：申请批量上传 → PUT 文件 → 轮询 batch 结果 → 下载 zip → 提取 Markdown。
支持 200MB / 200 页。
兜底：网络错误或 API 异常时抛异常，由调用方 fallback 到本地解析器。
"""

from __future__ import annotations
import io
import os
import subprocess
import time
import zipfile
from pathlib import Path
from typing import Optional
import httpx


MINERU_CLI = "mineru-open-api"
MINERU_BASE_URL = "https://mineru.net/api/v4"
POLL_INTERVAL = 3
POLL_TIMEOUT = 300


def _get_token() -> Optional[str]:
    """从环境变量或 .env 读取 MinerU API Token。"""
    token = os.environ.get("MINERU_API_TOKEN") or os.environ.get("UNI_RAG_MINERU_API_TOKEN")
    if not token:
        try:
            from dotenv import dotenv_values
            vals = dotenv_values(".env")
            token = vals.get("UNI_RAG_MINERU_API_TOKEN") or vals.get("MINERU_API_TOKEN")
        except Exception:
            pass
    return token


def parse_file_via_api(file_path: Path, language: str = "ch", pages: str = "1-200") -> str:
    """通过 MinerU v4 REST API 解析文件，返回 Markdown 文本。"""
    token = _get_token()
    if not token:
        raise RuntimeError("MinerU API Token 未配置")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    # 1. 申请批量上传链接
    with httpx.Client() as client:
        batch_resp = client.post(
            f"{MINERU_BASE_URL}/file-urls/batch",
            headers=headers,
            json={
                "files": [{"name": file_path.name}],
                "model_version": "pipeline",
            },
            timeout=30,
        )
        batch_resp.raise_for_status()
        batch_data = batch_resp.json()
        if batch_data.get("code") != 0:
            raise RuntimeError(f"MinerU 申请上传失败: {batch_data.get('msg')}")

        batch_id = batch_data["data"]["batch_id"]
        upload_url = batch_data["data"]["file_urls"][0]

        # 2. PUT 上传文件（不设 Content-Type，避免 OSS 签名不匹配）
        put = client.put(
            upload_url,
            content=file_path.read_bytes(),
            headers={"Content-Type": ""},
            timeout=120,
        )
        if put.status_code not in (200, 201):
            raise RuntimeError(f"MinerU 文件上传失败: HTTP {put.status_code}")

        # 3. 轮询结果
        return _poll_batch(client, batch_id)


def _poll_batch(client: httpx.Client, batch_id: str) -> str:
    start = time.time()
    while time.time() - start < POLL_TIMEOUT:
        resp = client.get(
            f"{MINERU_BASE_URL}/extract-results/batch/{batch_id}",
            headers={"Authorization": client.headers.get("Authorization", ""), "Content-Type": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"MinerU 查询失败: {data.get('msg')}")

        results = data.get("data", {}).get("extract_result", [])
        if not results:
            time.sleep(POLL_INTERVAL)
            continue

        result = results[0]
        state = result.get("state", "")

        if state == "done":
            zip_url = result["full_zip_url"]
            return _download_and_extract_md(zip_url)
        elif state == "failed":
            err = result.get("err_msg", "未知错误")
            raise RuntimeError(f"MinerU 解析失败: {err}")

        time.sleep(POLL_INTERVAL)

    raise TimeoutError(f"MinerU 解析超时 ({POLL_TIMEOUT}s)")


def _download_and_extract_md(zip_url: str) -> str:
    resp = httpx.get(zip_url, timeout=60, follow_redirects=True)
    resp.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        md_name = "full.md"
        if md_name not in zf.namelist():
            md_files = [n for n in zf.namelist() if n.endswith(".md")]
            if not md_files:
                raise RuntimeError(f"MinerU zip 中无 Markdown 文件: {zf.namelist()}")
            md_name = md_files[0]
        return zf.read(md_name).decode("utf-8")


def is_mineru_available() -> bool:
    """检查 MinerU API 是否可用（有 token + httpx 已装）。"""
    return bool(_get_token())
