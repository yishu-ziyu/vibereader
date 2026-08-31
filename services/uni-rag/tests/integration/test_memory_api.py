"""Integration tests for the phase-1 memory backend.

Covers the Reader-side contract:
  1. POST /api/memory/jobs persists a saved_artifact synchronously
     and returns status="completed" (Reader fast-paths on this).
  2. GET /api/memory/jobs/{job_id} returns the persisted status.
  3. After persistence, a query with include_memory=true surfaces
     a saved_memory citation.
  4. include_memory=false (default) keeps queries memory-free so the
     existing document RAG path is unchanged.

Reader sends camelCase fields; the API accepts them via Pydantic aliases.
"""
from __future__ import annotations
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from uni_rag.api.app import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Isolated FastAPI TestClient with a tmp data dir.

    We must wipe both config and routes singletons because FastAPI holds
    them at module level. _memory_store and _memory_jobs are added so
    memory state never leaks between tests.
    """
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    import uni_rag.config as config_module
    import uni_rag.api.routes as routes_module

    config_module._settings = None
    routes_module._pipeline = None
    routes_module._memory_store = None
    routes_module._memory_jobs.clear()

    app = create_app()
    return TestClient(app)


def _reader_payload(
    artifact_id: str = "art-001",
    title: str = "监督学习笔记",
    answer: str = "监督学习使用标注数据训练模型。",
    artifact_type: str = "answer",
    created_at: int | None = None,
) -> dict:
    """Build a Reader-style camelCase memory payload.

    Mirrors `apps/reader/src/services/savedMemoryService.js::buildSavedMemoryPayload`.
    """
    if created_at is None:
        created_at = int(time.time())
    return {
        "memory": {
            "source": "vibereader",
            "kind": "saved_artifact",
            "artifactId": artifact_id,
            "artifactType": artifact_type,
            "title": title,
            "document": {
                "id": "doc-1",
                "name": "sample.md",
                "kind": "md",
            },
            "verificationStatus": "ungrounded",
            "sourceRefs": [
                {
                    "documentId": "doc-1",
                    "documentName": "sample.md",
                    "page": 1,
                    "chunkId": "src1",
                    "label": "§1",
                    "text": "监督学习使用标注数据。",
                }
            ],
            "content": {
                "question": "什么是监督学习？",
                "answer": answer,
                "summary": "",
                "explanation": "",
                "body": "",
                "userNote": "",
                "keyPoints": [],
                "claims": [],
            },
            "text": "",
            "createdAt": created_at,
            "savedAt": created_at,
        }
    }


# ── POST /api/memory/jobs ──────────────────────────────────────────────


def test_post_memory_jobs_persists_synchronously(client):
    """POST returns status=completed so Reader can fast-path."""
    r = client.post("/api/memory/jobs", json=_reader_payload())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "completed"
    assert body["job_id"]
    assert body["status_url"].endswith(f"/api/memory/jobs/{body['job_id']}")


def test_post_memory_jobs_accepts_snake_case(client):
    """API also accepts snake_case field names (populate_by_name=True)."""
    payload = _reader_payload()
    # Convert top-level memory fields to snake_case to verify both paths
    mem = payload["memory"]
    snake_mem = {
        "source": mem["source"],
        "kind": mem["kind"],
        "artifact_id": mem["artifactId"],
        "artifact_type": mem["artifactType"],
        "title": mem["title"],
        "document": mem["document"],
        "verification_status": mem["verificationStatus"],
        "source_refs": mem["sourceRefs"],
        "content": mem["content"],
        "text": mem["text"],
        "created_at": mem["createdAt"],
        "saved_at": mem["savedAt"],
    }
    r = client.post("/api/memory/jobs", json={"memory": snake_mem})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"


def test_post_memory_jobs_persists_artifact_types(client):
    """All 6 Reader artifact types should be accepted."""
    for atype in ("answer", "card", "note", "highlight", "summary", "qa"):
        payload = _reader_payload(
            artifact_id=f"art-{atype}",
            title=f"{atype} 标题",
            artifact_type=atype,
        )
        r = client.post("/api/memory/jobs", json=payload)
        assert r.status_code == 200, f"{atype}: {r.text}"
        assert r.json()["status"] == "completed"


def test_post_memory_jobs_missing_memory_field_returns_422(client):
    """Body without `memory` should be rejected by schema validation."""
    r = client.post("/api/memory/jobs", json={"foo": "bar"})
    assert r.status_code == 422


# ── GET /api/memory/jobs/{job_id} ──────────────────────────────────────


def test_get_memory_job_status_after_post(client):
    """After POST, GET returns completed with memory_id in result."""
    r = client.post("/api/memory/jobs", json=_reader_payload())
    job_id = r.json()["job_id"]

    r = client.get(f"/api/memory/jobs/{job_id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "completed"
    assert body["result"]["memory_id"] == job_id  # we use memory_id as job_id
    assert body["result"]["chunks"] == 1


def test_get_memory_job_unknown_returns_404(client):
    r = client.get("/api/memory/jobs/does-not-exist")
    assert r.status_code == 404


# ── Persistence survives across requests ───────────────────────────────


def test_memory_persists_across_requests(client):
    """A second POST should not wipe the first memory (SQLite persistence)."""
    p1 = _reader_payload(artifact_id="art-A", title="记忆 A")
    p2 = _reader_payload(artifact_id="art-B", title="记忆 B")
    client.post("/api/memory/jobs", json=p1)
    client.post("/api/memory/jobs", json=p2)

    from uni_rag.api.routes import get_memory_store
    store = get_memory_store()
    assert store.count() == 2
    recent = store.list_recent(10)
    titles = {m["title"] for m in recent}
    assert titles == {"记忆 A", "记忆 B"}


# ── Query integration (mocked LLM, no real retriever deps) ─────────────


def test_query_with_include_memory_returns_saved_memory_citation(
    client, monkeypatch
):
    """End-to-end: persist a memory, then query with include_memory=true.

    LLM is mocked so we don't need a real API key. The retriever is left
    intact; an empty corpus simply yields no document chunks, but memory
    citations must still be appended.
    """
    # 1. Persist a memory
    payload = _reader_payload(
        artifact_id="art-query-1",
        title="监督学习定义",
        answer="监督学习使用标注数据训练模型。",
    )
    r = client.post("/api/memory/jobs", json=payload)
    assert r.json()["status"] == "completed"

    # 2. Mock the LLM so /api/query doesn't hit the network
    def fake_complete(self, system, max_tokens=1024):
        return "根据用户笔记，监督学习使用标注数据。"

    monkeypatch.setattr(
        "uni_rag.llm.client.LLMClient.complete", fake_complete
    )

    # 3. Query with include_memory=true
    r = client.post(
        "/api/query",
        json={
            "question": "什么是监督学习？",
            "include_memory": True,
            "memory_top_k": 3,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    memory_cites = [
        c for c in body["citations"] if c.get("source_type") == "saved_memory"
    ]
    assert len(memory_cites) == 1, f"expected 1 memory citation, got {memory_cites}"
    cite = memory_cites[0]
    assert cite["artifact_id"] == "art-query-1"
    assert cite["artifact_type"] == "answer"
    assert cite["memory_id"]
    assert cite["title"] == "监督学习定义"
    assert cite["source_refs"]  # populated from sourceRefs
    # chunk_id should be memory-scoped so it doesn't collide with doc chunks
    assert cite["chunk_id"].startswith("memory:")


def test_query_without_include_memory_has_no_saved_memory_citation(
    client, monkeypatch
):
    """Default query must not surface memory citations (regression guard)."""
    client.post(
        "/api/memory/jobs",
        json=_reader_payload(
            artifact_id="art-query-2",
            title="无监督学习",
            answer="无监督学习使用未标注数据。",
        ),
    )

    def fake_complete(self, system, max_tokens=1024):
        return "无监督学习使用未标注数据。"

    monkeypatch.setattr(
        "uni_rag.llm.client.LLMClient.complete", fake_complete
    )

    r = client.post(
        "/api/query",
        json={"question": "什么是无监督学习？"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    memory_cites = [
        c for c in body["citations"] if c.get("source_type") == "saved_memory"
    ]
    assert memory_cites == [], (
        f"include_memory=false must not return saved_memory citations: {memory_cites}"
    )


def test_query_include_memory_with_empty_store_does_not_break(
    client, monkeypatch
):
    """When there is no memory yet, query must still succeed."""

    def fake_complete(self, system, max_tokens=1024):
        return "未找到相关资料。"

    monkeypatch.setattr(
        "uni_rag.llm.client.LLMClient.complete", fake_complete
    )

    r = client.post(
        "/api/query",
        json={
            "question": "anything",
            "include_memory": True,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    memory_cites = [
        c for c in body["citations"] if c.get("source_type") == "saved_memory"
    ]
    assert memory_cites == []
