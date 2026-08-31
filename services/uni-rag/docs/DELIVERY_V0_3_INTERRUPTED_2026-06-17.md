# uni-rag v0.3 中断交付文档（2026-06-17）

## 当前目录

`/Users/mahaoxuan/Desktop/产品项目学习/uni-rag`

## 当前状态一句话

v0.3 已经完成 **M9 导出答案**、**M10 Docker 打包**、以及 **M11 多知识库底层 60%**；为了避免套餐耗尽导致 workflow 断在不可控位置，已主动停止 workflow，并把中断点固化为一个可恢复的 TDD RED commit。

## 重要澄清：MiniMax key 怎么填

项目里使用 `anthropic` Python SDK，是因为 MiniMax M3 提供 **Anthropic 兼容协议**。

所以变量名仍然叫：

```bash
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
ANTHROPIC_API_KEY=<你的 MiniMax API Key>
ANTHROPIC_MODEL=MiniMax-M3
```

这不是让你去找 Anthropic key；`ANTHROPIC_API_KEY` 里填的是 **MiniMax API Key**。

本机 shell 当前已经有 MiniMax 相关环境变量；项目根的 `.env` 只是本地兜底文件，目前是占位：

```bash
ANTHROPIC_API_KEY=REPLACE_WITH_YOUR_REAL_KEY
```

如果要用 `.env`，把占位符换成 MiniMax key 即可。

---

## 已完成内容

### v0.1：本地单机 RAG 基础版

已完成：

- PDF / Markdown 上传入库
- BGE-M3 embedding
- Chroma 向量库
- BM25 检索
- bge-reranker 重排
- MiniMax M3 生成答案
- citation chunk_id 引用
- SQLite session 多轮对话
- FastAPI + Web UI + Typer CLI
- BDD B1-B4 端到端测试

### v0.2：体验增强版

已完成：

- 点击 citation chip → 右侧原文侧栏
- 原文 span 暖黄高亮
- DOCX 表格解析为 markdown `|` 表格行
- DOCX `$$...$$` 块公式包进代码围栏
- Session 历史上限，默认 20 条，避免撑爆 LLM 上下文
- `.gitignore` 覆盖 `.coverage` / runtime logs
- `.env.example` 增加 `UNI_RAG_MAX_SESSION_MESSAGES=20`

### v0.3：已完成部分

#### M9 导出答案：完成

已完成：

- `weasyprint` 依赖加入项目
- Markdown exporter
- PDF exporter
- `GET /api/sessions/{session_id}/messages/{message_index}/export?format=md|pdf`
- Web assistant message 增加 `.md` / `.pdf` 下载链接

关键 commits：

```text
9d32bbd feat(export): Markdown exporter for Q&A + citations
0cf81a1 feat(export): PDF exporter via markdown-it-py + weasyprint
dfbe1d2 feat(api): export single message to md/pdf download
7113bc5 feat(web): download .md/.pdf links on assistant messages
```

#### M10 Docker 打包：完成

已完成：

- `Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- `tests/integration/test_docker_build.py`
- GitHub Actions docker build workflow

关键 commits：

```text
1a4580e feat(docker): Dockerfile + compose for one-command deployment
3497edc test(docker): verify image builds and exposes port 8766
795673c ci(github-actions): docker build on push/PR (linux/amd64+arm64)
```

#### M11 跨 session 知识库：已完成底层，API 未完成

已完成：

- `KBStore` SQLite CRUD + session binding + ensure_default
- `Settings.kb_db_path` + `Settings.kb_dir`
- `VectorStore(collection_name=...)` 支持 per-KB Chroma collection
- `IngestPipeline(kb_id=...)`
- `HybridRetriever(kb_id=...)`
- `RAGPipeline(kb_id=...)`

关键 commits：

```text
d31e3ab feat(kb): KBStore CRUD + session binding + ensure_default
703c473 feat(config): kb_db_path + kb_dir properties
b71e9a2 feat(vector): VectorStore accepts collection_name (per-KB isolation)
e258a7c feat(kb): IngestPipeline/Retriever/RAGPipeline accept kb_id
```

---

## 当前中断点

当前最新 commit：

```text
b47a199 wip(M11.6): KB API schemas + failing tests (interrupted before routes)
```

这个 commit 是刻意保留的 **TDD RED 状态**，内容包括：

- `src/uni_rag/api/schemas.py` 新增 KB API schemas
- `tests/integration/test_api.py` 新增两个失败测试：
  - `test_kb_crud_via_api`
  - `test_kb_ingest_uses_kb_scoped_collection`

当前失败命令：

```bash
uv run pytest tests/integration/test_api.py::test_kb_crud_via_api -q
```

当前失败原因：

```text
POST /api/kbs -> 404 Not Found
```

这不是 bug，而是正常 TDD RED：测试已经写好，`src/uni_rag/api/routes.py` 里的 KB API route 还没实现。

---

## 下次恢复时怎么接

### 第一步：确认状态

```bash
cd /Users/mahaoxuan/Desktop/产品项目学习/uni-rag
git status
git log --oneline | head -15
uv run pytest tests/integration/test_api.py::test_kb_crud_via_api -q
```

预期：

- `git status` 干净
- 最新 commit 是 `b47a199 wip(M11.6)...`
- `test_kb_crud_via_api` 失败，原因是 404

### 第二步：继续实现 M11.6

打开计划：

```text
docs/superpowers/plans/2026-06-17-uni-rag-v0.3.md
```

从 **M11.6 API 路由** 继续。

需要实现的 endpoints：

```text
POST   /api/kbs
GET    /api/kbs
GET    /api/kbs/{kb_id}
DELETE /api/kbs/{kb_id}
POST   /api/kbs/{kb_id}/ingest
```

主要修改文件：

```text
src/uni_rag/api/routes.py
```

已准备好的 schemas：

```text
KbCreateRequest
KbInfo
KbListResponse
SessionKbBindRequest
SessionKbListResponse
DeleteResponse
```

可直接从 `src/uni_rag/api/schemas.py` import。

### 第三步：让 RED 测试变 GREEN

先跑单测：

```bash
uv run pytest tests/integration/test_api.py::test_kb_crud_via_api -q
uv run pytest tests/integration/test_api.py::test_kb_ingest_uses_kb_scoped_collection -q
```

再跑 API 集成：

```bash
uv run pytest tests/integration/test_api.py -v
```

最后跑全量：

```bash
uv run pytest tests/ -v
```

---

## 还剩哪些工作

### 必做

1. **M11.6**：实现 KB API routes，让两个 RED 测试过
2. **M11.7**：CLI `kb` 子命令
   - `uni-rag kb list`
   - `uni-rag kb create "name"`
   - `uni-rag kb delete {id}`
   - `uni-rag kb ingest {id} file.pdf`
3. **M11.8**：Web UI 最小 KB 切换
4. **M11.9**：app startup `ensure_default()`，保证 v0.2 老路径透明兼容
5. **M12**：BDD + 最终验收

### 可选

- Docker 真 build 验证可能会下载 BGE-M3 + reranker，耗时较长；如果套餐/时间紧，可以先跑 compose config 和测试 skip 路径。

---

## 下次推荐 prompt

直接发：

```text
继续 uni-rag v0.3，从 docs/DELIVERY_V0_3_INTERRUPTED_2026-06-17.md 的中断点恢复。先完成 M11.6 KB API routes，把当前 RED 测试变 GREEN，然后再继续 M11.7/M11.8/M11.9/M12。不要重新跑 ultracode，先单线程小步推进。
```

如果用 ultracode，建议不要一次跑全量，而是：

```text
ultracode 只跑 M11.6 + M11.7，完成后停下来验证。
```

---

## 当前已知风险

1. **v0.3 workflow 被主动 stop**：不是失败，是人为停止以避免套餐耗尽。
2. **当前 test suite 不是全绿**：因为 `b47a199` 是故意保留的 RED 状态。
3. **真实 LLM 端到端尚未在 `.env` 下跑过**：变量名是 `ANTHROPIC_API_KEY`，值填 MiniMax key。
4. **Docker build 可能很慢**：会预热 BGE-M3 和 bge-reranker。

---

## 给 PM 的一句话验收口径

当前交付是：v0.1 + v0.2 可用，v0.3 的导出和 Docker 已落地，多知识库底层已打通，但 API/CLI/Web 入口还没收口；下次从 M11.6 KB API routes 继续即可。
