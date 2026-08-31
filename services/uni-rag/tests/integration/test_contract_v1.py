"""phase-1-contract-stabilization 契约测试套件。

本模块将 `reader-unirag-memory-v1` 契约钉死在共享 fixtures 上：
  - 请求侧（Reader → UniRAG，camelCase）：POST /api/memory/jobs 接受
    saved-answer-card / reading-card / note / highlight 四类 fixture，
    且均同步返回 status=completed。
  - 响应侧（UniRAG → Reader，snake_case）：/api/query 在 include_memory=true
    时返回的 saved_memory citation 必须携带稳定字段集，并标注
    contract_version="reader-unirag-memory-v1"。
  - 兼容性：缺失 contractVersion 的旧端载荷默认按 v1 处理；
    include_memory 缺省时不得返回 saved_memory citation。

fixtures 来源：workbench 根目录下 `contracts/reader-unirag-memory/v1/`，
由 `_contracts_dir()` 从本测试文件向上查找定位，不硬编码路径索引。
"""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from uni_rag.api.app import create_app


class _FakeMemoryEmbedder:
    """确定性桩 embedder：返回常数向量，避免真实加载/下载 BGE-M3。

    R5 起 POST /api/memory/jobs 会在 MemoryStore.add 内生成向量；这里注入
    轻量桩保证契约测试离线可跑，fast-path 语义不受影响。常数向量使库内
    任意两条记忆 cosine=1.0，向量通道行为完全可预测。
    """

    dim = 4

    def embed(self, texts):
        return [[0.1, 0.2, 0.3, 0.4] for _ in texts]


@pytest.fixture(autouse=True)
def _fake_memory_embedder(monkeypatch):
    """把 MemoryStore 的 get_embedder 替换为轻量桩（仅记忆通道）。"""
    import uni_rag.store.memory as memory_module
    monkeypatch.setattr(
        memory_module, "get_embedder", lambda: _FakeMemoryEmbedder()
    )


# ── fixtures 加载辅助 ──────────────────────────────────────────────────

def _contracts_dir() -> Path:
    """定位 `reader-unirag-memory/v1/` 契约 fixtures 目录。

    优先级：
      1. 环境变量 `VIBEREADER_CONTRACTS_DIR`——子仓独立 clone、目录结构
         与 workbench 主仓不一致时，可显式指向 fixtures 目录。
      2. 回退：从本测试文件向上遍历父目录，依次探测
         `packages/shared-contracts/reader-unirag-memory/v1` 与
         `contracts/reader-unirag-memory/v1`，不硬编码父级索引。
    """
    here = Path(__file__).resolve()
    env_dir = os.environ.get("VIBEREADER_CONTRACTS_DIR")
    if env_dir:
        candidate = Path(env_dir).expanduser().resolve()
        if candidate.is_dir():
            return candidate
    for parent in [here.parent, *here.parents]:
        candidates = [
            parent / "packages" / "shared-contracts" / "reader-unirag-memory" / "v1",
            parent / "contracts" / "reader-unirag-memory" / "v1",
        ]
        for candidate in candidates:
            if candidate.is_dir():
                return candidate
    msg = "contracts/reader-unirag-memory/v1 not found from " + str(here)
    if env_dir:
        msg += f"；注意 VIBEREADER_CONTRACTS_DIR={env_dir} 指向的目录无效"
    raise RuntimeError(msg)


def _load_fixture(name: str) -> dict:
    """读取共享契约 fixture 并解析为 dict。"""
    return json.loads((_contracts_dir() / name).read_text(encoding="utf-8"))


# ── client fixture（自包含，复制自 test_memory_api.py 的隔离模式） ──────

@pytest.fixture
def client(tmp_path, monkeypatch):
    """隔离的 FastAPI TestClient，使用临时数据目录。

    必须同时清空 config 与 routes 模块级单例（FastAPI 在模块级持有它们）。
    额外重置 _memory_store 和 _memory_jobs，确保记忆状态不在测试间泄漏。
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


# ── LLM mock（与 test_memory_api.py 完全一致的 monkeypatch 模式） ───────

def _mock_llm_complete(monkeypatch):
    """将 LLMClient.complete 替换为确定性桩函数，避免真实网络调用。"""
    def fake_complete(self, system, max_tokens=1024):
        return " mocked answer "

    monkeypatch.setattr("uni_rag.llm.client.LLMClient.complete", fake_complete)


# ── 1. saved-answer-card（explain_card）─────────────────────────────────

def test_contract_saved_answer_card_accepted(client):
    """契约维度：Reader 发送的 explain_card（saved-answer-card.json）必须被
    POST /api/memory/jobs 同步接受并返回 status=completed。"""
    payload = _load_fixture("saved-answer-card.json")
    r = client.post("/api/memory/jobs", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "completed"


# ── 2. reading-card（concept_card）──────────────────────────────────────

def test_contract_reading_card_accepted(client):
    """契约维度：concept_card（reading-card.json）必须被接受并同步完成。"""
    payload = _load_fixture("reading-card.json")
    r = client.post("/api/memory/jobs", json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"


# ── 3. note（reading_note，空 sourceRefs）──────────────────────────────

def test_contract_note_accepted(client):
    """契约维度：reading_note（note.json）带空 sourceRefs 时也必须被接受。
    随后 GET job 状态，result.memory_id 必须存在。"""
    payload = _load_fixture("note.json")
    r = client.post("/api/memory/jobs", json=payload)
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]

    r = client.get(f"/api/memory/jobs/{job_id}")
    assert r.status_code == 200, r.text
    result = r.json()["result"]
    assert result is not None
    assert result["memory_id"]


# ── 4. highlight（lens_card）────────────────────────────────────────────

def test_contract_highlight_accepted(client):
    """契约维度：lens_card（highlight.json）必须被接受并同步完成。"""
    payload = _load_fixture("highlight.json")
    r = client.post("/api/memory/jobs", json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"


# ── 5. query-response fixture 字段稳定性（纯 schema 断言）──────────────

def test_contract_query_response_fixture_fields_stable():
    """契约维度：query-response-with-saved-memory.json 中 saved_memory
    citation 的稳定字段集必须齐全——chunk_id 以 memory: 开头、source_type、
    artifact_id、artifact_type、memory_id、title、source_refs（列表）、
    contract_version。此为纯 schema 断言，不发起 HTTP 请求。"""
    fixture = _load_fixture("query-response-with-saved-memory.json")
    memory_cites = [
        c for c in fixture["citations"]
        if c.get("source_type") == "saved_memory"
    ]
    assert len(memory_cites) == 1, f"预期 1 条 saved_memory citation，实际 {len(memory_cites)}"
    cite = memory_cites[0]
    assert cite["chunk_id"].startswith("memory:")
    assert cite["source_type"] == "saved_memory"
    assert cite["artifact_id"]
    assert cite["artifact_type"]
    assert cite["memory_id"]
    assert cite["title"]
    assert isinstance(cite["source_refs"], list)
    assert cite["contract_version"] == "reader-unirag-memory-v1"


# ── 6. 未知 memory job 返回 404 ─────────────────────────────────────────

def test_contract_unknown_memory_job_returns_404(client):
    """契约维度：GET /api/memory/jobs/{job_id} 对不存在的 job_id 必须返回 404。"""
    r = client.get("/api/memory/jobs/art-deleted-999-nonexistent")
    assert r.status_code == 404


# ── 7. include_memory=false 不返回 saved_memory citation ──────────────

def test_contract_include_memory_false_omits_saved_memory_citation(client, monkeypatch):
    """契约维度：include_memory 缺省/为 false 时，/api/query 的 citations 中
    不得出现 source_type=="saved_memory" 的条目，确保原有文档 RAG 路径不受
    记忆后端影响。"""
    payload = _load_fixture("saved-answer-card.json")
    client.post("/api/memory/jobs", json=payload)

    _mock_llm_complete(monkeypatch)

    r = client.post(
        "/api/query",
        json={"question": "什么是监督学习？"},
    )
    assert r.status_code == 200, r.text
    memory_cites = [
        c for c in r.json()["citations"]
        if c.get("source_type") == "saved_memory"
    ]
    assert memory_cites == [], (
        f"include_memory=false 不应返回 saved_memory citation：{memory_cites}"
    )


# ── 8. 空记忆库查询不报错 ───────────────────────────────────────────────

def test_contract_empty_memory_store_query_does_not_break(client, monkeypatch):
    """契约维度：记忆库为空时，include_memory=true 的查询仍必须返回 200，
    且 citations 中不得出现 saved_memory 条目。"""
    _mock_llm_complete(monkeypatch)

    r = client.post(
        "/api/query",
        json={"question": "anything", "include_memory": True},
    )
    assert r.status_code == 200, r.text
    memory_cites = [
        c for c in r.json()["citations"]
        if c.get("source_type") == "saved_memory"
    ]
    assert memory_cites == []


# ── 9. camelCase 载荷的 contractVersion 被持久化 ───────────────────────

def test_contract_version_persisted_from_camelcase_payload(client):
    """契约维度：saved-answer-card.json 携带 contractVersion="reader-unirag-memory-v1"
    （camelCase），POST 后持久化的记忆必须携带 contract_version=="reader-unirag-memory-v1"
    （snake_case）。"""
    payload = _load_fixture("saved-answer-card.json")
    r = client.post("/api/memory/jobs", json=payload)
    assert r.json()["status"] == "completed"

    from uni_rag.api.routes import get_memory_store
    store = get_memory_store()
    recent = store.list_recent(1)
    assert recent, "持久化后应至少有 1 条记忆"
    assert recent[0]["contract_version"] == "reader-unirag-memory-v1"


# ── 10. 查询返回的 saved_memory citation 携带 contract_version ─────────

def test_contract_version_in_query_saved_memory_citation(client, monkeypatch):
    """契约维度：POST saved-answer-card.json 后，include_memory=true 查询返回的
    saved_memory citation 必须携带 contract_version=="reader-unirag-memory-v1"。"""
    payload = _load_fixture("saved-answer-card.json")
    client.post("/api/memory/jobs", json=payload)

    _mock_llm_complete(monkeypatch)

    r = client.post(
        "/api/query",
        json={"question": "什么是监督学习？", "include_memory": True},
    )
    assert r.status_code == 200, r.text
    memory_cites = [
        c for c in r.json()["citations"]
        if c.get("source_type") == "saved_memory"
    ]
    assert len(memory_cites) == 1, f"预期 1 条 saved_memory citation，实际 {len(memory_cites)}"
    assert memory_cites[0]["contract_version"] == "reader-unirag-memory-v1"


# ── 11. 缺失 contractVersion 的旧端载荷默认按 v1 处理 ─────────────────

def test_contract_legacy_payload_without_contract_version_defaults_to_v1(client):
    """契约维度：删除 saved-answer-card.json 中 memory.contractVersion 后，
    旧端载荷的持久化记忆 contract_version 必须默认为 "reader-unirag-memory-v1"。"""
    payload = copy.deepcopy(_load_fixture("saved-answer-card.json"))
    payload["memory"].pop("contractVersion", None)
    r = client.post("/api/memory/jobs", json=payload)
    assert r.json()["status"] == "completed"

    from uni_rag.api.routes import get_memory_store
    store = get_memory_store()
    recent = store.list_recent(1)
    assert recent, "持久化后应至少有 1 条记忆"
    assert recent[0]["contract_version"] == "reader-unirag-memory-v1"
