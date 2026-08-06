# Reading Agent Harness Review

**Scope:** `apps/reader/src/agent/` core + `App.jsx` wiring + `scripts/agent-eval-grok.mjs`  
**Date:** 2026-08-06  
**Baseline:** unit tests 120/120 in `src/agent` (pre-fix claim)  
**Quality bar:** AI Agent Book capability matrix (`docs/AGENT_BOOK_CAPABILITY_MATRIX.md`)

## One-line conclusion

Harness has a solid ReAct core (runtime, permissions defaults, offline eval, trajectory helpers). Pre-fix, the **product LLM path was half-wired** (empty tool schemas, unfiltered write tools to the model, deep-read write without confirm). This pass applies those P0 wirings; remaining gaps are timeout cancel, multi-agent product use, trajectory evolution, and stronger eval.

```text
                    ┌── local models (scripted) ──► works offline
UI skill / deep-read
                    └── preferLlm + modelConfig ──► llmModel + tools
                              │
                              ├─ fixed: filterAllowedTools before model
                              ├─ fixed: buildOpenAIToolDefinitions → toolSchemas
                              ├─ fixed: deep-read Modal.confirm before cards
                              └─ open P1: timeout cancel / multiAgent prior ctx / Pass^k
```

---

## Severity legend

| Level | Meaning |
|-------|---------|
| **P0** | Broken product contract, silent fail under LLM, or write/safety hole |
| **P1** | Real gap vs book / reliability; not blocking local demo |
| **P2** | Scale / evolution / polish |

---

## 1. Correctness / product contracts

### P0-1 — Tool parameter schemas never reach the LLM (registry path)

**Where:** `llmModel.js` → `buildOpenAIToolDefinitions`

`createReadingTools()` entries have `name` / `description` / `run` but **no** `parameters`.  
`toolToOpenAIFunction` correctly falls back to `TOOL_PARAMETER_SCHEMAS`.  
`buildOpenAIToolDefinitions` only calls that path when `tool.parameters` is set; otherwise it emits:

```js
parameters: { type: 'object', properties: {} }
```

So production LLM runs get empty schemas for `search_document`, `get_page_text` (required `page`), etc.  
Live eval still works when models guess, but tool-choice quality is degraded vs design.

**Contract break:** `toolSchemas.js` + tests prove schemas exist; product path does not use them.

### P0-2 — Write tools exposed to model when permissions deny them

**Where:** `App.jsx` → `createReadingAgentOptions`; `modelFactory` freezes `tools` into LLM static defs

App builds the **full** registry (`create_vibecard` included whenever adapter exists) and passes it to both:

1. `resolveReadingAgentModel(..., { tools })` → OpenAI `tools[]` includes writes  
2. `runReadingAgent({ tools, permissions })` → runtime `assertToolAllowed` blocks execution

Effect under LLM: overview/attention agents can **select** `create_vibecard` → `permission_denied` → whole task fails.  
`filterAllowedTools` exists and is unit-tested, **not used** on the product path.

### P0-3 — Deep-read writes cards without user confirm

**Where:** `App.jsx` → `handleStartDeepRead` vs `handleStartAgentTask`

| Path | Card write confirm |
|------|--------------------|
| Task panel → Create VibeCard | `Modal.confirm` before run |
| Deep-read pipeline | chains `card_generation_agent` with `canWriteVibeCards: true`, **no confirm** |

Same write surface, inconsistent HITL. Cards land via `createAgentVibeCard` → local artifact store.

### P0-4 — Skill system prompts diverge between skills.js and modelFactory

**Where:** `skills.js` embeds evidence-first prompts + `buildSystemPromptForSkill`;  
`modelFactory.js` uses a shorter parallel `SKILL_SYSTEM_PROMPTS` map.

Task payload persists `systemPrompt` from skills; **LLM path ignores it** and uses factory strings.  
Product contract: skill docs / skill metadata are not the runtime authority for LLM.

### P1-1 — Timeout race does not abort in-flight work

**Where:** `runtime.js` → `withTimeout` = `Promise.race`

On timeout the UI/task gets `status: 'timeout'` with **empty trace**, while the loop may continue and still call `create_vibecard`.  
No AbortSignal; no shared cancelled flag.

### P1-2 — LLM maps only the first OpenAI `tool_calls[]` item

**Where:** `llmModel.js` → `mapOpenAIMessageToAgentResponse`

Runtime supports multi `toolCalls`; adapter returns a single `tool_call`. Parallel tool use is dropped.

### P1-3 — `verify_citation` schema vs implementation mismatch

Schema mentions `sourceRefs` array; implementation reads `evidenceText` or singular `sourceRef`.  
Models that follow schema get score 0 / ungrounded.

### P1-4 — Task retry for non-runnable `*_agent` types

`handleRetryTask` falls through to `retryReadingAgentTask(task)` without rebuilt `agentOptions` for types outside `RUNNABLE_READING_AGENT_TYPES` → uses payload metadata only → `invalid_model`.

### P1-5 — Success toast for card gen is local-model string-coupled

```js
content.includes('Created 3 source-grounded VibeCards.')
```

LLM path rarely emits that exact string → silent UI even when cards were created.

---

## 2. Security

### What is good

| Control | Status |
|---------|--------|
| `DEFAULT_READING_PERMISSIONS` write flags false | OK |
| `canUseWeb: false` | OK |
| Write tools require both `allowedTools` entry **and** flag | OK (tests cover) |
| System prompt: never echo API keys | OK |
| Eval script masks keys; keys from env / `~/.cli-proxy-api`, not repo | OK |
| Browser model config keys only in client storage / Authorization header | Expected for this app |
| `resolveAgentLlmConfig` env fallbacks are Node/script oriented | OK if UI only uses product config |

### Issues

| ID | Issue | Sev |
|----|-------|-----|
| S1 | Full tool registry offered to LLM includes write tools (see P0-2) | P0 |
| S2 | Deep-read auto-write without confirm (see P0-3) | P0 |
| S3 | Timeout does not stop write tools mid-flight (see P1-1) | P1 |
| S4 | `list_tools` introspects **full** registry if not pre-filtered (leaks write tool names) | P1 |
| S5 | No prompt-injection hard gate: retrieved text is not marked as untrusted beyond prose system rules | P1 (book 2.8) |
| S6 | `create_vibecard` adapter trusts model card payload; grounding is heuristic in `cardInputToArtifact`, not a reviewer sidecar | P1 |

**API keys:** no hard-coded secrets found in harness. Risk is operational (localStorage model configs), not harness leakage into tool results by design.

---

## 3. Dead / half-wired paths (not connected to App)

| Module / API | Unit tested | Product App wiring |
|--------------|-------------|--------------------|
| `runDeepReadPipeline` / `runCriticPass` (`multiAgent.js`) | Yes | **No** - App chains three `runReadingAgentByType` promises instead |
| `createTrajectoryRecorder` / `formatTrajectoryForPrompt` | Yes | **No** - runtime accepts them; App never passes `trajectoryRecorder` / `onEvent` |
| `AgentProgressPanel` + progress store | UI exists on PDF viewer | **Not fed** by reading-agent events |
| `buildSystemPromptForSkill` | Yes | LLM path uses factory prompts only |
| `observation.js` (`formatToolObservation`, `buildStatusBar`) | Yes | llmModel JSON.stringifies tool results; status bar not injected into messages |
| Skills: `knowledge_qa_agent`, `critic_agent`, `memory_curator_agent`, `note_export_agent` | Listed in `skills.js` | **Not in** `RUNNABLE_READING_AGENT_TYPES` |
| `memory_search` / `knowledge_search` adapters | Tools exist | App only injects `listAttentionInsightsForDocument` + `createVibeCard` - no `searchMemory`, no `ragAdapter` |
| `filterAllowedTools` | Yes | **Not used** on App path (pre-fix) |
| `LLM_AGENT_DEFAULTS` export | - | Unused symbol; factory has its own budgets |
| `contextCompression` | Yes | Not called from runtime loop |

---

## 4. Gaps vs AI Agent Book (capability matrix)

Legend: **Done** / **Partial** / **Missing** relative to book P0/P1 in matrix.

### Tool discovery & action space (Ch1/4)

| Capability | Status | Notes |
|------------|--------|-------|
| Narrow action space + default no-web | **Done** | permissions defaults solid |
| Tool schemas for model | **Partial** → empty on registry path | P0-1 |
| Permission filter before model | **Partial** | assert at execute only |
| `list_tools` progressive disclosure | **Partial** | tool exists; not filtered; skills not progressive-loaded from md at runtime |
| Write sidecar / claim verify before write | **Missing** | book 4.9 |

### Memory (Ch3)

| Capability | Status | Notes |
|------------|--------|-------|
| Product saved-memory ingest (UniRAG jobs) | **Partial** | outside agent loop (`savedMemoryService`) |
| Agent `memory_search` in product runs | **Missing** | no adapter in App |
| Memory curator skill runnable | **Missing** | skill metadata only |
| Cross-session strategy evolution (Ch8) | **Missing** | trajectory not persisted for learning |

### Multi-agent (Ch10)

| Capability | Status | Notes |
|------------|--------|-------|
| Sequential skill pipeline helper | **Partial** | `runDeepReadPipeline` exists |
| Product deep-read uses multiAgent module | **Missing** | App reimplements chain without shared prior-context injection from multiAgent |
| Critic second pass | **Partial** | `runCriticPass` unshipped |
| Isolated sub-agent contexts | **Missing** | shared tools/doc only |

### Eval (Ch6)

| Capability | Status | Notes |
|------------|--------|-------|
| Offline cases + scorer | **Done** | `eval/readingEval.js` |
| Live Grok script | **Done** | `scripts/agent-eval-grok.mjs` (module path + inline fallback) |
| Pass^k / rubric / hallucination veto | **Missing** | keyword checks only |
| CI gate for live eval | **Missing** | exit 2 skip when proxy down (correct for optional) |
| Trajectory+outcome dual judge | **Missing** | tools-called check only |

### Trajectory / evolution (Ch1.8 / Ch8)

| Capability | Status | Notes |
|------------|--------|-------|
| In-loop event emit + recorder API | **Done** | runtime + trajectory.js |
| Persist / UI replay | **Missing** | not wired; task result drops full trace (summary only in taskRunner) |
| Inject prior trajectory into next run | **Missing** | `formatTrajectoryForPrompt` unused |
| Experience → skill update loop | **Missing** | book Ch8 |

### Context engineering (Ch2)

| Capability | Status | Notes |
|------------|--------|-------|
| contextPacker token budget | **Done** | used when context not pre-packed |
| Standard tool role messages | **Done** | llmModel rebuilds OpenAI roles from trace |
| Status bar per turn | **Partial** | `shortStatus` passed to model args; OpenAI adapter **ignores** status/permissions/iteration in prompt |
| Skill progressive disclosure of md | **Missing** | embedded strings only; skillPath is docs pointer |

---

## 5. Module notes (file-by-file)

### `runtime.js`

- Clear ReAct: final / tool_call / multi-call sequential / maxIterations / timeout / permission_denied / tool_not_found.
- `onEvent` + `trajectoryRecorder` are solid extension points; listeners cannot crash the loop.
- Gaps: timeout cancel; no automatic `filterAllowedTools`; status string not forced into model messages.

### `llmModel.js`

- Config resolution order is clear; env fallbacks suitable for scripts.
- Message rebuild from trace is correct for single tool_call per model turn.
- Bugs: empty schemas (P0-1); first-only tool_calls (P1-2); no status-bar injection.

### `tools.js`

- Adapter injection pattern is correct; freeze outputs; local keyword fallbacks.
- Business tools (`knowledge_search`, `memory_search`, `verify_citation`, `list_tools`) implemented.
- Product adapters incomplete (App).

### `permissions.js`

- Correct fail-closed for writes; dual gate (list + flag).
- `filterAllowedTools` ready but unused upstream.

### `modelFactory.js`

- Local fallback offline-safe; preferLlm gated on full config.
- Construction-time fallback only (doc notes runtime HTTP errors fail the task - OK).
- Divergent skill prompts (P0-4).

### `multiAgent.js`

- Clean sequential pipeline + critic pass; prior step content injection.
- Dead for App deep-read.

### `trajectory.js`

- Browser-safe ring buffer; prompt formatter with budget.
- Dead for App.

### `skills.js`

- Seven skills with embedded system prompts and required tools - good metadata.
- Only three runnable in UI.

### `App.jsx` agent wiring

- Local vs LLM switch via `validateRunnableModelConfig` is correct product gate.
- Missing: filter tools, trajectory, multiAgent, memory/RAG adapters, confirm on deep-read write.
- Card success detection tied to local model copy.

### `scripts/agent-eval-grok.mjs`

- Sensible SKIP (exit 2) vs FAIL (exit 1); key masking; dual path (import agent modules / inline).
- Does not exercise product App permissions or skill prompts.
- Inline scorer subset of `scoreAgentResult` (no minSourceRefs etc.) - OK for live smoke.

---

## 6. Recommended fix order

| Priority | Action | Files |
|----------|--------|-------|
| P0 | Use `toolToOpenAIFunction` for all registry tools | `llmModel.js` |
| P0 | `filterAllowedTools` before model + run | `App.jsx` (and/or runtime entry) |
| P0 | Deep-read: confirm before card write | `App.jsx` |
| P0 | LLM system prompt from `buildSystemPromptForSkill` | `modelFactory.js` |
| P1 | AbortSignal / cancelled flag on timeout | `runtime.js` |
| P1 | Wire `onEvent` → UI progress / store trajectory on task | `App.jsx`, taskRunner |
| P1 | Inject UniRAG + searchMemory adapters for QA/memory skills | `App.jsx` |
| P1 | Switch deep-read to `runDeepReadPipeline` for prior-context | `App.jsx` |
| P1 | Multi tool_calls mapping | `llmModel.js` |
| P2 | Pass^k + rubric; critic as sidecar on write | eval + multiAgent |

---

## 7. Codebase note (review-time drift)

While reviewing, the tree already had several post-matrix improvements not reflected in the older capability matrix §0:

- `readingAgentOptions.js` centralizes permissions profiles, UniRAG `knowledgeSearch` / `searchMemory` adapters, and runnable skill policy (local models for QA / critic / memory curator).
- `App.jsx` feeds `onEvent` into `useProgressStore` / AgentProgressPanel.
- `taskRunner` composes onEvent and persists compact trace summary.
- `modelFactory` already preferred `skill.systemPrompt` and supports Ch8 `lessonsPrompt`.

Review findings above still hold for unfixed gaps; “dead path” table for memory adapters and progress is partially stale after those wirings.

---

## 8. Fixes applied in this review pass

Only clearly safe P0 wirings (≤5 files), no rewrites:

1. **`llmModel.js`** - `buildOpenAIToolDefinitions` always uses `toolToOpenAIFunction` so `TOOL_PARAMETER_SCHEMAS` apply.
2. **`readingAgentOptions.js`** - `filterAllowedTools` before model resolve and agent run.
3. **`modelFactory.js`** - system prompt from `buildSystemPromptForSkill` (+ DEFAULT_SYSTEM_PROMPT prefix; keep lessons append).
4. **`App.jsx`** - deep-read asks confirm before `card_generation_agent` (same HITL as single-skill write).
5. **`llmModel.test.js`** - expect schema fallback for registry tools without inline parameters.

Residual risk: timeout still cannot cancel in-flight writes; multi-agent module still unused for deep-read prior-context; Pass^k / critic sidecar still open.

---

## 9. Verification

```bash
cd apps/reader && npx vitest run src/agent
```

Report pass/fail after implementing the fixes above.
