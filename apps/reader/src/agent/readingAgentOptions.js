/**
 * Product wiring for reading-agent options: permissions, UniRAG tool adapters,
 * and runnable task-type policy (local models vs LLM-only skills).
 */

import { createUniRagHttpAdapter } from '../services/ragEngineAdapter';
import { listPersistentAttentionInsights } from '../services/persistentStorage';
import { getArtifactById as getArtifactByIdFromService } from '../services/artifactService';
import {
    buildSavedMemoryPayload,
    canIngestSavedMemoryArtifact,
    startSavedMemoryIngest,
} from '../services/savedMemoryService';
import { DEFAULT_READING_PERMISSIONS, filterAllowedTools } from './permissions';
import { createReadingTools } from './tools';
import { getReadingAgentSkill, listReadingAgentSkills } from './skills';
import { resolveReadingAgentModel } from './modelFactory';
import { resolveSkillDocument } from './skillDocuments';

/**
 * Product entry for agent options.
 * Accepts optional injects so App can pass the barrel `./agent` bindings
 * (WorkspaceLayout tests mock that barrel). Defaults use direct module imports.
 */
function resolveDeps(deps = {}) {
    return {
        getSkill: deps.getReadingAgentSkill || getReadingAgentSkill,
        createTools: deps.createReadingTools || createReadingTools,
        resolveModel: deps.resolveReadingAgentModel || resolveReadingAgentModel,
        filterTools: deps.filterAllowedTools || filterAllowedTools,
    };
}

/** Skills with offline-safe local deterministic models. */
export const LOCAL_MODEL_READING_AGENT_TYPES = Object.freeze(new Set([
    'paper_overview_agent',
    'attention_agent',
    'card_generation_agent',
    'knowledge_qa_agent',
    'critic_agent',
    'memory_curator_agent',
    'note_export_agent',
]));

/**
 * Skills that require an LLM (no local model). Only runnable when useLlm is true.
 * Empty after local models landed for knowledge_qa / critic / memory_curator / note_export.
 */
export const LLM_ONLY_READING_AGENT_TYPES = Object.freeze(new Set([
]));

/** All product-wired agent types (local + LLM-only). */
export const RUNNABLE_READING_AGENT_TYPES = Object.freeze(new Set([
    ...LOCAL_MODEL_READING_AGENT_TYPES,
    ...LLM_ONLY_READING_AGENT_TYPES,
]));

export function isLlmOnlyReadingAgentType(taskType) {
    return LLM_ONLY_READING_AGENT_TYPES.has(taskType);
}

/**
 * @param {string} taskType
 * @param {{ useLlm?: boolean }} [options]
 */
export function isRunnableReadingAgentType(taskType, options = {}) {
    if (LOCAL_MODEL_READING_AGENT_TYPES.has(taskType)) return true;
    if (LLM_ONLY_READING_AGENT_TYPES.has(taskType) && options.useLlm === true) return true;
    return false;
}

/**
 * Expand permissions for write / knowledge / critic / memory skill profiles.
 * Defaults already allow read tools; skill profiles force required flags + tools.
 */
export function buildReadingAgentPermissions(taskType) {
    if (taskType === 'card_generation_agent') {
        return {
            ...DEFAULT_READING_PERMISSIONS,
            allowedTools: [
                ...new Set([
                    ...DEFAULT_READING_PERMISSIONS.allowedTools,
                    'create_vibecard',
                ]),
            ],
            canWriteVibeCards: true,
        };
    }

    if (taskType === 'knowledge_qa_agent') {
        return {
            ...DEFAULT_READING_PERMISSIONS,
            allowedTools: [
                ...new Set([
                    ...DEFAULT_READING_PERMISSIONS.allowedTools,
                    'knowledge_search',
                    'get_document_chunks',
                    'search_document',
                    'get_current_document',
                ]),
            ],
            canSearchKnowledge: true,
            canSearchDocument: true,
            canReadDocument: true,
        };
    }

    if (taskType === 'critic_agent') {
        return {
            ...DEFAULT_READING_PERMISSIONS,
            allowedTools: [
                ...new Set([
                    ...DEFAULT_READING_PERMISSIONS.allowedTools,
                    'verify_citation',
                    'search_document',
                    'get_document_chunks',
                    'knowledge_search',
                    'get_current_document',
                ]),
            ],
            canVerifyCitation: true,
            canSearchDocument: true,
            canSearchKnowledge: true,
            canReadDocument: true,
        };
    }

    if (taskType === 'memory_curator_agent') {
        return {
            ...DEFAULT_READING_PERMISSIONS,
            allowedTools: [
                ...new Set([
                    ...DEFAULT_READING_PERMISSIONS.allowedTools,
                    'memory_search',
                    'list_attention_insights',
                    'get_current_document',
                ]),
            ],
            canSearchMemory: true,
            canListAttentionInsights: true,
            canReadDocument: true,
        };
    }

    if (taskType === 'note_export_agent') {
        return {
            ...DEFAULT_READING_PERMISSIONS,
            allowedTools: [
                ...new Set([
                    ...DEFAULT_READING_PERMISSIONS.allowedTools,
                    'export_note',
                    'list_attention_insights',
                    'get_current_document',
                ]),
            ],
            canExportNotes: true,
            canListAttentionInsights: true,
            canReadDocument: true,
        };
    }

    return DEFAULT_READING_PERMISSIONS;
}

/**
 * Opt-in permissions for a product-gated memory_save flow.
 * Not used by any default skill profile. Caller must still pass
 * userConfirmed: true in memory_save tool args (model cannot self-confirm).
 *
 * @param {object} [base]
 */
export function buildMemoryWritePermissions(base = DEFAULT_READING_PERMISSIONS) {
    return {
        ...base,
        allowedTools: [
            ...new Set([
                ...(base.allowedTools || DEFAULT_READING_PERMISSIONS.allowedTools),
                'memory_save',
            ]),
        ],
        canWriteMemory: true,
    };
}

function isMemorySourceRef(sourceRef = {}) {
    return sourceRef.evidenceType === 'memory'
        || sourceRef.sourceType === 'saved_memory'
        || Boolean(sourceRef.artifactId || sourceRef.memoryId);
}

function queryProviderFields(modelConfig = null) {
    if (!modelConfig || typeof modelConfig !== 'object') return {};
    const provider = modelConfig.providerKey || modelConfig.provider || undefined;
    const apiKey = modelConfig.apiKey || undefined;
    return {
        ...(provider ? { providerKey: provider, provider } : {}),
        ...(apiKey ? { apiKey } : {}),
    };
}

/**
 * Map UniRAG query sourceRefs (document) into knowledge_search matches.
 */
export function matchesFromUniRagQueryResult(result = {}, limit) {
    const refs = Array.isArray(result.sourceRefs) ? result.sourceRefs : [];
    const documentRefs = refs.filter((ref) => !isMemorySourceRef(ref));
    const matches = documentRefs.map((ref, index) => ({
        id: ref.id || ref.chunkId || `match-${index + 1}`,
        documentId: ref.documentId || 'unknown',
        page: ref.page ?? null,
        paragraphId: ref.paragraphId || ref.chunkId || `match-${index + 1}`,
        text: ref.text || '',
        score: Number.isFinite(Number(ref.score)) ? Number(ref.score) : null,
        truncated: Boolean(ref.truncated),
    }));
    const bounded = Number(limit);
    return Number.isFinite(bounded) && bounded > 0
        ? matches.slice(0, bounded)
        : matches;
}

/**
 * Map UniRAG query memory sourceRefs into memory_search memories.
 */
export function memoriesFromUniRagQueryResult(result = {}, limit) {
    const refs = Array.isArray(result.sourceRefs) ? result.sourceRefs : [];
    const memoryRefs = refs.filter((ref) => isMemorySourceRef(ref));
    const memories = memoryRefs.map((ref, index) => ({
        id: ref.memoryId || ref.artifactId || ref.id || `memory-${index + 1}`,
        title: ref.memoryTitle || ref.label || '',
        text: ref.text || '',
        score: Number.isFinite(Number(ref.score)) ? Number(ref.score) : null,
        documentId: ref.documentId || null,
        artifactId: ref.artifactId || null,
        type: ref.artifactType || ref.sourceType || null,
    }));
    const bounded = Number(limit);
    return Number.isFinite(bounded) && bounded > 0
        ? memories.slice(0, bounded)
        : memories;
}

function knowledgeSearchAdapterFailure(errorCode, message, extra = {}) {
    return {
        ok: false,
        query: extra.query ?? '',
        matches: [],
        engine: 'unavailable',
        errorCode,
        message,
        error: message,
        ...extra,
    };
}

/**
 * Thin knowledge_search adapter backed by UniRAG query (document citations only).
 * On health/query failure returns structured ok:false so knowledgeSearch can degrade
 * to local-keyword without throwing.
 */
export function createKnowledgeSearchAdapter(ragAdapter, modelConfig = null) {
    // length === 2 so knowledgeSearch passes { signal } as the second argument.
    return async function knowledgeSearchAdapter(params, options) {
        const { query, limit, documentId, document } = params || {};
        const signal = options?.signal || options?.abortSignal || params?.signal || null;
        const q = query == null ? '' : String(query);
        if (!ragAdapter?.query) {
            return knowledgeSearchAdapterFailure(
                'unirag_unavailable',
                'UniRAG query adapter is not available.',
                { query: q },
            );
        }

        if (signal?.aborted) {
            const abortError = new Error('The operation was aborted.');
            abortError.name = 'AbortError';
            throw abortError;
        }

        if (typeof ragAdapter.health === 'function') {
            try {
                const health = await ragAdapter.health();
                if (health && health.available === false) {
                    return knowledgeSearchAdapterFailure(
                        'unirag_unavailable',
                        health.error
                            || health.reason
                            || 'UniRAG health failed.',
                        { query: q, ragEngine: health },
                    );
                }
            } catch (error) {
                return knowledgeSearchAdapterFailure(
                    'unirag_unavailable',
                    error?.message || String(error),
                    { query: q },
                );
            }
        }

        try {
            const topK = Number.isFinite(Number(limit)) && Number(limit) > 0
                ? Number(limit)
                : 5;
            const result = await ragAdapter.query({
                question: q,
                topK,
                includeMemory: false,
                mode: 'chat',
                ...(signal ? { signal, abortSignal: signal } : {}),
                ...queryProviderFields(modelConfig),
            });
            return {
                query: q,
                matches: matchesFromUniRagQueryResult(result, limit),
                engine: result?.ragEngine?.engine || ragAdapter.engine || 'uni-rag',
                documentId: documentId || document?.id || null,
            };
        } catch (error) {
            const message = error?.message || String(error);
            const lower = message.toLowerCase();
            const errorCode = lower.includes('timeout')
                || lower.includes('timed out')
                || lower.includes('aborted')
                ? 'timeout'
                : 'query_failed';
            return knowledgeSearchAdapterFailure(errorCode, message, { query: q });
        }
    };
}

function searchMemoryAdapterFailure(query, message, extra = {}) {
    const msg = message || 'Memory search unavailable.';
    return {
        query: query == null ? '' : String(query),
        memories: [],
        status: 'unavailable',
        ok: false,
        error: msg,
        message: msg,
        ...extra,
    };
}

/**
 * memory_search adapter: UniRAG query with includeMemory, filter saved_memory refs.
 * On throw/network fail returns soft status=unavailable (never throws).
 * Phase-1: no dedicated memory search HTTP API.
 */
export function createSearchMemoryAdapter(ragAdapter, modelConfig = null) {
    return async ({ query, limit } = {}) => {
        const q = query == null ? '' : String(query);
        if (!ragAdapter?.query) {
            return searchMemoryAdapterFailure(
                q,
                'UniRAG query adapter is not available.',
                { errorCode: 'unirag_unavailable' },
            );
        }

        try {
            const memoryTopK = Number.isFinite(Number(limit)) && Number(limit) > 0
                ? Number(limit)
                : 5;
            const result = await ragAdapter.query({
                question: q,
                topK: 1,
                includeMemory: true,
                memoryTopK,
                mode: 'chat',
                ...queryProviderFields(modelConfig),
            });
            return {
                query: q,
                memories: memoriesFromUniRagQueryResult(result, limit),
                status: 'ok',
            };
        } catch (error) {
            const message = error?.message || String(error);
            const lower = message.toLowerCase();
            const errorCode = lower.includes('timeout')
                || lower.includes('timed out')
                || lower.includes('aborted')
                ? 'timeout'
                : 'query_failed';
            return searchMemoryAdapterFailure(q, message, { errorCode });
        }
    };
}

/**
 * Build tool adapters for createReadingTools.
 * Wires UniRAG when available (or when an explicit ragAdapter is passed).
 *
 * @param {object} document
 * @param {{
 *   createVibeCard?: Function,
 *   exportNote?: Function,
 *   ragAdapter?: object,
 *   uniRagAvailable?: boolean,
 *   modelConfig?: object|null,
 *   knowledgeSearch?: Function,
 *   searchMemory?: Function,
 *   listAttentionInsightsForDocument?: Function,
 *   getArtifactById?: Function,
 *   getDocumentById?: Function,
 *   startSavedMemoryIngest?: Function,
 *   buildSavedMemoryPayload?: Function,
 *   canIngestSavedMemoryArtifact?: Function,
 * }} [adapters]
 */
export function buildReadingAgentToolAdapters(document, adapters = {}) {
    const documentId = document?.id || null;
    const toolAdapters = {
        listAttentionInsightsForDocument:
            adapters.listAttentionInsightsForDocument || listPersistentAttentionInsights,
        ...(adapters.createVibeCard ? { createVibeCard: adapters.createVibeCard } : {}),
        ...(adapters.exportNote ? { exportNote: adapters.exportNote } : {}),
        // Lookup adapters stay available even when canWriteMemory is false so a
        // dedicated product flow can enable memory_save without extra wiring.
        getArtifactById: adapters.getArtifactById
            || ((artifactId) => getArtifactByIdFromService(artifactId, { documentId })),
        getDocumentById: adapters.getDocumentById
            || (async (id) => {
                if (documentId && String(id) === String(documentId)) return document;
                return null;
            }),
        // Memory write path: product still gates via canWriteMemory + userConfirmed.
        canIngestSavedMemoryArtifact:
            adapters.canIngestSavedMemoryArtifact || canIngestSavedMemoryArtifact,
        buildSavedMemoryPayload:
            adapters.buildSavedMemoryPayload || buildSavedMemoryPayload,
        startSavedMemoryIngest:
            adapters.startSavedMemoryIngest || startSavedMemoryIngest,
    };

    const uniRagAvailable = adapters.uniRagAvailable;
    const shouldWireUniRag = Boolean(adapters.ragAdapter)
        || uniRagAvailable === true
        || uniRagAvailable === undefined;

    if (!shouldWireUniRag) {
        return toolAdapters;
    }

    const ragAdapter = adapters.ragAdapter || createUniRagHttpAdapter();
    const modelConfig = adapters.modelConfig || null;

    toolAdapters.ragAdapter = ragAdapter;
    toolAdapters.knowledgeSearch = adapters.knowledgeSearch
        || createKnowledgeSearchAdapter(ragAdapter, modelConfig);
    toolAdapters.searchMemory = adapters.searchMemory
        || createSearchMemoryAdapter(ragAdapter, modelConfig);

    return toolAdapters;
}

/**
 * Resolve lessons text for system-prompt injection.
 * Prefer explicit lessonsPrompt; else experienceStore.buildLessonsPrompt().
 * @param {{ lessonsPrompt?: string, experienceStore?: { buildLessonsPrompt?: Function }|null }} adapters
 * @returns {string}
 */
export function resolveLessonsPrompt(adapters = {}) {
    if (typeof adapters.lessonsPrompt === 'string') {
        return adapters.lessonsPrompt.trim();
    }
    const store = adapters.experienceStore;
    if (store && typeof store.buildLessonsPrompt === 'function') {
        try {
            return String(store.buildLessonsPrompt() || '').trim();
        } catch (_) {
            return '';
        }
    }
    return '';
}

/**
 * Read optional product grounding env.
 * Node eval: VIBEREADER_AGENT_GROUNDING
 * Vite browser (if set at build): VITE_AGENT_GROUNDING
 * @returns {string} lowercased trimmed value, or ''
 */
function readAgentGroundingEnv() {
    try {
        if (typeof process !== 'undefined' && process?.env) {
            const nodeVal = process.env.VIBEREADER_AGENT_GROUNDING;
            if (nodeVal != null && String(nodeVal).trim() !== '') {
                return String(nodeVal).toLowerCase().trim();
            }
        }
    } catch (_) {
        // process may be restricted in some runtimes
    }

    try {
        // Vite exposes only VITE_* on import.meta.env
        const viteVal = import.meta.env?.VITE_AGENT_GROUNDING;
        if (viteVal != null && String(viteVal).trim() !== '') {
            return String(viteVal).toLowerCase().trim();
        }
    } catch (_) {
        // import.meta.env absent outside Vite
    }

    return '';
}

/**
 * Product grounding mode for createReadingAgentOptions.
 * Distinct from groundingGate.resolveGroundingMode(options) (runtime option parser).
 *
 * Priority:
 * 1. Explicit adapters.groundingMode ('off' → omit; 'warn'|'strict' → that mode)
 * 2. Explicit adapters.groundingGate (false|'off' → omit; true|'warn' → warn;
 *    'strict' → strict). Gate enable only applies when resolvedSource is 'llm'.
 * 3. Non-llm resolvedSource: undefined (omit; runtime stays off)
 * 4. llm + VIBEREADER_AGENT_GROUNDING=strict / VITE_AGENT_GROUNDING=strict → 'strict'
 * 5. llm default: 'warn' (evidence-first soft gate, not a user-facing toggle)
 *
 * Explicit off keeps offline mock evals quiet (zero grounding noise).
 *
 * @param {{ groundingMode?: string, groundingGate?: boolean|string }} [adapters]
 * @param {string} [resolvedSource] modelFactory resolved.source ('llm' | 'local' | ...)
 * @returns {'warn'|'strict'|undefined}
 */
export function resolveGroundingMode(adapters = {}, resolvedSource) {
    const rawMode = adapters.groundingMode;
    if (rawMode != null && String(rawMode).trim() !== '') {
        const mode = String(rawMode).toLowerCase().trim();
        if (mode === 'off') return undefined;
        if (mode === 'warn' || mode === 'strict') return mode;
    }

    const gate = adapters.groundingGate;
    if (gate === false || gate === 'off') return undefined;

    if (resolvedSource !== 'llm') return undefined;

    if (gate === true || gate === 'warn') return 'warn';
    if (gate === 'strict') return 'strict';

    if (readAgentGroundingEnv() === 'strict') return 'strict';
    return 'warn';
}

/**
 * Build full agentOptions for runReadingAgentTask / retry.
 * When resolved.source is 'llm', sets groundingMode (warn default; env may force strict)
 * and includeObservability: true.
 * Local / fallback models omit both (runtime defaults). adapters.useLlm alone is not enough.
 * Explicit adapters.groundingMode/'groundingGate' off|false omit the gate (quiet offline mocks).
 *
 * @param {string} taskType
 * @param {object} document
 * @param {{
 *   createVibeCard?: Function,
 *   exportNote?: Function,
 *   useLlm?: boolean,
 *   modelConfig?: object|null,
 *   ragAdapter?: object,
 *   uniRagAvailable?: boolean,
 *   lessonsPrompt?: string,
 *   experienceStore?: { buildLessonsPrompt?: Function }|null,
 *   skillDocument?: string,
 *   skillDocuments?: Record<string, string>,
 *   groundingMode?: string,
 *   groundingGate?: boolean|string,
 *   requireSourceRefsForClaims?: boolean,
 *   getReadingAgentSkill?: Function,
 *   createReadingTools?: Function,
 *   resolveReadingAgentModel?: Function,
 *   filterAllowedTools?: Function,
 * }} [adapters]
 * @returns {object|null}
 */
export function createReadingAgentOptions(taskType, document, adapters = {}) {
    const { getSkill, createTools, resolveModel, filterTools } = resolveDeps(adapters);
    const skill = getSkill(taskType);
    if (!skill) return null;

    if (isLlmOnlyReadingAgentType(taskType) && adapters.useLlm !== true) {
        return null;
    }

    // Skills never set canWriteMemory. Product may pass permissions (e.g.
    // buildMemoryWritePermissions) for a dedicated user-confirmed save flow.
    const permissions = adapters.permissions || buildReadingAgentPermissions(taskType);
    const toolAdapters = buildReadingAgentToolAdapters(document, adapters);
    // Filter before model construction so OpenAI tools[] never lists writes the skill cannot run.
    const tools = filterTools(
        createTools({ document }, toolAdapters),
        permissions,
    );

    const lessonsPrompt = resolveLessonsPrompt(adapters);
    // Progressive skill md: explicit adapters.skillDocument wins; else Vite-bundled
    // raw docs (browser-safe). Empty → modelFactory stays on embedded systemPrompt.
    const skillDocument = resolveSkillDocument(skill, {
        skillDocument: adapters.skillDocument,
        documents: adapters.skillDocuments,
    });
    const resolved = resolveModel(taskType, adapters.modelConfig, {
        preferLlm: adapters.useLlm === true,
        skill,
        tools,
        ...(lessonsPrompt ? { lessonsPrompt } : {}),
        ...(skillDocument ? { skillDocument } : {}),
    });
    if (!resolved?.model) return null;

    // Product evidence-first soft gate + light observability: only when the
    // resolved model is actually LLM (or explicit warn/strict override).
    // useLlm/preferLlm alone is not enough - local fallback must stay off.
    // groundingMode: warn default on llm; env/adapters may force strict;
    // groundingGate/mode 'off'|false omits the gate (offline mock evals).
    const groundingMode = resolveGroundingMode(adapters, resolved.source);
    const requireSourceRefsForClaims = adapters.requireSourceRefsForClaims === false
        ? false
        : true;
    return {
        goal: skill.goal,
        model: resolved.model,
        tools,
        permissions,
        maxIterations: resolved.maxIterations || skill.maxIterations || 4,
        timeoutMs: resolved.timeoutMs || 30000,
        ...(groundingMode
            ? {
                groundingMode,
                includeObservability: true,
                // claim-heavy finals need sourceRefs; requireTools defaults true for warn
                requireSourceRefsForClaims,
            }
            : {}),
        ...(lessonsPrompt ? { lessonsPrompt } : {}),
    };
}

/**
 * Skills shown in the Tasks UI for the current runtime capabilities.
 * @param {{ useLlm?: boolean, listReadingAgentSkills?: Function }} [options]
 */
export function runnableReadingAgentSkills(options = {}) {
    const listSkills = options.listReadingAgentSkills || listReadingAgentSkills;
    return listSkills().filter((skill) =>
        isRunnableReadingAgentType(skill.type, options)
    );
}
