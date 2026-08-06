# AI Agent 书 → VibeReader 阅读 Agent 能力矩阵

来源：`/Users/mahaoxuan/Desktop/AI产品经理/ai-agent-book/book/`（第 1/2/3/4/6/8/10 章）。  
跳过：第 7 章（后训练细节）、第 9 章（机器人/重多模态）。  
产品锚点：PDF/md 阅读、annotations、vibe cards、UniRAG 本地知识、evidence-first 回答。

**本文件刷新：** 2026-08-07（Wave 17：对照主工作区代码 + 本会话 vitest **400/28**；offline/deep-read/live **未**本会话重跑）。
**进度快照：** [AGENT_ITERATION_STATUS.md](./AGENT_ITERATION_STATUS.md)

优先级约定：

- **P0**：不做则读答不成立或不可信（证据、检索、权限、基础循环）。
- **P1**：生产可靠性与可测（完整 rubric、可观测、压缩、写入安全深化）。
- **P2**：规模化与长期进化（自动改 skill、高级索引、失败回流）。

现状标记：

- **Done**：代码 + 测试/脚本可复核。
- **Partial**：主路径有，深度或产品面未满。
- **Gap**：仍缺。

---

## 0. 现状盘点：`apps/reader/src/agent/` 与相关服务

### 0.1 一句话

**P0 生产主路径已闭合：** 真 LLM ReAct（`llmModel` + `runtime`）+ 窄工具 + 权限 + UniRAG 适配 + 精读 multi-skill pipeline + critic sidecar + grounding gate（产品 LLM 默认 warn）+ status bar + skillDocument（Node + 浏览器 Vite 打包）+ chat 可选 document QA + metrics/spans + 离线/Live/deep-read eval + trajectory/lessons + skill proposals（人审）。
余量主要在 **P1/P2**（完整 rubric 默认硬开、chat QA 默认 OFF、真 OTel 管线、轨迹→自动改 skill）。

### 0.2 Agent 内核（已交付）

| 路径 | 作用 | 书中概念 | 现状 |
|------|------|----------|------|
| `runtime.js` | `runReadingAgent`：有界 ReAct；`maxIterations`；超时 Abort；单轮多 `tool_calls`；trace；**metrics**；可选 observability/spans | Ch1 ReAct + 轨迹 | **Done** |
| `llmModel.js` / `modelFactory.js` | OpenAI-compatible 真 LLM model；tools schema 下发；trace→messages；lessons 注入 | Ch1 Model-as-Agent | **Done** |
| `readingTaskModels.js` | 本地确定性 model（离线单测 / eval / 无配置回退） | Demo Harness | **Done**（并存，非唯一路径） |
| `tools.js` + `toolSchemas.js` | 感知：文档/页/块/搜/标注/attention；知识：`knowledge_search` / `memory_search`；审查：`verify_citation`；执行：写卡/注/export（权限控） | Ch4 窄动作空间 | **Done** |
| `permissions.js` | 默认只读；写 card/annotation/export/memory/web 默认关；`filterAllowedTools` 进产品 options | Ch1/4 故障安全 | **Done** |
| `contextPacker.js` / `contextCompression.js` / `observation.js` / `llmModel` status bar | token 预算打包；长 trace 压缩；观察规范化；**每轮 status bar 进 messages** | Ch2 上下文 | **Done** 主路径 |
| `skills.js` + `skillDocuments.js` | **7 skill** + 内嵌 systemPrompt；`skillPath`；Node inject + **浏览器 Vite `?raw` 打包** | Ch2 Skills | **Done** 主路径（缺 md 时回退 embed） |
| `artifact.js` / `lensCard.js` | claim ↔ sourceRefs；`verificationStatus` | Ch1 Verify | **Done** |
| `groundingGate.js` | final off/warn/strict；runtime 默认 off | Ch1/8 Verify | **Done**（产品 LLM 默认 warn，见 options） |
| `spanExport.js` | 轻量 OTel 风格 span 树（agent.run / llm.iteration / tool / retrieval） | Ch6 可观测 | **Partial**（纯变换；无 SDK/导出管线；需 `exportSpans`） |
| `taskRunner.js` | 任务状态 + 持久化 + compact trace；可挂 spans | Ch4 长任务 | **Done** |
| `trajectory.js` | 轨迹结构 / 回放辅助 | Ch1/6 可解释 | **Done** |
| `multiAgent.js` | `runDeepReadPipeline`、`runCriticPass`；App 精读已接线；`agent:eval:deep-read` | Ch10 多 Agent 子集 | **Done** |
| `experienceStore.js` / `experienceSingleton.js` | 记 run；lessons 注入；**`proposeSkillImprovements`（人审）** | Ch8 经验 | **Partial**（有库+注入+提案；无自动改 skill） |
| `documentQa.js` / `documentQaChat.js` | knowledge_qa helper；chat opt-in 入口（默认 OFF） | Ch3 文档问答 | **Done** helper；chat **Partial**（默认关） |
| `readingAgentOptions.js` | skill 权限、adapters、lessons、**LLM 源 grounding warn**、skillDocument 解析 | 产品 options 组装 | **Done** |
| `eval/readingEval.js` | 离线打分；`AGENT_EVAL_STRICT_GROUNDING` claim-heavy 可 hard | Ch6 最小集 | **Done**（完整事实 rubric 仍薄） |

### 0.3 检索与记忆服务（已有）

| 路径 | 作用 | 现状 |
|------|------|------|
| `retrievalContext.js` | 页/段分块 + 关键词；`sourceIdForChunk` | **Done** |
| `services/ragEngineAdapter.js` | LocalKeyword / UniRagHttp / router；health、query、ingest、degrade | **Done** |
| `services/savedMemoryService.js` | card/note → memory payload + UniRAG jobs | **Done** |
| `readingAgentOptions` 内 UniRAG adapters | `knowledge_search` / `memory_search` 挂真实 query | **Done**（视配置注入；无 UniRAG 时 local-keyword / unavailable） |
| UI / App | citation 跳转；精读 `runDeepReadPipeline`；写卡前 `Modal.confirm`；critic sidecar；chat 可选 agent 文档问答 | **Done**（主路径；chat QA 默认 OFF） |

### 0.4 相对书中「完整生产 Agent」的诚实余量

1. **Eval 深度（P1）：** Pass@k 脚本有，默认 1；`AGENT_EVAL_STRICT_GROUNDING` 可选；完整事实 rubric / CI 强制 live 未做。
2. **过程验证器（P1）：** 产品 LLM 路径默认 **warn**；runtime 裸默认 off；**strict 默认未开**。
3. **Skills 浏览器渐进加载：** **主工作区已落地**（`skillDocuments.js` Vite 打包）；缺文件仍 embed。
4. **可观测（P1）：** metrics 常挂；轻量 span 树有，需 `exportSpans`；**无** OTel SDK/collector。
5. **Ch8 自动进化（P2）：** lessons + **proposals 人审**；**无**自动改 skill md。
6. **子任务上下文隔离（P2）：** pipeline 阶段串行共享 document；非独立 KV 子 Agent。
7. **Chat tool-loop QA（P1 产品）：** 入口代码+UI 有；**默认 OFF**。

---

## 1. 第 1 章：Agent 入门 / Harness

| # | 能力 | VibeReader 映射 | P | 现状 |
|---|------|-----------------|---|------|
| 1.1 | ReAct 闭环 | `runReadingAgent` + 真 LLM / 本地 model | P0 | **Done** |
| 1.2 | 五段上下文齐全 | `buildMessagesFromTrace`（system/tools/user/assistant/tool） | P0 | **Done** |
| 1.3 | 观察空间覆盖阅读 | `contextPacker` + 读工具 | P0 | **Done** |
| 1.4 | 动作空间窄且足够 | `tools` + `permissions`（含 knowledge/memory/verify） | P0 | **Done** |
| 1.5 | sourceRefs / grounding | `artifact` / lensCard / citation jump | P0 | **Done** |
| 1.6 | 默认关闭写 | `DEFAULT_READING_PERMISSIONS` | P0 | **Done** |
| 1.7 | 停止条件 | maxIterations / timeout Abort / invalid / permission_denied | P0 | **Done** |
| 1.8 | 轨迹可解释 | runtime trace → task result / trajectory | P1 | **Done** |
| 1.9 | 验证与纠正 | tool 失败入 trace；critic + verify_citation；产品 LLM 默认 `groundingMode: warn`；runtime 裸默认 off | P1 | **Partial**（warn 软拦；非全局 strict） |
| 1.10 | 工作流 vs 自主分流 | ingest jobs vs 精读 agent vs chat 可选 document QA | P1 | **Partial**（chat QA 默认 OFF） |

---

## 2. 第 2 章：上下文工程

| # | 能力 | VibeReader 映射 | P | 现状 |
|---|------|-----------------|---|------|
| 2.1 | 稳定静态前缀 | skill systemPrompt + tools schema 相对稳定 | P1 | **Partial** |
| 2.2 | 标准 role 消息 | `llmModel` tool 角色回传 | P0 | **Done** |
| 2.3 | token 预算打包 | `contextPacker` | P0 | **Done** |
| 2.4 | 工具描述质量 | `toolSchemas.js` when/参数 | P1 | **Partial**（有 schema；消融未系统测） |
| 2.5 | Skills 渐进披露 | 内嵌 prompt；Node inject；浏览器 `skillDocuments` Vite `?raw` | P1 | **Done** 主路径（缺 md 回退 embed） |
| 2.6 | Agent 状态栏 | `llmModel` 每轮 status bar 进 messages；UI TaskStatusPanel | P1 | **Done** |
| 2.7 | 上下文感知压缩 | `contextCompression` + tool `truncated` | P1 | **Partial** |
| 2.8 | 提示注入防护 | 写权限默认关 + 检索源标记 | P0 | **Done**（可再硬化） |
| 2.9 | 隔离优于压入 | 多文档子任务 | P2 | **Gap** |
| 2.10 | 位置偏好 | packer 排序 | P1 | **Partial** |

---

## 3. 第 3 章：用户记忆与知识库（RAG）

| # | 能力 | VibeReader 映射 | P | 现状 |
|---|------|-----------------|---|------|
| 3.1 | 结构感知分块 | `retrievalContext.buildDocumentChunks` | P0 | **Done** |
| 3.2 | 混合检索路径 | UniRAG + local-keyword degrade | P0 | **Done** |
| 3.3 | 检索质量指标 | 固定集 recall@k | P1 | **Gap** |
| 3.4 | Agentic RAG | 多轮 search/get_page/chunks + knowledge_search | P0 | **Done** |
| 3.5 | 引用式回答 | sourceRefs + citation jump | P0 | **Done** |
| 3.6 | 上下文感知索引 | UniRAG 侧 | P2 | **Gap** / 远端 |
| 3.7 | 产物记忆 ingest | `savedMemoryService` | P0 | **Done** |
| 3.8 | 记忆与原文分离 | verification 字段 + memory_search 区分 | P0 | **Done** |
| 3.9 | 文档身份 | DocumentIdentity / sourceIndex | P0 | **Done** |
| 3.10 | 检索注入标记 | adapter 输出 | P1 | **Partial** |
| 3.11 | 跨会话偏好记忆 | UI 配置级 | P2 | **Gap** |

---

## 4. 第 4 章：工具

| # | 能力 | VibeReader 映射 | P | 现状 |
|---|------|-----------------|---|------|
| 4.1 | 工具分类清晰 | 感知 / 知识 / 审查 / 执行 | P0 | **Done** |
| 4.2 | 参数保真 | tools + adapters 单测 | P0 | **Done** |
| 4.3 | offset/limit 与截断可见 | `maxChars` / `truncated` | P0 | **Done** |
| 4.4 | 权限矩阵 | skill requiredTools + flags + filter | P0 | **Done** |
| 4.5 | 写前校验 | create_vibecard 强制 span 或 inference | P0 | **Done** |
| 4.6 | 危险操作 HITL | 精读写卡前 `Modal.confirm`；默认关写 | P1 | **Partial**（主路径有；批量外发等未扩） |
| 4.7 | 幂等任务 | taskRunner 重试语义 | P1 | **Partial** |
| 4.8 | 工具可观测 | runtime trace + tool `durationMs` + 可选 `spanExport` | P1 | **Partial**（有 metrics/可选 spans；无 OTel 管线） |
| 4.9 | Sidecar / 第二视角 | `runCriticPass` + `verify_citation` | P1 | **Done**（精读写卡后） |
| 4.10 | 事件驱动 | ingest 轮询为主 | P2 | **Gap** |

---

## 5. 第 6 章：评估与可观测

| # | 能力 | VibeReader 映射 | P | 现状 |
|---|------|-----------------|---|------|
| 6.1 | 阅读任务评估集 | offline 5 + live 10 + deep-read offline 12 checks | P0 | **Done**（最小集；可扩） |
| 6.2 | Rubric：事实/完整/幻觉 veto/引用 | 工具调用 + content；`AGENT_EVAL_STRICT_GROUNDING` 可 hard claim-heavy | P0 | **Partial**（仍非完整事实 rubric） |
| 6.3 | Pass^k 回归 | `AGENT_EVAL_PASS_K`；默认 1 | P1 | **Partial** |
| 6.4 | 轨迹 + outcome 双评 | mustCallTools + content | P1 | **Partial** |
| 6.5 | 模型 vs Harness 消融 | offline vs live 分脚本 | P1 | **Partial** |
| 6.6 | OTel 式 span | `spanExport.js` 轻量树；需 `exportSpans`；无 SDK | P1 | **Partial** |
| 6.7 | 成本与延迟 | runtime `metrics`（wallMs / llm / tool 计数与 duration） | P1 | **Partial**（无 token 计费系统） |
| 6.8 | 失败回流 eval | 流程级 | P2 | **Gap** |
| 6.9 | 提示词版本快照 | skills 路径有；自动 diff 回归无 | P2 | **Gap** |

---

## 6. 第 8 章：持续进化（生产可读子集）

| # | 能力 | VibeReader 映射 | P | 现状 |
|---|------|-----------------|---|------|
| 8.1 | 不可变轨迹存证 | taskRunner compact trace + experienceStore | P1 | **Partial** |
| 8.2 | 结果验证器 | artifact + critic + savedMemory 可见 | P0 | **Done** |
| 8.3 | 过程验证器 | critic + 产品 LLM 默认 grounding warn；strict 需 env | P1 | **Partial** |
| 8.4 | 经验 vs 用户记忆分离 | experience vs savedMemory | P1 | **Done**（结构分离） |
| 8.5 | 候选更新 + 回归 | `proposeSkillImprovements` 人审提案；无自动改 skill / canary | P2 | **Partial**（提案 Done；自动应用 Gap） |
| 8.6 | 注入不进正式经验 | 写权限 + memory 需确认 | P1 | **Partial** |
| 8.7 | 睡眠整理 | UniRAG curator 远期 | P2 | **Gap** |

---

## 7. 第 10 章：多 Agent（读者产品必要子集）

| # | 能力 | VibeReader 映射 | P | 现状 |
|---|------|-----------------|---|------|
| 10.1 | 有新信息时拆 Agent | pipeline 分 skill；critic 独立 pass | P2→产品已用 | **Partial**（阶段拆分 Done；检索子 Agent 未独立） |
| 10.2 | 子任务上下文隔离 | 仍共享 document/主 harness | P2 | **Gap** |
| 10.3 | 角色阶段切换 | overview→attention→card 共享 prior summaries | P1 | **Done** |
| 10.4 | handoff 自包含 | priorStepSummaries + documentId | P1 | **Done** |
| 10.5 | 交叉验证 | Proposer(card) + Reviewer(critic) | P1 | **Done** |
| 10.6 | 错误级联防护 | critic 只看证据/工具 | P1 | **Partial** |
| 10.7 | 预算意识 | skill maxIterations | P1 | **Done** |
| 10.8 | 不为辩论而辩论 | 无纯辩论 multi-agent | P2 | **Done**（原则遵守） |

---

## 8. 跨章合成：阅读 Agent 当前公式（已落地）

```text
ReadingAgent = Model (OpenAI-compatible LLM | 本地确定性)
  + Context (contextPacker, compression, skill systemPrompt, status bar, skillDocument/lessons)
  + Tools (读/搜/知识/记忆/verify/写卡写注, 权限默认只读)
  + UniRAG adapters (knowledge_search / memory_search, local degrade)
  + Multi-skill pipeline (deep-read: overview → attention → HITL → card + critic)
  + Chat entry (documentQaChat opt-in → knowledge_qa_agent; default OFF)
  + Verify (artifact sourceRefs, verify_citation, critic, product LLM grounding warn)
  + Correct (timeout Abort, maxIterations, permission_denied, UniRAG degrade)
  + Observability (metrics always; spans opt-in; status bar)
  + Eval (offline 5 + live 10 + deep-read + readingEval; optional strict grounding)
  + Experience (recordRun + lessons + skill proposals; 非自动改 skill)
```

产品行为一句：打开 PDF/md → 可问可标可精读生卡 → 关键判断可点回原文 → 卡可进本地知识 → 索引挂了仍能关键词兜底 → 精读写卡有确认与 critic → chat 可选手动开工具问答。

---

## 9. 实现顺序：P0 已完成 vs 下一批

### 9.1 P0（对照旧清单）— 均已交付

| # | 项 | 证据 |
|---|-----|------|
| 1 | 真 LLM 接入 `runReadingAgent` | `llmModel.js` / `modelFactory.js`；live 10/10 |
| 2 | Evidence-first 问答 / 引用 | artifact + live QA/card cases |
| 3 | UniRAG + local degrade | `ragEngineAdapter` + knowledge_search offline/live |
| 4 | Agentic 读工具闭环 | multi-tool live cases；runtime multi tool_calls |
| 5 | 写卡权限与 claim 规则 | permissions + create_vibecard 单测/flow |
| 6 | 阅读评估最小集 | `eval/` + offline 5/5 + live 10/10 |

另：**multi-agent 精读 pipeline + critic**、**deep-read eval**、**trajectory/lessons/proposals**、**groundingGate / status bar / skillDocuments**、**metrics/spans**、**documentQaChat**、**7 skill 注册** 已超出原最小 P0。

### 9.2 诚实剩余（P1 优先）

1. **Eval 加深：** 完整事实 rubric / 默认硬开幻觉 veto / 默认 Pass@k≥2；CI 门。
2. **过程验证器 strict：** 产品 LLM 已默认 **warn**；strict 仍靠 env；local 路径仍 off。
3. **Chat QA 产品默认：** 入口已有，默认仍 OFF。
4. **可观测管线：** span 树代码有；默认导出 / OTel collector 未做。
5. **工具描述消融测试**（改 bad description → 选错率上升）。
6. **P2：** proposals → 自动 skill 补丁 + 回归；多文档子上下文隔离。

---

## 10. 验证命令（`apps/reader`）

```bash
cd apps/reader

# 单元（agent 包）— Wave 17 本会话最终：400 passed / 28 files
npx vitest run src/agent

# 离线 eval — 文档/上轮 5/5（Wave 17 未重跑）
npm run agent:eval:offline

# 精读 pipeline offline — 文档/上轮 12/12（Wave 17 未重跑）
npm run agent:eval:deep-read

# Live Grok（需 8317 + client.env）— 文档 10/10；Wave 17 未重跑
set -a; source ~/.cli-proxy-api/client.env; set +a
npm run agent:eval:grok
# AGENT_EVAL_CASE=live-self-attention npm run agent:eval:grok
# AGENT_EVAL_STRICT_GROUNDING=1 npm run agent:eval:offline
```

Live 证据：`apps/reader/docs/AGENT_LIVE_EVAL_RESULTS.md`。进度快照：`docs/AGENT_ITERATION_STATUS.md`。

---

## 11. 文件索引（绝对路径）

**书**

- `/Users/mahaoxuan/Desktop/AI产品经理/ai-agent-book/book/chapter1.md` … `chapter4.md`、`chapter6.md`、`chapter8.md`、`chapter10.md`

**Agent**

- `/Users/mahaoxuan/Desktop/AI产品经理/vibereader-knowledge-workbench/apps/reader/src/agent/`
  `runtime.js` `llmModel.js` `modelFactory.js` `tools.js` `toolSchemas.js` `permissions.js`
  `contextPacker.js` `contextCompression.js` `skills.js` `skillDocuments.js` `readingTaskModels.js`
  `artifact.js` `taskRunner.js` `multiAgent.js` `trajectory.js` `groundingGate.js` `spanExport.js`
  `documentQa.js` `documentQaChat.js`
  `experienceStore.js` `experienceSingleton.js` `readingAgentOptions.js`
  `eval/readingEval.js`


**检索 / 记忆**

- `.../apps/reader/src/retrievalContext.js`  
- `.../apps/reader/src/services/ragEngineAdapter.js`  
- `.../apps/reader/src/services/savedMemoryService.js`  
- `.../docs/UNI_RAG_INTEGRATION_STRATEGY.md`

**同目录互链**

- [AGENT_ITERATION_STATUS.md](./AGENT_ITERATION_STATUS.md) — 进度快照与实测  
- [AGENT_BUILD_PLAN.md](./AGENT_BUILD_PLAN.md)  
- [AGENT_ACCEPTANCE_CHECKLIST.md](./AGENT_ACCEPTANCE_CHECKLIST.md)  
- [AGENT_BUSINESS_TOOLS_DESIGN.md](./AGENT_BUSINESS_TOOLS_DESIGN.md)  
- [AGENT_HARNESS_REVIEW.md](./AGENT_HARNESS_REVIEW.md)（部分表可能滞后；以 STATUS + 代码为准）

---

*本文件记录书中工程必做项与仓库现状对照；P0 已标 Done 处均有代码与测试/脚本证据。*
