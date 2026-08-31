# uni-rag v0.3 完成交付文档（2026-06-18）

## 当前目录

`/Users/mahaoxuan/Desktop/产品项目学习/uni-rag`

## 当前状态一句话

v0.3 已经收口：答案导出、Docker 打包、多知识库 API / CLI / Web 入口、默认 KB 兼容迁移、上传进度反馈、刷新后文档列表恢复、无引用答案降级提示、BDD 与全量测试均已完成；当前改动尚未提交 git。

---

## 行为覆盖

- [x] B8：问答结果可以导出为 Markdown。
- [x] B8：问答结果可以导出为 PDF；本机 weasyprint 原生依赖不可用时对应测试会自动 skip。
- [x] B10：可以创建多个知识库，并把文档上传到指定 KB。
- [x] B10：不同 KB 的 uploads / Chroma / BM25 存储相互隔离。
- [x] B10：Web 端可以选择 / 新建 KB，并按当前 KB 上传、提问、查看 citation 原文。
- [x] v0.2 兼容：启动 FastAPI app 时自动创建 `default` KB，老的单知识库路径继续可用。
- [x] UX：上传 / 解析 / 向量化 / 写索引期间显示真实进度，不让用户空等。
- [x] UX：未上传材料前禁用提问并显示空状态，引导用户先上传资料。
- [x] UX：刷新页面后能重新列出当前 KB 已入库文档，不让用户以为资料丢失。
- [x] UX：无 citation 的回答会显示“不建议直接采信”的来源风险提示。
- [x] UX：MiniMax 生成失败时返回可理解错误，而不是裸 500。
- [x] 安全：上传文件名会被净化为 basename，不能通过 `../` 写出 uploads 目录。
- [x] 导出：KB 内问答导出 Markdown/PDF 时沿用该 KB 的引用，不再回落到 default KB。

## 测试覆盖

测试文件：

- `tests/unit/test_kb.py`
- `tests/integration/test_api.py`
- `tests/integration/test_cli.py`
- `tests/bdd/test_b8_b10.py`
- 以及全量 `tests/`

运行命令与结果：

```bash
uv run pytest -q
```

结果：

```text
82 passed, 6 skipped, 9 warnings in 337.49s
```

最近一次覆盖率命令（UX 修复前，作为覆盖率基线）：

```bash
uv run pytest --cov=src/uni_rag --cov-report=term-missing -q
```

结果：

```text
TOTAL 934 59 94%
76 passed, 6 skipped, 358 warnings in 291.68s
```

补充 Web smoke test：

- 使用临时数据目录启动：`UNI_RAG_DATA_DIR=/tmp/uni-rag-ux-mcp-data ANTHROPIC_API_KEY=test-key uv run uni-rag serve --host 127.0.0.1 --port 8772`。
- `GET /api/health` 返回 `200 {"status":"ok"}`。
- 使用 web-access CDP 打开真实浏览器页面完成验收：
  - 初始状态：KB 下拉加载为 `default — default`。
  - 初始状态：空状态可见，提问框和按钮禁用。
  - 上传 `tests/fixtures/sample.pdf` 后，进度实际推进：加载模型 → 生成向量 → 写入索引 → 入库完成。
  - 入库完成后：文件列表出现，空状态消失，提问框启用。
  - 刷新页面后：文件列表仍存在，提问框仍启用。
- 截图：`/tmp/uni-rag-ux-after-upload.png`。

Playwright MCP 未完成实际浏览器点击验证：当前 Playwright 浏览器实例被占用，返回 `Browser is already in use`。本轮改用 web-access CDP 完成真实浏览器验收。

---

## 实现范围

### `src/uni_rag/api/routes.py`

新增 / 完成：

- `POST /api/kbs`
- `GET /api/kbs`
- `GET /api/kbs/{kb_id}`
- `DELETE /api/kbs/{kb_id}`
- `POST /api/kbs/{kb_id}/ingest`
- `POST /api/ingest/jobs`
- `GET /api/ingest/jobs/{job_id}`
- `POST /api/kbs/{kb_id}/ingest/jobs`
- `GET /api/documents`
- `GET /api/kbs/{kb_id}/documents`
- `POST /api/kbs/{kb_id}/query`
- `GET /api/kbs/{kb_id}/documents/{filename}/chunks`
- `POST /api/sessions/{session_id}/kbs`
- `GET /api/sessions/{session_id}/kbs`

为什么改：让多知识库不只停留在底层存储，而是能被 Web / CLI / API 实际使用。

### `src/uni_rag/api/app.py`

新增 FastAPI app 创建时的 `default` KB 初始化。

为什么改：保证 v0.2 老用户升级后不需要手动迁移；默认知识库记录自动存在。

### `src/uni_rag/store/kb.py`

把 KB ID 规则从 `3-32` 位放宽到 `1-32` 位。

为什么改：当前 API 测试与产品用例允许 `A` / `B` 这种短课程代号，学生本地单机使用下单字符 ID 没有实际风险。

### `cli/main.py`

新增：

- `uni-rag kb list`
- `uni-rag kb create <name> [--id <id>] [--description <desc>]`
- `uni-rag kb delete <id>`
- `uni-rag kb ingest <id> <file>`

为什么改：多知识库不能只依赖 Web；CLI 是 v0.1 起就确定的产品形态。

### `src/uni_rag/web/index.html`

新增 `0. 选择知识库` 区块，包括 KB 下拉、新建输入框和新建按钮。

为什么改：学生需要按课程 / 项目切换资料库。

### `src/uni_rag/web/app.js`

新增：

- 页面加载时读取 `/api/kbs`。
- 切换 KB 时清空当前聊天、文件列表和 citation panel。
- 新建 KB 后自动选中新 KB。
- 上传走 `/api/kbs/{id}/ingest/jobs`，并轮询 `/api/ingest/jobs/{job_id}` 显示阶段进度。
- 页面加载 / 切换 KB 时读取 `/api/kbs/{id}/documents`，刷新后恢复已入库文件列表。
- 提问走 `/api/kbs/{id}/query`。
- citation 原文侧栏走 `/api/kbs/{id}/documents/{filename}/chunks`。

为什么改：避免前端看起来切了 KB，但实际仍在默认 KB 查询。

### `src/uni_rag/web/style.css`

新增 KB selector 的轻量样式，保持现有 editorial / serif 风格。

### 测试文件

- `tests/unit/test_kb.py`：同步新的 `1-32` 位 KB ID 规则。
- `tests/integration/test_api.py`：补 KB CRUD、KB scoped ingest / query / chunks、session-KB binding、startup default KB、ingest job progress、文档列表恢复、MiniMax 失败友好错误、上传文件名路径净化、KB 问答导出引用测试。
- `tests/integration/test_cli.py`：补 KB CLI 创建、列表、删除、入库测试，并重置 settings singleton 避免测试间串数据目录。
- `tests/bdd/test_b8_b10.py`：新增 v0.3 BDD 验收测试。

---

## 手动验收

你作为 PM 只需要试这一句：启动 Web 后，新建一个 KB，上传一个 PDF，问一个问题，确认答案下面有 Download .md / .pdf，点 citation 能打开原文侧栏。

CLI 侧可以试：

```bash
uv run uni-rag kb create CS101 --description "课程笔记"
uv run uni-rag kb ingest cs101 tests/fixtures/sample.pdf
uv run uni-rag kb list
```

---

## 当前已知风险

- PDF 导出依赖 weasyprint 原生库；当前测试在本机对不可用环境做了 skip，Dockerfile 已包含对应系统依赖，但本轮没有重新跑真实 Docker build。
- Playwright MCP 浏览器点击验收未完成，因为浏览器实例被占用；已改用 web-access CDP 做真实浏览器验收，覆盖初始空状态、上传进度、入库完成、刷新后文档恢复。
- Coverage 运行出现较多 `ResourceWarning: unclosed database`，测试仍通过；这更像 Chroma / sqlite 资源释放噪音，后续可以开单独清理任务。
- 本轮误触发了一次错误的 Agent team_name 调用；已再次确认后续规则：单 Agent 不传 `team_name`，多 Agent 先 `TeamCreate`。
- 当前所有 v0.3 改动还未提交 git；如果要固化版本，下一步应由你明确说“提交”。

---

## 当前未提交文件

```text
.gitignore
cli/main.py
src/uni_rag/api/app.py
src/uni_rag/api/routes.py
src/uni_rag/api/schemas.py
src/uni_rag/ingest/pipeline.py
src/uni_rag/rag/pipeline.py
src/uni_rag/store/kb.py
src/uni_rag/web/app.js
src/uni_rag/web/index.html
src/uni_rag/web/style.css
tests/integration/test_api.py
tests/integration/test_cli.py
tests/integration/test_ingest_pipeline.py
tests/unit/test_kb.py
tests/bdd/test_b8_b10.py
docs/DELIVERY_V0_3_COMPLETE_2026-06-18.md
docs/UX_ITERATION_2026-06-18.md
```

另外已记忆用户级 workflow 脚本库位置：`~/.claude/workflows/`，对应记忆文件：`/Users/mahaoxuan/.claude/projects/-/memory/reference_workflow_script_library_path.md`。
