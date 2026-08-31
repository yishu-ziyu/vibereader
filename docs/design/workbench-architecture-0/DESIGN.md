# Workbench Architecture 0 与架构债审计

- 日期：2026-08-31
- 方法：参照 system-design-skill（pinchen147/system-design-skill）仓库模式 —— 只从代码证据重构 Architecture 0，再对照「文档声称的架构」与 ADR 审计架构债。每条 finding 必须指名代价、引用文件证据、附补救方案与可逆性。
- 范围：整个 workbench —— `apps/reader`、`services/uni-rag`、`packages/shared-contracts`、根仓管理资产。
- 路径约定：`R:` = `apps/reader`，`B:` = `services/uni-rag`（相对 workbench 根）。

---

## 1. Architecture 0（从代码还原的现状）

### 1.1 系统总览

三个独立 Git 仓组成一个本地优先的阅读知识产品，无容器编排、无服务发现，靠 HTTP + 共享契约 fixtures 连接：

```text
┌──────────────────────────── workbench 根仓（管理资产/契约/文档）────────────────────────────┐
│  docs/（ADR、规划）  .ship/（生命周期）  packages/shared-contracts/reader-unirag-memory/v1/  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
        │ 契约 fixtures 被两侧测试经相对路径遍历引用（B:/tests/integration/test_contract_v1.py:30-44）
        │
┌───────────────┐   HTTP :8766    ┌──────────────────────────┐
│ apps/reader   │ ──────────────▶ │ services/uni-rag         │
│ React+Tauri   │  /api/query     │ FastAPI                  │
│ 桌面/浏览器    │  /api/ingest/jobs│  ├ ingest: MinerU/PyMuPDF→chunk→BGE-M3→Chroma+BM25
│ 权威=SQLite    │  /api/memory/jobs│  ├ retrieve: 向量+BM25→CrossEncoder 重排
│ (Rust 侧)     │  /api/health     │  ├ cite: locator+verifier(BGE 相似度≥0.45)
└───────┬───────┘                  │  ├ store: Chroma/BM25/memory.db/kbs.db/sessions.db
        │                          │  └ llm: Anthropic SDK（provider 由 Reader 透传+api_key）
   Tauri Rust                      └──────────────────────────┘
   vibereader.sqlite3                    │
   （documents/annotations/              ├─▶ data/uploads, chroma, bm25, visual_tiles
     vibecards/conversations/            └─▶ 外部：MinerU 云端解析、LLM API、yt-dlp/BBDown
     source_spans/task_records）              （subprocess）
```

### 1.2 组件职责（实测）

| 组件 | 职责 | 证据 |
| --- | --- | --- |
| `R:src/agent/` | 浏览器侧阅读 agent 框架：runtime 循环（模型↔工具，maxIterations=4）、taskRunner 持久化任务、multiAgent 深读流水线（overview→attention→card+critic）、7 技能注册表、modelFactory（本地确定性模型兜底，LLM 可选） | runtime.js:11-18、multiAgent.js:5-9、modelFactory.js:82-99 |
| `R:src/services/` | 数据桥接层：文档身份（id=source+stableHash+名）、Tauri↔浏览器双轨存储、UniRAG HTTP 客户端、知识入库轮询、记忆沉淀、artifact/标注 CRUD | documentService.js:44-48、persistentStorage.js:52-62、documentKnowledgeService.js:153-263 |
| `R:src-tauri/` | Rust 权威存储：`vibereader.sqlite3`，30+ 个 `storage_*` 命令，13 张表 | commands/storage.rs:65-93、core/storage.rs:711-919 |
| `B:src/uni_rag/api/` | FastAPI 层，25+ 端点，模块级单例 pipeline/job 字典 | routes.py:34-47 |
| `B:ingest/` | 文件/URL 入库：MinerU 优先失败回退 PyMuPDF、标题分块（1000 字符）、BGE-M3 嵌入、质量过滤、视觉 CLIP 通道 | ingest/pipeline.py:77-173、parsers.py:30-43 |
| `B:retrieve/` + `B:cite/` | 混合检索（向量×3 + BM25×3 合并）→ bge-reranker-base 重排；引用定位 + 相似度校验（阈值 0.45） | retriever.py:28-47、config.py:29 |
| `B:store/` | Chroma PersistentClient（默认库 + 每 KB 独立目录）、BM25 docs.json、memory/kbs/sessions 三个 SQLite | vector.py:16-30、kb.py:49-160 |
| `B:llm/` | Anthropic SDK 包装（非流式），provider 动态初始化，强制 `[chunk_id]` 引用规则 | llm/client.py:7-60、prompts.py:4-66 |

### 1.3 权威状态与派生视图

| 数据 | 权威存储 | 派生/缓存 | 注意 |
| --- | --- | --- | --- |
| Reader 文档元数据+正文 | Tauri SQLite `documents`/`document_contents` | Zustand 内存态 | **PDF 正文不持久化**（白名单仅 md/txt/html，App.jsx:91） |
| 标注/卡片/会话/思维树 | Tauri SQLite | — | 浏览器端降级为 localStorage/IndexedDB（见债 D3） |
| 模型配置+API key | localStorage `ai-chat.modelConfigs` | zustand persist 副本 | 明文（见债 D5） |
| 文档↔UniRAG 入库链接 | **localStorage `vibereader.documentKnowledgeLinks`** | — | 不在 SQLite，换端即失（债 D4） |
| UniRAG 文档原文 | `data/uploads/` | — | 服务端唯一原文副本 |
| chunk 文本 | 双份冗余：Chroma documents + BM25 docs.json | 均可由 uploads 重算，但无重建入口 | 无删除端点，只增不减（债 D12） |
| 记忆（saved_memories） | `data/memory.db` SQLite | — | LIKE 关键字检索，无向量索引（债 D15） |
| 会话历史 | `data/sessions.db` | — | 不存 citations，导出时重放检索（债 D16） |
| agent 任务记录 | Tauri SQLite `task_records` | — | — |

### 1.4 关键流转（实测调用链）

- **导入→知识入库**：Tauri dialog 读文件 → documents/document_contents/source_spans 落库 → health 可用则自动 POST `/api/ingest/jobs` → 1.5s×240 次轮询 → link 状态写 localStorage。
- **提问三级降级**：① agent QA 开关开 → knowledge_qa 工具循环；② UniRAG health 可用且该文档入库完成 → `/api/query`（includeMemory=true，透传 provider+api_key）；③ 本地 source_spans 关键词检索拼 prompt → 直连 LLM 流式。
- **保存记忆**：createArtifact 先落 SQLite → UniRAG 可用则 POST `/api/memory/jobs`（同步 completed fast-path，contractVersion=reader-unirag-memory-v1）；不可用则本地 fallback。
- **UniRAG query 内部**：混合检索 → memory LIKE 召回 → prompt（强制引用格式）→ LLM → 正则抽 `[chunk_id:n]` → locator 定位 span → verifier 相似度校验 → memory citations 无条件追加（不走校验）。

### 1.5 已定决策（重构必须保留的约束）

| 决策 | 内容 | 证据 |
| --- | --- | --- |
| DEC-0003 | 渐进式 workbench 仓：根仓管契约/文档，子仓保留独立历史；fixtures 单份放根仓防漂移 | docs/decisions/DEC-0003 |
| DEC-0004 | monorepo cutover 前保留 VibeReader.git 与 uni-rag.git | docs/decisions/DEC-0004 |
| 契约 v1 | artifactType 分歧本期不收束，字符串透传；contractVersion 可选，缺省视 v1 | packages/shared-contracts/.../README.md §2-3 |
| Reader-first | Reader 不可用时一切本地降级可用；UniRAG 永远是增强而非依赖 | ragEngineAdapter 降级链、tools.js:872-878 |
| memory fast-path | 持久化失败仍返回 HTTP 200 + status=failed（"Reader checks status field, not HTTP code"） | routes.py:363-377 |

---

## 2. 架构债审计（implemented vs intended）

审计基准：`B:docs/ARCHITECTURE.md`（意图）、DEC-0003/0004、契约 README。严重度按两轴查表：影响面（正确性/数据/安全/可用性）× 可逆性。

### 跨仓 / 契约层

| # | 发现 | 证据 | 代价 | 补救 | 严重度 |
| --- | --- | --- | --- | --- | --- |
| D1 | **ARCHITECTURE.md 与实现严重脱节**：文档称 Chroma 在 `~/.uni-rag/db`、PDF 用 pdfplumber、dev 端口 5173/5001；实际是 `data/chroma`（config.py:61-65）、MinerU+PyMuPDF（parsers.py:30-43）、8766（README/脚本）。文档还缺 memory/session/KB/视觉通道整层 | B:docs/ARCHITECTURE.md 全文 vs B:src/uni_rag/config.py | 后续 agent/新人以过时图为起点做错决策；本次审计的「意图架构」基准本身失真 | 按 §1 重写 ARCHITECTURE.md，并约定随交付更新 | 中 / 可逆 |
| D2 | **契约 fixtures 靠相对路径遍历查找**，子仓独立 clone 时两侧契约测试静默跳过或失败，Phase C 迁移未完成的结构性代价 | B:tests/integration/test_contract_v1.py:30-44 | 契约回归在子仓 CI/他人机器上失效，漂移防护只在 workbench 全目录下成立 | 根脚本提供 env var 注入契约路径；或 cutover 后改为 workspace 内绝对引用 | 中 / 可逆 |

### Reader（apps/reader）

| # | 发现 | 证据 | 代价 | 补救 | 严重度 |
| --- | --- | --- | --- | --- | --- |
| D3 | **双轨存储分支贯穿所有 service 且浏览器端碎片化**：每个 service 重复 `if (isTauriRuntime())…else localStorage`；会话在 IndexedDB、文档/卡片/标注在 localStorage，无 Rust→浏览器迁移路径 | persistentStorage.js:355-404、artifactService.js:116-134、annotationService.js:35-51、storage.js:82-150 | 每新增一个数据域都要写两遍存储代码；浏览器端数据三处散落难备份；localStorage 清空即丢卡片/标注 | 收敛到 persistentStorage 单一网关 + 统一 web 回退（IndexedDB），禁止 service 直接摸 localStorage | 高 / 可逆 |
| D4 | **文档↔UniRAG 入库链接只存前端 localStorage**，SQLite 无对应表 | documentKnowledgeService.js:6,50-67；core/storage.rs:711-919 无该表 | 换机/清浏览器数据后「已入库」状态丢失 → 重复 ingest（6 分钟轮询+重复嵌入开销）或错误降级到本地检索 | link 状态提升为 SQLite 表（documents 加 unirag_source_id/status 列即可） | 高 / 可逆 |
| D5 | **API key 明文多路扩散**：localStorage 权威 + zustand 副本 + 原样转发给 UniRAG query body 的 `api_key` 字段 + baseURL 无 host 白名单 | storage.js:190-204、modelStore.js:126-131、App.jsx:1646-1650、ragEngineAdapter.js:489-493 | 桌面应用场景风险可控但违背最小暴露：任何 XSS/恶意依赖即可窃取；key 还落到 UniRAG 进程内存与日志面 | 短期：key 不再进 query body，改 UniRAG 侧本地配置；长期：Tauri keychain/stronghold 存 key | 高 / 部分可逆 |
| D6 | **UniRAG 适配器实例散落 + health 语义三处不一致**：App 层 5 处 new adapter + 轮询、工具层 health 检查、savedMemoryService 完全不查；router.buildRetrievalContext 恒走 local（半成品路由） | App.jsx:533,610,1257,1356,1639、readingAgentOptions.js:281-300、ragEngineAdapter.js:648-655 | 超时/健康状态不一致导致同一时刻不同功能对 UniRAG 可用性判断矛盾；重复连接开销 | 单例 adapter + 单一 health source（App 轮询结果共享）；删掉或完成 router | 中 / 可逆 |
| D7 | **UI 依赖模型输出字符串判断成功**：`content.includes('Created 3 source-grounded VibeCards.')` 触发 toast | App.jsx:942-948 | 提示词或模型一改，UI 静默失效；这也是把 UX 绑在 LLM 措辞上的反模式 | 工具返回结构化结果字段，UI 读结构化状态 | 中 / 可逆 |
| D8 | **PDF 不持久化 → 本地/远端知识状态不对称**：PDF 重开才能读，但 UniRAG 可能已完成入库 | App.jsx:91,1453-1456、documentKnowledgeService.js:41-48 | 「最近文档」列表点开 PDF 直接报恢复失败；知识在远端却本地不可读 | document_contents 增加 PDF 提取文本列，或恢复时走 UniRAG source 反查 | 中 / 可逆 |
| D9 | **skill 提示词三份并存**：skills.js 内嵌、modelFactory SKILL_SYSTEM_PROMPTS 兜底表、docs/*.md ?raw 注入 | skills.js:13-21、modelFactory.js:27-80,146-167 | 三处漂移无一致性校验，改提示词要同步三处 | 单一来源（md 文件），代码只引用不内嵌 | 低 / 可逆 |
| D10 | **AI 服务三套实现，两套死代码**：aiService 已合并，customOpenAI/customAnthropic 零引用仍完整维护 | aiService.js:1-4 注释、customOpenAIService.js:32-42 全仓无 import | 阅读噪音 + 误用风险（新代码可能引到旧实现） | 直接删除两个文件 | 低 / 可逆 |

### UniRAG（services/uni-rag）

| # | 发现 | 证据 | 代价 | 补救 | 严重度 |
| --- | --- | --- | --- | --- | --- |
| D11 | **单进程内存态 job 系统且无界增长**：`_ingest_jobs/_memory_jobs` 模块级字典，重启即失、只写不删 | routes.py:36,45-47 及各 `_set_*` 调用点 | 重启后 Reader 轮询 404 → 6 分钟无效轮询；长运行内存泄漏 | job 状态落 SQLite；启动时清理/定期淘汰已完成 job | 中 / 可逆 |
| D12 | **Chroma/BM25 双写无事务 + 索引只增不减**：逐条 add 后 BM25 全量重写 docs.json，并发 last-writer-wins；无删除端点；删 KB 不清理目录；CASCADE 因 foreign_keys=OFF 失效 | ingest/pipeline.py:118-140、bm25.py:22-34、kb.py:72,118-121 | 中途失败即 Chroma 与 BM25 失步且无对账路径；孤儿索引持续膨胀磁盘 | 加文档删除端点 + 删除时清理 KB 目录；ingest 加 per-source 幂等（先删旧 source 再写）；开启 PRAGMA foreign_keys | 高 / 可逆 |
| D13 | **Docker 数据目录配置错位（真 bug）**：容器设 `UNI_RAG_DATA_DIR=/data`，但 Settings 读的是 `UNI_RAG_DATA_DIR_PATH`（字段 data_dir_path）；`UNI_RAG_HOST/PORT` 无人消费 | Dockerfile:47-49 vs config.py:9-15,23、docker-compose.yml:10 | 容器数据落 `/app/data` 而非挂载卷 `/data`，卷挂载形同虚设，容器重建数据全丢 | 改 Dockerfile env 为 `UNI_RAG_DATA_DIR_PATH`，加一个启动时打印 data_dir 的日志 | 高 / 可逆 |
| D14 | **PDF 引用 span 定位基本失效**：对 `uploads/<src>` 直接 `read_text`，而 uploads 大量是二进制 PDF；MinerU 路径还丢页码 | rag/pipeline.py:190-192、parsers.py:38-39 | PDF 查询的 citation.span 多为空/乱码，Reader 端 grounding jump 对 PDF 无效——伤害产品核心卖点 | 存解析后的 markdown 全文（MinerU full.md 已有）作为 span 定位底稿 | 高 / 可逆 |
| D15 | **memory 召回是 LIKE + 兜底返回最近**，注释自述为让 smoke tests 通过 | memory.py:79-81,195-232 | 「长期知识记忆」的产品叙事下，召回质量与相关性无保证；兜底返回会造成不相关 citation 污染答案 | 用 BGE-M3 给 saved_memories 加向量列（模型已在进程内），LIKE 降级为兜底 | 中 / 可逆 |
| D16 | **会话只存 role+content**：citations 不落库，导出时重放检索重推引用；append 先 SELECT MAX(seq) 再 INSERT 无事务 | session/store.py:14-42、routes.py:846-864 | 导出内容与当时展示可能不一致（检索结果已变）；并发 append 可撞主键 | messages 加 citations_json 列 + 时间戳；append 用 INSERT OR REPLACE/自增主键 | 中 / 可逆 |
| D17 | **无鉴权 + 暴露面**：全端点无 auth，`X-API-Key` 只是 LLM 透传；run.py 绑 0.0.0.0；Docker/compose 暴露 8766；SSRF 检查放行 198.18.0.0/15 且存在 DNS rebinding 窗口 | routes.py:243-925、run.py:7、Dockerfile:51-52、routes.py:433-462 | 本地单用户可接受，但任何局域网设备可读写全部知识库并借用其 key 调 LLM | 默认绑 127.0.0.1；compose 场景加共享 token 中间件 | 中 / 可逆 |
| D18 | **非默认 KB 每请求重建 pipeline（含重载 bge-reranker-base）** | routes.py:664-666、retriever.py:26 | KB 场景首 token 延迟秒级膨胀；Embedder 有 lru_cache 而 Reranker 没有 | KB→pipeline 字典缓存 | 低 / 可逆 |

### 审计不含的

- 不评分、不按小时估算工作量（skill 原则：无校准基础的数字是伪精确）。
- 每条 finding 都给出过最强反驳检验：如 D13 曾怀疑是 config 有第二读取路径——核实 Settings 字段名后确认；D4 曾怀疑 Rust 侧有隐藏表——核实 schema 全表清单后确认。

---

## 3. 优先级建议（下一步可选动作）

1. **立即修（bug 级）**：D13 Docker env 错位、D14 PDF span 定位（直接伤害 grounding 核心体验）。
2. **本阶段顺手修（低风险高回报）**：D10 删死代码、D9 提示词单一来源、D7 结构化成功判定、D4 link 入 SQLite。
3. **进入 Phase C.1 monorepo cutover 前必须解决**：D1 重写 ARCHITECTURE.md、D2 契约查找机制（cutover 后 D2 自然消失）。
4. **单独立项**：D5 key 管理、D12 双写一致性+删除端点、D3 存储网关收敛。

## 4. 重构落地状态（2026-08-31 技术栈重构后）

全部 18 项债务处置完毕，另完成两项产品级能力升级：

| 债务 | 处置 | 落点 |
| --- | --- | --- |
| D1 | ✅ 已修复 | ARCHITECTURE.md 重写 |
| D2 | ✅ 消除 | monorepo cutover（DEC-0005 squash import，契约同仓）+ VIBEREADER_CONTRACTS_DIR |
| D3 | ✅ 消除 | 产品决策桌面 only，浏览器回退分支全部删除（R2） |
| D4 | ✅ 已修复 | 入库链接入 SQLite |
| D5 | ✅ 已修复 | API key 迁入 macOS Keychain，localStorage 只存空占位（R3） |
| D6 | 🔄 缓解 | 适配器实例仍散落，但 health/降级链路稳定，留待 agent 层重构 |
| D7 | ✅ 已修复 | 结构化 toolOutcome |
| D8 | ✅ 已修复 | PDF 文本持久化 + 文本模式恢复（P0） |
| D9 | ✅ 已修复 | 提示词单一来源 |
| D10 | ✅ 已修复 | 死代码删除 |
| D11 | ✅ 已修复 | job 落库 data/jobs.db，重启标记 failed，终态 24h 清理（R6） |
| D12 | ✅ 已修复 | 删除端点 + per-source 幂等 + foreign_keys=ON + BM25 锁（R4），顺手修复 BM25 全量冲掉旧索引的既有 bug |
| D13 | ✅ 已修复 | Docker env 修正 + 启动日志 |
| D14 | ✅ 已修复 | parsed sidecar |
| D15 | ✅ 已修复 | 三级检索 vector(≥0.30)→LIKE→recent + backfill-memory CLI（R5） |
| D16 | 🔄 未处理 | 会话 citations 落库，留待下一轮 |
| D17 | 🔄 大幅缓解 | run.py/容器绑定 loopback（社区 PR #3）+ Docker 配置修正；鉴权仍未做 |
| D18 | 🔄 未处理 | KB pipeline 缓存，留待下一轮 |

新增能力：PDF 文本持久化 + 阅读位置记忆（DEC-0008 P0）、VibeReader for Mac 原生版底座（DEC-0009）、monorepo 单仓（DEC-0005）。

遗留（下一轮候选）：D6/D16/D18、Mac 版 M1（改品牌+摘除 Sparkle）、Mac 版 AI 融合 M2-M4。
