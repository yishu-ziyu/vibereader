# Agent Live Eval Results (Grok 4.5)

Live acceptance run of the reading agent against **Grok 4.5** via the local OpenAI-compatible proxy.

## Verdict

**PASS** (exit code 0) — full suite 10/10

## Run metadata

| Field | Value |
| --- | --- |
| Timestamp (UTC) | 2026-08-06T17:11:22Z |
| Working dir | `apps/reader` |
| Script | `scripts/agent-eval-runner.mjs` via `vite-node` (`npm run agent:eval:grok`) |
| Wrapper | `scripts/agent-eval-grok.mjs` spawns local `vite-node` for product ESM |
| Offline (separate) | `scripts/agent-eval-offline.mjs` / `npm run agent:eval:offline` (no network) |
| Proxy | `http://127.0.0.1:8317/v1` |
| Model | `grok-4.5` |
| Key source | `~/.cli-proxy-api/client.env` (value not recorded) |
| Proxy probe | reachable (unauthenticated `/models` → HTTP 401) |
| Pass@k | `1` (`AGENT_EVAL_PASS_K`, default 1; set `2` for two attempts per case) |
| Agent path | **product modules** (`src/agent` runtime + tools + llmModel + skills + readingEval) |
| Ch8 lessons | pre-seeded `max_iterations` / `tool_not_found` bullets injected when `AGENT_EVAL_LESSONS` ≠ `0` |

## Aggregate

| Metric | Value |
| --- | --- |
| Cases | 10 |
| Passed | 10 |
| Failed | 0 |
| Pass@k | 1 |

| Case | Type | Result | Attempts | Tools | Iterations |
| --- | --- | --- | --- | --- | --- |
| `live-self-attention` | (generic) | PASS | 1 (first_pass=1) | `search_document` | 2 |
| `live-multi-head` | (generic) | PASS | 1 (first_pass=1) | `search_document`, `get_document_chunks` | 2 |
| `live-paper-overview` | `paper_overview_agent` | PASS | 1 (first_pass=1) | `get_current_document`, `get_document_chunks` | 2 |
| `live-attention-route` | `attention_agent` | PASS | 1 (first_pass=1) | `get_current_document`, `list_attention_insights`, `get_document_chunks` | 2 |
| `live-multi-tool` | (generic) | PASS | 1 (first_pass=1) | `get_current_document`, `search_document` (same-turn parallel) | 2 |
| `live-card-generation` | `card_generation_agent` | PASS | 1 (first_pass=1) | `get_current_document`, `get_document_chunks`, `create_vibecard`×2 | 3 |
| `live-knowledge-qa` | `knowledge_qa_agent` | PASS | 1 (first_pass=1) | `get_current_document`, `knowledge_search` | 2 |
| `live-critic` | `critic_agent` | PASS | 1 (first_pass=1) | `get_current_document`, `search_document`, `get_document_chunks`, `verify_citation`×2 | 4 |
| `live-memory-curator` | `memory_curator_agent` | PASS | 1 (first_pass=1) | `memory_search`, `get_current_document`, `list_attention_insights` | 2 |
| `live-note-export` | `note_export_agent` | PASS | 1 (first_pass=1) | `get_current_document`, `list_attention_insights`, `export_note` | 3 |

## Case: `live-self-attention`

| Field | Value |
| --- | --- |
| Document | 2-page markdown sample (`attention-snippet.md`) |
| Goal | Use document tools to explain what self-attention does; must call tools before final |
| Status | `completed` |
| Content preview | `## What self-attention does **Self-attention** lets each **token** attend to every other token in the sequence.` |

| Check | Result | Detail |
| --- | --- | --- |
| `status` | PASS | status is completed |
| `mustCallAnyTools` | PASS | called at least one of: search_document |
| `contentMustIncludeAny` | PASS | content includes: self-attention, Self-attention, token |

## Case: `live-multi-head`

| Field | Value |
| --- | --- |
| Document | same sample (page 2: multi-head / QKV / subspaces) |
| Goal | Use document tools to explain multi-head attention; must call tools before final |
| Status | `completed` |
| Content preview | `## Multi-head attention ... **Multi-head attention** projects **queries**, **keys**, and **values** ...` |

| Check | Result | Detail |
| --- | --- | --- |
| `status` | PASS | status is completed |
| `mustCallAnyTools` | PASS | called at least one of: search_document, get_document_chunks |
| `contentMustIncludeAny` | PASS | content includes: multi-head, Multi-head |

## Case: `live-paper-overview` (`type=paper_overview_agent`)

| Field | Value |
| --- | --- |
| Skill | `paper_overview_agent` via `skills.js` (`buildSystemPromptForSkill` + skill goal / maxIterations) |
| Document | 4-page mini paper (`did-staggered-adoption.md`: abstract / method / results / conclusion) |
| Goal | Skill default: concise paper overview using safe metadata and bounded source chunks |
| System prompt | Product skill prompt (Evidence-first / Tools-first) + live eval hint |
| Status | `completed` |
| Tools called | `get_current_document`, `get_document_chunks` (required for skill) |
| Content preview | `## reading_note **Document:** `did-staggered-adoption.md` ... treatment effects under staggered adoption ...` |
| Content length | 1288 (non-empty, grounded) |

| Check | Result | Detail |
| --- | --- | --- |
| `status` | PASS | status is completed |
| `mustCallAnyTools` | PASS | called at least one of: get_current_document, get_document_chunks |
| `contentMustIncludeAny` | PASS | content includes: treatment, difference-in-differences, staggered, Staggered, fixed effects, event-study |
| `contentNonEmpty` | PASS | content length=1288 |

## Case: `live-attention-route` (`type=attention_agent`)

| Field | Value |
| --- | --- |
| Skill | `attention_agent` via `skills.js` (`buildSystemPromptForSkill` + skill goal / maxIterations) |
| Document | 2-page markdown sample (`attention-snippet.md`: self-attention + multi-head) |
| Adapter | seeded `listAttentionInsightsForDocument` (2 in-memory insights); no write tools |
| Goal | Skill default: identify most important source-grounded reading positions as a short route |
| System prompt | Product skill prompt (Evidence-first / Tools-first) + live eval hint |
| Status | `completed` |
| Tools called | `get_current_document`, `list_attention_insights`, `get_document_chunks` |
| Content preview | `## Attention route (2 high-confidence stops) Ordered by usefulness ... 1. **Type:** Definition / Claim **Description:** **Self-attention** ...` |
| Content length | 1056 (non-empty short route ranking) |

| Check | Result | Detail |
| --- | --- | --- |
| `status` | PASS | status is completed |
| `mustCallAnyTools` | PASS | called at least one of: list_attention_insights, get_document_chunks |
| `contentMustIncludeAny` | PASS | content includes: route, Route, attention, self-attention, Self-attention, multi-head, Multi-head, 1., 1) |
| `contentNonEmpty` | PASS | content length=1056 |

## Case: `live-multi-tool`

| Field | Value |
| --- | --- |
| Document | 2-page attention sample |
| Goal | Prefer same-turn parallel: first response calls BOTH `get_current_document` AND `search_document` together; sequential multi-tool still hard-passes |
| System prompt | Explicit parallel instruction: "In your first response call BOTH get_current_document AND search_document together." |
| Status | `completed` |
| Tools called | `get_current_document`, `search_document` (same iteration=1 → same-turn parallel) |
| Iterations | 2 |
| Content preview | `## Self-attention (from the source) **Self-attention** lets each **token** attend to every other **token** in the sequence...` |

| Check | Result | Detail |
| --- | --- | --- |
| `status` | PASS | status is completed |
| `mustCallAnyTools` | PASS | called at least one of: search_document, get_current_document |
| `contentMustIncludeAny` | PASS | content includes: self-attention, Self-attention, token |
| `minToolCalls` | PASS (hard) | toolsCalled=2 >= 2 |
| `minDistinctTools` | SOFT_PASS | distinctTools=2 >= 2 [get_current_document, search_document] |
| `minToolCallsInFirstToolIteration` | SOFT_PASS | firstToolIter=1 toolCount=2 >= 2 (same-turn parallel) |

**Soft vs hard:** hard bar is `minToolCalls >= 2` + grounded content. Soft metrics prefer parallel same-turn multi `tool_calls` and two distinct tools; sequential multi-tool still passes the suite (`softMinToolCallsInFirstToolIteration` / `softMinDistinctTools`).

**How measured:** runtime tags all tools from one model multi-`tool_calls` response with the same `trace[].iteration`. Scorer `measureFirstToolUsingIteration` counts tools in the first tool-using iteration (and first model `toolCalls` length).

## Case: `live-card-generation` (`type=card_generation_agent`)

| Field | Value |
| --- | --- |
| Skill | `card_generation_agent` via `skills.js` + `buildSystemPromptForSkill` |
| Document | 4 distinct claim paragraphs (`transformer-claims.md`; blank-line chunks A–D) |
| Permissions | **write only for this case**: `buildReadingAgentPermissions('card_generation_agent')` → `canWriteVibeCards: true` + `create_vibecard` allowlist; other cases keep default read-only |
| Adapter | mock `createVibeCard` records cards in memory (`cardsRecorded`); no disk/UI |
| Goal | Create at least 2 source-grounded VibeCards via `create_vibecard` after reading document/chunks |
| Status | `completed` |
| Tools called | `get_current_document`, `get_document_chunks`, `create_vibecard` ×2 |
| Cards recorded | 2 (`Self-attention without recurrence`, `Multi-head attention subspaces`) |
| Content preview | `## Cards created Created **2** source-grounded VibeCards from `transformer-claims.md` ...` |
| Content length | 585 |

| Check | Result | Detail |
| --- | --- | --- |
| `status` | PASS | status is completed |
| `mustCallTools` | PASS | called required tools: create_vibecard (>= 1) |
| `contentNonEmptyOrCardsRecorded` | PASS | content length=585, cardsRecorded=2 |

If Grok refuses write (never calls `create_vibecard`), runner prints `FAIL_REASON: create_vibecard was never called (Grok refused or skipped write)` and exits 1.

## Case: `live-knowledge-qa` (`type=knowledge_qa_agent`)

| Field | Value |
| --- | --- |
| Skill | `knowledge_qa_agent` via `skills.js` (`buildSystemPromptForSkill` + skill goal / maxIterations) |
| Document | 3-paragraph RAG primer (`rag-primer.md`: retriever + generator, local corpus, grounding) |
| Permissions | `buildReadingAgentPermissions('knowledge_qa_agent')` → `canSearchKnowledge: true` + knowledge/document tools |
| Adapter | no UniRAG adapter in Node eval; `knowledge_search` uses **local-keyword** fallback (accepted) |
| Goal | Answer what RAG combines and why ground answers in passages; call `knowledge_search` (preferred) or `search_document` |
| Status | `completed` |
| Tools called | `get_current_document`, `knowledge_search` |
| Content preview | `## knowledge_answer **Answer:** Retrieval-augmented generation (RAG) combines a **retriever** with a **generator** ...` |
| Content length | 926 (non-empty, grounded) |

| Check | Result | Detail |
| --- | --- | --- |
| `status` | PASS | status is completed |
| `mustCallAnyTools` | PASS | called at least one of: knowledge_search |
| `contentMustIncludeAny` | PASS | content includes: retrieval, Retrieval, retriever, RAG, generator, passages |
| `contentNonEmpty` | PASS | content length=926 |

## Case: `live-critic` (`type=critic_agent`)

| Field | Value |
| --- | --- |
| Skill | `critic_agent` via `skills.js` + `buildSystemPromptForSkill` |
| Document | 2-page GAT claims sample (`gat-claims.md`) |
| Goal | Verify claim about graph attention networks using document tools + `verify_citation` |
| Status | `completed` |
| Tools called | `get_current_document`, `search_document`, `get_document_chunks`, `verify_citation` ×2 |
| Content preview | `## claim_critique | Field | Value | **Claim** | Graph attention networks ... | **Verdict** | **supported** ...` |
| Content length | 3300 |

| Check | Result | Detail |
| --- | --- | --- |
| `status` | PASS | status is completed |
| `mustCallTools` | PASS | called required tools: verify_citation |
| `mustCallAnyTools` | PASS | called at least one of: get_document_chunks, search_document |
| `contentMustIncludeAny` | PASS | content includes: supported, grounded, Verdict |
| `contentNonEmpty` | PASS | content length=3300 |



## Case: `live-memory-curator` (`type=memory_curator_agent`)

| Field | Value |
| --- | --- |
| Skill | `memory_curator_agent` via `skills.js` + `buildSystemPromptForSkill` |
| Document | 3-paragraph curation notes (`memory-curation-notes.md`: self-attention / DID / RAG candidates) |
| Permissions | `buildReadingAgentPermissions('memory_curator_agent')` → `canSearchMemory: true`; `memory_save` off |
| Adapter | no UniRAG `searchMemory` in Node eval; `memory_search` returns **status=unavailable** (accepted) |
| Goal | Call `memory_search`; report empty/unavailable honestly; propose save candidates; never auto `memory_save` |
| Status | `completed` |
| Tools called | `memory_search`, `get_current_document`, `list_attention_insights` |
| Content preview | `## memory_curation ### hits - **status:** `unavailable` ... proposals ... confirm` |
| Content length | 2443 (non-empty; propose + unavailable/empty handling) |

| Check | Result | Detail |
| --- | --- | --- |
| `status` | PASS | status is completed |
| `mustCallTools` | PASS | called required tools: memory_search |
| `contentMustIncludeAny` | PASS | content includes: propose, proposal, unavailable, empty, no saved, confirm, candidate, degraded |
| `contentNonEmpty` | PASS | content length=2443 |

**Not required:** `memory_save` (permissions filter it out; eval does not expect auto-write).


## Case: `live-note-export` (`type=note_export_agent`)

| Field | Value |
| --- | --- |
| Skill | `note_export_agent` via `skills.js` + `buildSystemPromptForSkill` |
| Document | 2-page reading note sample (`reading-note-sample.md`: claim + multi-head insight) |
| Permissions | **export only for this case**: `buildReadingAgentPermissions('note_export_agent')` → `canExportNotes: true` + `export_note` / `list_attention_insights` allowlist |
| Adapter | mock `exportNote` records exports in memory (`notesExported`); seeded `listAttentionInsightsForDocument` (2 insights); no disk/UI |
| Goal | Call `get_current_document`; preferred `list_attention_insights` then `export_note`; fallback non-empty markdown assembly |
| Status | `completed` |
| Tools called | `get_current_document`, `list_attention_insights`, `export_note` |
| Notes exported | 1 (`reading-note-eval-live-note-export.md`) |
| Content preview | `## reading_note_export Export completed for the current document. **Document** `reading-note-sample.md` ...` |
| Content length | 921 |

| Check | Result | Detail |
| --- | --- | --- |
| `status` | PASS | status is completed |
| `mustCallTools` | PASS | called required tools: get_current_document |
| `contentNonEmptyOrNotesExported` | PASS | content length=921, notesExported=1, export_note_called=true |

If Grok neither calls `export_note` nor produces non-empty markdown, runner prints `FAIL_REASON: export_note never called and content empty (no markdown assembly)` and exits 1.


## Preconditions verified

1. Sourced `~/.cli-proxy-api/client.env` (secrets not printed).
2. Proxy at `127.0.0.1:8317` reachable (probe treats 401 as up).
3. Ran `npm run agent:eval:grok` successfully with product modules and live cases including skill-typed `paper_overview_agent`, write-skill `card_generation_agent`, knowledge-skill `knowledge_qa_agent` (local-keyword fallback), critic-skill `critic_agent`, memory-skill `memory_curator_agent` (`memory_search` unavailable accepted; no auto `memory_save`), export-skill `note_export_agent` (mock `exportNote` + `canExportNotes`), and attention-skill `attention_agent` (seeded insights + short route ranking).

## Notes / residual risk

1. **Product agent modules loaded.** Eval runs under `vite-node` so extensionless Vite-style imports in `src/agent/*` resolve. Log line: `agent path: product (src/agent runtime + tools + llmModel + skills)`.
2. **Skill-typed cases.** `type=paper_overview_agent` / `attention_agent` / `card_generation_agent` / `knowledge_qa_agent` / `critic_agent` / `memory_curator_agent` / `note_export_agent` wire skill system prompt + filtered tools. Attention case seeds `listAttentionInsights` and expects short ranked route content. Memory case enables `canSearchMemory`; `memory_save` stays off; UniRAG optional (unavailable accepted). Card case enables write permissions + mock `createVibeCard`. Note-export case enables `canExportNotes` + mock `exportNote` (seeded insights). Knowledge case enables knowledge search permissions; UniRAG optional.
3. **Tool filtering.** Runner uses `filterAllowedTools` so OpenAI `tools[]` does not list writes denied by permissions.
4. **Pass@k:** `AGENT_EVAL_PASS_K` (default `1`, soft max `10`). Case passes if any attempt scores pass; runner early-stops on first pass.
5. **Case filter:** `AGENT_EVAL_CASE=live-knowledge-qa` runs only the knowledge QA skill case.
6. **Offline stays separate.** `agent-eval-offline.mjs` uses deterministic local models + `READING_EVAL_CASES` only; no network, suitable for CI. Offline already includes `knowledge-search-local` and `verify-citation-critic`.
7. Unauthenticated proxy probe returns 401; eval treats 401/403 as "proxy up". Real calls need the client key.
8. Browser product path still depends on model config seed + Vite `/api/llm-proxy`; this Node eval hits 8317 directly.
9. `vite-node` is a devDependency; if missing, install it or use the wrapper which falls back to `npx vite-node`.
10. Write path is mock-only in eval; production persistence still goes through product adapters / storage.
11. **Memory curator without UniRAG:** Node eval does not inject a `searchMemory` adapter, so `memory_search` returns `status=unavailable` with empty memories. Live product with UniRAG should exercise real hits separately. Eval requires `memory_search` + propose/empty language; does **not** require `memory_save`.
12. **Knowledge QA without UniRAG:** Node eval does not inject a UniRAG `knowledgeSearch` adapter, so `knowledge_search` falls back to local keyword search over the case document. Live product with UniRAG indexed docs should exercise the remote path separately.
13. **Note export mock path:** Node eval records `export_note` via in-memory `exportNote` adapter (`notesExported`); no real file write. Scorer accepts content non-empty **or** notes exported **or** `export_note` called (`contentNonEmptyOrNotesExported`).
14. **Ch8 lessons:** runner may pre-seed experience lessons (`AGENT_EVAL_LESSONS=0` disables). Orthogonal to case pass/fail.
15. **Parallel multi-tool (soft):** `live-multi-tool` hard-requires `minToolCalls >= 2`. Soft checks `minDistinctTools` and `minToolCallsInFirstToolIteration` report same-turn parallel preference without failing the suite when the model only goes sequential.


## How to re-run

```bash
cd apps/reader
set -a; source ~/.cli-proxy-api/client.env; set +a
curl -sS -H "Authorization: Bearer $OPENAI_API_KEY" http://127.0.0.1:8317/v1/models | head -c 200
npm run agent:eval:grok
# or: node scripts/agent-eval-grok.mjs
# or: npx vite-node scripts/agent-eval-runner.mjs

# multi-tool parallel-prefer (soft same-turn)
AGENT_EVAL_CASE=live-multi-tool npm run agent:eval:grok

# knowledge_qa skill only
AGENT_EVAL_CASE=live-knowledge-qa npm run agent:eval:grok

# card_generation skill only
AGENT_EVAL_CASE=live-card-generation npm run agent:eval:grok

# paper_overview skill only
AGENT_EVAL_CASE=live-paper-overview npm run agent:eval:grok

# attention_agent skill only
AGENT_EVAL_CASE=live-attention-route npm run agent:eval:grok

# critic skill only
AGENT_EVAL_CASE=live-critic npm run agent:eval:grok

# memory_curator skill only
AGENT_EVAL_CASE=live-memory-curator npm run agent:eval:grok

# note_export skill only
AGENT_EVAL_CASE=live-note-export npm run agent:eval:grok

# optional Pass@2 (two attempts per case if first fails)
AGENT_EVAL_PASS_K=2 npm run agent:eval:grok
```

Optional overrides: `GROK_EVAL_MODEL`, `GROK_PROXY_BASE`, `VIBEREADER_AGENT_*`, `AGENT_EVAL_PASS_K`, `AGENT_EVAL_CASE`, `AGENT_EVAL_LESSONS`.

---

## Deep-read live pipeline (+ optional critic)

| Field | Value |
| --- | --- |
| Timestamp (UTC) | 2026-08-06T17:12:00Z (approx; run ~102s) |
| Script | `scripts/agent-eval-deep-read.mjs` via `npm run agent:eval:deep-read` |
| Command | `AGENT_EVAL_DEEP_READ_MODE=live AGENT_EVAL_DEEP_READ_CRITIC=1 npm run agent:eval:deep-read` |
| Model | `grok-4.5` @ `http://127.0.0.1:8317/v1` |
| Key source | `~/.cli-proxy-api/client.env` |
| Skills | `paper_overview` → `attention` → `critic` sidecar (no `card_generation`) |
| enableCritic | `true` (live default is off; env `AGENT_EVAL_DEEP_READ_CRITIC=1`) |
| Result | **PASS** 13/13 |
| Elapsed | ~102s |

| Check | Result |
| --- | --- |
| `pipeline_status` | PASS (`completed`) |
| `skill_order` | PASS overview → attention → critic |
| `overview_*` / `attention_*` | PASS (tools + non-empty content) |
| `prior_context_attention` | PASS (overview injected into attention goal) |
| `no_card_skill` | PASS |
| `critic_completed` / `critic_content_nonempty` | PASS |
| `critic_goal` | PASS (`Re-check the claims`) |
| `critic_tools` | PASS (`verify_citation`, `search_document`, document tools) |

**Implementation note:** `runDeepReadPipeline({ enableCritic })` now also runs `runCriticPass` after the last skill when `card_generation_agent` is omitted (no-card / live path). Full pipeline still runs critic only after successful cards.

```bash
cd apps/reader
set -a; source ~/.cli-proxy-api/client.env; set +a
AGENT_EVAL_DEEP_READ_MODE=live AGENT_EVAL_DEEP_READ_CRITIC=1 npm run agent:eval:deep-read
# live without critic (default):
# AGENT_EVAL_DEEP_READ_MODE=live npm run agent:eval:deep-read
```


---

## Live suite re-run (append)

| Field | Value |
| --- | --- |
| Timestamp (UTC) | 2026-08-06T17:25:21Z |
| Working dir | `apps/reader` |
| Script | `scripts/agent-eval-runner.mjs` via `vite-node` (`npm run agent:eval:grok`) |
| Proxy | `http://127.0.0.1:8317/v1` |
| Model | `grok-4.5` |
| Key source | `~/.cli-proxy-api/client.env` (value not recorded) |
| Proxy probe | ok (HTTP 401) |
| Pass@k | `1` |
| Agent path | product (`src/agent` runtime + tools + llmModel + skills) |
| Ch8 lessons | enabled (2 bullets) |
| Result | **PASS** exit 0 — 10/10 |

### Aggregate

| Metric | Value |
| --- | --- |
| Cases | 10 |
| Passed | 10 |
| Failed | 0 |
| Pass@k | 1 |

| Case | Type | Result | Attempts | Tools | Iterations |
| --- | --- | --- | --- | --- | --- |
| `live-self-attention` | (generic) | PASS | 1 (first_pass=1) | `search_document` | 2 |
| `live-multi-head` | (generic) | PASS | 1 (first_pass=1) | `search_document`, `get_document_chunks` | 2 |
| `live-paper-overview` | `paper_overview_agent` | PASS | 1 (first_pass=1) | `get_current_document`, `get_document_chunks` | 2 |
| `live-attention-route` | `attention_agent` | PASS | 1 (first_pass=1) | `get_current_document`, `list_attention_insights`, `get_document_chunks` | 2 |
| `live-multi-tool` | (generic) | PASS | 1 (first_pass=1) | `get_current_document`, `search_document` (same-turn parallel SOFT_PASS) | 2 |
| `live-card-generation` | `card_generation_agent` | PASS | 1 (first_pass=1) | `get_current_document`, `get_document_chunks`, `create_vibecard`×2 | 3 |
| `live-knowledge-qa` | `knowledge_qa_agent` | PASS | 1 (first_pass=1) | `get_current_document`, `knowledge_search` | 2 |
| `live-critic` | `critic_agent` | PASS | 1 (first_pass=1) | `get_current_document`, `search_document`, `get_document_chunks`, `verify_citation`×2, `get_page_text` | 4 |
| `live-memory-curator` | `memory_curator_agent` | PASS | 1 (first_pass=1) | `memory_search`, `get_current_document`, `list_attention_insights` | 2 |
| `live-note-export` | `note_export_agent` | PASS | 1 (first_pass=1) | `get_current_document`, `list_attention_insights`, `export_note` | 3 |

### Soft notes (non-failing)

- `live-multi-tool`: hard `minToolCalls>=2` PASS; soft same-turn parallel PASS (`minDistinctTools`, `minToolCallsInFirstToolIteration`).
- `live-card-generation`: `cardsRecorded=2` (Self-attention without recurrence; Multi-head attention subspaces).
- `live-note-export`: `notesExported=1` (`reading-note-eval-live-note-export.md`).
- `live-memory-curator`: `memory_search` → `unavailable` (accepted); propose-to-save language present; no auto `memory_save`.

```bash
cd apps/reader
set -a; source ~/.cli-proxy-api/client.env; set +a
npm run agent:eval:grok
```
