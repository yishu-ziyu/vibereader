"""RAG pipeline: query → retrieve → LLM → citations. Supports per-KB isolation."""
from __future__ import annotations
import re
from pathlib import Path
from uni_rag.ingest.pipeline import IngestPipeline
from uni_rag.retrieve.retriever import HybridRetriever
from uni_rag.llm.client import LLMClient
from uni_rag.llm.prompts import get_system_prompt, build_user_prompt, get_mode_system_prompt
from uni_rag.cite.locator import locate_citation
from uni_rag.cite.verifier import CitationVerifier
from uni_rag.config import load_settings


# chunk_id 形如 "<source_id>:<offset>"（旧）或 "<source_id>:<offset>:<seq>"（新，
# 序号用于消歧重复 offset）。捕获一个 source_id 段 + 至少一段 ":数字"，
# 允许多段。裸 hex（memory_id）无冒号，仍不匹配，符合预期。
_CITE_RE = re.compile(r"\[([a-zA-Z0-9_]+(?::\d+)+)\]")


def resolve_source_text(
    parsed_dir: Path,
    uploads_dir: Path,
    chunk_id: str,
    source_name: str,
) -> str | None:
    """返回用于定位 citation span 的全文文本。

    优先读 ingest 时保存的解析文本 sidecar（<parsed_dir>/<source_id>.md）：
    uploads 里的 PDF 是二进制，直接 read_text 会得到乱码导致定位失败。
    sidecar 不存在（旧数据/解析为空）时回退读 uploads 原文，保持旧行为。
    """
    # source_id 是 16 位 hex（不含冒号），chunk_id 形如 "<source_id>:<offset>"
    # 或新的 "<source_id>:<offset>:<seq>"，取首段即 source_id，两种格式都成立。
    source_id = chunk_id.split(":", 1)[0] if ":" in chunk_id else chunk_id
    sidecar = parsed_dir / f"{source_id}.md"
    if sidecar.exists():
        return sidecar.read_text(encoding="utf-8")
    src_path = uploads_dir / source_name
    if src_path.exists():
        return src_path.read_text(errors="ignore")
    return None


class RAGPipeline:
    """kb_id=None = legacy v0.2 mode (single global KB)."""

    def __init__(self, kb_id: str | None = None):
        from uni_rag.session.store import SessionStore
        self.kb_id = kb_id
        self.ingest = IngestPipeline(kb_id=kb_id)
        self.retriever = HybridRetriever(kb_id=kb_id)
        self.llm = LLMClient()
        # uploads_dir 用于回查原文做 span 定位
        self.uploads_dir = (
            self.ingest.uploads_dir  # IngestPipeline 已经按 kb_id 算好
        )
        self.session_store = SessionStore(load_settings().sessions_db_path)

    def ingest_file(self, path: Path, original_name: str | None = None, progress=None) -> dict:
        return self.ingest.ingest_file(path, original_name=original_name, progress=progress)

    def ingest_url(self, url: str, original_name: str | None = None, progress=None) -> dict:
        return self.ingest.ingest_url(url, original_name=original_name, progress=progress)

    def query(
        self,
        question: str,
        session_id: str | None = None,
        top_k: int = 5,
        style: str = "academic",
        api_key: str | None = None,
        provider: str = "minimax",
        mode: str = "chat",
        include_memory: bool = False,
        memory_top_k: int = 3,
        memory_store=None,
    ) -> dict:
        if api_key:
            llm = self.llm.with_api_key(api_key)
        elif provider and provider != "minimax":
            llm = self.llm.with_provider(provider)
        else:
            llm = self.llm

        # 1. 检索（KB-scoped）
        chunks = self.retriever.retrieve(question, top_k=top_k)

        # 1b. 检索用户已保存的记忆（phase-1 memory backend）
        memories: list[dict] = []
        if include_memory and memory_store is not None:
            try:
                memories = memory_store.search(question, memory_top_k)
            except Exception:
                # Memory retrieval must never break the main query path.
                memories = []

        # 2. 加载历史
        history = []
        if session_id:
            settings = load_settings()
            cap = settings.max_session_messages
            history = self.session_store.get_recent(session_id, max(cap - 1, 0))

        # 3. 构造 prompt
        llm.clear_messages()
        for m in history:
            if m["role"] == "user":
                llm.add_user_message(m["content"])
            elif m["role"] == "assistant":
                llm.add_assistant_message(m["content"])

        system_prompt = get_mode_system_prompt(mode, style)

        if chunks:
            user_prompt = build_user_prompt(question, chunks)
        else:
            user_prompt = question
        if memories:
            user_prompt = f"{user_prompt}\n\n{self._build_memory_block(memories)}"
        llm.add_user_message(user_prompt)
        answer = llm.complete(system_prompt)

        citations = self._extract_citations(answer, chunks) if mode == "chat" else []
        # Memory citations are appended unconditionally so Reader can render
        # 「我的记忆」 even when the LLM did not explicitly cite them.
        if memories:
            citations.extend(self._build_memory_citations(memories))

        if session_id:
            self.session_store.append(session_id, "user", question)
            self.session_store.append(session_id, "assistant", answer)

        return {
            "answer": answer,
            "citations": citations,
            "chunks_used": chunks,
        }

    @staticmethod
    def _build_memory_block(memories: list[dict]) -> str:
        """Format saved memories as a <saved_memory> context block for the LLM.

        Memory entries are labeled clearly as user-saved notes/cards so the
        LLM understands they are personal context, not raw document chunks.
        We intentionally do NOT use the `[chunk_id]` citation syntax here
        (memory_ids are hex uuids, which would not match `_CITE_RE` anyway),
        so the LLM is free to reference memory content without forcing a
        citation marker that `_extract_citations` cannot resolve.
        """
        parts = [
            "<saved_memory>",
            "以下是用户之前保存的笔记/卡片（用户已确认的个人记忆，可在回答中参考但无需用 [编号] 引用）：",
            "",
        ]
        for m in memories:
            title = m.get("title") or "(无标题)"
            text = m.get("text") or ""
            parts.append(f"## {title}")
            parts.append(text)
            parts.append("")
        parts.append("---")
        parts.append(f"(共 {len(memories)} 条记忆)")
        parts.append("</saved_memory>")
        return "\n".join(parts)

    @staticmethod
    def _build_memory_citations(memories: list[dict]) -> list[dict]:
        """Convert saved-memory dicts to citation dicts for the API response.

        Each citation carries the `source_type="saved_memory"` marker plus
        the original Reader-side fields (artifact_id, artifact_type, memory_id,
        title, source_refs) so Reader can detect it as 「我的记忆」 and jump
        back to the saved Notes card.
        """
        out: list[dict] = []
        for m in memories:
            out.append({
                "chunk_id": f"memory:{m['memory_id']}",
                "source": "saved_memory",
                "section": m.get("title") or "",
                "page": 0,
                "text": m.get("text") or "",
                "span": None,
                "source_type": "saved_memory",
                "artifact_id": m.get("artifact_id") or "",
                "artifact_type": m.get("artifact_type") or "",
                "memory_id": m["memory_id"],
                "title": m.get("title") or "",
                "source_refs": m.get("source_refs") or [],
                "contract_version": "reader-unirag-memory-v1",
            })
        return out

    def _extract_citations(self, answer: str, chunks: list[dict]) -> list[dict]:
        chunk_map = {c["id"]: c for c in chunks}
        seen = set()
        out = []
        settings = load_settings()
        threshold = settings.cite_similarity_threshold
        verifier = CitationVerifier(threshold=threshold)
        last_end = 0
        for m in _CITE_RE.finditer(answer):
            cid = m.group(1)
            if cid in seen:
                last_end = m.end()
                continue
            seen.add(cid)
            chunk = chunk_map.get(cid)
            if chunk is not None:
                meta = chunk.get("metadata", {})
                src = meta.get("source", "")
                section = meta.get("section", "")
                page = meta.get("page", 0)
                cited_text = chunk.get("document") or ""
                # 优先读解析文本 sidecar，回退 uploads 原文（见 resolve_source_text）
                full = resolve_source_text(
                    settings.parsed_dir, self.uploads_dir, cid, src
                )
                span = None
                if full is not None:
                    _, span = locate_citation(full, cited_text)
            else:
                meta = {}
                src = ""
                section = ""
                page = 0
                cited_text = ""
                span = None
            claimed_text = answer[last_end:m.start()].strip()

            # NOTE: For UX reasons, we allow citation verification to be skipped or
            # we just mark it softly without blocking the main thread. Here we run it inline
            # but it is very fast (local BGE-M3 model). If it becomes a bottleneck,
            # we can make this async or run it in a background thread and push updates via WebSocket.
            similarity = verifier.verify(claimed_text, cited_text) if (claimed_text and cited_text) else 0.0

            out.append({
                "chunk_id": cid,
                "source": src,
                "section": section,
                "page": page,
                "text": cited_text,
                "span": span,
                "verified": similarity >= threshold,
                "similarity": round(similarity, 4),
            })
            last_end = m.end()
        return out