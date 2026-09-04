# Reading Agent — 续开发入口（Handoff）

**日期：** 2026-08-07  
**阶段：** Wave 17 已收口；下一会话从本文 + 状态快照开始即可。  
**代码主仓：** 本仓库根（远程 `https://github.com/yishu-ziyu/vibereader.git`）；Reader 位于 `apps/reader`。

---

## 1. 一句话现状

生产主路径已闭合：真 LLM ReAct + 工具权限 + UniRAG 可降级 + 精读 multi-agent + critic + grounding（产品 LLM 默认 warn）+ 可选 chat 工具问答 + offline/live/deep-read eval 全绿。  
余量是产品默认、更严 rubric、真 OTel、UniRAG 联调、轨迹自动改 skill。

```text
P0 完成
P1 大半（入口/可观测/浏览器 skill md 已落地；默认仍保守）
P2 提案有，自动改 skill 无
```

---

## 2. 下次从哪读（顺序）

| 顺序 | 文件 | 用途 |
| --- | --- | --- |
| 1 | **本文** `docs/AGENT_CONTINUE.md` | 续开发入口 |
| 2 | `docs/AGENT_ITERATION_STATUS.md` | 最新 Wave 证据与勾选 |
| 3 | `docs/AGENT_BOOK_CAPABILITY_MATRIX.md` | 书章 → 能力矩阵 |
| 4 | `docs/AGENT_BUILD_PLAN.md` | P0/P1/P2 总计划 |
| 5 | `docs/AGENT_ACCEPTANCE_CHECKLIST.md` | 人机验收清单 |
| 6 | `apps/reader/docs/AGENT_LIVE_EVAL_RESULTS.md` | Live 10/10 记录 |
| 7 | `apps/reader/docs/AGENT_GROK_INTEGRATION.md` | Grok / 8317 接线 |

实现代码根：`apps/reader/src/agent/`。  
Skill 合同：`apps/reader/docs/reading-agent-skills/*.md`（7 份）。

---

## 3. 关键代码地图

```text
apps/reader/src/agent/
  runtime.js          # ReAct 循环、metrics、observability、exportSpans
  tools.js            # 读/写工具 + UniRAG knowledge/memory + abort
  permissions.js      # 默认只读；写工具双门控
  skills.js           # 7 skill 注册
  skillDocuments.js   # 浏览器 Vite ?raw 注入 skill md
  modelFactory.js     # local / llm 解析
  llmModel.js         # OpenAI-compatible tool loop + status bar
  readingAgentOptions.js  # 产品 options；LLM 默认 grounding warn
  multiAgent.js       # 精读 pipeline + critic
  documentQa.js       # knowledge_qa helper
  documentQaChat.js   # chat 可选入口（默认 OFF）
  groundingGate.js    # off / warn / strict
  spanExport.js       # OTel-like span 树（exportSpans: true）
  experienceStore.js  # lessons + proposeSkillImprovements（不写 skill 文件）
  taskRunner.js / trajectory.js / observation.js
  eval/readingEval.js
App.jsx               # 精读 handleStartDeepRead；chat 可选 QA
```

---

## 4. 命令（在 `apps/reader`）

```bash
# 单元（agent 包）
npx vitest run src/agent

# 离线 eval（无网络）
npm run agent:eval:offline

# Deep-read pipeline offline
npm run agent:eval:deep-read

# Live Grok（需 8317 + client.env）
set -a && source ~/.cli-proxy-api/client.env && set +a
npm run agent:eval:grok
AGENT_EVAL_DEEP_READ_MODE=live AGENT_EVAL_DEEP_READ_CRITIC=1 npm run agent:eval:deep-read

# Playwright skill 烟测
npx playwright test e2e/agent-skill.spec.js

# 开发
npm run dev   # 默认 127.0.0.1:3217
```

**LLM 代理：** `http://127.0.0.1:8317/v1`，密钥只在 `~/.cli-proxy-api/client.env`，禁止写入仓库。  
**UniRAG（可选）：** `http://127.0.0.1:8766`；DOWN 时 Agent 走 local-keyword 降级。启动见 `services/uni-rag` / 根 README。

**环境开关（摘录）：**

| 变量 / 键 | 作用 |
| --- | --- |
| `VITE_AGENT_CHAT_QA` / `VIBEREADER_AGENT_CHAT_QA` / `localStorage vibereader.agent.chatQa` | Chat 走工具问答；默认关 |
| `VIBEREADER_AGENT_GROUNDING=strict` | 产品 grounding 升 strict |
| `AGENT_EVAL_STRICT_GROUNDING=1` | Eval 幻觉/无证据硬否决 |
| `AGENT_EVAL_DEEP_READ_MODE=live` | Deep-read 用真模型 |
| `AGENT_EVAL_DEEP_READ_CRITIC=1` | Deep-read 挂 critic |
| `exportSpans: true`（options） | 结果附 span 树 |

---

## 5. Wave 17 验收证据（勿写假数）

| 检查 | 结果 |
| --- | --- |
| `npx vitest run src/agent` | **407 passed / 28 files** |
| `npm run agent:eval:offline` | **7/7 PASS**（含 multipage-page-aware-citation） |
| `npm run agent:eval:deep-read` | **12/12 PASS** |
| `npm run agent:eval:grok` | **10/10 PASS** |
| deep-read live + critic | **13/13 PASS** |
| `e2e/agent-skill.spec.js` | **1/1 PASS** |
| UniRAG health `:8766` | **DOWN → E4 N/A** |

---

## 6. 下一会话建议任务（按优先级）

1. **产品决策：** Chat 工具问答是否默认开（现 OFF + UI 切换）。  
2. **UniRAG up 联调：** 起 8766 → 勾验收 U2/U3 + live knowledge_search。  
3. **Rubric：** 完整事实/幻觉默认硬开（现 soft + env strict）。  
4. **可观测：** 真 OTel 导出或把 spans/metrics 接到 UI/任务面板。  
5. **P2：** experience 提案 → 人审改 skill md 的半自动流（仍不要无审写盘）。  
6. **嵌套 git 注意：** 父仓 worktree **不含** `apps/reader` 内容；改 Reader 请在 `apps/reader` 内 commit/push。

---

## 7. 双仓提交约定

| 仓 | 路径 | 推什么 |
| --- | --- | --- |
| VibeReader | `apps/reader` | 产品代码、eval 脚本、reader 内 docs |
| workbench | 仓库根 | `docs/AGENT_*.md`、集成策略、本 handoff |

不要把密钥、`playwright-report/`、`test-results/` 提交进仓。

---

## 8. 完成定义（下次 wave 最低验收）

- `npx vitest run src/agent` 全绿  
- offline + deep-read offline 全绿  
- 若改 live 路径：`agent:eval:grok` 全绿或说明失败相  
- 更新 `docs/AGENT_ITERATION_STATUS.md` 新 Wave 节（只写本会话实测）
