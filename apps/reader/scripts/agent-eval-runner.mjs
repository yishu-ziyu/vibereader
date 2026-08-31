#!/usr/bin/env node
/**
 * Live acceptance for the reading agent against Grok 4.5 via local proxy.
 *
 * Run via vite-node so product ESM resolves extensionless imports:
 *   vite-node scripts/agent-eval-runner.mjs
 *   npm run agent:eval:grok
 *
 * Proxy default: http://127.0.0.1:8317/v1
 * Key source: ~/.cli-proxy-api/client.env (KEY=VAL) or process env
 *
 * Env:
 *   AGENT_EVAL_PASS_K  - attempts per case; case passes if any attempt scores pass (default 1)
 *   AGENT_EVAL_CASE    - optional comma-separated case ids to run (default: all)
 *   GROK_EVAL_MODEL / GROK_PROXY_BASE / VIBEREADER_AGENT_* - model + proxy overrides
 *
 * Exit codes:
 *   0 - eval passed (all cases pass under Pass@k)
 *   1 - eval failed (model ran, checks failed) or unhandled error
 *   2 - proxy/key unavailable or setup error (optional skip for CI)
 *
 * Uses the real product agent runtime (src/agent/*), not an inline loop.
 * Offline harness stays in scripts/agent-eval-offline.mjs.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Product modules: extensionless imports resolved by vite-node / Vite SSR.
import { runReadingAgent } from '../src/agent/runtime';
import { createReadingTools } from '../src/agent/tools';
import {
    DEFAULT_READING_PERMISSIONS,
    filterAllowedTools,
} from '../src/agent/permissions';
import {
    createOpenAICompatibleAgentModel,
    DEFAULT_SYSTEM_PROMPT,
} from '../src/agent/llmModel';
import { createExperienceStore } from '../src/agent/experienceStore';
import {
    buildSystemPromptForSkill,
    getReadingAgentSkill,
} from '../src/agent/skills';
import { buildReadingAgentPermissions } from '../src/agent/readingAgentOptions';
import { scoreAgentResult } from '../src/agent/eval/readingEval';

const DEFAULT_PROXY = 'http://127.0.0.1:8317/v1';
const DEFAULT_MODEL = 'grok-4.5';
const DEFAULT_PASS_K = 1;

const ENV_CANDIDATES = [
    process.env.CLI_PROXY_ENV,
    resolve(homedir(), '.cli-proxy-api/client.env'),
    resolve(homedir(), '.cli-proxy-api/.env'),
].filter(Boolean);

/** Shared two-page sample used by attention live cases. */
const SAMPLE_DOCUMENT = {
    id: 'eval-live-sample',
    name: 'attention-snippet.md',
    kind: 'markdown',
    pages: [
        {
            page: 1,
            text: 'Self-attention lets each token attend to every other token in the sequence.',
        },
        {
            page: 2,
            text: 'Multi-head attention projects queries, keys, and values into several subspaces.',
        },
    ],
};

/** Mini paper sample for paper_overview_agent (abstract / method / results / conclusion). */
const PAPER_OVERVIEW_DOCUMENT = {
    id: 'eval-live-paper-overview',
    name: 'did-staggered-adoption.md',
    kind: 'markdown',
    pages: [
        {
            page: 1,
            text: 'Abstract: We study local treatment effects under staggered adoption using difference-in-differences.',
        },
        {
            page: 2,
            text: 'Method: We use a two-way fixed effects estimator with event-study leads and lags.',
        },
        {
            page: 3,
            text: 'Results: The average treatment effect on the treated is positive and significant at conventional levels.',
        },
        {
            page: 4,
            text: 'Conclusion: Staggered difference-in-differences recovers treatment effects when parallel trends hold.',
        },
    ],
};

/**
 * Document with 3+ distinct claim chunks (blank-line paragraphs) for card_generation_agent.
 * localDocumentChunks splits on double newlines, so each claim is one source span.
 */
const CARD_GENERATION_DOCUMENT = {
    id: 'eval-live-card-generation',
    name: 'transformer-claims.md',
    kind: 'markdown',
    contentText: [
        'Claim A: Self-attention lets each token attend to every other token in the sequence without recurrence.',
        'Claim B: Multi-head attention projects queries, keys, and values into several subspaces and concatenates the heads.',
        'Claim C: Positional encodings inject order information so the model can distinguish token positions.',
        'Claim D: Residual connections and layer normalization stabilize deep transformer training.',
    ].join('\n\n'),
};

/**
 * RAG primer sample for knowledge_qa_agent (knowledge_search local-keyword fallback).
 * localDocumentChunks / localSearchMatches score keyword overlap on these paragraphs.
 */
const KNOWLEDGE_QA_DOCUMENT = {
    id: 'eval-live-knowledge-qa',
    name: 'rag-primer.md',
    kind: 'markdown',
    contentText: [
        'Retrieval-augmented generation (RAG) combines a retriever with a generator.',
        'The retriever fetches relevant passages from a local corpus before the model answers.',
        'Grounding answers in retrieved passages reduces unsupported hallucinations.',
    ].join('\n\n'),
};

/**
 * Document with an explicit claim span + matching evidence for critic_agent / verify_citation.
 * Claim in the goal is nearly copied from page 1 so token-overlap grounding can succeed.
 */
const CRITIC_DOCUMENT = {
    id: 'eval-live-critic',
    name: 'gat-claims.md',
    kind: 'markdown',
    pages: [
        {
            page: 1,
            text: 'Graph attention networks assign attention weights over neighboring nodes during message passing.',
        },
        {
            page: 2,
            text: 'Multi-head attention stabilizes learning by averaging several attention subspaces.',
        },
    ],
};

/**
 * Sample reading notes for memory_curator_agent.
 * Node live eval has no UniRAG searchMemory adapter, so memory_search returns status=unavailable.
 * Document context still gives the model something local to talk about when proposing saves.
 */
const MEMORY_CURATOR_DOCUMENT = {
    id: 'eval-live-memory-curator',
    name: 'memory-curation-notes.md',
    kind: 'markdown',
    contentText: [
        'Saved insight candidate: Self-attention lets each token attend to every other token without recurrence.',
        'Method note candidate: Difference-in-differences with staggered adoption recovers treatment effects under parallel trends.',
        'Definition candidate: Retrieval-augmented generation combines a retriever with a generator and grounds answers in passages.',
    ].join('\n\n'),
};

/**
 * Live product cases.
 * type=paper_overview_agent / attention_agent / card_generation_agent / knowledge_qa_agent / critic_agent / memory_curator_agent / note_export_agent use skill system prompt + required tools.
 */

/**
 * Note-export sample: metadata + claim body for note_export_agent.
 * list_attention_insights can return empty or seeded insights; export_note is mock-only.
 */
const NOTE_EXPORT_DOCUMENT = {
    id: 'eval-live-note-export',
    name: 'reading-note-sample.md',
    kind: 'markdown',
    pages: [
        {
            page: 1,
            text: 'Claim: Self-attention lets each token attend to every other token without recurrence.',
        },
        {
            page: 2,
            text: 'Insight: Multi-head attention stabilizes learning by averaging several subspaces.',
        },
    ],
    contentText: [
        'Claim: Self-attention lets each token attend to every other token without recurrence.',
        'Insight: Multi-head attention stabilizes learning by averaging several subspaces.',
        'Summary: Transformers replace recurrence with attention for sequence modeling.',
    ].join('\n\n'),
};

const LIVE_CASES = [
    {
        id: 'live-self-attention',
        description: 'Explain self-attention with grounded tool use.',
        document: SAMPLE_DOCUMENT,
        goal: [
            'Using document tools only, explain what self-attention does.',
            'You must call search_document or get_document_chunks before finishing.',
            'Final answer must mention self-attention or token grounded in the source.',
        ].join(' '),
        systemHint: [
            'Live eval: call search_document or get_document_chunks before final.',
            'Final content must mention self-attention or token from the source.',
        ].join('\n'),
        expectations: {
            status: 'completed',
            mustCallAnyTools: ['search_document', 'get_document_chunks'],
            contentMustIncludeAny: ['self-attention', 'Self-attention', 'token', 'Token'],
        },
    },
    {
        id: 'live-multi-head',
        description: 'Explain multi-head attention with grounded tool use.',
        document: SAMPLE_DOCUMENT,
        goal: [
            'Using document tools only, explain multi-head attention.',
            'You must call search_document or get_document_chunks before finishing.',
            'Final answer must mention multi-head (or multi head) and queries/keys/values or subspaces, grounded in the source.',
        ].join(' '),
        systemHint: [
            'Live eval: call search_document or get_document_chunks before final.',
            'Final content must mention multi-head attention and queries, keys, values, or subspaces from the source.',
        ].join('\n'),
        expectations: {
            status: 'completed',
            mustCallAnyTools: ['search_document', 'get_document_chunks'],
            contentMustIncludeAny: [
                'multi-head',
                'Multi-head',
                'multi head',
                'Multi head',
                'multihead',
                'Multihead',
            ],
        },
    },
    {
        id: 'live-paper-overview',
        type: 'paper_overview_agent',
        description: 'Paper overview skill: grounded reading_note via get_current_document / get_document_chunks.',
        document: PAPER_OVERVIEW_DOCUMENT,
        // goal defaults to skill.goal when type is set
        systemHint: [
            'Live eval for paper_overview_agent.',
            'You must call get_current_document or get_document_chunks before drafting.',
            'Final overview must be non-empty and grounded in tool results',
            '(mention treatment, difference-in-differences, staggered, or fixed effects from the source).',
            'Cite page or chunk ids when available; if chunks are weak, say so.',
        ].join(' '),
        expectations: {
            status: 'completed',
            contentNonEmpty: true,
            mustCallAnyTools: ['get_current_document', 'get_document_chunks'],
            contentMustIncludeAny: [
                'treatment',
                'Treatment',
                'difference-in-differences',
                'Difference-in-differences',
                'staggered',
                'Staggered',
                'fixed effects',
                'Fixed effects',
                'event-study',
                'event study',
            ],
        },
    },
    {
        id: 'live-attention-route',
        type: 'attention_agent',
        description: 'Attention route skill: short ranked reading route via list_attention_insights / get_document_chunks.',
        document: SAMPLE_DOCUMENT,
        // goal defaults to skill.goal when type is set
        systemHint: [
            'Live eval for attention_agent.',
            'You must call list_attention_insights or get_document_chunks before finishing',
            '(prefer get_current_document → list_attention_insights → get_document_chunks).',
            'Final content must be a short ordered reading route (ranked stops), not a long essay.',
            'Ground each stop in tool results (page/chunk/insight); mention self-attention or multi-head when present.',
            'Prefer 2-5 high-confidence stops with type/description and source location when available.',
        ].join(' '),
        expectations: {
            status: 'completed',
            contentNonEmpty: true,
            mustCallAnyTools: ['list_attention_insights', 'get_document_chunks'],
            contentMustIncludeAny: [
                'route',
                'Route',
                'attention',
                'Attention',
                'self-attention',
                'Self-attention',
                'multi-head',
                'Multi-head',
                'rank',
                'Rank',
                'priority',
                'Priority',
                '1.',
                '1)',
            ],
        },
    },
    {
        id: 'live-multi-tool',
        description: 'Multi-tool: prefer same-turn parallel tool_calls; sequential multi-tool is soft-ok pass.',
        document: SAMPLE_DOCUMENT,
        maxIterations: 8,
        goal: [
            'You must use multiple tools before answering.',
            'In your first response call BOTH get_current_document AND search_document together',
            '(same-turn multi tool_calls / parallel) with query "self-attention".',
            'Do not wait for one tool result before calling the other when the API supports multiple tool_calls.',
            'If you cannot emit parallel tool_calls, call get_current_document then search_document sequentially',
            '(still at least two tool calls total).',
            'After tools, explain self-attention grounded in the source (mention self-attention or token).',
        ].join(' '),
        systemHint: [
            'Live eval multi-tool (parallel preferred).',
            'In your first response call BOTH get_current_document AND search_document together.',
            'Emit them as multiple tool_calls in a single assistant message when possible.',
            'Sequential multi-tool (two turns) still satisfies the hard bar; same-turn is preferred.',
            'Final content must mention self-attention or token from the source.',
        ].join('\n'),
        expectations: {
            status: 'completed',
            // Hard: total tool invocations >= 2 (sequential multi-tool still passes).
            minToolCalls: 2,
            // Soft: prefer two distinct tools (not the same tool twice).
            minDistinctTools: 2,
            softMinDistinctTools: true,
            // Soft: prefer >=2 tools in first tool-using iteration (same-turn parallel).
            minToolCallsInFirstToolIteration: 2,
            softMinToolCallsInFirstToolIteration: true,
            mustCallAnyTools: [
                'list_tools',
                'search_document',
                'get_current_document',
                'get_document_chunks',
            ],
            contentMustIncludeAny: ['self-attention', 'Self-attention', 'token', 'Token'],
        },
    },
    {
        id: 'live-card-generation',
        type: 'card_generation_agent',
        description: 'Card generation skill: create source-grounded vibe cards via create_vibecard (write permissions + mock adapter).',
        document: CARD_GENERATION_DOCUMENT,
        goal: [
            'Using document tools, create at least 2 source-grounded VibeCards with create_vibecard.',
            'First call get_current_document and get_document_chunks.',
            'Then call create_vibecard at least twice with distinct claims from different chunks',
            '(title, type, sourceText, page/paragraphId when available).',
            'Do not invent quotes; finish with a short non-empty summary of cards created.',
        ].join(' '),
        systemHint: [
            'Live eval for card_generation_agent.',
            'Write permission canWriteVibeCards is enabled for this case only.',
            'You MUST call create_vibecard at least once (prefer 2+ distinct source chunks).',
            'If you refuse to write or only draft cards in text without the tool, the eval fails.',
            'Each create_vibecard card should include title and sourceText grounded in tool results.',
        ].join('\n'),
        expectations: {
            status: 'completed',
            // Tool create_vibecard called >= 1
            mustCallTools: ['create_vibecard'],
            // Final content non-empty OR cards recorded by mock adapter
            contentNonEmptyOrCardsRecorded: true,
        },
    },
    {
        id: 'live-knowledge-qa',
        type: 'knowledge_qa_agent',
        description: 'Knowledge QA skill: answer via knowledge_search (local-keyword fallback ok) with grounded content.',
        document: KNOWLEDGE_QA_DOCUMENT,
        goal: [
            'Answer: What does retrieval-augmented generation combine, and why ground answers in passages?',
            'You must call knowledge_search (preferred) or search_document before finishing.',
            'Local-keyword fallback for knowledge_search is fine when UniRAG is unavailable.',
            'Final answer must be grounded in tool results (mention retriever, generator, RAG, retrieval, or passages).',
            'Attach source refs when tool results include them; do not invent citations.',
        ].join(' '),
        systemHint: [
            'Live eval for knowledge_qa_agent.',
            'Prefer knowledge_search; fall back to search_document if needed.',
            'knowledge_search may use local-keyword engine when UniRAG adapter is absent - that is OK.',
            'Final content must mention RAG/retrieval/retriever/generator/passages from the source.',
            'Do not answer from parametric knowledge alone without tool grounding.',
        ].join('\n'),
        expectations: {
            status: 'completed',
            mustCallAnyTools: ['knowledge_search', 'search_document'],
            contentMustIncludeAny: [
                'retrieval',
                'Retrieval',
                'retriever',
                'Retriever',
                'RAG',
                'generator',
                'Generator',
                'passages',
                'Passages',
            ],
            contentNonEmpty: true,
        },
    },
    {
        id: 'live-critic',
        type: 'critic_agent',
        description: 'Critic skill: verify a grounded claim via document tools + verify_citation.',
        document: CRITIC_DOCUMENT,
        goal: [
            'Claim: Graph attention networks assign attention weights over neighboring nodes.',
            'Verify this claim against the current document using tools.',
            'You must call verify_citation with the claim and evidenceText (or sourceRef.text) from the document.',
            'Preferred: first call get_document_chunks or search_document to load evidence, then verify_citation.',
            'Finish with a claim_critique: verdict (supported / partially supported / unsupported / not found),',
            'score or grounded flag from the tool, and residual risks. Do not invent citations.',
        ].join(' '),
        systemHint: [
            'Live eval for critic_agent.',
            'You MUST call verify_citation at least once (pass claim + evidenceText or sourceRef from tool results).',
            'Preferred path: get_document_chunks or search_document, then verify_citation with evidence from those results.',
            'Final content must report a clear verdict (e.g. supported / grounded) from tool output, not parametric guesswork.',
        ].join('\n'),
        expectations: {
            status: 'completed',
            // Soft core: at least verify_citation (hard fail if never called)
            mustCallTools: ['verify_citation'],
            // Prefer retrieval before verify; accept either chunks or search
            mustCallAnyTools: ['get_document_chunks', 'search_document'],
            contentNonEmpty: true,
            contentMustIncludeAny: [
                'supported',
                'Supported',
                'partially supported',
                'partially_supported',
                'Partially',
                'grounded',
                'Grounded',
                'Verdict',
                'verdict',
            ],
        },
    },
    {
        id: 'live-memory-curator',
        type: 'memory_curator_agent',
        description: 'Memory curator skill: memory_search (unavailable ok) + propose-to-save; never auto memory_save.',
        document: MEMORY_CURATOR_DOCUMENT,
        goal: [
            'Curate memory for this reading session.',
            'You must call memory_search for relevant saved memories about self-attention, DID methods, or RAG.',
            'memory_search may return status unavailable or empty when UniRAG is not wired - that is OK; report empty/degraded honestly.',
            'Propose save candidates (what to save and why) from local document context if useful.',
            'Do NOT call memory_save and do not claim anything was saved.',
            'Finish with a short memory_curation: hits (or empty/unavailable), proposals[], and notes that saves need user confirm.',
        ].join(' '),
        systemHint: [
            'Live eval for memory_curator_agent.',
            'You MUST call memory_search at least once (status unavailable/empty is accepted).',
            'Propose save candidates only; never auto memory_save without userConfirmed.',
            'Final content must mention propose/proposal/save candidates, or empty/unavailable memory handling, and confirm-before-write.',
            'Do not invent memory ids; do not claim saved.',
        ].join('\n'),
        expectations: {
            status: 'completed',
            // Hard: memory_search must run (result may be unavailable without UniRAG adapter)
            mustCallTools: ['memory_search'],
            // Soft: propose-to-save language OR empty/degraded memory handling
            contentMustIncludeAny: [
                'propose',
                'Propose',
                'proposal',
                'Proposal',
                'unavailable',
                'Unavailable',
                'empty',
                'Empty',
                'no saved',
                'No saved',
                'no memory',
                'No memory',
                'no memories',
                'No memories',
                'confirm',
                'Confirm',
                'candidate',
                'Candidate',
                'degraded',
                'Degraded',
            ],
            contentNonEmpty: true,
            // Explicitly do NOT require memory_save (permissions keep it off)
        },
    },
    {
        id: 'live-note-export',

        type: 'note_export_agent',
        description: 'Note export skill: get_current_document then export_note (write permissions + mock adapter) or markdown assembly.',
        document: NOTE_EXPORT_DOCUMENT,
        goal: [
            'Export a source-grounded reading note for the current document.',
            'You must call get_current_document first to load metadata.',
            'Preferred: also call list_attention_insights, then export_note once',
            '(template default, format markdown) via the write tool.',
            'If you cannot call export_note, assemble a non-empty markdown reading note',
            'from tool results (document name/metadata + insights or body summary).',
            'Do not invent citations; finish with path/payload summary or the markdown note.',
        ].join(' '),
        systemHint: [
            'Live eval for note_export_agent.',
            'Write permission canExportNotes is enabled for this case only.',
            'You MUST call get_current_document.',
            'Preferred path: get_current_document → list_attention_insights → export_note (once).',
            'Fallback: if export_note is skipped, produce a non-empty markdown assembly',
            'with document metadata and any insights/body from tools.',
            'If you neither call export_note nor produce markdown content, the eval fails.',
        ].join('\n'),
        expectations: {
            status: 'completed',
            // Required grounding step
            mustCallTools: ['get_current_document'],
            // Final content non-empty OR notes recorded by mock exportNote adapter
            contentNonEmptyOrNotesExported: true,
        },
    },
];

// ---------- env ----------

function parseEnvFile(filePath) {
    if (!existsSync(filePath)) return {};
    const text = readFileSync(filePath, 'utf8');
    const out = {};
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const cleaned = line.startsWith('export ') ? line.slice(7).trim() : line;
        const eq = cleaned.indexOf('=');
        if (eq < 1) continue;
        const key = cleaned.slice(0, eq).trim();
        let value = cleaned.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

function loadClientEnv() {
    for (const candidate of ENV_CANDIDATES) {
        const parsed = parseEnvFile(candidate);
        if (Object.keys(parsed).length > 0) {
            return { path: candidate, env: parsed };
        }
    }
    return { path: null, env: {} };
}

function applyEnvToProcess(fileEnv = {}) {
    for (const [key, value] of Object.entries(fileEnv)) {
        if (!process.env[key] && value) process.env[key] = value;
    }
}

function firstNonEmpty(...values) {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return '';
}

function resolvePassK() {
    const raw = firstNonEmpty(process.env.AGENT_EVAL_PASS_K, String(DEFAULT_PASS_K));
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_PASS_K;
    // Soft cap to avoid accidental bill spikes.
    return Math.min(n, 10);
}

function resolveCaseFilter() {
    const raw = firstNonEmpty(process.env.AGENT_EVAL_CASE);
    if (!raw) return null;
    const ids = raw.split(',').map((part) => part.trim()).filter(Boolean);
    return ids.length > 0 ? new Set(ids) : null;
}

function resolveConfig() {
    const baseUrl = firstNonEmpty(
        process.env.GROK_PROXY_BASE,
        process.env.VIBEREADER_AGENT_BASE_URL,
        process.env.OPENAI_BASE_URL,
        DEFAULT_PROXY,
    );
    const apiKey = firstNonEmpty(
        process.env.VIBEREADER_AGENT_API_KEY,
        process.env.OPENAI_API_KEY,
        process.env.GROK_API_KEY,
        process.env.XAI_API_KEY,
        process.env.API_KEY,
        process.env.CLI_PROXY_API_KEY,
    );
    const model = firstNonEmpty(
        process.env.GROK_EVAL_MODEL,
        process.env.VIBEREADER_AGENT_MODEL,
        process.env.OPENAI_MODEL,
        DEFAULT_MODEL,
    );
    return { baseUrl, apiKey, model };
}

function maskKey(value = '') {
    if (!value) return '(empty)';
    if (value.length <= 8) return '****';
    return `${value.slice(0, 3)}…${value.slice(-3)} (len=${value.length})`;
}

async function probeProxy(baseUrl) {
    const modelsUrl = `${String(baseUrl).replace(/\/$/, '')}/models`;
    try {
        const response = await fetch(modelsUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(4000),
        });
        return {
            ok: response.ok || response.status === 401 || response.status === 403,
            status: response.status,
            modelsUrl,
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            modelsUrl,
            error: error?.message || String(error),
        };
    }
}

// ---------- product agent ----------

/** apps/reader root (scripts/ is one level down). */
const READER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Node-only progressive disclosure: try skillPath md under apps/reader.
 * Missing file → empty string (caller keeps embed-only prompt). Never used in browser.
 */
function tryLoadSkillDocument(skill) {
    const skillPath = typeof skill?.skillPath === 'string' ? skill.skillPath.trim() : '';
    if (!skillPath) return '';

    const candidates = [
        resolve(READER_ROOT, skillPath),
        resolve(process.cwd(), skillPath),
    ];
    for (const absolute of candidates) {
        if (!existsSync(absolute)) continue;
        try {
            const text = readFileSync(absolute, 'utf8');
            return typeof text === 'string' ? text.trim() : '';
        } catch {
            // try next candidate
        }
    }
    return '';
}

/**
 * Build system prompt for a live case.
 * Skill-typed cases (e.g. paper_overview_agent) use skills.js + DEFAULT_SYSTEM_PROMPT.
 * When skillPath md exists on disk (Node), append as skillDocument progressive disclosure.
 */
function buildCaseSystemPrompt(caseDef) {
    const skillType = caseDef.type || caseDef.skillType || null;
    const skill = skillType ? getReadingAgentSkill(skillType) : null;

    if (skill) {
        // paper_overview (and other skills with on-disk md): progressive skill document.
        // Prefer explicit caseDef.skillDocument (tests/injection), else read skillPath if present.
        const skillDocument = typeof caseDef.skillDocument === 'string'
            && caseDef.skillDocument.trim()
            ? caseDef.skillDocument.trim()
            : tryLoadSkillDocument(skill);
        const promptOptions = skillDocument ? { skillDocument } : {};
        const fromSkill = buildSystemPromptForSkill(skillType, promptOptions)
            || (typeof skill.systemPrompt === 'string' ? skill.systemPrompt.trim() : '')
            || '';
        const base = fromSkill.startsWith(DEFAULT_SYSTEM_PROMPT)
            ? fromSkill
            : [DEFAULT_SYSTEM_PROMPT, '', fromSkill].filter(Boolean).join('\n');
        if (caseDef.systemHint) {
            return [base, '', String(caseDef.systemHint)].join('\n');
        }
        return base;
    }

    const systemHint = caseDef.systemHint
        || 'Live eval: call search_document or get_document_chunks before final.';
    return [DEFAULT_SYSTEM_PROMPT, '', systemHint].join('\n');
}

function resolveCaseGoal(caseDef) {
    if (caseDef.goal) return caseDef.goal;
    const skillType = caseDef.type || caseDef.skillType || null;
    const skill = skillType ? getReadingAgentSkill(skillType) : null;
    return skill?.goal || '';
}

function resolveCaseMaxIterations(caseDef) {
    if (caseDef.maxIterations != null) return Number(caseDef.maxIterations);
    const skillType = caseDef.type || caseDef.skillType || null;
    const skill = skillType ? getReadingAgentSkill(skillType) : null;
    if (skill?.maxIterations) {
        // Match modelFactory LLM budget: card_generation needs more steps (read + N writes).
        const floor = skillType === 'card_generation_agent'
            || skillType === 'note_export_agent'
            ? 10
            : 8;
        return Math.max(Number(skill.maxIterations) || 4, floor);
    }
    return 6;
}

/**
 * Permissions for a live case.
 * Write flags (e.g. canWriteVibeCards) only when skill/type requires them.
 */
function resolveCasePermissions(caseDef) {
    if (caseDef.permissions && typeof caseDef.permissions === 'object') {
        return caseDef.permissions;
    }
    const skillType = caseDef.type || caseDef.skillType || null;
    if (
        skillType === 'card_generation_agent'
        || skillType === 'knowledge_qa_agent'
        || skillType === 'critic_agent'
        || skillType === 'memory_curator_agent'
        || skillType === 'note_export_agent'
    ) {
        return buildReadingAgentPermissions(skillType);
    }
    return DEFAULT_READING_PERMISSIONS;
}

/**
 * Mock createVibeCard adapter that records cards in-memory (no disk/UI).
 * @returns {{ createVibeCard: Function, getCards: () => Array }}
 */
function createMockCreateVibeCardAdapter() {
    const cards = [];
    return {
        createVibeCard: async (cardInput = {}) => {
            const saved = {
                id: `eval-card-${cards.length + 1}`,
                ...cardInput,
            };
            cards.push(saved);
            return saved;
        },
        getCards: () => cards.slice(),
    };
}

/**
 * Mock exportNote adapter that records exports in-memory (no disk/UI).
 * @returns {{ exportNote: Function, getExports: () => Array }}
 */
function createMockExportNoteAdapter() {
    const exports = [];
    return {
        exportNote: async ({ documentId, template, format } = {}) => {
            const saved = {
                documentId: documentId || null,
                template: template || 'default',
                format: format || 'markdown',
                filename: `reading-note-${documentId || 'unknown'}.md`,
                path: `reading-note-${documentId || 'unknown'}.md`,
                status: 'exported',
                hasMarkdown: true,
                hasJson: false,
            };
            exports.push(saved);
            return saved;
        },
        getExports: () => exports.slice(),
    };
}

/**
 * Seeded listAttentionInsightsForDocument for note_export / attention_agent live cases.
 * Returns in-memory insights so route ranking or export/assembly has source-ish material.
 */
function createMockListAttentionInsightsAdapter(document) {
    const documentId = document?.id || null;
    const insights = [
        {
            id: 'eval-insight-1',
            documentId,
            type: 'Claim',
            description: 'Self-attention lets each token attend to every other token without recurrence.',
            location: { page: 1, paragraphId: 'page-1-para-0' },
        },
        {
            id: 'eval-insight-2',
            documentId,
            type: 'Insight',
            description: 'Multi-head attention stabilizes learning by averaging several subspaces.',
            location: { page: 2, paragraphId: 'page-2-para-0' },
        },
    ];
    return {
        listAttentionInsightsForDocument: async () => insights.slice(),
        getInsights: () => insights.slice(),
    };
}

/**
 * Tool adapters for a live case.
 * card_generation → mock createVibeCard; note_export → mock exportNote (+ seeded insights);
 * attention_agent → seeded listAttentionInsights.
 */
function resolveCaseToolAdapters(caseDef) {
    const skillType = caseDef.type || caseDef.skillType || null;
    if (skillType === 'card_generation_agent' || caseDef.useCreateVibeCardAdapter) {
        const mock = createMockCreateVibeCardAdapter();
        return {
            createVibeCard: mock.createVibeCard,
            _getRecordedCards: mock.getCards,
        };
    }
    if (skillType === 'note_export_agent' || caseDef.useExportNoteAdapter) {
        const mockExport = createMockExportNoteAdapter();
        const mockInsights = createMockListAttentionInsightsAdapter(caseDef.document);
        return {
            exportNote: mockExport.exportNote,
            listAttentionInsightsForDocument: mockInsights.listAttentionInsightsForDocument,
            _getRecordedExports: mockExport.getExports,
        };
    }
    // attention_agent: seed list_attention_insights so route ranking can reuse existing insights
    if (skillType === 'attention_agent' || caseDef.useListAttentionInsightsAdapter) {
        const mockInsights = createMockListAttentionInsightsAdapter(caseDef.document);
        return {
            listAttentionInsightsForDocument: mockInsights.listAttentionInsightsForDocument,
        };
    }
    return {};
}


/**
 * Pre-seed Ch8 experience lessons for live eval (offline-safe, no disk).
 * Demonstrates failed max_iterations / tool_not_found → buildLessonsPrompt injection.
 * Set AGENT_EVAL_LESSONS=0 to disable.
 */
let cachedEvalLessonsPrompt = null;
function buildEvalLessonsPrompt() {
    if (cachedEvalLessonsPrompt !== null) return cachedEvalLessonsPrompt;

    const disabled = String(process.env.AGENT_EVAL_LESSONS || '').trim() === '0';
    if (disabled) {
        cachedEvalLessonsPrompt = '';
        return cachedEvalLessonsPrompt;
    }

    const store = createExperienceStore({ now: () => Date.now() });
    store.recordRun({
        goal: 'eval seed: open-ended tool loop',
        skillType: 'paper_overview_agent',
        status: 'max_iterations',
        contentSummary: 'hit iteration cap without final answer',
    });
    store.recordRun({
        goal: 'eval seed: invent unregistered tool',
        skillType: 'knowledge_qa_agent',
        status: 'tool_not_found',
        contentSummary: 'Tool "search_web" is not registered',
        error: 'tool_not_found',
    });
    cachedEvalLessonsPrompt = store.buildLessonsPrompt({ limit: 5 });
    return cachedEvalLessonsPrompt;
}

async function runProductAgent(config, caseDef) {
    const document = caseDef.document || SAMPLE_DOCUMENT;
    const permissions = resolveCasePermissions(caseDef);
    const adapters = resolveCaseToolAdapters(caseDef);
    const fullTools = createReadingTools({ document }, adapters);
    // Filter so OpenAI tools[] never lists writes the case cannot run.
    const tools = filterAllowedTools(fullTools, permissions);
    const systemPrompt = buildCaseSystemPrompt(caseDef);
    // Ch8: inject rule-based lessons from pre-seeded failed runs (disable: AGENT_EVAL_LESSONS=0).
    const lessonsPrompt = buildEvalLessonsPrompt();
    const model = createOpenAICompatibleAgentModel({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        temperature: 0,
        tools,
        systemPrompt,
        ...(lessonsPrompt ? { lessonsPrompt } : {}),
    });

    const agentResult = await runReadingAgent({
        goal: resolveCaseGoal(caseDef),
        model,
        tools,
        permissions,
        context: { document },
        maxIterations: resolveCaseMaxIterations(caseDef),
        timeoutMs: 120000,
    });

    const cardsRecorded = typeof adapters._getRecordedCards === 'function'
        ? adapters._getRecordedCards()
        : [];
    const notesExported = typeof adapters._getRecordedExports === 'function'
        ? adapters._getRecordedExports()
        : [];

    // Attach recorded cards/exports for scorer
    // (contentNonEmptyOrCardsRecorded / contentNonEmptyOrNotesExported / minCardsRecorded).
    return Object.freeze({
        ...agentResult,
        cardsRecorded: Object.freeze(cardsRecorded.map((card) => Object.freeze({ ...card }))),
        notesExported: Object.freeze(notesExported.map((item) => Object.freeze({ ...item }))),
    });
}

function toolNamesFromResult(agentResult) {
    return (agentResult?.trace || [])
        .filter((entry) => entry.type === 'tool')
        .map((entry) => entry.toolName);
}

function contentPreview(agentResult, max = 200) {
    if (!agentResult?.content) return '';
    return String(agentResult.content).replace(/\s+/g, ' ').slice(0, max);
}

/**
 * Run one case up to passK times. Case-level pass if any attempt scores pass (Pass@k).
 */
async function runCaseWithPassK(config, caseDef, passK) {
    const attempts = [];
    let firstPassIndex = -1;

    for (let attempt = 1; attempt <= passK; attempt += 1) {
        let agentResult = null;
        let error = null;
        try {
            agentResult = await runProductAgent(config, caseDef);
        } catch (err) {
            error = err?.message || String(err);
            agentResult = {
                status: 'error',
                content: '',
                trace: [],
                iterations: 0,
                error,
            };
        }

        const score = scoreAgentResult(caseDef, agentResult);
        const attemptRecord = {
            attempt,
            pass: score.pass,
            checks: score.checks,
            agentResult,
            error,
            tools: toolNamesFromResult(agentResult),
            status: agentResult?.status || 'error',
            iterations: agentResult?.iterations ?? 0,
            preview: contentPreview(agentResult),
        };
        attempts.push(attemptRecord);

        if (score.pass && firstPassIndex < 0) {
            firstPassIndex = attempt - 1;
            // Early stop on first pass (Pass@k does not require all k to pass).
            break;
        }
    }

    const pass = firstPassIndex >= 0;
    const best = pass ? attempts[firstPassIndex] : attempts[attempts.length - 1];

    return {
        id: caseDef.id,
        type: caseDef.type || null,
        description: caseDef.description || '',
        pass,
        passK,
        attemptsRun: attempts.length,
        firstPassAttempt: pass ? firstPassIndex + 1 : null,
        attempts,
        // Represent case with the first passing attempt, else last attempt for diagnostics.
        agentResult: best.agentResult,
        checks: best.checks,
        error: best.error || null,
        tools: best.tools,
        status: best.status,
        iterations: best.iterations,
        preview: best.preview,
    };
}

function printAttempt(attempt, indent = '  ') {
    const mark = attempt.pass ? 'PASS' : 'FAIL';
    console.log(`${indent}attempt ${attempt.attempt}: ${mark}`);
    console.log(`${indent}  status: ${attempt.status}  iterations: ${attempt.iterations}`);
    console.log(`${indent}  tools: ${attempt.tools.join(', ') || '(none)'}`);
    const cards = attempt.agentResult?.cardsRecorded;
    if (Array.isArray(cards)) {
        console.log(`${indent}  cardsRecorded: ${cards.length}`);
        for (const card of cards.slice(0, 5)) {
            const title = card?.title || card?.card?.title || card?.id || '(untitled)';
            console.log(`${indent}    - ${String(title).slice(0, 80)}`);
        }
    }
    const notes = attempt.agentResult?.notesExported;
    if (Array.isArray(notes)) {
        console.log(`${indent}  notesExported: ${notes.length}`);
        for (const item of notes.slice(0, 5)) {
            const label = item?.path || item?.filename || item?.documentId || '(export)';
            console.log(`${indent}    - ${String(label).slice(0, 80)}`);
        }
    }
    if (attempt.preview) {
        console.log(`${indent}  content: ${attempt.preview}`);
    }
    if (attempt.error) {
        console.log(`${indent}  error: ${attempt.error}`);
    }
    // Clear fail signal when write tool was required but refused/skipped.
    const called = new Set(attempt.tools || []);
    if (!attempt.pass && !called.has('create_vibecard')) {
        const wantsWrite = (attempt.checks || []).some(
            (check) => check.name === 'mustCallTools'
                && !check.pass
                && String(check.detail).includes('create_vibecard'),
        );
        if (wantsWrite) {
            console.log(`${indent}  FAIL_REASON: create_vibecard was never called (Grok refused or skipped write)`);
        }
    }
    if (!attempt.pass && !called.has('verify_citation')) {
        const wantsVerify = (attempt.checks || []).some(
            (check) => check.name === 'mustCallTools'
                && !check.pass
                && String(check.detail).includes('verify_citation'),
        );
        if (wantsVerify) {
            console.log(`${indent}  FAIL_REASON: verify_citation was never called (Grok refused or skipped critic tool)`);
        }
    }
    if (!attempt.pass && !called.has('memory_search')) {
        const wantsMemory = (attempt.checks || []).some(
            (check) => check.name === 'mustCallTools'
                && !check.pass
                && String(check.detail).includes('memory_search'),
        );
        if (wantsMemory) {
            console.log(`${indent}  FAIL_REASON: memory_search was never called (Grok refused or skipped curator tool)`);
        }
    }
    if (!attempt.pass) {
        const notesExported = attempt.agentResult?.notesExported;
        const notesCount = Array.isArray(notesExported) ? notesExported.length : 0;
        const hasContent = Boolean(String(attempt.agentResult?.content || '').trim());
        const wantsNoteExport = (attempt.checks || []).some(
            (check) => check.name === 'contentNonEmptyOrNotesExported' && !check.pass,
        );
        if (wantsNoteExport && notesCount === 0 && !hasContent) {
            console.log(`${indent}  FAIL_REASON: export_note never called and content empty (no markdown assembly)`);
        } else if (
            !called.has('get_current_document')
            && (attempt.checks || []).some(
                (check) => check.name === 'mustCallTools'
                    && !check.pass
                    && String(check.detail).includes('get_current_document'),
            )
        ) {
            console.log(`${indent}  FAIL_REASON: get_current_document was never called (required for note export)`);
        }
    }
    for (const check of attempt.checks || []) {
        const softBit = check.soft ? 'SOFT_' : '';
        const mark = check.pass ? 'PASS' : 'FAIL';
        console.log(`${indent}  check ${softBit}${mark}: ${check.name} - ${check.detail}`);
    }
}

function printCaseResult(entry) {
    const mark = entry.pass ? 'PASS' : 'FAIL';
    const typeLabel = entry.type ? ` type=${entry.type}` : '';
    console.log('');
    console.log(`[${mark}] ${entry.id}${typeLabel}  (Pass@${entry.passK}, attempts=${entry.attemptsRun}${entry.firstPassAttempt != null ? `, first_pass=${entry.firstPassAttempt}` : ''})`);
    if (entry.description) {
        console.log(`  desc: ${entry.description}`);
    }
    for (const attempt of entry.attempts) {
        printAttempt(attempt);
    }
}

function printAggregate(summary) {
    console.log('');
    console.log('--- aggregate ---');
    console.log(`cases: ${summary.total}  passed: ${summary.passed}  failed: ${summary.failed}`);
    console.log(`pass_k: ${summary.passK}`);
    console.log(`model: ${summary.model}`);
    console.log(`proxy: ${summary.baseUrl}`);
    console.log(`agent path: product (src/agent runtime + tools + llmModel + skills)`);
    for (const entry of summary.results) {
        const mark = entry.pass ? 'PASS' : 'FAIL';
        const typeBit = entry.type ? ` type=${entry.type}` : '';
        console.log(
            `  ${mark} ${entry.id}${typeBit}  tools=[${entry.tools.join(',') || '-'}]  attempts=${entry.attemptsRun}`,
        );
    }
    console.log('');
    console.log(summary.failed === 0 ? 'RESULT: PASS' : 'RESULT: FAIL');
}

// ---------- main ----------

async function main() {
    console.log('agent-eval-runner: starting (product modules via vite-node)');
    console.log('agent path: product (src/agent runtime + tools + llmModel + skills)');

    const loaded = loadClientEnv();
    if (loaded.path) {
        console.log(`env file: ${loaded.path} (keys not printed)`);
        applyEnvToProcess(loaded.env);
    } else {
        console.log('env file: none found under ~/.cli-proxy-api/');
    }

    const config = resolveConfig();
    const passK = resolvePassK();
    const caseFilter = resolveCaseFilter();
    const cases = caseFilter
        ? LIVE_CASES.filter((entry) => caseFilter.has(entry.id))
        : LIVE_CASES;

    if (cases.length === 0) {
        console.error('FAIL: no cases matched AGENT_EVAL_CASE filter');
        process.exit(1);
    }

    console.log(`proxy: ${config.baseUrl}`);
    console.log(`model: ${config.model}`);
    console.log(`cases: ${cases.length} (${cases.map((c) => c.id).join(', ')})`);
    console.log(`pass@k: ${passK} (AGENT_EVAL_PASS_K, default ${DEFAULT_PASS_K})`);

    if (!config.apiKey) {
        console.error('SKIP: no API key in process env or client.env');
        console.error('Set OPENAI_API_KEY / GROK_API_KEY or create ~/.cli-proxy-api/client.env');
        process.exit(2);
    }
    console.log(`api key: ${maskKey(config.apiKey)}`);

    const probe = await probeProxy(config.baseUrl);
    if (!probe.ok) {
        console.error(`SKIP: proxy not reachable at ${probe.modelsUrl}`);
        if (probe.error) console.error(`reason: ${probe.error}`);
        else console.error(`http status: ${probe.status}`);
        process.exit(2);
    }
    console.log(`proxy probe: ok (HTTP ${probe.status})`);

    const lessonsPrompt = buildEvalLessonsPrompt();
    if (lessonsPrompt) {
        const lessonLines = lessonsPrompt.split('\n').filter((line) => line.startsWith('- ')).length;
        console.log(`ch8 lessons: enabled (${lessonLines} bullets from pre-seeded max_iterations/tool_not_found)`);
    } else {
        console.log('ch8 lessons: disabled (AGENT_EVAL_LESSONS=0 or empty)');
    }

    const results = [];
    for (const caseDef of cases) {
        console.log('');
        console.log(`--- case ${caseDef.id}${caseDef.type ? ` (${caseDef.type})` : ''} ---`);
        const entry = await runCaseWithPassK(config, caseDef, passK);
        results.push(entry);
        printCaseResult(entry);
    }

    const passed = results.filter((entry) => entry.pass).length;
    const failed = results.length - passed;
    const summary = {
        total: results.length,
        passed,
        failed,
        passK,
        model: config.model,
        baseUrl: config.baseUrl,
        results,
    };

    printAggregate(summary);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error('FAIL: unhandled error:', error?.message || error);
    if (error?.stack) console.error(error.stack);
    process.exit(1);
});
