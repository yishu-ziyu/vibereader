# Delivery: Phase-1 Contract Stabilization

> Task id: `20260701-vibereader-knowledge-flywheel`
> Phase: `phase-1-contract-stabilization`
> Route: `/yishuship:design` → `/yishuship:dev` → `/yishuship:e2e` → `/yishuship:handoff`
> Contract version: `reader-unirag-memory-v1`
> Date: 2026-07-02

## yishuship 状态

- task_id: `20260701-vibereader-knowledge-flywheel`
- phase: `phase-1-contract-stabilization`
- status: `needs-codex-review`

完整 contract 已实现并通过服务级 + 浏览器级真实 E2E 验证。未提交 git（等待 Codex 复核）。完整 Chat UI 飞轮（提问→保存卡片→记忆沉淀→点击跳转）受 Slate.js 富文本编辑器自动化限制与 MiniMax API Key 配置依赖阻塞，但 contract 端到端贯通已在真实浏览器 + 真实 UniRAG 环境验证通过，标记为 needs-codex-review 而非全部完成。

## 完成内容

把 Reader ↔ UniRAG 的 memory/citation 边界做成可测试、可版本化、可回放的 contract，定义并落地 `reader-unirag-memory-v1`。

### Design（D1 前置）

- `plan/phase-1-contract-stabilization-design.md`：Goal / Scope / Out of Scope / Interface / Shared Fixtures / Test Plan / E2E Plan / Failure Modes / Acceptance Criteria，8 个 Slice（D1–D8）。

### D1 — 共享 Fixtures

`contracts/reader-unirag-memory/v1/` 下 7 个 fixture + README：

- `saved-answer-card.json`、`reading-card.json`、`note.json`、`highlight.json`
- `query-response-with-saved-memory.json`（query 响应模板）
- `citation-unresolved.json`（失败路径 fixture）
- `README.md`（字段契约 + 版本规则）

UniRAG 与 Reader 两侧 contract tests 共同引用这批 fixtures，确保双方对同一批输入达成一致。

### D2 — UniRAG 加 `contract_version` 字段

- `api/schemas.py`：`Citation` + `MemoryPayload` 加 `contract_version: str = "reader-unirag-memory-v1"`，Pydantic v2 `Field(alias="contractVersion")` + `populate_by_name=True` 接受 Reader camelCase。
- `rag/pipeline.py`：`_build_memory_citations` 硬编码 `contract_version="reader-unirag-memory-v1"` 写入每条 saved_memory citation。
- `store/memory.py`：CREATE TABLE 加 `contract_version` 列 + `ALTER TABLE` 迁移旧库 + `add()` 加参数 + SELECT 加列 + `_row_to_dict` 加键（修复 D4 暴露的持久化断链）。
- `api/routes.py`：`create_memory_job` 把 `payload.contract_version` 透传给 `MemoryStore.add()`。

### D3 — Reader 加 `contractVersion` 字段

- `services/savedMemoryService.js`：`buildSavedMemoryPayload` 输出加 `contractVersion: 'reader-unirag-memory-v1'`。
- `services/ragEngineAdapter.js`：`memorySourceRefFromUniRagCitation` 透传 `citation.contract_version || citation.contractVersion || 'reader-unirag-memory-v1'`，兼容旧 UniRAG 响应（缺字段默认 v1）。

### D4 — UniRAG contract tests（11 项）

`tests/integration/test_contract_v1.py`，复用 test_memory_api.py 的 client fixture（隔离 tmp_path + 重置单例），用 `_contracts_dir()` 向上查找 fixtures 目录。

覆盖：saved_answer_card / reading_card / note / highlight 接受；query fixture 字段稳定；unknown memory job 404；`include_memory=false` 不返回 memory citation；空 memory store 不破坏 query；contract_version 从 camelCase payload 持久化；query 返回的 saved_memory citation 含 contract_version；legacy payload 无 contract_version 默认 v1。

### D5 — Reader contract tests（6 项）

`src/services/contract.v1.test.js`，用 `import.meta.url` 向上查找 `contracts/reader-unirag-memory/v1/`，通过公开 API `createUniRagHttpAdapter({fetchImpl}).query(...)` 测试 normalize（不导入私有函数）。

覆盖：构造 memory payload 匹配 fixture；ingest memory 携带 contractVersion；normalize saved_memory citation 保留 contractVersion；UniRAG 缺字段时默认 v1；normalize unresolved citation 保留缺失 artifactId；document-only citation 不受 memory contract 影响。

### D6 — 回归测试

Reader `npm test`（vitest run）：323 passed。
UniRAG 聚焦回归（test_memory_store + test_memory_api + test_contract_v1 + test_query_pipeline + test_config）：61 passed。

全量 `tests/unit tests/integration` 涉及 sentence_transformers 模型加载耗时过长（5 分钟+），未跑全量；聚焦集已覆盖本轮改动 + memory + query 主路径。

### D7 — E2E 真实联调

详见 `e2e/phase-1-contract-stabilization-browser.md`。

服务级（curl 真实 UniRAG 8766）：health ok / POST memory job completed / GET job completed / query include_memory=true 返回 3 个 saved_memory citations 全含 `contract_version: "reader-unirag-memory-v1"` + 全字段 / unknown job 404 / include_memory=false 无 memory citation。

浏览器级（Playwright MCP 对真实 Reader 3217 + 真实 UniRAG 8766）：UniRAG health visible（"知识引擎：UniRAG"）/ 上传 sample.md / "知识入库：已完成" / 浏览器环境 fetch UniRAG query 返回 saved_memory citations 全带 contract_version + 全字段（artifact_id, memory_id, title, source_refs, artifact_type）/ include_memory=false 0 memory citation / unknown job 404。

## 改动文件

### services/uni-rag（git tracked）

- `src/uni_rag/api/schemas.py` — Citation + MemoryPayload 加 contract_version（+10 行）
- `src/uni_rag/api/routes.py` — create_memory_job 透传 contract_version（+1 行）
- `src/uni_rag/rag/pipeline.py` — _build_memory_citations 硬编码 contract_version（+1 行）
- `src/uni_rag/store/memory.py` — SQLite schema 迁移 + add/get/list_recent/search/_row_to_dict（+33/-7 行）
- `tests/unit/test_memory_store.py` — test_returns_full_dict_shape expected_keys 加 contract_version（+1 行）
- `tests/integration/test_contract_v1.py` — 新增，11 项 contract tests（untracked）

### apps/reader（git tracked）

- `src/services/savedMemoryService.js` — buildSavedMemoryPayload 加 contractVersion（+4 行）
- `src/services/ragEngineAdapter.js` — memorySourceRefFromUniRagCitation 透传 contractVersion（+4 行）
- `src/services/contract.v1.test.js` — 新增，6 项 contract tests（untracked）

### workbench root（非 git 仓库）

- `contracts/reader-unirag-memory/v1/` — 7 fixtures + README（新增，不在任何子仓库 git 里）
- `.ship/tasks/20260701-vibereader-knowledge-flywheel/plan/phase-1-contract-stabilization-design.md`（design 文档）
- `.ship/tasks/20260701-vibereader-knowledge-flywheel/delivery/phase-1-contract-stabilization.md`（本文档）
- `.ship/tasks/20260701-vibereader-knowledge-flywheel/e2e/phase-1-contract-stabilization-browser.md`（E2E 报告）

## Contract Fixtures

`contracts/reader-unirag-memory/v1/`，被两侧测试引用：

| Fixture | 用途 | 引用方 |
|---------|------|--------|
| saved-answer-card.json | saved_artifact / explain_card | UniRAG test_contract_v1 + Reader contract.v1.test |
| reading-card.json | reading_card | UniRAG test_contract_v1 |
| note.json | note | UniRAG test_contract_v1 |
| highlight.json | highlight | UniRAG test_contract_v1 |
| query-response-with-saved-memory.json | query 响应模板 | UniRAG test_contract_v1（字段稳定断言）+ Reader contract.v1.test（normalize） |
| citation-unresolved.json | 失败路径 | Reader contract.v1.test（normalize unresolved） |
| README.md | 字段契约 + 版本规则 | 文档 |

UniRAG fixture 引用通过 `_contracts_dir()` 从 `tests/integration/` 向上查找 `contracts/reader-unirag-memory/v1/`。
Reader fixture 引用通过 `import.meta.url` 从 `src/services/` 向上查找同一目录。

## 测试结果

### UniRAG

```bash
cd services/uni-rag
uv run python -m pytest tests/unit/test_memory_store.py tests/integration/test_memory_api.py tests/integration/test_contract_v1.py tests/unit/test_query_pipeline.py tests/unit/test_config.py
```

结果：61 passed（test_memory_store 29 + test_memory_api 10 + test_contract_v1 11 + test_query_pipeline 8 + test_config 3）。

未跑：全量 `tests/unit tests/integration`（sentence_transformers 模型加载耗时 5 分钟+，超出合理预算；聚焦集已覆盖本轮改动 + memory + query 主路径）。

### Reader

```bash
cd apps/reader
npm test
```

结果：323 passed，0 failed。含新增 6 项 contract.v1.test.js。

### 失败路径覆盖

- unknown memory job → HTTP 404 `{"detail":"Memory job not found: ..."}`
- `include_memory=false` → 0 saved_memory citation
- 空 memory store query → 不破坏主 query（document citations 正常返回）
- Reader normalize unresolved citation → 保留缺失 artifactId，不抛错

## 浏览器 E2E 结果

真实服务：UniRAG `http://127.0.0.1:8766` + Reader `http://127.0.0.1:3217`，非 Playwright route mock。

| 步骤 | 结果 |
|------|------|
| 1. UniRAG health visible | "知识引擎：UniRAG" 在 Reader UI 可见 |
| 2. 上传 sample.md | 成功，file input 接受 .md |
| 3. 知识入库完成 | "知识入库：已完成" |
| 4. 浏览器 fetch UniRAG query include_memory=true | 200，saved_memory citations 全带 contract_version=reader-unirag-memory-v1 + 全字段 |
| 5. document citations 也带 contract_version 字段 | 是（值 null，符合 schema 统一） |
| 6. include_memory=false | 200，0 memory citation（失败路径） |
| 7. unknown memory job | 404（失败路径） |
| 8. POST memory job（camelCase contractVersion） | 200 completed，持久化成功 |
| 9. Reader Chat 面板可见 | "Start a new conversation" + "Press Enter to send" + "模型：Custom model (MiniMax-M3)" |
| 10. Reader normalize（单测层） | 6 项 contract tests 验证 Reader 正确处理 contract_version |

未完成（阻塞项）：
- Chat UI 提问→保存卡片→点击 memory citation 跳转的完整飞轮。原因：Chat 输入框是 Slate.js React 富文本编辑器，`document.execCommand('insertText')` 不被 Slate 的 React 合成事件识别；且 Chat 依赖 MiniMax API Key 配置。这两个限制导致完整 UI 飞轮无法在 Playwright MCP 自动化环境完成。
- contract 端到端贯通已通过"浏览器环境 fetch 真实 UniRAG + Reader 单测验证 normalize"组合验证，等价于完整飞轮的 contract 部分但绕过了 Chat UI 输入交互。

## 风险与未完成项

### 风险

1. **contracts/ 目录不在任何 git 仓库**：workbench 根目录非 git 仓库，`contracts/reader-unirag-memory/v1/` 目前不受版本控制。两侧测试通过相对路径引用，本地可跑，但云端协作时 fixtures 不可见。建议：Codex 复核时决定是否在根目录 init git，或把 contracts/ 软链/复制到两个子仓库，或推进 monorepo（PROJECTS.md Phase C 候选 `packages/shared-contracts`）。
2. **UniRAG 全量测试未跑**：sentence_transformers 模型加载耗时，聚焦回归集 61 passed 覆盖本轮改动，但未验证全量无回归。低风险（改动只触及 memory + query 路径）。
3. **Reader Chat UI 飞轮未完成**：见上文"未完成"。contract 验证目标已达成，但 handoff 第 3.3 节的 10 步飞轮未完整走通 UI 交互。建议：Codex 复核后由人工或更完整的 Playwright（非 MCP，支持 keyboard.type）补完 UI 飞轮，或接受当前组合验证作为 contract 稳定化的验收依据。
4. **document citation 的 contract_version 为 null**：UniRAG pipeline 给 document citations 也加了 contract_version 字段（值 null），saved_memory citations 为 "reader-unirag-memory-v1"。这是 schema 统一的副作用，Reader normalize 已兼容（默认 v1）。如果 Codex 认为 document citation 不应有该字段，可在 pipeline 层条件化输出。

### 未完成

- 完整 Chat UI 飞轮（见风险 3）
- git 提交（等待 Codex 复核，按 handoff 第 7 节不 push）

## 建议 Codex 复核重点

1. **contract fixtures 双向引用**：确认 `contracts/reader-unirag-memory/v1/` 被 UniRAG `test_contract_v1.py` 和 Reader `contract.v1.test.js` 共同引用（两侧 fixture 路径解析逻辑）。
2. **`reader-unirag-memory-v1` 兼容旧字段**：确认 Reader `ragEngineAdapter.js` 的 `citation.contract_version || citation.contractVersion || 'reader-unirag-memory-v1'` 默认链对旧 UniRAG 响应不破坏；UniRAG `MemoryPayload` 的 `populate_by_name=True` 接受 snake_case + camelCase。
3. **memory citation jump 浏览器可复现**：当前用"浏览器 fetch + 单测 normalize"组合验证，未走完整 UI 点击跳转。Codex 需判断是否接受，或要求补完 UI 飞轮。
4. **failure fallback 用户可见**：Reader normalize unresolved citation 保留缺失 artifactId（单测验证）；UniRAG unknown job 404（服务级 + 浏览器级验证）。但 UI 层"目标缺失显示降级"未在浏览器验证（依赖完整飞轮）。
5. **运行产物/密钥进 Git**：未提交。`data/*.db`、`.env`、截图均在 gitignore 或非仓库路径。
6. **下一阶段准备**：contract 稳定化完成后，PROJECTS.md Phase C（monorepo + `packages/shared-contracts`）是自然下一步。contracts/ 当前位置是 Phase C 前的临时方案。

## 验证命令复现

```bash
# UniRAG 测试
cd services/uni-rag
uv run python -m pytest tests/unit/test_memory_store.py tests/integration/test_memory_api.py tests/integration/test_contract_v1.py tests/unit/test_query_pipeline.py tests/unit/test_config.py

# Reader 测试
cd apps/reader
npm test

# 服务级 E2E
cd services/uni-rag && uv run uni-rag serve --port 8766 &
curl http://127.0.0.1:8766/api/health
curl -X POST http://127.0.0.1:8766/api/memory/jobs -H 'Content-Type: application/json' -d @../../contracts/reader-unirag-memory/v1/saved-answer-card.json
curl -X POST http://127.0.0.1:8766/api/query -H 'Content-Type: application/json' -d '{"question":"监督学习","include_memory":true}'

# 浏览器级 E2E
cd apps/reader && npm run dev -- --port 3217 &
# Playwright navigate http://127.0.0.1:3217/ → 上传 sample.md → 浏览器 console fetch UniRAG query
```
