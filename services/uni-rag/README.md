# uni-rag

面向中文研究者的私有文档工作站。数据不出域的本地 RAG · 模型自由选择 · 国内直连可用。
上传文档，问问题，得到带高亮引用的答案，支持多轮追问。

## 核心能力

- **数据主权** — 所有文档和向量索引仅存于本地，不上传任何第三方
- **模型自由** — 支持 MiniMax / StepFun / 本地 Ollama，按需切换
- **多源入站** — PDF、Markdown、网页 URL、YouTube/Bilibili 视频字幕
- **引用溯源** — 每条回答附带原文页码和段落定位
- **知识加工** — 聊天问答 + 闪卡 + 测验 + 知识图谱 + 翻译

## 启动

```bash
# 安装
uv sync

# 配 .env
cp .env.example .env
# 编辑 .env，至少填一个 LLM provider 的 key：
#   UNI_RAG_LLM_API_KEY=<你的 API key>
#   UNI_RAG_LLM_PROVIDER=minimax   # 或 stepfun / local

# 起 Web（VibeReader 集成建议使用专用端口 http://127.0.0.1:8766）
uv run uni-rag serve --port 8766

# CLI
uv run uni-rag ingest ./paper.pdf
uv run uni-rag ask "第三章讲什么"
uv run uni-rag ask "详细说说" -s <session-id>
```

## 测试

```bash
uv run pytest                                  # 跑全部
uv run pytest --cov=src/uni_rag --cov-report=term-missing  # 带 coverage
```

测试分层：
- `tests/unit/` — 各模块的单元测试（parsers, chunker, embedder, vector, bm25, retriever, reranker, client, session, locator, config, logging）
- `tests/integration/` — 端到端管线（ingest, query, API, CLI）
- `tests/bdd/` — BDD 行为用例（B1 上传 / B2 单文件问答 / B2+ 多轮追问 / B3 多文件 / B4 答不上来 / URL 入站）

v1.0 测试：**172 passed / 6 skipped / 0 failed**。

## Docker

**🔒 你的数据永远留在本地机器上，不会上传至任何第三方服务器。**

```bash
# 1) 复制环境变量样板并填 API key
cp .env.example .env
# 编辑 .env

# 2) 一键起服务（首跑会构建镜像，~5-10 分钟下载模型）
docker compose up -d

# 3) 看日志
docker compose logs -f

# 4) 停服务
docker compose down
```

访问 `http://127.0.0.1:8766/`。

数据持久化到 named volume `uni-rag-data`；删除容器不丢数据。

## 路线图

- **v1.0** — PDF/MD/URL/视频入站，多 Provider LLM，引用溯源，闪卡/测验/图谱，Web + CLI ✅
- v1.1 — 引用卡片可折叠 + 页码跳转，App.tsx 组件拆分
- v1.2 — DOCX 支持，BM25 + 向量混合检索增强，reranker 优化
- v2.0 — Supabase 账号同步，多设备历史保留
