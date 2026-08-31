"""Pydantic schemas for API."""
from __future__ import annotations
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class QueryRequest(BaseModel):
    question: str
    session_id: str | None = None
    top_k: int = 5
    style: str = "academic"
    api_key: str | None = None
    provider: str = "minimax"  # "minimax" | "stepfun" | "local"
    mode: str = "chat"  # "chat" | "translate" | "flashcards" | "quiz" | "graph"
    # Memory backend (phase-1): when true, /api/query also retrieves saved
    # user memories and appends them as `saved_memory` citations.
    include_memory: bool = False
    memory_top_k: int = 3


class Citation(BaseModel):
    """A single piece of evidence returned alongside an answer.

    Raw document citations use only the original fields (chunk_id/source/
    section/page/text/span). Saved-memory citations additionally populate
    the optional memory fields so Reader can detect `source_type == "saved_memory"`
    and render them as 「我的记忆」.
    """
    chunk_id: str
    source: str
    section: str
    page: int = 0
    text: str
    span: tuple[int, int] | None = None
    # ── Memory backend extensions (all optional, default None) ──
    # Reader detects memory citations via `source_type` or presence of
    # `artifact_id` / `memory_id`. See Reader `ragEngineAdapter.js`
    # `normalizeCitation` for detection logic.
    source_type: str | None = None
    artifact_id: str | None = None
    artifact_type: str | None = None
    memory_id: str | None = None
    title: str | None = None
    source_refs: list[dict[str, Any]] | None = None
    # contract_version (phase-1-contract-stabilization): marks which
    # Reader↔UniRAG memory contract this citation obeys. Optional so old
    # UniRAG responses without it still parse; Reader defaults to v1.
    contract_version: str | None = None


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]
    session_id: str | None = None


class IngestResponse(BaseModel):
    source_id: str
    chunks: int
    format: str
    filename: str


class IngestJobStartResponse(BaseModel):
    job_id: str
    status_url: str


class IngestJobStatusResponse(BaseModel):
    job_id: str
    status: str
    step: str
    percent: int
    message: str
    filename: str
    result: IngestResponse | None = None
    error: str | None = None


class DocumentInfo(BaseModel):
    filename: str
    chunks: int
    format: str = "unknown"
    platform: str | None = None
    source_url: str | None = None


class DocumentListResponse(BaseModel):
    documents: list[DocumentInfo]


class ChunkInfo(BaseModel):
    """A single chunk of a document, for the side-panel viewer."""
    id: str
    text: str
    span: tuple[int, int] | None = None
    section: str = ""


class DocumentChunksResponse(BaseModel):
    """All chunks of a single document, ordered by offset."""
    filename: str
    chunks: list[ChunkInfo]


class ExportFormat(str):
    MD = "md"
    PDF = "pdf"


class KbCreateRequest(BaseModel):
    name: str
    description: str = ""
    id: str | None = None  # 可选指定 ID


class KbInfo(BaseModel):
    id: str
    name: str
    description: str
    created_at: str


class KbListResponse(BaseModel):
    kbs: list[KbInfo]


class SessionKbBindRequest(BaseModel):
    kb_ids: list[str]


class SessionKbListResponse(BaseModel):
    session_id: str
    kbs: list[KbInfo]


class SuggestQuestionsRequest(BaseModel):
    text: str
    api_key: str | None = None
    provider: str = "minimax"


class SuggestQuestionsResponse(BaseModel):
    questions: list[str]


class DeleteResponse(BaseModel):
    deleted: bool


class ProviderInfo(BaseModel):
    id: str
    name: str
    model: str


class ProvidersResponse(BaseModel):
    providers: list[ProviderInfo]


# ──────────────────────────────────────────────────────────────────────────
# Memory backend schemas (phase-1: saved_artifact persistence + retrieval)
#
# Reader sends camelCase fields; we accept both camelCase (alias) and
# snake_case (field name) via populate_by_name=True.
# See `apps/reader/src/services/savedMemoryService.js::buildSavedMemoryPayload`
# for the canonical Reader-side contract.
# ──────────────────────────────────────────────────────────────────────────


class MemoryGrounding(BaseModel):
    """Reader-side grounding info attached to each sourceRef."""
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    precision: str | None = None
    matched_by: str | None = Field(default=None, alias="matchedBy")
    score: float | None = None


class MemorySourceRef(BaseModel):
    """A single source reference inside a saved_artifact memory payload."""
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    document_id: str = Field(default="", alias="documentId")
    document_name: str = Field(default="", alias="documentName")
    page: int | None = None
    paragraph_id: str = Field(default="", alias="paragraphId")
    chunk_id: str = Field(default="", alias="chunkId")
    label: str = ""
    text: str = ""
    grounding: MemoryGrounding | None = None


class MemoryDocument(BaseModel):
    """Document metadata embedded in a saved_artifact memory payload."""
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = ""
    name: str = ""
    kind: str = ""
    fingerprint: str | None = None


class MemoryContent(BaseModel):
    """Structured content of a saved_artifact.

    All fields are optional and default to empty. `claims` is heterogeneous
    (elements may be str or {text: str, ...}); we type as list[Any] to avoid
    over-constraining.
    """
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    question: str = ""
    answer: str = ""
    summary: str = ""
    explanation: str = ""
    body: str = ""
    user_note: str = Field(default="", alias="userNote")
    key_points: list[str] = Field(default_factory=list, alias="keyPoints")
    claims: list[Any] = Field(default_factory=list)


class MemoryPayload(BaseModel):
    """The `memory` object inside a POST /api/memory/jobs request body.

    Field aliases match Reader's camelCase payload exactly. Reader generates
    `artifactId`; UniRAG generates `memory_id` (returned in job status result).
    """
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    source: str = "vibereader"
    kind: str = "saved_artifact"
    artifact_id: str = Field(alias="artifactId")
    artifact_type: str = Field(default="artifact", alias="artifactType")
    title: str = ""
    document: MemoryDocument = Field(default_factory=MemoryDocument)
    verification_status: str = Field(
        default="ungrounded", alias="verificationStatus"
    )
    source_refs: list[MemorySourceRef] = Field(
        default_factory=list, alias="sourceRefs"
    )
    content: MemoryContent = Field(default_factory=MemoryContent)
    text: str = ""
    created_at: int = Field(alias="createdAt")
    saved_at: int = Field(alias="savedAt")
    # contract_version (phase-1-contract-stabilization): Reader sends
    # contractVersion; we accept both alias and snake_case. Defaults to
    # v1 so old Reader payloads (without the field) still parse.
    contract_version: str = Field(
        default="reader-unirag-memory-v1", alias="contractVersion"
    )


class MemoryJobsRequest(BaseModel):
    """Root request body for POST /api/memory/jobs.

    Reader wraps the memory object: `{"memory": {...}}`. See
    `apps/reader/src/services/ragEngineAdapter.js::ingestMemory`.
    """
    model_config = ConfigDict(populate_by_name=True)

    memory: MemoryPayload


class MemoryJobStartResponse(BaseModel):
    """Response for POST /api/memory/jobs. Reader expects snake_case."""
    job_id: str
    status_url: str | None = None
    status: str = "queued"  # "queued" | "completed"


class MemoryJobResult(BaseModel):
    """Result object returned inside MemoryJobStatusResponse when status=completed.

    `memory_id` is generated by UniRAG and consumed by Reader.
    """
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    memory_id: str | None = None
    chunks: int = 0


class MemoryJobStatusResponse(BaseModel):
    """Response for GET /api/memory/jobs/{job_id}. Reader expects snake_case."""
    job_id: str
    status: str  # "queued" | "running" | "completed" | "failed"
    step: str = ""
    percent: int = 0
    message: str = ""
    result: MemoryJobResult | None = None
    error: str | None = None
