# VibeReader Reading Agent 构建总计划

更新时间：2026-08-06

质量标尺来源：本地《深入理解 AI Agent》十章（`/Users/mahaoxuan/Desktop/AI产品经理/ai-agent-book`，核心公式 **Agent = LLM + 上下文 + 工具**）。
产品落点：本仓库的 **Reader 阅读现场** + **UniRAG 长期知识**。

本文只写计划与可验收标准，不写产品代码。

---

## 1. 一句话结论

VibeReader 的阅读 Agent 不是「PDF 里塞聊天」，而是把大模型放进受控 harness：

```text
Agent = LLM + Context + Tools
      = 用户配置的模型
        + 当前文档/选区/大纲/批注/检索块（打包后的上下文）
        + 只读与门控写入的阅读工具
```

做得对时，用户能看到：**有界循环 → 工具轨迹 → 带 sourceRefs 的产物 → 可回原文**。

---

## 2. 核心公式在本产品里的含义

| 公式项 | 书中含义 | VibeReader 落点 | 主要代码位置 |
| --- | --- | --- | --- |
| **LLM** | 推理与决策主体 | 用户模型配置；开发/评测优先 Grok 4.5（见 §7） | `apps/reader/src/aiService.js`、`modelPresets.js`、`aiEndpoint.js` |
| **Context** | 决定能力上限 | 文档元数据、选区、页/段落块、注意力洞察、打包预算 | `apps/reader/src/agent/contextPacker.js`、`retrievalContext.js` |
| **Tools** | Agent 的手 | 读文档、搜文档、列洞察、建卡片/批注、导出笔记、跳页 | `apps/reader/src/agent/tools.js`、`permissions.js` |
| **Harness** | 循环、权限、预算、轨迹 | 有界 loop、task 持久化、skill 注册、产物模型 | `runtime.js`、`taskRunner.js`、`skills.js`、`artifact.js` |

```text
用户目标
  → contextPacker 打包
  → runtime 循环（model 决策 / tool 执行）
  → permissions 门控
  → artifact + sourceRefs
  → UI 任务面板 / 卡片 / 笔记
  →（用户确认后）UniRAG memory / citation
```

---

## 3. 业务映射：Reader Module + UniRAG

### 3.1 分工

| 模块 | 职责 | 不做什么 |
| --- | --- | --- |
| **Reader**（`apps/reader`） | 打开文档、阅读 UI、选区、Agent 循环、任务状态、本地产物 | 不当重型向量库本体 |
| **UniRAG**（`services/uni-rag`） | ingest、检索、rerank、带 citation 的问答、memory 索引 | 不替代 Reader 的页码/选区体验 |
| **Seam** | `RagEngineAdapter`：local-keyword 回退 + `UniRagHttpAdapter` | 不把 Python 栈硬塞进 Tauri 首发 |

集成策略见：[UNI_RAG_INTEGRATION_STRATEGY.md](./UNI_RAG_INTEGRATION_STRATEGY.md)。
共享契约：`packages/shared-contracts/reader-unirag-memory/v1/`。

### 3.2 阅读闭环 vs 知识闭环

```text
阅读现场（Reader Agent）
  打开 → 读/搜 → 概览/注意力/卡片/笔记 → 回原文

知识飞轮（用户确认后进 UniRAG）
  保存的卡片/笔记/高亮 → memory jobs → 后续 query 可引用 → 再回到 Reader 原文
```

Agent 可以**建议**写入；默认写权限关闭（见 `DEFAULT_READING_PERMISSIONS`），写入需 skill/任务显式放开。

---

## 4. 书十章 → 产品能力映射

| 章 | 书主题 | 产品能力 | 现状（2026-08） | 主改路径 |
| :--: | --- | --- | --- | --- |
| 1 | Agent 基础 / Harness | 有界 loop、trace、非法响应中止 | 已有 `runReadingAgent` / `runLoop` | `apps/reader/src/agent/runtime.js` |
| 2 | 上下文工程 | 目标+元数据+选区+块的 token 预算打包 | 已有 `packDocumentContext` | `contextPacker.js` |
| 3 | 记忆与知识库 | 会话内上下文 + UniRAG 检索/memory | Adapter 与契约在推进；Agent 工具侧仍偏本地文档 | `ragEngineAdapter.js`、`services/uni-rag`、契约 fixtures |
| 4 | 工具 | 工具注册表、只读/写入分离、权限 | `createReadingTools` + `permissions` 已落地 | `tools.js`、`permissions.js` |
| 5 | Coding Agent 范式 | 借其「可验证产物」思想：阅读产物可校验、可回源 | 产物与 claim 规范化在 `artifact.js` | `artifact.js`、UI 产物面板 |
| 6 | 评估 | 单元 + 实机 live eval | 单测多；`eval/` 目录空，缺统一 live 套件 | `apps/reader/src/agent/eval/`、checklist |
| 7 | 模型后训练 | **本期不做训练**；只做模型选型与评测后端 | 开发默认见 LOCAL_MODEL；Agent 评测用 Grok 4.5 | 配置与 eval 脚本，不进训练栈 |
| 8 | 持续进化 | 轨迹 → 修 skill/工具描述/打包策略（人驱动） | skill markdown + 注册表 | `skills.js`、`docs/reading-agent-skills/*` |
| 9 | 多模态 | PDF 页图/OCR 辅助；语音非 P0 | OCR/页相关能力在 Reader 侧 | 仅当阅读证据需要时再扩工具 |
| 10 | 多 Agent | 多 skill 顺序/编排，非独立「社会」 | 四 skill 注册；无跨 agent 编排层 | `skills.js`、`taskRunner.js`、后续 orchestrator |

已有四条 skill（实现侧 `skills.js`，说明在 `apps/reader/docs/reading-agent-skills/`）：

| skill type | 标题 | 必填工具 | 产物类型 |
| --- | --- | --- | --- |
| `paper_overview_agent` | Paper overview | `get_current_document`, `get_document_chunks` | `reading_note` |
| `attention_agent` | Attention route | 上表 + `list_attention_insights` | `attention_insights` |
| `card_generation_agent` | Create VibeCard | 上表 + `create_vibecard` | `vibecard` |
| `note_export_agent` | Note export | `get_current_document`, `list_attention_insights`, `export_note` | `reading_note_export` |

配套文档（已互链）：

- 能力矩阵：[AGENT_BOOK_CAPABILITY_MATRIX.md](./AGENT_BOOK_CAPABILITY_MATRIX.md)（书章 × 能力 × 现状）
- 业务工具设计：[AGENT_BUSINESS_TOOLS_DESIGN.md](./AGENT_BUSINESS_TOOLS_DESIGN.md)（UniRAG 业务工具：search / memory / verify / list_tools）
- 运行时映射：[`apps/reader/docs/AGENT_RUNTIME_MAPPING.md`](../apps/reader/docs/AGENT_RUNTIME_MAPPING.md)

---

## 5. 工作项：P0 / P1 / P2

路径均相对于仓库根；实现代码集中在 `apps/reader/src/agent/`，联调会碰到 `services/` 与 UI。

### P0（必须先做完，否则不算「阅读 Agent」）

| ID | 做什么 | 文件 / 目录 | 怎样算完（可证伪） |
| --- | --- | --- | --- |
| P0-1 | 稳定有界循环：final / tool_call / 超限 / 权限拒绝 | `runtime.js`, `runtime.test.js` | 单测覆盖四种结束状态；`maxIterations` 超时后不得无限转 |
| P0-2 | 工具注册与权限一致 | `tools.js`, `permissions.js`, 对应 `*.test.js` | 默认权限下写工具失败；skill 放开后 `create_vibecard` / `export_note` 可跑通 |
| P0-3 | 上下文打包有预算、可测 | `contextPacker.js` | 超预算时截断且保留 goal + metadata + 关键块；单测断言 token/字符上限 |
| P0-4 | 四 skill 任务可创建并跑通（mock model 即可） | `skills.js`, `taskRunner.js`, `readingTaskModels.js` | `buildReadingAgentTask` + `runReadingAgentTask` 写出 pending→running→completed/failed |
| P0-5 | 产物带 sourceRefs / claim 规则 | `artifact.js`, `lensCard.js` | 无 source 且非 inference 的 claim 被拒绝；卡片可回跳所需字段齐全 |
| P0-6 | 单元测试绿 | `apps/reader` 下 agent 相关 `*.test.js` | `cd apps/reader && pnpm test`（或项目惯用 test 命令）agent 相关失败为 0 |
| P0-7 | Live eval 脚手架 + Grok 4.5 一条金路径 | `apps/reader/src/agent/eval/`（新建脚本/用例） | 用 §7 配置对 demo 文档跑通 `paper_overview`；失败日志可复现 |

### P1（增强阅读质量与知识 seam）

| ID | 做什么 | 文件 / 目录 | 怎样算完 |
| --- | --- | --- | --- |
| P1-1 | 工具接 UniRAG 检索（只读 query） | `tools.js` + `services/ragEngineAdapter.js` | UniRAG 可用时 `search_document` / chunks 可走 adapter；不可用时 local 回退且 UI/trace 标明 engine |
| P1-2 | 用户确认后的 memory 推送不经 Agent 偷偷写 | `savedMemoryService.js`、契约 fixtures | 仅用户保存动作触发 `POST /api/memory/jobs`；契约测试与 `packages/shared-contracts/...` 一致 |
| P1-3 | 注意力路线与跳页联动 | `attentionNavigator.js`、工具 `navigatePage` | 任务结果 insight 点击后 PDF 页码/段落与 sourceRef 一致 |
| P1-4 | skill 文档与代码 requiredTools 同步 | `apps/reader/docs/reading-agent-skills/*`, `skills.js` | 任一 skill 改工具列表时文档与注册表一致；有检查或测试 |
| P1-5 | Live eval 集：四 skill × 固定 demo 文档 | `eval/` + `demo-assets/` | 每 skill 有可重复脚本；失败时保存 trace JSON |
| P1-6 | 任务 UI 可重试、可看 result preview | `TaskStatusPanel.jsx`、相关 store | 失败任务一点重试再进 running；成功结果可见 sourceRefs |

### P2（后置，明确不做训练）

| ID | 做什么 | 文件 / 目录 | 怎样算完 |
| --- | --- | --- | --- |
| P2-1 | 多 skill 编排（顺序/条件，单用户目标） | 新 `orchestrator` 或扩展 `taskRunner.js` | 一个目标可串 overview→attention→cards；总 iteration 仍有硬上限 |
| P2-2 | 轨迹驱动改进 skill 文案（人审） | `eval/` 失败样本库 | 失败 trace 可归档；改 skill 后同一用例通过率上升可度量 |
| P2-3 | 多模态页图进上下文（可选） | tools + OCR 服务 | 无文本 PDF 页可注入 OCR 摘要块并带页码；无 OCR 时明确降级文案 |
| P2-4 | 模型后训练 / 自托管 SFT-RL | — | **范围外**；文档中永久标为非目标 |

---

## 6. 可证伪验收原则

每条验收必须写成：

```text
当我做 X 时，我应看到 Y；若看到 Z，则本条失败。
```

示例（P0）：

- **当**我用 mock model 固定返回两次 `tool_call` 再 `final`，**应** `status === 'completed'` 且 `trace` 含 2 条 tool + 3 条 model；**若**超过 `maxIterations` 仍无 final，**应** `status` 为超限类而非挂死。
- **当**权限未开 `canWriteVibeCards` 却调用 `create_vibecard`，**应** `permission_denied`，**不得**写入持久化。
- **当** live 模型对 `demo-assets` 中样本文档跑 `paper_overview_agent`，**应**得到非空 `content` 或 `artifact`，且声称事实处带 `sourceRefs` 或明确「块不足」；**若**胡编页码且无 ref，本条失败。

完整勾选表见：[AGENT_ACCEPTANCE_CHECKLIST.md](./AGENT_ACCEPTANCE_CHECKLIST.md)。

---

## 7. 测试模型：Grok 4.5

Agent **live eval** 默认模型：**Grok 4.5**。

### 7.1 推荐：本机 8317 代理

凭据与 base URL 在本机（**不要**把 key 写进仓库）：

```text
~/.cli-proxy-api/client.env
```

典型变量形态（以你机器上文件为准）：

```bash
# 示例形态 — 实际值以 client.env 为准，禁止提交
export OPENAI_BASE_URL="http://127.0.0.1:8317/v1"
export OPENAI_API_KEY="..."   # proxy 侧密钥
export CLI_PROXY_API_BASE_URL="http://127.0.0.1:8317"
```

使用前：

1. 确认 8317 代理进程已启动。
2. `source ~/.cli-proxy-api/client.env`（或等价加载）。
3. 在 Reader 模型配置中指向 OpenAI 兼容端点 `http://127.0.0.1:8317/v1`，模型名按代理暴露的 Grok 4.5 标识填写。
4. 发一条最短 chat，确认非 401/连接拒绝。

### 7.2 备选：直连 `XAI_API_KEY`

若代理不可用，可用官方 xAI 密钥环境变量 `XAI_API_KEY` + 官方 OpenAI 兼容 base URL（以 xAI 当前文档为准）。**密钥只存在环境或本机密钥管理中，禁止写入 git、docs、localStorage 模板。**

### 7.3 与产品默认模型的关系

- 产品日常开发模板仍可按 `apps/reader/docs/LOCAL_MODEL_SERVICES.md`（如 MiniMax）运行。
- **本文档定义的 Agent 能力 live eval / 回归**以 Grok 4.5（8317 或 `XAI_API_KEY`）为准，避免「测的是一套、验收是另一套」。

---

## 8. 迭代环

```text
实现 → 单元测试 → live eval（Grok 4.5）→ 根据 trace 修复 → 再测
```

规则：

1. **实现**：只动本计划中的目标文件；不顺手大重构。
2. **单元**：mock model / 假 adapter；不依赖外网。失败必须先修单测路径。
3. **Live eval**：真实模型 + demo 文档；保存 goal、trace、产物、模型名、时间。
4. **修复**：优先改工具描述、权限、打包、skill 步骤、模型接入错误处理；避免用「提示词玄学」掩盖工具 bug。
5. **停止条件**：P0 验收表全过；或明确失败场景写入 checklist「已知缺口」并标明优先级。

命令习惯（在 `apps/reader`）：

```bash
pnpm test          # 或 npm test — 以 package.json 为准
pnpm build         # 防回归打包失败
# live eval：eval 脚手架就绪后的脚本（P0-7 交付）
```

UniRAG 联调：

```bash
# 仓库根
./scripts/dev-unirag.sh   # 或 services/uni-rag 文档中的启动方式
./scripts/dev-reader.sh
```

---

## 9. 当前代码地图（实现时先读）

```text
apps/reader/src/agent/
  index.js              # 导出面
  runtime.js            # 有界循环
  contextPacker.js      # 上下文打包
  tools.js              # 工具实现与 createReadingTools
  permissions.js        # 默认只读 + 写门控
  skills.js             # 四 skill 注册
  readingTaskModels.js  # skill 轨迹 → 产物
  taskRunner.js         # 任务状态机 + 持久化
  artifact.js           # 产物与 claim 规则
  lensCard.js           # 透镜卡片
  eval/                 # live eval（待填）

apps/reader/src/services/
  ragEngineAdapter.js   # local-keyword | uni-rag
  savedMemoryService.js
  ...

apps/reader/docs/
  AGENT_RUNTIME_MAPPING.md
  reading-agent-skills/*.md
  LOCAL_MODEL_SERVICES.md
```

---

## 10. 非目标（写清楚以免扩 scope）

- 不做模型 SFT/RL 训练流水线（书第 7 章工程不迁入本仓）。
- 不做通用桌面 Computer Use / 机器人（书第 9 章大部分）。
- 不做「多 Agent 社会」仿真（书第 10 章仅借鉴编排与隔离思想）。
- 不把 UniRAG 重前端与 Reader 合并；不 flatten 两边 git 历史（见产品决策与集成策略）。
- 不在默认权限下开放任意网页抓取或裸文件系统写。

---

## 11. 相关文档

| 文档 | 作用 |
| --- | --- |
| [AGENT_ACCEPTANCE_CHECKLIST.md](./AGENT_ACCEPTANCE_CHECKLIST.md) | 人/机共用验收勾选 |
| [AGENT_BOOK_CAPABILITY_MATRIX.md](./AGENT_BOOK_CAPABILITY_MATRIX.md) | 书章 × 能力 × 现状矩阵 |
| [AGENT_BUSINESS_TOOLS_DESIGN.md](./AGENT_BUSINESS_TOOLS_DESIGN.md) | UniRAG 业务工具设计（仅设计） |
| [UNI_RAG_INTEGRATION_STRATEGY.md](./UNI_RAG_INTEGRATION_STRATEGY.md) | Reader ↔ UniRAG seam |
| [PRODUCT_VISION.md](./PRODUCT_VISION.md) | 产品定义 |
| [PROJECT_DEVELOPMENT_PLAN.md](./PROJECT_DEVELOPMENT_PLAN.md) | 工作台整体计划 |
| [`apps/reader/docs/AGENT_RUNTIME_MAPPING.md`](../apps/reader/docs/AGENT_RUNTIME_MAPPING.md) | 运行时概念映射 |
| 书源：`/Users/mahaoxuan/Desktop/AI产品经理/ai-agent-book` | 质量与概念 SSOT |

---

## 12. 下一步（实现侧）

1. 按 P0-1～P0-6 把单测与权限/循环缺口补齐。
2. 在 `apps/reader/src/agent/eval/` 落最小 live 脚本（P0-7），绑定 Grok 4.5。
3. 用 [AGENT_ACCEPTANCE_CHECKLIST.md](./AGENT_ACCEPTANCE_CHECKLIST.md) 跑一轮，失败项回填本计划 P0/P1 表。
