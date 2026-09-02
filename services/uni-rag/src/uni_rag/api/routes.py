"""API route handlers."""
from __future__ import annotations
import ipaddress
import socket
from pathlib import Path
import tempfile
import threading
import uuid
from urllib.parse import urlparse
from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from uni_rag.rag.pipeline import RAGPipeline
from uni_rag.ingest.pipeline import IngestPipeline, cleanup_kb_files
from uni_rag.session.store import SessionStore
from uni_rag.store.vector import VectorStore
from uni_rag.store.kb import KBStore
from uni_rag.store.jobs import JobStore
from uni_rag.config import load_settings
from uni_rag.api.schemas import (
    QueryRequest, QueryResponse, IngestResponse,
    IngestJobStartResponse, IngestJobStatusResponse,
    DocumentInfo, DocumentListResponse,
    ChunkInfo, DocumentChunksResponse,
    KbCreateRequest, KbInfo, KbListResponse,
    SessionKbBindRequest, SessionKbListResponse, DeleteResponse,
    SuggestQuestionsRequest, SuggestQuestionsResponse,
    ProvidersResponse, ProviderInfo,
    MemoryJobsRequest, MemoryJobStartResponse,
    MemoryJobStatusResponse, MemoryJobResult,
    DocumentDeleteResponse,
)
from uni_rag.export.md_exporter import render_markdown
from uni_rag.ingest.link_extractors import LinkExtractionError


router = APIRouter(prefix="/api")
_pipeline: RAGPipeline | None = None


# ── Job 状态落库（R6，审计债 D11）──
# 旧实现用模块级字典 _ingest_jobs/_memory_jobs，重启即失、只写不删。
# 现统一走 JobStore（data/jobs.db），Reader 轮询契约不变。
def get_job_store() -> JobStore:
    """按当前 settings 构造 JobStore（与 _kb_store() 等现有 helper 同风格）。

    不做进程级缓存：SQLite 打开成本极低，而缓存单例会在测试/多数据目录
    场景下指向过期的 tmp 路径。startup 维护（app.py）自行创建实例。
    """
    return JobStore(load_settings().jobs_db_path)


# ── Memory backend (phase-1) ──
# _memory_store is a process-wide MemoryStore singleton lazily created
# from settings.memory_db_path. Memory job status now persists via
# JobStore (kind="memory") so Reader can poll GET /api/memory/jobs/{job_id}
# across restarts. In practice POST persists synchronously (Reader
# fast-paths on status=completed), but we still register the job record
# so the GET endpoint is consistent.
_memory_store = None


def get_memory_store():
    """Lazy-load the MemoryStore singleton.

    Kept lazy so unit tests pointing UNI_RAG_DATA_DIR_PATH at a tmp dir
    don't trigger SQLite handle creation at import time.
    """
    global _memory_store
    if _memory_store is None:
        from uni_rag.store.memory import MemoryStore
        _memory_store = MemoryStore(load_settings().memory_db_path)
    return _memory_store


def get_pipeline() -> RAGPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = RAGPipeline()
    return _pipeline


def _set_ingest_job(key: str, **updates) -> None:
    get_job_store().update(key, "ingest", **updates)


def _get_ingest_job(job_id: str) -> dict | None:
    return get_job_store().get(job_id)


def _run_ingest_job(
    job_id: str,
    tmp_path: Path,
    filename: str,
    kb_id: str | None,
) -> None:
    def on_progress(event: dict) -> None:
        _set_ingest_job(
            job_id,
            status="running",
            step=event.get("step", "running"),
            percent=int(event.get("percent", 0)),
            message=str(event.get("message", "正在处理")),
        )

    try:
        _set_ingest_job(
            job_id,
            status="running",
            step="loading_model",
            percent=8,
            message="正在加载本地向量模型，首次使用可能需要更久。",
        )
        pipeline = get_pipeline() if kb_id is None else _pipeline_for_kb(kb_id)
        result = pipeline.ingest_file(tmp_path, original_name=filename, progress=on_progress)
        response = IngestResponse(
            source_id=result["source_id"],
            chunks=result["chunks"],
            format=result["format"],
            filename=filename,
        )
        _set_ingest_job(
            job_id,
            status="completed",
            step="done",
            percent=100,
            message="入库完成，可以开始提问。",
            result=response.model_dump(),
        )
    except Exception as e:
        _set_ingest_job(
            job_id,
            status="failed",
            step="failed",
            percent=100,
            message="入库失败，请换一个文件再试。",
            error=str(e),
        )
    finally:
        tmp_path.unlink(missing_ok=True)


def _run_url_ingest_job(
    job_id: str,
    url: str,
    kb_id: str | None,
) -> None:
    def on_progress(event: dict) -> None:
        _set_ingest_job(
            job_id,
            status="running",
            step=event.get("step", "running"),
            percent=int(event.get("percent", 0)),
            message=str(event.get("message", "正在处理")),
        )

    try:
        _set_ingest_job(
            job_id,
            status="running",
            step="extracting",
            percent=5,
            message="正在识别链接并提取内容",
        )
        pipeline = get_pipeline() if kb_id is None else _pipeline_for_kb(kb_id)
        result = pipeline.ingest_url(url, progress=on_progress)
        response = IngestResponse(
            source_id=result["source_id"],
            chunks=result["chunks"],
            format=result["format"],
            filename=result.get("filename", url),
        )
        _set_ingest_job(
            job_id,
            status="completed",
            step="done",
            percent=100,
            message="入库完成，可以开始提问。",
            result=response.model_dump(),
        )
    except LinkExtractionError as e:
        _set_ingest_job(
            job_id,
            status="failed",
            step="failed",
            percent=100,
            message=e.hint,
            error=str(e),
        )
    except Exception as e:
        _set_ingest_job(
            job_id,
            status="failed",
            step="failed",
            percent=100,
            message="入库失败，请检查链接是否有效后重试。",
            error=str(e),
        )


def _start_url_ingest_job(url: str, kb_id: str | None = None) -> IngestJobStartResponse:
    job_id = uuid.uuid4().hex
    _set_ingest_job(
        job_id,
        job_id=job_id,
        status="queued",
        step="queued",
        percent=1,
        message="已收到链接，准备开始提取。",
        filename=url,
        result=None,
        error=None,
    )
    worker = threading.Thread(
        target=_run_url_ingest_job,
        args=(job_id, url, kb_id),
        daemon=True,
    )
    worker.start()
    return IngestJobStartResponse(job_id=job_id, status_url=f"/api/ingest/jobs/{job_id}")


def _start_ingest_job(file: UploadFile, kb_id: str | None = None) -> IngestJobStartResponse:
    if not file.filename:
        raise HTTPException(400, "No filename")
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        content = file.file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    job_id = uuid.uuid4().hex
    _set_ingest_job(
        job_id,
        job_id=job_id,
        status="queued",
        step="queued",
        percent=1,
        message="已收到文件，准备开始解析。",
        filename=file.filename,
        result=None,
        error=None,
    )
    worker = threading.Thread(
        target=_run_ingest_job,
        args=(job_id, tmp_path, file.filename, kb_id),
        daemon=True,
    )
    worker.start()
    return IngestJobStartResponse(job_id=job_id, status_url=f"/api/ingest/jobs/{job_id}")


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/providers", response_model=ProvidersResponse)
def list_providers():
    """Return available LLM providers with their configured models."""
    s = load_settings()
    items = []
    for pid, (_url, _key, model) in s.PROVIDERS.items():
        if pid == "minimax":
            name = "MiniMax M3"
        elif pid == "stepfun":
            name = "阶跃星辰 Step"
        elif pid == "local":
            name = "本地路由"
        else:
            name = pid
        items.append(ProviderInfo(id=pid, name=name, model=model))
    return ProvidersResponse(providers=items)


@router.post("/ingest/jobs", response_model=IngestJobStartResponse)
def start_ingest_job(file: UploadFile = File(...)):
    return _start_ingest_job(file)


@router.get("/ingest/jobs/{job_id}", response_model=IngestJobStatusResponse)
def get_ingest_job(job_id: str):
    job = _get_ingest_job(job_id)
    if job is None:
        raise HTTPException(404, f"Ingest job not found: {job_id}")
    return IngestJobStatusResponse(**job)


# ── Memory backend (phase-1) ──
# POST /api/memory/jobs persists a Reader saved_artifact synchronously.
# Reader expects a fast-path: if POST returns status="completed", it
# skips polling and treats the memory as ready. We honor that by doing
# the SQLite write inline and returning completed immediately.
# GET /api/memory/jobs/{job_id} is still provided for compatibility
# (e.g. if Reader ever switches to async ingestion).
def _set_memory_job(job_id: str, **updates) -> None:
    get_job_store().update(job_id, "memory", **updates)


def _get_memory_job(job_id: str) -> dict | None:
    return get_job_store().get(job_id)


def _build_memory_text(payload) -> str:
    """Derive a flat searchable text blob from a MemoryPayload.

    Reader populates different fields depending on artifact_type
    (answer/card/note/highlight/summary/qa). We concatenate anything
    that could carry semantic content so MemoryStore.search can match.
    """
    parts: list[str] = []
    if payload.title:
        parts.append(payload.title)
    c = payload.content
    if c.question:
        parts.append(c.question)
    if c.answer:
        parts.append(c.answer)
    if c.summary:
        parts.append(c.summary)
    if c.explanation:
        parts.append(c.explanation)
    if c.body:
        parts.append(c.body)
    if c.user_note:
        parts.append(c.user_note)
    if c.key_points:
        parts.extend(c.key_points)
    if payload.text:
        parts.append(payload.text)
    # Source refs may carry helpful `text` excerpts
    for ref in payload.source_refs:
        if ref.text:
            parts.append(ref.text)
    return "\n".join(p for p in parts if p)


@router.post("/memory/jobs", response_model=MemoryJobStartResponse)
def create_memory_job(req: MemoryJobsRequest):
    """Persist a VibeReader saved_artifact as a memory entry.

    Synchronous: returns status="completed" so Reader can fast-path.
    Generates memory_id (uuid4 hex) and stores it in the job result so
    Reader can later reference it (e.g. for citation jumps).
    """
    payload = req.memory
    memory_id = uuid.uuid4().hex
    text = _build_memory_text(payload)
    document_id = payload.document.id if payload.document else ""
    document_name = payload.document.name if payload.document else ""
    # source_refs as plain dicts for storage
    source_refs_dicts = [r.model_dump(by_alias=True, exclude_none=True) for r in payload.source_refs]

    try:
        get_memory_store().add(
            memory_id=memory_id,
            artifact_id=payload.artifact_id,
            artifact_type=payload.artifact_type,
            title=payload.title,
            text=text,
            document_id=document_id,
            document_name=document_name,
            source_refs=source_refs_dicts,
            verification_status=payload.verification_status,
            created_at=payload.created_at,
            saved_at=payload.saved_at,
            contract_version=payload.contract_version,
        )
    except Exception as e:
        # Persist failure should not crash Reader; surface as failed job.
        job_id = uuid.uuid4().hex
        _set_memory_job(
            job_id,
            status="failed",
            step="failed",
            percent=100,
            message="记忆持久化失败",
            error=str(e),
            result=None,
        )
        # Still return 200 with status=failed so Reader's HTTP layer
        # doesn't 5xx; Reader checks `status` field, not HTTP code.
        return MemoryJobStartResponse(job_id=job_id, status_url=f"/api/memory/jobs/{job_id}", status="failed")

    job_id = memory_id  # use memory_id as job_id for traceability
    result = MemoryJobResult(memory_id=memory_id, chunks=1)
    _set_memory_job(
        job_id,
        status="completed",
        step="done",
        percent=100,
        message="记忆已保存",
        result=result.model_dump(),
        error=None,
    )
    return MemoryJobStartResponse(
        job_id=job_id,
        status_url=f"/api/memory/jobs/{job_id}",
        status="completed",
    )


@router.get("/memory/jobs/{job_id}", response_model=MemoryJobStatusResponse)
def get_memory_job_status(job_id: str):
    job = _get_memory_job(job_id)
    if job is None:
        raise HTTPException(404, f"Memory job not found: {job_id}")
    return MemoryJobStatusResponse(**job)


@router.post("/ingest", response_model=IngestResponse)
async def ingest(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "No filename")
    safe_filename = Path(file.filename).name
    # 存临时文件 → pipeline 读取
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(safe_filename).suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)
    try:
        # 用上传时的 safe_filename 命名落盘文件，side-panel 按 filename 查找
        result = get_pipeline().ingest_file(tmp_path, original_name=safe_filename)
    finally:
        tmp_path.unlink(missing_ok=True)
    return IngestResponse(
        source_id=result["source_id"],
        chunks=result["chunks"],
        format=result["format"],
        filename=safe_filename,
    )


class LinkIngestRequest(BaseModel):
    url: str
    kb_id: str | None = None


def _is_safe_url(url: str) -> bool:
    """Reject URLs that resolve to loopback / link-local addresses (SSRF prevention).

    Note: 不拦截 198.18.0.0/15（fake‑ip 代理段），因为 Surge / Clash 等工具
    会把所有域名解析到这个段，代理层负责转发到真实地址。
    """
    FAKEIP_NET = ipaddress.ip_network("198.18.0.0/15")
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
        if not hostname:
            return False
        # 明确拒绝 localhost
        if hostname in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
            return False
        # 解析域名为 IP（可能返回多个）
        ips = socket.getaddrinfo(hostname, None)
        for *_, sockaddr in ips:
            ip = ipaddress.ip_address(sockaddr[0])
            if ip.is_loopback or ip.is_link_local:
                return False
            # fake‑ip 代理段放行（Surge / Clash 等）
            if ip in FAKEIP_NET:
                continue
            # RFC 1918 私有地址
            if ip.is_private:
                return False
        return True
    except (socket.gaierror, ValueError):
        return False


@router.post("/ingest/url", response_model=IngestJobStartResponse)
def ingest_url(req: LinkIngestRequest):
    if not req.url or not req.url.strip():
        raise HTTPException(400, "URL 不能为空")
    url = req.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "请输入以 http:// 或 https:// 开头的有效链接")
    if not _is_safe_url(url):
        raise HTTPException(400, "不允许访问内网或保留地址")
    return _start_url_ingest_job(url, kb_id=req.kb_id)


def _query_pipeline(pipeline: RAGPipeline, question: str, session_id: str, top_k: int, api_key: str | None = None, style: str = "academic", provider: str = "minimax", mode: str = "chat", include_memory: bool = False, memory_top_k: int = 3) -> dict:
    try:
        memory_store = get_memory_store() if include_memory else None
        return pipeline.query(
            question,
            session_id=session_id,
            top_k=top_k,
            api_key=api_key,
            style=style,
            provider=provider,
            mode=mode,
            include_memory=include_memory,
            memory_top_k=memory_top_k,
            memory_store=memory_store,
        )
    except Exception as e:
        raise HTTPException(
            502,
            "回答生成失败。请检查 API key / 网络连接，或稍后重试。",
        ) from e


@router.post("/query", response_model=QueryResponse)
def query(request: Request, req: QueryRequest):
    sid = req.session_id
    if not sid:
        # 自动开新 session
        sid = SessionStore(load_settings().sessions_db_path).create()
    api_key = req.api_key or request.headers.get("X-API-Key")
    result = _query_pipeline(get_pipeline(), req.question, sid, req.top_k, api_key=api_key, style=req.style, provider=req.provider, mode=req.mode, include_memory=req.include_memory, memory_top_k=req.memory_top_k)
    return QueryResponse(
        answer=result["answer"],
        citations=result["citations"],
        session_id=sid,
    )


@router.post("/suggest-questions", response_model=SuggestQuestionsResponse)
def suggest_questions(request: Request, req: SuggestQuestionsRequest):
    """根据文档内容生成 3 个建议问题。"""
    s = load_settings()
    api_key = req.api_key or request.headers.get("X-API-Key")
    provider = req.provider or "minimax"

    if not api_key:
        entry = s.PROVIDERS.get(provider)
        if entry:
            api_key = entry[1]
    base_url, _, model = s.PROVIDERS.get(provider, s.PROVIDERS["minimax"])

    if not api_key:
        raise HTTPException(400, "请先在设置中配置 API Key")

    preview = req.text[:3000]  # 限制长度
    prompt = f"""根据以下文档内容，生成 3 个可以帮助学习者深入理解材料的问题。
要求：问题具体、有启发性、覆盖不同理解层次（1 个基础概念题 + 1 个分析题 + 1 个应用/延伸题）。
只返回问题列表，每行一个，不要编号，不要其他说明。

文档内容：
{preview}"""

    try:
        from anthropic import Anthropic
        client = Anthropic(base_url=base_url, api_key=api_key)
        resp = client.messages.create(
            model=model,
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        text = ""
        for block in resp.content:
            if hasattr(block, "text"):
                text += block.text
        questions = [q.strip() for q in text.strip().split("\n") if q.strip()][:3]
        if not questions:
            questions = [
                "这份材料的核心观点是什么？",
                "有哪些关键概念需要掌握？",
                "能举几个例子说明吗？",
            ]
        return SuggestQuestionsResponse(questions=questions)
    except Exception as e:
        raise HTTPException(502, f"生成建议问题失败: {e}") from e


@router.get("/documents", response_model=DocumentListResponse)
def list_documents():
    """List documents already ingested into the default KB."""
    return DocumentListResponse(documents=_list_documents_for_kb("default"))


@router.get("/files", response_model=DocumentListResponse)
def list_files(kb_id: str | None = None):
    """List uploaded files for a given kb_id, defaults to 'default'."""
    target_kb = kb_id if kb_id else "default"
    if target_kb != "default" and _kb_store().get(target_kb) is None:
        raise HTTPException(404, f"KB not found: {target_kb}")
    return DocumentListResponse(documents=_list_documents_for_kb(target_kb))


@router.get("/sources", response_model=DocumentListResponse)
def list_sources(kb_id: str | None = None):
    """List all sources (files + URLs) from Chroma metadata for a given kb_id."""
    target_kb = kb_id if kb_id else "default"
    if target_kb != "default" and _kb_store().get(target_kb) is None:
        raise HTTPException(404, f"KB not found: {target_kb}")

    vector = _vector_for_kb(target_kb)
    try:
        res = vector.collection.get(include=["metadatas"])
    except Exception:
        res = {"metadatas": []}

    source_info: dict[str, dict] = {}
    for meta in res.get("metadatas") or []:
        if not meta:
            continue
        source = str(meta.get("source", ""))
        if not source:
            continue
        if source not in source_info:
            source_info[source] = {
                "filename": source,
                "chunks": 0,
                "format": meta.get("format", "unknown"),
                "platform": meta.get("platform", ""),
                "source_url": meta.get("source_url", ""),
            }
        source_info[source]["chunks"] += 1

    documents = [
        DocumentInfo(
            filename=info["filename"],
            chunks=info["chunks"],
            format=info.get("format", "unknown"),
            platform=info.get("platform"),
            source_url=info.get("source_url"),
        )
        for info in sorted(source_info.values(), key=lambda x: x["filename"])
    ]
    return DocumentListResponse(documents=documents)


@router.get("/documents/{filename:path}/chunks", response_model=DocumentChunksResponse)
def get_document_chunks(filename: str):
    """Return all chunks for a given source (file or URL), ordered by offset."""
    safe_filename = Path(filename).name  # 路径遍历防护
    settings = load_settings()
    target = settings.uploads_dir / safe_filename
    if not target.exists():
        pass  # URL source without disk file — query Chroma directly
    vector = VectorStore()
    res = vector.collection.get(where={"source": safe_filename}, include=["metadatas", "documents"])
    if not res["ids"]:
        return DocumentChunksResponse(filename=safe_filename, chunks=[])

    rows: list[ChunkInfo] = []
    for i, cid in enumerate(res["ids"]):
        meta = res["metadatas"][i] if res["metadatas"] else {}
        doc_text = res["documents"][i] if res["documents"] else ""
        start = int(meta.get("start", 0) or 0)
        end = int(meta.get("end", start + len(doc_text)) or (start + len(doc_text)))
        rows.append(ChunkInfo(
            id=cid,
            text=doc_text,
            span=(start, end),
            section=str(meta.get("section", "")),
        ))
    rows.sort(key=lambda r: r.span[0] if r.span else 0)
    return DocumentChunksResponse(filename=filename, chunks=rows)


# --- Knowledge base API ---

def _kb_store() -> KBStore:
    return KBStore(load_settings().kb_db_path)


def _to_kb_info(record: dict) -> KbInfo:
    return KbInfo(
        id=record["id"],
        name=record["name"],
        description=record["description"],
        created_at=record["created_at"],
    )


def _pipeline_for_kb(kb_id: str) -> RAGPipeline:
    """Map the default KB to legacy v0.2 storage; other KBs use scoped storage."""
    return RAGPipeline(kb_id=None if kb_id == "default" else kb_id)


def _vector_for_kb(kb_id: str) -> VectorStore:
    if kb_id == "default":
        return VectorStore()
    kb_base = load_settings().data_dir / "kbs" / kb_id
    return VectorStore(data_dir=kb_base / "chroma", collection_name=f"kb_{kb_id}")


def _uploads_dir_for_kb(kb_id: str) -> Path:
    if kb_id == "default":
        return load_settings().uploads_dir
    return load_settings().data_dir / "kbs" / kb_id / "uploads"


def _list_documents_for_kb(kb_id: str) -> list[DocumentInfo]:
    uploads_dir = _uploads_dir_for_kb(kb_id)
    if not uploads_dir.exists():
        return []

    counts: dict[str, int] = {}
    source_ids: dict[str, str] = {}
    vector = _vector_for_kb(kb_id)
    try:
        res = vector.collection.get(include=["metadatas"])
    except Exception:
        res = {"ids": [], "metadatas": []}
    for cid, meta in zip(res.get("ids") or [], res.get("metadatas") or []):
        source = str(meta.get("source", "")) if meta else ""
        if source:
            counts[source] = counts.get(source, 0) + 1
            source_ids.setdefault(source, str(cid).split(":", 1)[0])

    documents: list[DocumentInfo] = []
    for path in sorted(p for p in uploads_dir.iterdir() if p.is_file() and not p.name.startswith(".")):
        documents.append(DocumentInfo(
            filename=path.name,
            chunks=counts.get(path.name, 0),
            source_id=source_ids.get(path.name),
        ))
    return documents


@router.post("/kbs", response_model=KbInfo)
def create_kb(req: KbCreateRequest):
    try:
        record = _kb_store().create(req.name, req.description, kb_id=req.id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _to_kb_info(record)


@router.get("/kbs", response_model=KbListResponse)
def list_kbs():
    store = _kb_store()
    store.ensure_default()
    return KbListResponse(kbs=[_to_kb_info(kb) for kb in store.list()])


@router.get("/kbs/{kb_id}", response_model=KbInfo)
def get_kb(kb_id: str):
    record = _kb_store().get(kb_id)
    if record is None:
        raise HTTPException(404, f"KB not found: {kb_id}")
    return _to_kb_info(record)


@router.delete("/kbs/{kb_id}", response_model=DeleteResponse)
def delete_kb(kb_id: str):
    deleted = _kb_store().delete(kb_id)
    if not deleted:
        raise HTTPException(404, f"KB not found: {kb_id}")
    # 级联清理：连 KB 的落盘索引目录一起删（audit D12）。
    # legacy 'default' KB 复用全局 data/ 目录，cleanup 内部会跳过。
    cleanup_kb_files(kb_id)
    return DeleteResponse(deleted=True)


# --- Document deletion (R4, audit D12: 索引只增不减) ---

def _ingest_pipeline_for_kb(kb_id: str | None) -> IngestPipeline:
    """Delete 路径只需要 IngestPipeline（不必构建检索器/LLM 客户端）。"""
    if kb_id in (None, "default"):
        return IngestPipeline(kb_id=None)
    return IngestPipeline(kb_id=kb_id)


def _delete_document(kb_id: str | None, source_id: str) -> DocumentDeleteResponse:
    """按 source_id 彻底删除一个来源并返回删除统计。"""
    if kb_id in (None, "default") and _pipeline is not None:
        # default KB：复用单例 pipeline 的 ingest 实例，同步清掉它内存里
        # 持有的 BM25 docs，避免删除后单例再次 save 时把旧条目写回去。
        ingest = _pipeline.ingest
    else:
        # KB 级路径没有实例缓存（每次 _pipeline_for_kb 都新建），从盘新开即可
        ingest = _ingest_pipeline_for_kb(kb_id)
    try:
        stats = ingest.delete_source(source_id)
    except KeyError:
        raise HTTPException(404, f"Source not found: {source_id}")
    return DocumentDeleteResponse(
        source_id=source_id,
        deleted=True,
        chunks_deleted=stats["chunks_deleted"],
        visual_deleted=stats["visual_deleted"],
        bm25_removed=stats["bm25_removed"],
        files_deleted=stats["files_deleted"],
        sidecar_deleted=stats["sidecar_deleted"],
    )


@router.delete("/documents/{source_id}", response_model=DocumentDeleteResponse)
def delete_document(source_id: str):
    """Delete a document from the default KB: Chroma vectors, BM25 entries,
    parsed sidecar, the uploaded file, and visual tiles."""
    return _delete_document(None, source_id)


@router.delete("/kbs/{kb_id}/documents/{source_id}", response_model=DocumentDeleteResponse)
def delete_kb_document(kb_id: str, source_id: str):
    """Delete a document from a specific KB (same cleanup as the default-KB route)."""
    if _kb_store().get(kb_id) is None:
        raise HTTPException(404, f"KB not found: {kb_id}")
    return _delete_document(kb_id, source_id)


@router.post("/kbs/{kb_id}/ingest/jobs", response_model=IngestJobStartResponse)
def start_kb_ingest_job(kb_id: str, file: UploadFile = File(...)):
    if _kb_store().get(kb_id) is None:
        raise HTTPException(404, f"KB not found: {kb_id}")
    return _start_ingest_job(file, kb_id=kb_id)


@router.post("/kbs/{kb_id}/ingest", response_model=IngestResponse)
async def ingest_into_kb(kb_id: str, file: UploadFile = File(...)):
    if _kb_store().get(kb_id) is None:
        raise HTTPException(404, f"KB not found: {kb_id}")
    if not file.filename:
        raise HTTPException(400, "No filename")

    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)
    try:
        result = _pipeline_for_kb(kb_id).ingest_file(tmp_path, original_name=file.filename)
    finally:
        tmp_path.unlink(missing_ok=True)
    return IngestResponse(
        source_id=result["source_id"],
        chunks=result["chunks"],
        format=result["format"],
        filename=file.filename,
    )


@router.get("/kbs/{kb_id}/documents", response_model=DocumentListResponse)
def list_kb_documents(kb_id: str):
    """List documents already ingested into a KB."""
    if _kb_store().get(kb_id) is None:
        raise HTTPException(404, f"KB not found: {kb_id}")
    return DocumentListResponse(documents=_list_documents_for_kb(kb_id))


@router.get("/kbs/{kb_id}/documents/{filename}/chunks", response_model=DocumentChunksResponse)
def get_kb_document_chunks(kb_id: str, filename: str):
    """Return chunks for a document inside a KB, for the citation side panel."""
    if _kb_store().get(kb_id) is None:
        raise HTTPException(404, f"KB not found: {kb_id}")

    safe_filename = Path(filename).name  # 路径遍历防护
    target = _uploads_dir_for_kb(kb_id) / safe_filename
    if not target.exists():
        raise HTTPException(404, f"Document not found: {safe_filename}")

    vector = _vector_for_kb(kb_id)
    res = vector.collection.get(where={"source": safe_filename}, include=["metadatas", "documents"])
    if not res["ids"]:
        return DocumentChunksResponse(filename=safe_filename, chunks=[])

    rows: list[ChunkInfo] = []
    for i, cid in enumerate(res["ids"]):
        meta = res["metadatas"][i] if res["metadatas"] else {}
        doc_text = res["documents"][i] if res["documents"] else ""
        start = int(meta.get("start", 0) or 0)
        end = int(meta.get("end", start + len(doc_text)) or (start + len(doc_text)))
        rows.append(ChunkInfo(
            id=cid,
            text=doc_text,
            span=(start, end),
            section=str(meta.get("section", "")),
        ))
    rows.sort(key=lambda r: r.span[0] if r.span else 0)
    return DocumentChunksResponse(filename=filename, chunks=rows)


@router.post("/kbs/{kb_id}/query", response_model=QueryResponse)
def query_kb(request: Request, kb_id: str, req: QueryRequest):
    """Ask a question against one KB; keeps v0.2 /api/query unchanged."""
    if _kb_store().get(kb_id) is None:
        raise HTTPException(404, f"KB not found: {kb_id}")
    sid = req.session_id
    if not sid:
        sid = SessionStore(load_settings().sessions_db_path).create()
    _kb_store().bind_session(sid, [kb_id])
    api_key = req.api_key or request.headers.get("X-API-Key")
    result = _query_pipeline(_pipeline_for_kb(kb_id), req.question, sid, req.top_k, api_key=api_key, style=req.style, provider=req.provider, mode=req.mode, include_memory=req.include_memory, memory_top_k=req.memory_top_k)
    return QueryResponse(
        answer=result["answer"],
        citations=result["citations"],
        session_id=sid,
    )


@router.post("/sessions/{session_id}/kbs", response_model=SessionKbListResponse)
def bind_session_kbs(session_id: str, req: SessionKbBindRequest):
    store = _kb_store()
    try:
        store.bind_session(session_id, req.kb_ids)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return SessionKbListResponse(
        session_id=session_id,
        kbs=[_to_kb_info(kb) for kb in store.get_session_kbs(session_id)],
    )


@router.get("/sessions/{session_id}/kbs", response_model=SessionKbListResponse)
def get_session_kbs(session_id: str):
    store = _kb_store()
    return SessionKbListResponse(
        session_id=session_id,
        kbs=[_to_kb_info(kb) for kb in store.get_session_kbs(session_id)],
    )


def _build_export_payload(
    question: str,
    answer: str,
    kb_id: str | None = None,
) -> dict:
    """Build a {question, answer, citations} payload for the export modules.

    Re-runs retrieval on the same question to re-derive citations consistently.
    If the original retrieval would fail (e.g. cleared vector store), citations is [].
    """
    payload: dict = {"question": question, "answer": answer, "citations": []}
    try:
        pipeline = _pipeline_for_kb(kb_id) if kb_id else get_pipeline()
        result = pipeline.query(question, session_id=None, top_k=5)
        payload["citations"] = result.get("citations", [])
    except Exception:
        # 导出在主对话失败时仍要可用；citations 留空
        payload["citations"] = []
    return payload


@router.get("/sessions/{session_id}/messages/{message_index}/export")
def export_message(session_id: str, message_index: int, format: str = "md"):
    """Download a single assistant message as Markdown or PDF.

    `format` must be 'md' or 'pdf'. The Nth (1-based) message must be 'assistant';
    we walk back to find the most recent 'user' message to use as the question.
    """
    fmt = (format or "").lower()
    if fmt not in ("md", "pdf"):
        raise HTTPException(400, "format must be 'md' or 'pdf'")

    settings = load_settings()
    from uni_rag.session.store import SessionStore
    store = SessionStore(settings.sessions_db_path)
    msgs = store.get(session_id)
    if not msgs:
        raise HTTPException(404, f"Session not found or empty: {session_id}")
    if message_index < 1 or message_index > len(msgs):
        raise HTTPException(404, f"message_index out of range")

    role, answer = msgs[message_index - 1]["role"], msgs[message_index - 1]["content"]
    if role != "assistant":
        raise HTTPException(400, "Only assistant messages can be exported")

    # 找前一条 user message 作为 question
    question = ""
    for j in range(message_index - 2, -1, -1):
        if msgs[j]["role"] == "user":
            question = msgs[j]["content"]
            break
    if not question:
        question = "（无对应问题）"

    bound_kbs = KBStore(settings.kb_db_path).get_session_kbs(session_id)
    kb_id = bound_kbs[0]["id"] if bound_kbs else None
    payload = _build_export_payload(question, answer, kb_id=kb_id)

    if fmt == "md":
        md_text = render_markdown(payload)
        return Response(
            content=md_text,
            media_type="text/markdown; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="uni-rag-msg-{message_index}.md"'
            },
        )
    # pdf
    try:
        from uni_rag.export.pdf_exporter import render_pdf
    except Exception as e:
        raise HTTPException(503, f"PDF export unavailable: {e}")
    pdf_bytes = render_pdf(payload)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="uni-rag-msg-{message_index}.pdf"'
        },
    )
