# Changelog

## v1.1.0 — 2026-06-26

### 变更

**PDF 解析后端重构：LlamaParse → MinerU v4 precision API**
- 新增 `mineru_client.py`：v4 REST API 客户端（batch 上传 → PUT → 轮询 → 下载 zip → 提取 Markdown）
- `parsers.py` 接入双引擎降级链：**MinerU 优先 + PyMuPDF 兜底**（任何异常仅 warning 级别降级，不阻断流程）
- `embedder.py` 增加 16 texts/batch 分批 encode，解决 MinerU 文本量偏大触发的 OOM
- `config.py` 新增 `mineru_api_token` / `mineru_api_base` 字段

### 新增

- 新增 `docs/DEVLOG_2026-06-26.md` 详细记录架构决策、降级链设计、已知风险

### 已知限制

- 当前 MinerU JWT token 已过期，需要用户去 https://mineru.net/apiManage/token 重新申请
- MinerU v4 返回扁平 Markdown 不带页码分段，PDF 引用页码显示依赖 PyMuPDF 路径

## v1.0.0 — 2026-06-25

首个正式版本。面向中文研究者的私有文档工作站。

### 新增

**核心功能**
- PDF / Markdown 文件上传与解析（含 LlamaParse 语义解析）
- URL 入站：网页、YouTube、Bilibili 视频字幕自动提取
- 多轮对话问答，带引用溯源（页码 + 段落定位）
- 知识加工：闪卡生成、测验出题、知识图谱可视化、翻译

**模型自由**
- 多 Provider 支持：MiniMax / StepFun / 本地 Ollama
- 前端一键切换 Provider，设置持久化到 localStorage
- Provider 级 API Key 管理

**前端**
- Matrix 风格着陆页，传达三大差异化卖点（数据主权 / 模型自由 / 多源直连）
- 工作台三栏布局：来源列表 / 文档查看 / 聊天面板
- 空状态引导：「上传第一份文档」CTA + 安全徽章
- 渐进式功能展开：首次使用只展示核心功能，上传后逐步解锁高级功能
- 文档预览：.md 渲染为富文本，其他格式显示纯文本
- 设置弹窗：API Key + Provider 配置

**基础设施**
- BDD 测试覆盖 B1-B4 核心流程 + URL 入站 + 前端 UX
- 172 个测试全部通过（6 skipped 为环境依赖）
- Docker + docker-compose 一键部署
- CLI 命令行工具（ingest / ask / serve）

### 安全

- BM25 索引从 pickle 迁移到 JSON 序列化（消除任意代码执行风险）
- URL 入库增加 SSRF 防护（拦截 loopback / 私有地址）
- 文件上传路径遍历防护（`Path(filename).name` 清理）
- 前端错误信息友好化，不泄露后端路径

### 已知限制

- 单用户本地部署，无账号体系
- 前端 App.tsx 为单文件（1139 行），待 v1.1 拆分
- 无速率限制，API Key 存于 localStorage
