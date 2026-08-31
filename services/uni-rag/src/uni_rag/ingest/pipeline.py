"""Ingest pipeline: parse -> (text chunk -> embed) + (visual tile -> embed) -> store."""
from __future__ import annotations
import hashlib
import logging
from pathlib import Path
from collections.abc import Callable
from uni_rag.ingest.parsers import parse_document
from uni_rag.ingest.chunker import chunk_document
from uni_rag.ingest.embedder import get_embedder
from uni_rag.ingest.visual_embedder import get_visual_embedder
from uni_rag.ingest.quality import ChunkQualityFilter
from uni_rag.ingest.url_parser import parse_url_result
from uni_rag.ingest import link_extractors
from uni_rag.store.vector import VectorStore
from uni_rag.store.bm25 import BM25Index
from uni_rag.config import load_settings


logger = logging.getLogger(__name__)


def _safe_upload_name(name: str) -> str:
    """Return a filename-only upload name, stripping client-supplied paths."""
    safe = Path(name.replace("\\", "/")).name
    if safe in ("", ".", ".."):
        raise ValueError("invalid upload filename")
    return safe


class IngestPipeline:
    """kb_id=None = legacy single-KB mode (v0.2 default collection 'chunks', single BM25 dir)."""

    def __init__(self, kb_id: str | None = None):
        self.embedder = get_embedder()
        self.quality_filter = ChunkQualityFilter()
        self.kb_id = kb_id
        if kb_id is None:
            # Legacy: v0.2 兼容模式
            self.vector = VectorStore()
            self.bm25 = BM25Index(load_settings().bm25_dir)
            self.uploads_dir = load_settings().uploads_dir
        else:
            # Per-KB mode
            data_dir = load_settings().data_dir
            kb_base = data_dir / "kbs" / kb_id
            chroma_dir = kb_base / "chroma"
            bm25_dir = kb_base / "bm25"
            uploads_dir = kb_base / "uploads"
            chroma_dir.mkdir(parents=True, exist_ok=True)
            bm25_dir.mkdir(parents=True, exist_ok=True)
            uploads_dir.mkdir(parents=True, exist_ok=True)
            self.vector = VectorStore(data_dir=chroma_dir, collection_name=f"kb_{kb_id}")
            self.bm25 = BM25Index(bm25_dir)
            self.uploads_dir = uploads_dir

        # Visual RAG store: separate collection for image embeddings
        self.visual_embedder = get_visual_embedder()
        self.visual_tiles_dir = load_settings().visual_tiles_dir
        self.visual_tiles_dir.mkdir(parents=True, exist_ok=True)

        if kb_id is None:
            self.visual_vector = VectorStore(collection_name="visual_chunks")
        else:
            visual_chroma = (load_settings().data_dir / "kbs" / kb_id / "chroma_visual")
            visual_chroma.mkdir(parents=True, exist_ok=True)
            self.visual_vector = VectorStore(
                data_dir=visual_chroma,
                collection_name=f"kb_{kb_id}_visual",
            )

    def _source_id(self, path: Path) -> str:
        h = hashlib.sha256()
        h.update(str(path.resolve()).encode())
        h.update(path.read_bytes()[:1024 * 1024])  # 前 1MB
        return h.hexdigest()[:16]

    @staticmethod
    def _save_parsed_sidecar(source_id: str, text: str) -> None:
        """把解析后的全文保存为 sidecar：<parsed_dir>/<source_id>.md。

        PDF 等二进制原文无法直接 read_text 定位 citation span，
        query 侧优先读这份解析文本（见 rag/pipeline.resolve_source_text）。
        """
        if not text:
            return
        try:
            sidecar = load_settings().parsed_dir / f"{source_id}.md"
            sidecar.write_text(text, encoding="utf-8")
        except OSError as e:
            logger.warning("保存解析文本 sidecar 失败 %s: %s", source_id, e)

    def ingest_file(
        self,
        path: Path,
        original_name: str | None = None,
        progress: Callable[[dict], None] | None = None,
    ) -> dict:
        def emit(step: str, percent: int, message: str, **extra) -> None:
            if progress:
                progress({"step": step, "percent": percent, "message": message, **extra})

        path = Path(path)
        save_name = _safe_upload_name(original_name or path.name)
        emit("saving", 5, "正在保存上传文件")
        dest = self.uploads_dir / save_name
        dest.write_bytes(path.read_bytes())

        # Visual tiles are stored per-document under visual_tiles/<source_id>/
        visual_tiles_subdir = self.visual_tiles_dir / self._source_id(dest)

        emit("parsing", 20, "正在解析文档内容")
        doc = parse_document(dest, visual_tiles_dir=visual_tiles_subdir)
        source_id = self._source_id(dest)
        self._save_parsed_sidecar(source_id, doc.text)

        emit("chunking", 40, "正在按章节和段落切分")
        chunks = chunk_document(doc.text, source_id=source_id, pages=getattr(doc, 'pages', None))
        if not chunks:
            emit("done", 100, "未解析出可用文本", chunks=0, source_id=source_id)
            return {"source_id": source_id, "chunks": 0, "format": doc.format}

        if self.quality_filter.enabled:
            kept, dropped = self.quality_filter.filter(chunks)
            if dropped:
                emit("filtering", 55, f"质量过滤：保留 {len(kept)} / 丢弃 {len(dropped)}")
            chunks = kept

        # ── Text channel ──
        texts = [c.text for c in chunks]
        emit("embedding", 60, f"正在生成 {len(chunks)} 个文本块的向量", chunks=len(chunks))
        vecs = self.embedder.embed(texts)

        emit("indexing", 82, "正在写入向量索引和关键词索引", chunks=len(chunks))
        for c, v in zip(chunks, vecs):
            self.vector.add(
                source_id=source_id,
                chunk_id=f"{source_id}:{c.start_offset}",
                embedding=v,
                metadata={
                    "source": save_name,
                    "format": doc.format,
                    "section": c.section_title or "",
                    "page": c.page_number or 0,
                    "start": c.start_offset,
                    "end": c.end_offset,
                },
                document=c.text,
            )

        for c in chunks:
            self.bm25.add(
                chunk_id=f"{source_id}:{c.start_offset}",
                text=c.text,
                metadata={"source": save_name, "section": c.section_title or "", "page": c.page_number or 0},
            )
        self.bm25.save()

        # ── Visual channel ──
        visual_count = 0
        if doc.visual_tiles and self.visual_embedder and self.visual_embedder.available:
            emit("visual-embedding", 75, f"正在对 {len(doc.visual_tiles)} 张页面截图做视觉嵌入")
            try:
                visual_vecs = self.visual_embedder.embed_images(doc.visual_tiles)
                for page_path, v in zip(doc.visual_tiles, visual_vecs):
                    self.visual_vector.add(
                        source_id=source_id,
                        chunk_id=f"{source_id}:visual:{page_path.stem}",
                        embedding=v,
                        metadata={
                            "source": save_name,
                            "format": doc.format,
                            "page": int(page_path.stem.split("_")[-1]),
                            "tile_path": str(page_path),
                        },
                        document=None,
                    )
                visual_count = len(doc.visual_tiles)
            except Exception as e:
                logger.warning("Visual embedding failed for %s: %s", source_id, e)

        emit("done", 100, "入库完成",
             chunks=len(chunks), visual_tiles=visual_count, source_id=source_id)

        return {
            "source_id": source_id,
            "chunks": len(chunks),
            "visual_tiles": visual_count,
            "format": doc.format,
        }

    def ingest_url(
        self,
        url: str,
        original_name: str | None = None,
        progress: Callable[[dict], None] | None = None,
    ) -> dict:
        """From URL extraction and index. Reuses existing chunk/embed/index flow."""
        def emit(step: str, percent: int, message: str, **extra) -> None:
            if progress:
                progress({"step": step, "percent": percent, "message": message, **extra})

        emit("extracting", 5, "正在识别链接并提取内容")
        extraction = link_extractors.extract(url)

        emit("parsing", 25, "正在解析提取的内容")
        doc = parse_url_result(extraction)
        source_id = self._source_id_from_url(url, doc.text)
        self._save_parsed_sidecar(source_id, doc.text)

        emit("chunking", 40, "正在按章节和段落切分")
        chunks = chunk_document(doc.text, source_id=source_id, pages=getattr(doc, 'pages', None))
        if not chunks:
            emit("done", 100, "未解析出可用文本", chunks=0, source_id=source_id)
            return {"source_id": source_id, "chunks": 0, "format": doc.format}

        if self.quality_filter.enabled:
            kept, dropped = self.quality_filter.filter(chunks)
            if dropped:
                emit("filtering", 55, f"质量过滤：保留 {len(kept)} / 丢弃 {len(dropped)}")
            chunks = kept

        texts = [c.text for c in chunks]
        emit("embedding", 60, f"正在生成 {len(chunks)} 个文本块的向量", chunks=len(chunks))
        vecs = self.embedder.embed(texts)

        save_name = original_name or extraction.title or url
        emit("indexing", 82, "正在写入向量索引和关键词索引", chunks=len(chunks))
        for c, v in zip(chunks, vecs):
            self.vector.add(
                source_id=source_id,
                chunk_id=f"{source_id}:{c.start_offset}",
                embedding=v,
                metadata={
                    "source": save_name,
                    "format": doc.format,
                    "platform": extraction.platform,
                    "source_url": extraction.source_url,
                    "content_type": extraction.content_type,
                    "section": c.section_title or "",
                    "page": c.page_number or 0,
                    "start": c.start_offset,
                    "end": c.end_offset,
                },
                document=c.text,
            )

        for c in chunks:
            self.bm25.add(
                chunk_id=f"{source_id}:{c.start_offset}",
                text=c.text,
                metadata={
                    "source": save_name,
                    "section": c.section_title or "",
                    "page": c.page_number or 0,
                    "platform": extraction.platform,
                    "source_url": extraction.source_url,
                },
            )
        self.bm25.save()
        emit("done", 100, "入库完成", chunks=len(chunks), source_id=source_id)

        return {"source_id": source_id, "chunks": len(chunks), "format": doc.format,
                "filename": save_name}

    @staticmethod
    def _source_id_from_url(url: str, text: str) -> str:
        h = hashlib.sha256()
        h.update(url.encode())
        h.update(text[:1024 * 1024].encode())
        return h.hexdigest()[:16]

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        """Test seam: vector-only search within this KB."""
        vec = self.embedder.embed([query])[0]
        return self.vector.query(vec, top_k=top_k)

    def visual_search(self, query: str, top_k: int = 5) -> list[dict]:
        """Visual RAG search: embed the text query with the visual embedder,
        then query the visual vector collection for visually-similar page tiles.

        Falls back gracefully if visual embedder is unavailable.
        """
        if not self.visual_embedder or not self.visual_embedder.available:
            return []
        try:
            vec = self.visual_embedder.embed_text(query) if isinstance(query, str) else query
            if not isinstance(vec, list):
                return []
            return self.visual_vector.query(vec, top_k=top_k)
        except Exception as e:
            logger.warning("Visual search failed: %s", e)
            return []
