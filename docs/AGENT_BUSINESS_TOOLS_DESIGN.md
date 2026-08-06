# Agent Business Tools Design (UniRAG)

Date: 2026-08-06  
Status: design only (no implementation)  
Scope: new agent tools for `apps/reader/src/agent/tools.js` (or a sibling module), wired through existing `createReadingTools` + `permissions.js` + UniRAG adapters.

## 1. One-line conclusion

Add four business tools on top of the existing reading tool registry: **knowledge_search**, **memory_search / memory_save**, **verify_citation**, and **list_tools**.
They call `RagEngineAdapter` / `savedMemoryService` / local grounding helpers; they do **not** call UniRAG FastAPI directly from tool `run` handlers.

## 2. Current territory (what exists)

```text
runReadingAgent
  -> assertToolAllowed(permissions)
  -> tools[name].run(args)

createReadingTools(baseContext, adapters)
  -> { name, description, readOnly, run }

RagEngineAdapter (apps/reader/src/services/ragEngineAdapter.js)
  -> health | query | ingestDocument | getIngestStatus
  -> ingestMemory | getMemoryIngestStatus
  -> normalizes UniRAG citations -> sourceRefs
       (document vs saved_memory / evidenceType)

documentKnowledgeService
  -> localStorage document->uniRagSourceId link
  -> isDocumentKnowledgeQueryReady / startDocumentKnowledgeIngest

savedMemoryService
  -> buildSavedMemoryPayload (reader-unirag-memory-v1)
  -> startSavedMemoryIngest (user-confirmed artifact only)

UniRAG FastAPI (services/uni-rag)
  -> POST /api/query  (+ include_memory, memory_top_k)
  -> POST/GET /api/memory/jobs
  -> CitationVerifier (embedding cosine, threshold ~0.45) inside RAG pipeline
  -> MemoryStore.search (LIKE keyword, phase-1; no public /api/memory/search yet)
```

### Existing tool shape (pattern to mirror)

Each entry in `createReadingTools`:

| Field | Today |
| --- | --- |
| key / `name` | snake or legacy camel (`search_document`, `extractText`) |
| `description` | short English sentence for the model |
| `readOnly` | boolean; write tools default off via permissions |
| `run(args)` | merges `baseContext` via `withBaseContext`, calls pure export + `adapters` |
| schema | **not present yet** - args are free-form JS objects |
| permissions | `READING_TOOL_NAMES` allow-list **and** `TOOL_PERMISSION_FLAGS` |

Default permissions (`DEFAULT_READING_PERMISSIONS`) allow only read tools.
Write tools (`create_vibecard`, `create_annotation`, `export_note`) exist in the registry but require explicit flags.

**Design addition:** new tools should also export optional `inputSchema` (JSON Schema) on the tool object so a future model tool-calling layer can advertise args without inventing a second registry.
Until the model bridge reads `inputSchema`, `run` still validates args in JS and throws / returns structured failure.

## 3. Design principles

1. **Adapter boundary:** tools depend on injected adapters (`ragAdapter`, `searchMemory`, `saveMemory`, `verifyCitation`, local document helpers). Default implementations may wrap `createUniRagHttpAdapter` / services; unit tests inject fakes.
2. **No silent long-term memory write:** `memory_save` only after user-confirmed content (artifact already saved locally, or explicit `userConfirmed: true` from the product UI gate). Matches `UNI_RAG_INTEGRATION_STRATEGY` §6 and App.jsx saved-memory path.
3. **Degrade, do not crash the agent loop:** UniRAG down -> structured failure with `degraded: true` and optional local fallback note; runtime treats tool result as data, not as an uncaught throw when possible.
4. **Citation honesty:** never claim `exact` grounding when only page/source is known. Reuse adapter `sourceRefs` fields (`evidenceType`, `sourceType`, nested `sourceRefs` for memory).
5. **Permissions first:** new flags default **false** except `list_tools` and (optionally) `knowledge_search` when knowledge is already ready; product enables them per task profile.

## 4. Permission flags (proposed)

Extend `permissions.js`:

```text
READING_TOOL_NAMES += [
  knowledge_search,
  memory_search,
  memory_save,
  verify_citation,
  list_tools,
]

DEFAULT_READING_PERMISSIONS += {
  canSearchKnowledge: false,   // UniRAG corpus query
  canSearchMemory: false,      // user memory read
  canWriteMemory: false,       // memory_save
  canVerifyCitation: false,    // grounding check
  canListTools: true,          // discovery always on for agent loop
}

TOOL_PERMISSION_FLAGS += {
  knowledge_search: canSearchKnowledge,
  memory_search: canSearchMemory,
  memory_save: canWriteMemory,
  verify_citation: canVerifyCitation,
  list_tools: canListTools,
}
```

Suggested task profiles (product, not code):

| Profile | knowledge_search | memory_search | memory_save | verify_citation | list_tools |
| --- | --- | --- | --- | --- | --- |
| Read-only Q&A | true if indexed | true | false | true | true |
| Card generation | true if indexed | false | false | true | true |
| Memory promote | false | false | true (UI confirm) | optional | true |
| Default agent | false | false | false | false | true |

## 5. Adapter surface needed by tools

Prefer **not** growing UniRAG HTTP surface in tool code. Minimal adapter contract for tools:

```ts
// Injected via createReadingTools(..., adapters)
type BusinessToolAdapters = {
  // existing reading adapters stay unchanged
  document?: object;
  documentId?: string;

  // UniRAG / knowledge
  ragAdapter?: {
    health(): Promise<RagEngineHealth>;
    query(input: QueryInput): Promise<QueryResult>; // already on UniRagHttpAdapter
    // optional later:
    // searchMemory?(input): Promise<MemorySearchResult>
  };

  // Knowledge readiness (documentKnowledgeService)
  isDocumentKnowledgeQueryReady?: (documentId: string) => boolean;
  loadDocumentKnowledgeLink?: (documentId: string) => DocumentKnowledgeLink | null;

  // Memory write path (savedMemoryService)
  buildSavedMemoryPayload?: typeof buildSavedMemoryPayload;
  startSavedMemoryIngest?: typeof startSavedMemoryIngest;
  canIngestSavedMemoryArtifact?: typeof canIngestSavedMemoryArtifact;

  // Local artifact lookup for memory_save
  getArtifactById?: (artifactId: string) => Promise<object | null>;
  getDocumentById?: (documentId: string) => Promise<object | null>;

  // Citation verify (local text match and/or UniRAG-style score)
  verifyCitation?: (input: VerifyCitationInput) => Promise<VerifyCitationResult>;

  // Optional provider runtime for query (same as chat)
  getProviderRuntimeConfig?: () => { provider?: string; apiKey?: string; sessionId?: string };
};
```

**Gap note:** UniRAG has `MemoryStore.search` internally but **no** dedicated `GET/POST /api/memory/search`. Phase-1 `memory_search` should:

- Prefer `ragAdapter.query({ question, includeMemory: true, topK: 0 or low, memoryTopK })` and filter `sourceRefs` where `evidenceType === 'memory'` / `sourceType === 'saved_memory'`; **or**
- Call a thin future adapter method once UniRAG exposes search-only API.

Do not invent a second HTTP client in tools.js.

**Gap note for verify:** UniRAG verifier runs inside answer citation extraction (`verified`, `similarity` on query citations). There is no public verify endpoint. Phase-1 `verify_citation` should implement **local** grounding (text containment / paragraph match against current document pages + optional nested memory `sourceRefs`), and optionally trust adapter-provided `verified`/`similarity` if the citation came from a prior query. Phase-2 may add `POST /api/cite/verify` if product needs embedding parity.

## 6. Tool specs

### 6.1 `knowledge_search`

**Purpose:** Ask UniRAG over the indexed knowledge (current document / library), return answer + normalized source refs. Distinct from `search_document` (local keyword on open document pages).

**Permission:** `canSearchKnowledge`  
**readOnly:** `true`  
**Adapters:** `ragAdapter.query`, `ragAdapter.health`, `isDocumentKnowledgeQueryReady`, `loadDocumentKnowledgeLink`, optional `getProviderRuntimeConfig`

#### Args schema

```json
{
  "$id": "knowledge_search.args",
  "type": "object",
  "additionalProperties": false,
  "required": ["query"],
  "properties": {
    "query": {
      "type": "string",
      "minLength": 1,
      "description": "Natural language question or search query."
    },
    "documentId": {
      "type": "string",
      "description": "Reader document id; defaults to baseContext document."
    },
    "scope": {
      "type": "string",
      "enum": ["current-document", "current-section", "knowledge-library"],
      "default": "current-document"
    },
    "topK": {
      "type": "integer",
      "minimum": 1,
      "maximum": 20,
      "default": 5
    },
    "includeMemory": {
      "type": "boolean",
      "default": false,
      "description": "If true, also pull saved_memory citations (requires canSearchMemory ideally; product may dual-gate)."
    },
    "memoryTopK": {
      "type": "integer",
      "minimum": 0,
      "maximum": 10,
      "default": 3
    },
    "sessionId": {
      "type": ["string", "null"]
    },
    "style": {
      "type": "string",
      "default": "academic"
    },
    "mode": {
      "type": "string",
      "enum": ["chat", "translate", "flashcards", "quiz", "graph"],
      "default": "chat"
    }
  }
}
```

#### Success shape

```json
{
  "ok": true,
  "tool": "knowledge_search",
  "query": "…",
  "documentId": "doc-…",
  "scope": "current-document",
  "answer": "…",
  "sessionId": "sess-…",
  "sourceRefs": [
    {
      "chunkId": "…",
      "documentId": "…",
      "documentName": "…",
      "page": 1,
      "paragraphId": "…",
      "text": "…",
      "evidenceType": "source",
      "sourceType": "document",
      "label": "P1"
    }
  ],
  "citations": [],
  "ragEngine": {
    "engine": "uni-rag",
    "adapter": "uni-rag",
    "available": true,
    "degraded": false,
    "baseUrl": "http://127.0.0.1:8766"
  },
  "knowledgeLink": {
    "status": "completed",
    "uniRagSourceId": "…",
    "uniRagFilename": "…"
  }
}
```

#### Failure shape

```json
{
  "ok": false,
  "tool": "knowledge_search",
  "errorCode": "unirag_unavailable | not_indexed | empty_query | query_failed | timeout",
  "message": "human-readable",
  "degraded": true,
  "ragEngine": { "available": false, "degraded": true, "error": "…" },
  "fallbackHint": "use search_document for local keyword match"
}
```

Prefer **return** failure objects for availability/index/query errors so the agent loop can continue; throw only on programmer misuse (missing adapter when required).

#### Fit into `createReadingTools`

```js
knowledge_search: {
  name: 'knowledge_search',
  description: 'Search indexed knowledge via UniRAG and return answer with source citations.',
  readOnly: true,
  inputSchema: knowledgeSearchArgsSchema,
  run: (args) => knowledgeSearch(withBaseContext(baseContext, args), adapters),
}
```

Implementation sketch (not code to ship yet):

1. Resolve `documentId` from args/baseContext.
2. If `scope === 'current-document'` and `!isDocumentKnowledgeQueryReady(documentId)` -> `not_indexed`.
3. `health()`; if unavailable -> `unirag_unavailable`.
4. `ragAdapter.query({ question, topK, includeMemory, memoryTopK, sessionId, provider, apiKey, style, mode })`.
5. Return frozen success with `sourceRefs` from adapter normalization.

Relationship: keep `search_document` for offline/local page keyword; `knowledge_search` is semantic / indexed path.

---

### 6.2 `memory_search`

**Purpose:** Retrieve user-confirmed saved memories (artifacts already ingested), not raw document chunks.

**Permission:** `canSearchMemory`  
**readOnly:** `true`  
**Adapters:** `ragAdapter.query` (phase-1 with `includeMemory: true`) or future `ragAdapter.searchMemory`; optional local artifact list fallback

#### Args schema

```json
{
  "$id": "memory_search.args",
  "type": "object",
  "additionalProperties": false,
  "required": ["query"],
  "properties": {
    "query": { "type": "string", "minLength": 1 },
    "topK": { "type": "integer", "minimum": 1, "maximum": 20, "default": 5 },
    "documentId": {
      "type": "string",
      "description": "Optional filter to memories linked to this Reader document."
    },
    "artifactTypes": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "explain_card",
          "lens_card",
          "evidence_card",
          "concept_card",
          "concept",
          "reading_note"
        ]
      }
    },
    "includeAnswer": {
      "type": "boolean",
      "default": false,
      "description": "If true, allow a short generative answer; default is retrieval-only framing."
    }
  }
}
```

#### Success shape

```json
{
  "ok": true,
  "tool": "memory_search",
  "query": "…",
  "matches": [
    {
      "memoryId": "…",
      "artifactId": "art-…",
      "artifactType": "explain_card",
      "title": "…",
      "text": "…",
      "documentId": "…",
      "documentName": "…",
      "evidenceType": "memory",
      "sourceType": "saved_memory",
      "sourceRefs": [],
      "contractVersion": "reader-unirag-memory-v1"
    }
  ],
  "answer": null,
  "ragEngine": { "engine": "uni-rag", "available": true, "degraded": false }
}
```

#### Failure shape

```json
{
  "ok": false,
  "tool": "memory_search",
  "errorCode": "unirag_unavailable | empty_query | query_failed | no_memory_backend",
  "message": "…",
  "degraded": true,
  "matches": []
}
```

#### Fit

Same registry pattern as `knowledge_search`. Phase-1 algorithm:

1. `query` with `includeMemory: true`, `memoryTopK: topK`, small document `top_k` if product wants memory-first.
2. Map `sourceRefs` where `evidenceType === 'memory'`.
3. Client-filter by `documentId` / `artifactTypes` if adapter cannot.

Contract fixture reference: `packages/shared-contracts/reader-unirag-memory/v1/query-response-with-saved-memory.json`.

---

### 6.3 `memory_save`

**Purpose:** Push a **user-confirmed** local artifact into UniRAG memory (`POST /api/memory/jobs` via `ingestMemory` / `startSavedMemoryIngest`). Agent must not invent free-form permanent memory without an artifact id and confirmation gate.

**Permission:** `canWriteMemory`  
**readOnly:** `false`  
**Adapters:** `getArtifactById`, `getDocumentById`, `canIngestSavedMemoryArtifact`, `buildSavedMemoryPayload`, `startSavedMemoryIngest` (or `ragAdapter.ingestMemory` + status poll)

#### Args schema

```json
{
  "$id": "memory_save.args",
  "type": "object",
  "additionalProperties": false,
  "required": ["artifactId", "userConfirmed"],
  "properties": {
    "artifactId": {
      "type": "string",
      "minLength": 1,
      "description": "Local Reader artifact id already persisted by the user."
    },
    "userConfirmed": {
      "type": "boolean",
      "const": true,
      "description": "Must be true. Product UI sets this after explicit user confirm; model cannot self-confirm."
    },
    "documentId": {
      "type": "string",
      "description": "Optional; defaults to artifact.documentId / baseContext."
    },
    "waitForCompletion": {
      "type": "boolean",
      "default": true,
      "description": "If true, poll job status like startSavedMemoryIngest; if false, return queued job only."
    }
  }
}
```

Hard rules in `run`:

- Reject if `userConfirmed !== true` -> `errorCode: "confirmation_required"`.
- Reject if artifact missing / type not ingestible -> `unsupported_artifact`.
- Prefer reusing `startSavedMemoryIngest` so task panel / persistent task type `saved_memory_ingest` stays consistent with App.jsx.

#### Success shape

```json
{
  "ok": true,
  "tool": "memory_save",
  "artifactId": "art-…",
  "documentId": "doc-…",
  "status": "completed",
  "jobId": "memory-job-…",
  "statusUrl": "/api/memory/jobs/…",
  "memoryId": "…",
  "contractVersion": "reader-unirag-memory-v1",
  "ragEngine": { "engine": "uni-rag", "available": true }
}
```

#### Failure shape

```json
{
  "ok": false,
  "tool": "memory_save",
  "errorCode": "confirmation_required | artifact_not_found | unsupported_artifact | unirag_unavailable | ingest_failed | timeout",
  "message": "…",
  "artifactId": "art-…",
  "degraded": true
}
```

#### Fit

```js
memory_save: {
  name: 'memory_save',
  description: 'Persist a user-confirmed local artifact into long-term knowledge memory via UniRAG.',
  readOnly: false,
  inputSchema: memorySaveArgsSchema,
  run: (args) => memorySave(withBaseContext(baseContext, args), adapters),
}
```

Do **not** accept raw `{ title, text }` as the primary path in v1; that would bypass verificationStatus / sourceRefs packaging in `buildSavedMemoryPayload`. If product later needs free-form notes, first create a `reading_note` artifact through existing write tools, then `memory_save`.

---

### 6.4 `verify_citation`

**Purpose:** Check whether a claim is grounded in a cited span / page / memory sourceRef. Closes the "agent invents citations" hole that `AGENT_RUNTIME_MAPPING` calls out.

**Permission:** `canVerifyCitation`  
**readOnly:** `true`  
**Adapters:** `verifyCitation` (injectable), current `document` pages/text, optional nested memory sourceRefs; phase-2 UniRAG embedding verify

#### Args schema

```json
{
  "$id": "verify_citation.args",
  "type": "object",
  "additionalProperties": false,
  "required": ["claim"],
  "properties": {
    "claim": {
      "type": "string",
      "minLength": 1,
      "description": "Statement to verify against evidence."
    },
    "sourceRef": {
      "type": "object",
      "description": "One SourceRef / citation object (document or memory).",
      "properties": {
        "documentId": { "type": "string" },
        "documentName": { "type": "string" },
        "page": { "type": ["integer", "null"] },
        "paragraphId": { "type": "string" },
        "chunkId": { "type": "string" },
        "text": { "type": "string" },
        "evidenceType": { "type": "string", "enum": ["source", "memory"] },
        "sourceType": { "type": "string" },
        "sourceRefs": { "type": "array", "items": { "type": "object" } },
        "verified": { "type": "boolean" },
        "similarity": { "type": "number" }
      }
    },
    "quote": {
      "type": "string",
      "description": "Optional explicit quote; defaults to sourceRef.text."
    },
    "strategy": {
      "type": "string",
      "enum": ["auto", "exact_text", "normalized_text", "page_window", "trust_prior"],
      "default": "auto"
    },
    "threshold": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.45,
      "description": "Semantic threshold when embedding verify exists; unused for pure substring phase-1."
    }
  }
}
```

#### Success shape

```json
{
  "ok": true,
  "tool": "verify_citation",
  "claim": "…",
  "grounded": true,
  "mappingStatus": "exact | page | source-only | unmapped | memory-nested",
  "score": 0.92,
  "matchedBy": "exact_text | normalized_text | page_window | prior_verified | none",
  "precision": "paragraph | page | document | memory",
  "evidence": {
    "quote": "…",
    "page": 1,
    "paragraphId": "…",
    "chunkId": "…",
    "documentId": "…"
  },
  "reason": "Claim substring matches sourceRef.text after whitespace normalize."
}
```

#### Failure shape

```json
{
  "ok": false,
  "tool": "verify_citation",
  "errorCode": "empty_claim | missing_source | document_unavailable | verify_failed",
  "message": "…",
  "grounded": false,
  "mappingStatus": "unmapped"
}
```

Note: "claim not grounded" is a **success** with `grounded: false`, not a tool failure. Failure is for missing inputs / no document text.

#### Phase-1 matching rules (honest)

| Situation | mappingStatus | grounded |
| --- | --- | --- |
| `claim` (normalized) contained in `quote`/`sourceRef.text` | `exact` | true |
| quote found on given page text | `page` | true if claim overlaps quote |
| only document id / filename known | `source-only` | false unless claim empty |
| memory citation with nested `sourceRefs` | `memory-nested` | true if any nested ref grounds claim |
| prior UniRAG `verified: true` + strategy `trust_prior` | prior | true with score = similarity |
| no match | `unmapped` | false |

Align labels with strategy doc §5 citation mapping (`exact | page | source-only | unmapped`).

#### Fit

```js
verify_citation: {
  name: 'verify_citation',
  description: 'Check whether a claim is grounded in a provided source or memory citation.',
  readOnly: true,
  inputSchema: verifyCitationArgsSchema,
  run: (args) => verifyCitation(withBaseContext(baseContext, args), adapters),
}
```

---

### 6.5 `list_tools`

**Purpose:** Tool discovery for the agent loop (and UI debug). Returns only tools allowed by **current** permissions.

**Permission:** `canListTools` (default true)  
**readOnly:** `true`  
**Adapters:** none (needs registry + permissions closure)

#### Args schema

```json
{
  "$id": "list_tools.args",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "detail": {
      "type": "string",
      "enum": ["names", "summary", "full"],
      "default": "summary"
    },
    "includeDenied": {
      "type": "boolean",
      "default": false,
      "description": "If true, list denied tools with reason (for debug); default only allowed."
    }
  }
}
```

#### Success shape (`detail: summary`)

```json
{
  "ok": true,
  "tool": "list_tools",
  "tools": [
    {
      "name": "search_document",
      "description": "…",
      "readOnly": true,
      "allowed": true
    },
    {
      "name": "knowledge_search",
      "description": "…",
      "readOnly": true,
      "allowed": true,
      "inputSchema": { "...": "optional when detail=full" }
    }
  ]
}
```

#### Failure shape

Rare; only if registry missing:

```json
{
  "ok": false,
  "tool": "list_tools",
  "errorCode": "registry_unavailable",
  "message": "…"
}
```

#### Fit

`list_tools` is special: `run` needs the **filtered** registry. Prefer:

```js
export function createReadingTools(baseContext = {}, adapters = {}) {
  const registry = {
    /* existing + new tools */
  };

  registry.list_tools = Object.freeze({
    name: 'list_tools',
    description: 'List tools available under the current permission policy.',
    readOnly: true,
    inputSchema: listToolsArgsSchema,
    run: (args = {}) => listTools(registry, args, adapters.permissions || DEFAULT_READING_PERMISSIONS),
  });

  return Object.freeze(registry);
}
```

Or pass `permissions` into `createReadingTools` as third arg / options bag:

```js
createReadingTools(baseContext, adapters, { permissions })
```

Runtime still applies `assertToolAllowed` before every call; `list_tools` only exposes metadata.

## 7. Module placement

| Option | When |
| --- | --- |
| **A. Extend `tools.js`** | Small patch, keep one registry (matches today). |
| **B. Sibling `businessTools.js` + re-export from `createReadingTools`** | Prefer if tools.js growth hurts readability; pure functions live in sibling, registry still one object. |

Recommendation: **B** for UniRAG-facing tools (`knowledge_search`, memory_*, `verify_citation`), keep local PDF tools in `tools.js`. `list_tools` stays in `tools.js` as registry-aware glue.

Tests:

- `businessTools.test.js` with fake `ragAdapter` / memory service.
- `permissions.test.js` for new flags.
- Contract fixtures under `packages/shared-contracts/reader-unirag-memory/v1/` for memory shapes.

## 8. Agent loop usage (intended)

```text
goal: "这篇论文贡献是否站得住"
  list_tools
  get_current_document
  knowledge_search { query, scope: current-document }
  verify_citation { claim, sourceRef }  × N
  optional memory_search
  final { content, sourceRefs }
```

```text
goal: "把这张卡片沉淀进知识库"
  (UI confirm) -> memory_save { artifactId, userConfirmed: true }
```

Permissions prevent silent `memory_save` in default read profile.

## 9. Success / failure convention (shared)

All new business tools should prefer:

```ts
type ToolResult<T> =
  | ({ ok: true; tool: string } & T)
  | { ok: false; tool: string; errorCode: string; message: string; degraded?: boolean };
```

Existing tools return domain objects without `ok` (e.g. `search_document` returns `{ documentId, query, matches }`).
**Compatibility rule:** do not rewrite old tools in this design pass. New tools use `ok` so degraded UniRAG paths are first-class. Runtime does not require `ok` today; model / task prompts should teach both shapes, or a thin `normalizeToolResult` can be added later.

## 10. Non-goals (this design)

- No direct Chroma / SQLite access from the agent.
- No merging UniRAG frontend into Reader.
- No free-form memory write without local artifact + user confirm.
- No new public UniRAG HTTP routes required for phase-1 (optional later: memory search-only, cite verify).
- No changing default allow-list to open write tools for all chat sessions.

## 11. Implementation checklist (when coding starts)

1. Add flags + names in `permissions.js` + tests.
2. Implement pure runners + `inputSchema` constants (sibling module OK).
3. Register in `createReadingTools`; wire adapters from App / taskRunner (same place that already constructs UniRAG adapter for chat).
4. For card / critique tasks: enable `canSearchKnowledge` + `canVerifyCitation` when `isDocumentKnowledgeQueryReady`.
5. Keep `memory_save` behind UI confirm that sets `userConfirmed: true` in tool args (never model-only).
6. Vitest: health down, not indexed, memory confirm rejected, verify unmapped vs exact, list_tools respects permissions.
7. Manual: UniRAG up -> open PDF -> index -> agent knowledge_search -> verify_citation -> save card -> memory_save.

## 12. File references

| Path | Role |
| --- | --- |
| `apps/reader/src/agent/tools.js` | `createReadingTools` registry |
| `apps/reader/src/agent/permissions.js` | allow-list + flags |
| `apps/reader/src/agent/runtime.js` | loop + `assertToolAllowed` |
| `apps/reader/src/services/ragEngineAdapter.js` | UniRAG HTTP + citation normalize |
| `apps/reader/src/services/documentKnowledgeService.js` | ingest link / query-ready |
| `apps/reader/src/services/savedMemoryService.js` | memory payload + ingest |
| `packages/shared-contracts/reader-unirag-memory/v1/` | memory contract fixtures |
| `services/uni-rag/src/uni_rag/api/routes.py` | `/api/query`, `/api/memory/jobs` |
| `services/uni-rag/src/uni_rag/cite/verifier.py` | embedding verify (pipeline-internal) |
| `docs/UNI_RAG_INTEGRATION_STRATEGY.md` | adapter strategy SSOT |
| `apps/reader/docs/AGENT_RUNTIME_MAPPING.md` | agent loop product map |
| `docs/AGENT_BUILD_PLAN.md` | master plan + P0/P1/P2 + live eval model |
| `docs/AGENT_ACCEPTANCE_CHECKLIST.md` | QA checklist (human/agent) |
| `docs/AGENT_BOOK_CAPABILITY_MATRIX.md` | book chapter × capability matrix |
