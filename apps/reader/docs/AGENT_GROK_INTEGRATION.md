# Reading Agent + Grok 4.5 Integration

How to run the product Reading Agent against a real LLM (Grok 4.5) via the local OpenAI-compatible proxy on port **8317**, with offline-safe fallback to local deterministic models.

Working directory for all commands below: **`apps/reader`**.

Progress snapshot: repo root `docs/AGENT_ITERATION_STATUS.md`.

---

## User try-path (copy-paste)

### 1. Load proxy client env (live only)

```bash
cd apps/reader
set -a
source ~/.cli-proxy-api/client.env
set +a
```

Do not commit keys. If the file is missing, create/configure the local proxy client first (see Prerequisites).

Optional probe (401/403 still means the proxy is up):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8317/v1/models
# or with key:
curl -sS -H "Authorization: Bearer $OPENAI_API_KEY" http://127.0.0.1:8317/v1/models | head -c 200
```

### 2. Model preset: Local OpenAI Proxy (8317) + grok-4.5

In the app **model settings** picker:

| Field | Value |
| --- | --- |
| Preset | **Local OpenAI Proxy (8317)** (`id: local-openai-proxy`) |
| Base URL | `http://127.0.0.1:8317/v1` |
| Model | **`grok-4.5`** |
| API key | proxy client key from `~/.cli-proxy-api/client.env` |

Why this preset: browser requests rewrite through Vite `/api/llm-proxy` and avoid CORS to 8317.

Alternatives (same model family):

| Preset id | Name | Base URL | Notes |
| --- | --- | --- | --- |
| `local-openai-proxy` | Local OpenAI Proxy (8317) | `http://127.0.0.1:8317/v1` | **Recommended** for UI agent |
| `xai` | xAI / Grok | `https://api.x.ai/v1` | Direct cloud; may hit CORS in browser |
| `antigravity` | Antigravity (本地代理) | `http://127.0.0.1:8317/v1` | Same port; other default models |

### 3. Start the product

```bash
cd apps/reader
npm run dev
```

Dev server defaults to **`http://127.0.0.1:3217`** (`vite --host 127.0.0.1`).

Then: open a PDF/md → run **精读 / deep-read** (or per-skill agent tasks). Invalid model config falls back to local deterministic models.

### 4. Agent checks (unit + offline + deep-read + live Grok)

```bash
cd apps/reader

# Unit (agent package) — expect full green
npx vitest run src/agent

# Offline eval: no network, deterministic local models → 5/5
npm run agent:eval:offline

# Deep-read pipeline offline (local models + mock write + critic) → 12/12
npm run agent:eval:deep-read
# optional: AGENT_EVAL_DEEP_READ_CRITIC=0
# optional live (8317; overview+attention only, no card write):
#   set -a; source ~/.cli-proxy-api/client.env; set +a
#   AGENT_EVAL_DEEP_READ_MODE=live npm run agent:eval:deep-read

# Live Grok via 8317 (load env first) → documented 10/10
set -a; source ~/.cli-proxy-api/client.env; set +a
npm run agent:eval:grok
```

| Script | npm | What |
| --- | --- | --- |
| Unit | `npx vitest run src/agent` | Vitest under `src/agent/` |
| Offline | `npm run agent:eval:offline` | `vite-node scripts/agent-eval-offline.mjs` |
| Deep-read | `npm run agent:eval:deep-read` | `vite-node scripts/agent-eval-deep-read.mjs` |
| Live | `npm run agent:eval:grok` | `vite-node scripts/agent-eval-runner.mjs` |

Exit code `2` on live = proxy/key missing (safe CI skip). Exit `0` = all cases PASS.

Optional filters:

```bash
AGENT_EVAL_CASE=live-knowledge-qa npm run agent:eval:grok
AGENT_EVAL_CASE=live-card-generation npm run agent:eval:grok
AGENT_EVAL_CASE=live-memory-curator npm run agent:eval:grok
AGENT_EVAL_CASE=live-multi-tool npm run agent:eval:grok
AGENT_EVAL_PASS_K=2 npm run agent:eval:grok
AGENT_EVAL_LESSONS=0 npm run agent:eval:grok   # disable pre-seeded Ch8 lessons
```

Evidence log after live runs: `docs/AGENT_LIVE_EVAL_RESULTS.md` (under `apps/reader`).

---

## 7 skills + eval case names

Registered in `src/agent/skills.js`; contracts in `docs/reading-agent-skills/*.md`.

| Skill type | Contract md | Live case (if any) |
| --- | --- | --- |
| `paper_overview_agent` | `paper-overview.md` | `live-paper-overview` |
| `attention_agent` | `attention-route.md` | `live-attention-route` |
| `card_generation_agent` | `card-generation.md` | `live-card-generation` |
| `note_export_agent` | `note-export.md` | `live-note-export` |
| `knowledge_qa_agent` | `knowledge-qa.md` | `live-knowledge-qa` |
| `critic_agent` | `critic.md` | `live-critic` |
| `memory_curator_agent` | `memory-curator.md` | `live-memory-curator` |

**Offline cases (5):** `search-document-keyword`, `get-chunks-method`, `metadata-then-page`, `knowledge-search-local`, `verify-citation-critic`.

**Live generic cases (plus skill rows above):** `live-self-attention`, `live-multi-head`, `live-multi-tool`.

**Deep-read offline pipeline skills:** `paper_overview_agent` → `attention_agent` → `card_generation_agent` → (`critic_agent` sidecar when enabled).

UI main path: overview / attention / card / **精读 deep-read**. Weaker product entry (scripts work): note_export / knowledge_qa / memory_curator.

---

## Architecture

```text
UI (精读 / agent task)
  -> createReadingAgentOptions (App.jsx)
  -> resolveReadingAgentModel (agent/modelFactory.js)
       |-- preferLlm + valid config  -> createOpenAICompatibleAgentModel (agent/llmModel.js)
       |-- else / on failure         -> local paper/attention/card models
  -> runReadingAgentTask (agent loop + tools)

Browser (dev :3217)
  POST http://127.0.0.1:8317/v1/chat/completions
    -> resolveAiEndpointForRuntime
    -> /api/llm-proxy/v1/chat/completions
    -> Vite proxy -> http://127.0.0.1:8317/v1/chat/completions
```

Local models stay the default when the product model config is missing baseUrl, API key, or model name.

---

## Prerequisites

1. Local OpenAI-compatible proxy listening on `127.0.0.1:8317` (e.g. `cli-proxy-api` / Antigravity-style gateway).
2. Client key the proxy accepts, typically via `~/.cli-proxy-api/client.env`. Do not commit secrets.
3. Reader dev server on port **3217** for UI (`npm run dev`). Live eval does **not** need Vite; it hits 8317 from Node.

---

## Seed example (no secrets in git)

```bash
# Template only (empty key) - open Settings and paste the proxy key after seed
VIBEREADER_SEED_GROK_PROXY=1 node scripts/seed-model-config.mjs

# Or seed with a real env key (never commit the value)
CLI_PROXY_API_KEY=... node scripts/seed-model-config.mjs
# also accepts XAI_API_KEY / GROK_API_KEY for the same 8317+grok-4.5 profile
```

---

## Live cases (default model `grok-4.5`)

Defined in `scripts/agent-eval-runner.mjs`. Runs under `vite-node` so product `src/agent/*` ESM (extensionless imports) loads. Key is read from env or `~/.cli-proxy-api/client.env`.

| Case id | What it checks |
| --- | --- |
| `live-self-attention` | grounded tool use + keyword |
| `live-multi-head` | grounded tool use + keyword |
| `live-paper-overview` | skill-typed `paper_overview_agent` |
| `live-attention-route` | skill-typed `attention_agent` (short ranked route; `list_attention_insights` or `get_document_chunks`) |
| `live-multi-tool` | hard `minToolCalls: 2`; soft same-turn parallel (`minToolCallsInFirstToolIteration`) + soft `minDistinctTools` |
| `live-card-generation` | skill-typed `card_generation_agent` + mock write |
| `live-knowledge-qa` | skill-typed `knowledge_qa_agent` via `knowledge_search` (local-keyword fallback ok) + grounded answer |
| `live-critic` | skill-typed `critic_agent` via `verify_citation` + grounded verdict |
| `live-memory-curator` | skill-typed `memory_curator_agent` via `memory_search` (unavailable ok) + propose-to-save; no auto `memory_save` |
| `live-note-export` | skill-typed `note_export_agent` via `export_note` + mock export |

Filter: `AGENT_EVAL_CASE=live-multi-tool` (or any case id). Scorer supports soft checks (`soft: true`) so preferred parallel patterns never fail the suite when sequential multi-tool still works. See `measureFirstToolUsingIteration` in `src/agent/eval/readingEval.js`.

Env helpers used by `resolveAgentLlmConfig` (for scripts, not required for UI):

| Env | Meaning |
| --- | --- |
| `VIBEREADER_AGENT_BASE_URL` + `VIBEREADER_AGENT_API_KEY` (+ optional `VIBEREADER_AGENT_MODEL`) | Highest-priority agent override |
| `OPENAI_API_KEY` | Uses local proxy base `http://127.0.0.1:8317/v1` and model `grok-4.5` by default |
| `XAI_API_KEY` | Uses `https://api.x.ai/v1` + `grok-4.5` |
| `VIBEREADER_AGENT_GROUNDING=strict` | Node eval / scripts: force product `groundingMode: 'strict'` when the resolved model source is `llm` (default is `warn`). No UI toggle. |
| `VITE_AGENT_GROUNDING=strict` | Browser/Vite build-time equivalent of the above (`import.meta.env.VITE_AGENT_GROUNDING`) |

Deep-read script env:

| Env | Meaning |
| --- | --- |
| `AGENT_EVAL_DEEP_READ_MODE` | `offline` (default) or `live` |
| `AGENT_EVAL_DEEP_READ_LIVE=1` | alias for mode=live |
| `AGENT_EVAL_DEEP_READ_CRITIC` | `1` (default) / `0` offline critic sidecar |

---

## Grounding mode (product LLM path)

Not a user-facing setting. Product wiring chooses mode in `createReadingAgentOptions` via `resolveGroundingMode(adapters, resolvedSource)`:

| Resolved model source | `groundingMode` | Notes |
| --- | --- | --- |
| `llm` | **`warn`** (default) | Soft evidence-first gate + `includeObservability: true` |
| `llm` + env strict | **`strict`** | Hard fail ungrounded finals (`status: 'ungrounded'`) |
| `local` / fallback | omitted | Runtime gate stays **off** (deterministic models) |

Env force-strict (optional, for eval / hard QA):

```bash
# Node (live eval scripts, vite-node)
VIBEREADER_AGENT_GROUNDING=strict npm run agent:eval:grok

# Browser build (Vite): only VITE_* is exposed at build time
VITE_AGENT_GROUNDING=strict npm run dev
```

Runtime parser for the option itself remains `groundingGate.resolveGroundingMode(options)` (`off`/`warn`/`strict`, default `off` when unset). Product alias on the barrel: `resolveReadingAgentGroundingMode` (same as `readingAgentOptions.resolveGroundingMode`).

There is intentionally **no** Settings UI for strict mode.

## Remaining gaps (honest)

- Full fact / hallucination-veto rubric still thin; Pass@k default 1.
- `groundingGate` exists (`off`/`warn`/`strict`). LLM product path defaults to **warn** via `resolveGroundingMode` in `readingAgentOptions` (not a UI toggle). Env can force **strict**.
- Browser path still embeds skill systemPrompt; does not fs-load `skillPath` md.
- No OTel-style LLM+tool+retrieval export.
- Experience injects lessons only; does not auto-patch skill files.
- knowledge_qa / memory_curator / note_export product entry weaker than deep-read main path.
- **Chat vs knowledge_qa agent (2026-08):** App chat already has retrieval: local `buildIndexedRetrievalContext` prompt injection + optional UniRAG `adapter.query` when the document is indexed. That path is **not** the tool-loop agent. Optional agent path: `runDocumentQaAgent(document, question, modelConfig)` in `src/agent/documentQa.js` (skill `knowledge_qa_agent`, goal = user question). **Not wired into chat** by default to avoid breaking the stream path; call from Tasks / a flag / a future optional branch.

Do not claim “default hard-blocks ungrounded finals” or “live 10/10 this session” unless you re-ran the full suite.

---

## Code map

| Surface | Path |
| --- | --- |
| Provider presets | `src/modelPresets.js` (`xai`, `local-openai-proxy`) |
| Dev proxy | `vite.config.js` → `/api/llm-proxy` |
| Endpoint rewrite | `src/aiEndpoint.js` (8317 → `/api/llm-proxy`) |
| LLM adapter | `src/agent/llmModel.js` |
| Model resolve + fallback | `src/agent/modelFactory.js` |
| Product wiring | `src/App.jsx` → `createReadingAgentOptions` (`resolveGroundingMode`: llm→warn, env strict) |
| Grounding gate | `src/agent/groundingGate.js` (runtime apply) |
| Document QA helper | `src/agent/documentQa.js` → `runDocumentQaAgent` (not chat-default) |
| Skill prompts | `docs/reading-agent-skills/*.md` (summarized into system prompts; Node may inject `skillDocument`) |
| Seed helper | `scripts/modelConfigSeed.cjs` |
| Offline eval | `scripts/agent-eval-offline.mjs` |
| Live eval runner | `scripts/agent-eval-runner.mjs` |
| Deep-read eval | `scripts/agent-eval-deep-read.mjs` |

---

## Safety notes

- Never store real API keys in repo, templates, or docs.
- Offline / missing key: agents still run on local deterministic models.
- LLM failures fall back only at model construction time; runtime HTTP errors surface as agent task errors (retry from task panel after fixing config/proxy).
