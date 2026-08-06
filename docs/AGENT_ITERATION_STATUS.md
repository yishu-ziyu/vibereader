# Reading Agent 进度快照

**日期：** 2026-08-07（Wave 17 实测刷新）
**范围：** `apps/reader/src/agent/` + App 精读 / chat 接线 + eval 脚本
**质量标尺：** `docs/AGENT_BOOK_CAPABILITY_MATRIX.md`、`docs/AGENT_HARNESS_REVIEW.md`

一句话：**P0 已交付；P1 并行项多数已有主工作区代码，Wave 17 是验证波 + 入口/可观测收口。**
真 LLM ReAct、工具与权限、UniRAG adapters、精读 multi-agent pipeline、critic、grounding（runtime 裸默认 off；产品 LLM 路径默认 warn）、status bar、浏览器 skill md 打包注入、多 tool 并行、experience lessons + **提案（不自动改 skill）**、document QA helper + **chat 可选 tool-loop 入口**、span 导出 + run metrics、offline / live / deep-read eval 均可跑。
余量在 **完整事实 rubric 默认硬开、chat QA 产品默认仍 OFF、exportSpans 默认关、轨迹→自动改 skill、真 OTel SDK/导出管线、live 全量每会话复验**。

```text
P0 ████████████ 完成
P1 ██████████░░ 大半（gate warn 产品默认 / chat 入口可选 / skill 浏览器 / spans+metrics / proposals）
P2 █░░░░░░░░░░░ 极少（提案有；自动改 skill 无）
```

---

## Wave 17（本轮）

**主题：** 并行 P1（chat QA 入口、grounding 产品默认、rubric 收紧、spans、metrics、skill 浏览器、proposals）+ **验证波**。

| 项 | 状态 | 证据（主工作区磁盘 + 本会话） |
| --- | --- | --- |
| 单元：`npx vitest run src/agent` | **407 passed / 28 files / 0 failed** | Wave 17 末主工作区复测（2026-08-07） |
| Live Grok 全量 | **10/10 PASS**（本会话实测） | `npm run agent:eval:grok`；已 append `AGENT_LIVE_EVAL_RESULTS.md` |
| Offline | **7/7 PASS**（本会话实测） | 含 `multipage-page-aware-citation`；`npm run agent:eval:offline` |
| Deep-read offline | **12/12 PASS**（本会话实测） | `npm run agent:eval:deep-read` |
| Deep-read live + critic | **13/13 PASS**（本会话实测） | `MODE=live CRITIC=1`；~114s；card 写跳过 |
| Playwright skill smoke | **1/1 PASS** | `e2e/agent-skill.spec.js` |
| UniRAG E4 | **N/A**（8766 DOWN） | local-keyword 降级路径代码存在；未启服务 |
| Chat QA 入口 | **落地 / 默认 OFF** | `documentQaChat.js` + App 接线 + UI「问答」切换；opt-in：`localStorage vibereader.agent.chatQa` / `VITE_AGENT_CHAT_QA` / `VIBEREADER_AGENT_CHAT_QA` |
| Grounding 产品默认 | **落地（LLM 路径 warn）** | `readingAgentOptions.resolveGroundingMode`：`resolved.source==='llm'` → `warn`；env strict 可升；runtime 裸默认仍 `off` |
| Rubric / 幻觉 veto | **进行中 / Partial** | `readingEval` + `AGENT_EVAL_STRICT_GROUNDING`；claim-heavy 无证据 soft/hard；非完整事实 rubric |
| Spans | **落地 / 可选** | `spanExport.js`；runtime/taskRunner 需 `exportSpans: true`；非 OTel SDK |
| Metrics | **落地** | runtime 每次 run 附 `metrics`（wallMs / llmCallCount / toolCallCount / toolDurations） |
| Skill 浏览器加载 | **落地** | `skillDocuments.js` Vite `import.meta.glob(?raw)`；`createReadingAgentOptions` 注入 `skillDocument` |
| Skill 改进提案 | **落地 / 不写盘** | `experienceStore.proposeSkillImprovements` + markdown；**明确不**自动改 skill md |
| Deep-read live + critic | **13/13 PASS**（本会话实测） | live + critic 已跑绿 |

```text
Wave16 ──P1 收紧──► Wave17 ──并行 15 agent + 验证──► 仍欠：chat 默认开、完整 rubric 默认硬开、
                      │                               真 OTel 管线、自动改 skill、UniRAG up 联调
                      ├─ unit 407/28 全绿
                      ├─ offline 7/7 · deep-read offline 12/12
                      ├─ live grok 10/10 · deep-read live+critic 13/13
                      ├─ playwright skill 1/1
                      ├─ chat QA opt-in + UI
                      ├─ LLM 产品 grounding warn
                      ├─ skillDocuments 浏览器
                      ├─ spanExport + metrics
                      └─ skill proposals（人审）
```

**诚实标记：** 以主工作区磁盘 + Wave 17 实测为准。  
**收口：** 2026-08-07 已 commit/push；续开发入口见 [AGENT_CONTINUE.md](./AGENT_CONTINUE.md)。

---

## Wave 16（上轮）

**主题：** P1 收紧 - 更严 grounded、document QA helper、deep-read live critic、导出面完整。

| 项 | 状态 | 证据 |
| --- | --- | --- |
| 单元：`npx vitest run src/agent` | **300 passed / 25 files / 0 failed** | Wave 16 会话实测（含 `documentQa.test.js`） |
| Live Grok 全量 | **10/10 PASS**（文档） | `AGENT_LIVE_EVAL_RESULTS.md`；Wave 16 **未**全量重跑 |
| Offline / deep-read offline | 仍以既有 **5/5**、**12/12** 为准 | 未每波重跑则不谎称本会话实测 |
| `runDocumentQaAgent` | **落地** | `documentQa.js`；Wave 16 时未默认接 App chat |
| Grounding 收紧 | **部分落地** | `requireSourceRefsForClaims`；产品 LLM 默认 warn 在 Wave 17 钉死 |
| Deep-read live + critic | **脚本支持** | `AGENT_EVAL_DEEP_READ_MODE=live` + `AGENT_EVAL_DEEP_READ_CRITIC=1` |
| `index.js` 导出 | **补齐** | grounding / model / options / schema + index 双测 |

```text
Wave15 ──验收稳──► Wave16 ──P1 收紧──► Wave17 接入口/可观测/验证
```

---

## 1. 书章 → 已落地模块

| 书章 | 主题 | 已落地（代码） | 状态 |
| :--: | --- | --- | --- |
| 1 | Harness / ReAct | `runtime.js`（有界 loop、trace、超时 Abort、多 `tool_calls`、**metrics**）、`permissions.js`、`trajectory.js`、`observation.js`、`llmModel.js`、`groundingGate.js`、`spanExport.js` | **Done** |
| 2 | 上下文工程 | `contextPacker.js`、`contextCompression.js`、`skills.js`（7 skill）、status bar、**`skillDocuments.js` 浏览器打包 md** | **Done 主路径**（浏览器不再依赖 fs） |
| 3 | 记忆 / RAG | `knowledge_search` / `memory_search`；UniRAG adapters；`savedMemoryService`；`documentQa` + **`documentQaChat`（默认 OFF）** | **Done**（可 degrade；chat 需 opt-in） |
| 4 | 工具 | `tools.js`、`toolSchemas.js`、写工具双门控、`filterAllowedTools`、同轮多 tool 并行 | **Done** |
| 5 | 可验证产物 | `artifact.js`、`lensCard.js` | **Done** |
| 6 | 评估 | `eval/readingEval.js`；offline / grok / deep-read / runner；strict grounding 开关 | **最小集 Done**；完整 rubric 仍薄 |
| 8 | 持续进化 | experienceStore / lessons + **`proposeSkillImprovements`** | **Partial**：有提案；**无**自动改 skill |
| 10 | 多 Agent | `multiAgent.js`：pipeline + critic；App 精读已用；deep-read eval | **Done** |

**注册 skill（7）：**

1. `paper_overview_agent`
2. `attention_agent`
3. `card_generation_agent`
4. `note_export_agent`
5. `knowledge_qa_agent`
6. `critic_agent`（精读写卡后 sidecar）
7. `memory_curator_agent`

**UI 主路径：** overview / attention / card / **精读 deep-read**。
**可跑、入口较弱或 opt-in：** `note_export`、`knowledge_qa`（chat 可开 agent 问答）、`memory_curator`。

**关键能力（主工作区可核对）：**

| 能力 | 代码 / 证据 | 说明 |
| --- | --- | --- |
| **Grounding gate** | `groundingGate.js` + runtime | runtime 默认 `off`；产品 `createReadingAgentOptions` 在 LLM 源上默认 `warn` + `requireSourceRefsForClaims` |
| **Status bar 进 messages** | `llmModel.js` | 每轮 user trailer；UI `TaskStatusPanel` 可展示 |
| **Skill md 渐进加载** | `skillDocuments.js` + modelFactory | Node eval 可 inject；浏览器 Vite `?raw` 打包 7 份 skill md |
| **Multi-tool 并行** | runtime 同轮多 `tool_calls` | live-multi-tool 文档 PASS |
| **Experience lessons** | experienceStore → lessonsPrompt | 只注入，不改 skill 文件 |
| **Skill proposals** | `proposeSkillImprovements` / markdown | 失败 run 归并提案；人审；不自动写 md |
| **Document QA helper** | `documentQa.js` | knowledge_qa_agent 薄封装 |
| **Chat QA 入口** | `documentQaChat.js` + App | 默认 OFF；失败回落 UniRAG/stream |
| **Metrics** | runtime `createRunMetrics` | 每 run 附 wall/tool/llm 计数 |
| **Spans** | `spanExport.js` | OTel 风格树；`exportSpans: true` 才挂 |
| **Deep-read eval** | `scripts/agent-eval-deep-read.mjs` | offline + 可选 live/critic |

---

## 2. Agent 文件清单（`apps/reader/src/agent/`）

```text
runtime.js / tools.js / toolSchemas.js / permissions.js
contextPacker.js / contextCompression.js / observation.js
skills.js / skillDocuments.js / modelFactory.js / llmModel.js
readingTaskModels.js / readingAgentOptions.js / taskRunner.js
documentQa.js / documentQaChat.js
artifact.js / lensCard.js / groundingGate.js / spanExport.js
multiAgent.js / trajectory.js
experienceStore.js / experienceSingleton.js
index.js
eval/readingEval.js
+ 各模块 *.test.js（含 documentQa / documentQaChat / skillDocuments /
  spanExport / cardGenerationFlow / noteExportFlow /
  multiAgent.pipeline / groundingGate）
```

**28 个测试文件**（Wave 17 最终 vitest 发现数）；实现与测试同目录。
Skill 合同：`apps/reader/docs/reading-agent-skills/*.md`（7 份）。

---

## 3. 测试与 live 证据（不编造）

| 项 | 结果 | 说明 |
| --- | --- | --- |
| 单元：`npx vitest run src/agent`（`apps/reader`） | **400 passed / 28 files / 0 failed** | **Wave 17 本会话最终实测。** 首跑 337/26 因并行落盘不完整，不作为终态。 |
| 离线 eval：`npm run agent:eval:offline` | **5/5 PASS**（上轮文档） | Wave 17 **未**重跑；勿写「本会话 5/5」。 |
| Deep-read：`npm run agent:eval:deep-read` | **12/12 PASS**（offline，上轮文档） | Wave 17 **未**重跑。 |
| Live Grok：`npm run agent:eval:grok` | **全量 10/10 PASS**（文档仍有效） | 见 `AGENT_LIVE_EVAL_RESULTS.md`（2026-08-06T17:01:45Z）。Wave 17 **未**全量重跑。 |

### Offline 五 case

| Case | 要点 |
| --- | --- |
| `search-document-keyword` | `search_document` + grounded 关键词 |
| `get-chunks-method` | 强制 `get_document_chunks` |
| `metadata-then-page` | 页级检索回答 |
| `knowledge-search-local` | `knowledge_search` local-keyword |
| `verify-citation-critic` | `get_document_chunks` + `verify_citation` |

### Live 十 case（技能覆盖 + 通用）— 文档 10/10

| Case | 技能 / 类型 | 要点 |
| --- | --- | --- |
| `live-self-attention` | generic | 工具后 grounded 回答 |
| `live-multi-head` | generic | multi-tool 顺序/检索 |
| `live-paper-overview` | `paper_overview_agent` | skill 路径 |
| `live-attention-route` | `attention_agent` | skill 路径 |
| `live-multi-tool` | generic | **同轮 parallel** soft prefer |
| `live-card-generation` | `card_generation_agent` | 写卡 |
| `live-knowledge-qa` | `knowledge_qa_agent` | knowledge_search |
| `live-critic` | `critic_agent` | verify_citation |
| `live-memory-curator` | `memory_curator_agent` | memory_search |
| `live-note-export` | `note_export_agent` | export_note |

均（全量文档记录）`status=completed` 且有 grounded 工具调用。

### Deep-read offline 检查（12）

pipeline_status / skill_order / all_steps_completed / overview|attention|card|critic content / create_vibecard_count≥3 / cards_have_source / prior_context（attention+cards）/ critic_goal。

---

## 4. 精读与 chat 产品路径（代码事实）

```text
handleStartDeepRead (App.jsx)
  → experienceStore = getExperienceStore()
  → phase1: runDeepReadPipeline([overview, attention])
  → Modal.confirm（写卡前 HITL）
  → phase2: runDeepReadPipeline([card_generation], priorStepSummaries,
              enableCritic=true → runCriticPass sidecar，只读、无二次 Modal)
  → 各步 runReadingAgentTask + experienceStore.recordRun（经 taskRunner）
  → createReadingAgentOptions：LLM 源 → groundingMode warn + includeObservability
  → runtime final 可套 groundingGate；metrics 始终；spans 需 exportSpans

Chat handleSubmit（节选）
  → shouldRunDocumentQaFromChat（默认 flag OFF）
  → 若 ON：runDocumentQaFromChat → knowledge_qa_agent
  → 失败则回落 UniRAG query / stream chat
```

- Critic：`enableCritic = true` 且 `optionsBySkill.critic_agent` 存在时跑。
- `note_export`：pipeline `includeNoteExport`；默认精读三步不强制 export。
- Lessons：`readingAgentOptions` 从 experienceStore 解析 `lessonsPrompt` 注入 model。
- 文档 QA helper：`runDocumentQaAgent`；chat 入口：`documentQaChat`（**默认 OFF**）。
- 脚本验收：`npm run agent:eval:deep-read`；live：`AGENT_EVAL_DEEP_READ_MODE=live`；live+critic：`AGENT_EVAL_DEEP_READ_CRITIC=1`。

---

## 5. P0 / 已勾 P1

- [x] 真 LLM 接入 `runReadingAgent`（`llmModel` / `modelFactory`）
- [x] 工具注册 + schema + 权限默认只读
- [x] Agentic 读/搜/块工具闭环（含多 `tool_calls` / 并行 prefer）
- [x] UniRAG `knowledge_search` / `memory_search` adapters + local degrade
- [x] Evidence-first 产物（sourceRefs / verificationStatus）
- [x] 写卡权限与 claim 规则 + 精读 HITL
- [x] 多 skill 精读 pipeline + critic sidecar + deep-read eval
- [x] 评估最小集（offline 5 + live 10 + deep-read 12 + `readingEval`）
- [x] Trajectory 存证 + lessons 注入 model
- [x] **Grounding gate**（runtime 默认 off；**产品 LLM 路径默认 warn**；`requireSourceRefsForClaims`）
- [x] **Status bar 进 LLM messages** + UI 可展示
- [x] **Skill md 渐进注入**（Node eval + **浏览器 Vite 打包**）
- [x] **Document QA helper** + **Chat 可选入口**（默认 OFF）
- [x] **Run metrics** + **可选 span 树导出**
- [x] **Skill 改进提案**（人审 markdown；不自动写 skill）
- [ ] 完整 rubric / 幻觉一票否决（**默认强制**） → **仍 P1**
- [ ] Chat **默认** tool-loop QA → **仍 P1 / 产品**（代码有，默认关）
- [ ] 轨迹自动改 skill → **P2**
- [ ] 真 OTel SDK / 导出管线 → **仍 P1 余量**（轻量 span 树已有）

---

## 6. 仍缺 / 诚实余量

1. **Eval 深度：** Pass@k 支持但默认 1；完整事实/幻觉 veto 默认硬开未做；CI 不强制 live。
2. **Grounding 产品 vs runtime：** LLM 产品路径默认 warn；裸 runtime / local model 仍 off；strict 需 env。
3. **Chat QA 默认 OFF：** 入口与 UI 已有；默认不进 tool-loop。
4. **可观测：** metrics 常开；span 树需 `exportSpans`；无 OTel collector/导出管线。
5. **产品边角：** memory_curator / note_export 入口与 toast 仍弱。
6. **P2 进化：** proposals 只建议；不自动改 skill 文件。
7. **P2 子任务：** pipeline 串行共享 document，无独立 KV 子 Agent。
8. **Live 全量未每会话重跑：** 10/10 以 `AGENT_LIVE_EVAL_RESULTS.md` 为准；Wave 17 只实测 unit **400/28**。

历史已关闭（勿再当主余量）：超时不取消、只映射第一条 tool_call、eval 目录为空、无 multi-agent、仅脚本 model、无 critic、无 status bar、无 grounding 模块、浏览器完全不加载 skill md、无 chat QA 入口代码、无 span/metrics 模块、**llmModel 单元 1 红**、agent 包 286/300 旧快照。

---

## 7. 你怎么试

工作目录：`apps/reader`。

```bash
cd apps/reader
set -a; source ~/.cli-proxy-api/client.env; set +a   # live 时

# 单元（Wave 17 本会话最终 400/400 全绿，28 files）
npx vitest run src/agent

# 离线 eval（无网络）→ 文档/上轮 5/5（本会话未重跑）
npm run agent:eval:offline

# 精读 pipeline offline（本地 model + mock 写卡 + critic）→ 12/12（本会话未重跑）
npm run agent:eval:deep-read
# 可选: AGENT_EVAL_DEEP_READ_CRITIC=0
# 可选 live（需 8317；overview+attention，CRITIC=1 可挂 critic）:
#   AGENT_EVAL_DEEP_READ_MODE=live AGENT_EVAL_DEEP_READ_CRITIC=1 npm run agent:eval:deep-read

# Live Grok（需 8317 + key；缺代理可 exit 2）→ 文档 10/10
npm run agent:eval:grok
# 可选: AGENT_EVAL_PASS_K=2  /  AGENT_EVAL_CASE=live-multi-tool
# lessons: AGENT_EVAL_LESSONS=0 可关预种 lessons
# rubric: AGENT_EVAL_STRICT_GROUNDING=1 可硬否 claim-heavy 无证据

# 产品
npm run dev   # 通常 http://127.0.0.1:3217
# 模型：Local OpenAI Proxy (8317) + grok-4.5 → 打开 PDF → 精读
# chat 工具问答：UI「问答」切到 agent，或 localStorage vibereader.agent.chatQa=1
```

细节：`apps/reader/docs/AGENT_GROK_INTEGRATION.md`。
Live 证据：`apps/reader/docs/AGENT_LIVE_EVAL_RESULTS.md`。

---

## 8. 相关文档

| 文档 | 用途 |
| --- | --- |
| `docs/AGENT_BOOK_CAPABILITY_MATRIX.md` | 书章 × 能力矩阵 |
| `docs/AGENT_HARNESS_REVIEW.md` | harness 评审（可能滞后） |
| `docs/AGENT_BUILD_PLAN.md` | 构建计划 |
| `docs/AGENT_ACCEPTANCE_CHECKLIST.md` | 验收清单 |
| `apps/reader/docs/AGENT_GROK_INTEGRATION.md` | 用户 try-path |
| `apps/reader/docs/AGENT_LIVE_EVAL_RESULTS.md` | Live **10/10** 证据 |
| `apps/reader/docs/reading-agent-skills/*.md` | 7 skill 合同 md |

**下一步建议：** 决定 chat QA 是否默认 ON；`AGENT_EVAL_STRICT_GROUNDING` 是否进 CI；span 是否默认挂到 task result / 导出。
**不要：** 把「产品 LLM warn」说成「全局 strict 硬拦」；不要把未重跑的 live/offline 说成「本会话实测」。
