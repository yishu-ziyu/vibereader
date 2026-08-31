# uni-rag UX 迭代记录（2026-06-18）

## 当前目录

`/Users/mahaoxuan/Desktop/产品项目学习/uni-rag`

## 这轮问题判断

用户反馈不是单纯“UI 不好看”，而是产品还像工程 demo：上传、解析、向量化、提问、刷新后的状态都没有给用户足够反馈。学生用户不会关心 RAG pipeline 多完整；他们首先会判断：页面有没有反应、资料有没有丢、我下一步该做什么、答案能不能追溯。

## 已落地的体验修复

### 1. 入库过程不再空等

新增后台 ingest job：

- `POST /api/ingest/jobs`
- `GET /api/ingest/jobs/{job_id}`
- `POST /api/kbs/{kb_id}/ingest/jobs`

前端会轮询 job 状态，显示阶段进度：

- 排队中
- 加载模型
- 保存文件
- 解析文档
- 切分文本
- 生成向量
- 写入索引
- 入库完成

### 2. 未上传材料前禁用提问

首屏聊天区新增空状态：

> 先放一份材料进来。上传课程 PDF、讲义或 Markdown 后，再像问助教一样提问。

未上传前：

- 提问输入框禁用
- 提问按钮禁用
- 若用户绕过禁用，也会提示“请先上传资料”

### 3. 页面刷新后文档不会“消失”

新增文档列表 API：

- `GET /api/documents`
- `GET /api/kbs/{kb_id}/documents`

前端加载 KB 时会重新读取已入库文档列表。这样用户刷新页面后，已上传文件仍然显示，提问框仍然可用。

### 4. 真实浏览器验收已跑

使用 web-access CDP 在真实浏览器中完成 smoke test：

1. 打开 `http://127.0.0.1:8772/`
2. 初始状态：KB 已加载为 `default — default`
3. 初始状态：空状态可见
4. 初始状态：提问框和按钮禁用
5. 上传 `tests/fixtures/sample.pdf`
6. 进度状态实际出现：加载模型 → 生成向量 → 写入索引 → 入库完成
7. 入库完成后：文件列表出现，空状态消失，提问框启用
8. 刷新页面后：文件列表仍存在，提问框仍启用

截图：`/tmp/uni-rag-ux-after-upload.png`

### 5. 无引用答案会被明确降级

如果 assistant 回答没有任何 citation，前端会显示：

> 这条回答没有可追溯引用，不建议直接采信。

这避免学生把无来源回答误当作可靠材料。

### 6. MiniMax 生成失败时返回可读错误

如果 MiniMax / Anthropic 兼容接口调用失败，API 不再裸抛 500，而是返回 502 和用户可理解文案：

> MiniMax 回答生成失败。请检查 API key / 网络连接，或稍后重试。

前端会把 pending 消息替换成这条错误，不让用户面对技术栈堆栈。

## 验证结果

```bash
node --check src/uni_rag/web/app.js
uv run pytest tests/integration/test_api.py tests/integration/test_cli.py tests/integration/test_ingest_pipeline.py tests/bdd/test_b8_b10.py -q
```

结果：

```text
19 passed, 2 skipped
```

## 仍未解决的体验债

### P0 / 接下来必须补

- 真实问答失败时的可理解错误：MiniMax key 缺失、网络失败、检索为空应分别提示。
- citation 可信度状态：如果回答没有引用，页面应该明确提醒“不建议采信”。
- 文档管理：已入库文件目前只能看，不能删除或重新索引。

### P1 / 影响长期体验

- 首次加载本地 embedding 模型很慢，需要在首屏提前说明“首次使用会慢”。
- 多知识库切换时，应该显示该 KB 下有多少文档，而不是只显示下拉框。
- 上传失败需要更具体：扫描版 PDF、空 DOCX、解析失败、向量模型失败应分开。

### P2 / 暂缓

- 完整 NotebookLM 式 source guide / 自动摘要。
- 多文档对比视图。
- 复杂的文件夹/标签系统。

## 当前未提交改动范围

这份文档只记录本轮 UX 修复。当前工作区还包含 v0.3 多知识库、导出、Docker、Web UI 改版等前序未提交改动，提交前需要统一整理。
