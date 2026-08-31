# DEVLOG — Reading Agent Wave 17（2026-08-07）

## 摘要

并行收口 P1：chat 可选工具问答、产品 LLM grounding 默认 warn、eval 严格 grounded 开关、span 导出、run metrics、浏览器 skill md、experience skill 提案（不写盘）、abort/权限边角、offline multipage case、全量 live/offline 验收。

## 证据

| 检查 | 结果 |
| --- | --- |
| `npx vitest run src/agent` | 407 passed / 28 files |
| `npm run agent:eval:offline` | 7/7 |
| `npm run agent:eval:deep-read` | 12/12 |
| `npm run agent:eval:grok` | 10/10 |
| deep-read live + critic | 13/13 |
| `e2e/agent-skill.spec.js` | 1/1 |
| UniRAG `:8766` | DOWN（E4 N/A，local-keyword 降级） |

## 新增 / 关键路径

- `src/agent/documentQaChat.js` — chat 可选入口（默认 OFF）
- `src/agent/spanExport.js` — `exportSpans: true`
- `src/agent/skillDocuments.js` — Vite `?raw` skill md
- `src/agent/groundingGate.js` + 产品 `resolveGroundingMode`（LLM → warn）
- `experienceStore.proposeSkillImprovements` — 只提案
- `scripts/agent-eval-*.mjs` — offline / grok / deep-read / runner
- 工作台 handoff：仓库根 `docs/AGENT_CONTINUE.md`

## 下次优先

见工作台 `docs/AGENT_CONTINUE.md` §6。

## 注意

- 密钥：`~/.cli-proxy-api/client.env`，禁止入库。
- 父 monorepo worktree 不含本仓；在本目录 git 操作。
