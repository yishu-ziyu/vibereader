/**
 * Optional Chat → runDocumentQaAgent product entry (P1).
 *
 * Default OFF so App chat stays on retrieval + UniRAG + stream.
 * When ON and the user asks a document-bound text question, App can call
 * runDocumentQaFromChat → knowledge_qa_agent tool loop (same adapters as deep-read).
 *
 * Enable (any one):
 * - Explicit: options.enabled / useAgentDocumentQa = true
 * - localStorage: vibereader.agent.chatQa = 1 | true | on | yes
 * - Env (Node): VIBEREADER_AGENT_CHAT_QA=1
 * - Env (Vite): VITE_AGENT_CHAT_QA=1
 *
 * Explicit false / localStorage 0 always wins over env when the key is set.
 */

import { runDocumentQaAgent } from './documentQa';

export const AGENT_CHAT_QA_STORAGE_KEY = 'vibereader.agent.chatQa';

const TRUTHY = new Set(['1', 'true', 'on', 'yes']);
const FALSY = new Set(['0', 'false', 'off', 'no']);

function parseFlagValue(raw) {
    if (raw == null) return null;
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    if (TRUTHY.has(s)) return true;
    if (FALSY.has(s)) return false;
    return null;
}

/**
 * Read optional env flags (Node + Vite). Missing / unreadable → null.
 * @returns {boolean|null}
 */
export function readAgentChatQaEnv() {
    try {
        if (typeof process !== 'undefined' && process?.env) {
            const nodeVal = process.env.VIBEREADER_AGENT_CHAT_QA
                ?? process.env.VITE_AGENT_CHAT_QA;
            const parsed = parseFlagValue(nodeVal);
            if (parsed !== null) return parsed;
        }
    } catch (_) {
        // process may be restricted
    }

    try {
        const viteVal = import.meta.env?.VITE_AGENT_CHAT_QA;
        const parsed = parseFlagValue(viteVal);
        if (parsed !== null) return parsed;
    } catch (_) {
        // import.meta.env absent outside Vite
    }

    return null;
}

/**
 * Read localStorage toggle. Missing / unreadable → null.
 * @param {{ getItem?: Function }|null} [storage]
 * @returns {boolean|null}
 */
export function readAgentChatQaStorage(storage = null) {
    try {
        const store = storage
            || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!store?.getItem) return null;
        return parseFlagValue(store.getItem(AGENT_CHAT_QA_STORAGE_KEY));
    } catch (_) {
        return null;
    }
}

/**
 * Persist runtime toggle (UI). Writes '1' / '0'.
 * @param {boolean} enabled
 * @param {{ setItem?: Function }|null} [storage]
 * @returns {boolean}
 */
export function setAgentDocumentQaEnabled(enabled, storage = null) {
    const value = Boolean(enabled);
    try {
        const store = storage
            || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (store?.setItem) {
            store.setItem(AGENT_CHAT_QA_STORAGE_KEY, value ? '1' : '0');
        }
    } catch (_) {
        // ignore quota / private mode
    }
    return value;
}

/**
 * Resolve whether agent document QA is enabled.
 * Precedence: explicit option → localStorage → env → false (default OFF).
 *
 * @param {{
 *   enabled?: boolean,
 *   useAgentDocumentQa?: boolean,
 *   storage?: { getItem?: Function }|null,
 *   envValue?: boolean|null,
 * }} [options]
 * @returns {boolean}
 */
export function isAgentDocumentQaEnabled(options = {}) {
    if (typeof options.enabled === 'boolean') return options.enabled;
    if (typeof options.useAgentDocumentQa === 'boolean') return options.useAgentDocumentQa;

    const stored = readAgentChatQaStorage(options.storage ?? null);
    if (stored !== null) return stored;

    if (typeof options.envValue === 'boolean') return options.envValue;
    const env = readAgentChatQaEnv();
    if (env !== null) return env;

    return false;
}

/**
 * Whether handleSubmit should take the tool-loop QA branch.
 * Requires flag ON + document id + non-empty text question + no images.
 *
 * @param {{
 *   enabled?: boolean,
 *   useAgentDocumentQa?: boolean,
 *   document?: object|null,
 *   question?: string,
 *   images?: Array|null,
 *   storage?: object|null,
 *   envValue?: boolean|null,
 * }} [input]
 * @returns {boolean}
 */
export function shouldRunDocumentQaFromChat(input = {}) {
    if (!isAgentDocumentQaEnabled(input)) return false;

    const document = input.document;
    if (!document || typeof document !== 'object' || !document.id) return false;

    const question = String(input.question ?? '').trim();
    if (!question) return false;

    const images = input.images;
    if (Array.isArray(images) && images.length > 0) {
        const hasRenderable = images.some((img) => {
            if (!img || typeof img !== 'object') return true;
            return Boolean(img.base64 || img.url || img.dataUrl);
        });
        if (hasRenderable) return false;
    }

    return true;
}

/**
 * Chat product entry: run knowledge_qa_agent for one document-bound question.
 * Call only when shouldRunDocumentQaFromChat is true (or pass skipGate).
 *
 * Mirrors deep-read adapter shape: modelConfig + uniRag + experienceStore + injects.
 *
 * @param {object|null|undefined} document
 * @param {string} question
 * @param {object|null} [modelConfig]
 * @param {{
 *   skipGate?: boolean,
 *   enabled?: boolean,
 *   useAgentDocumentQa?: boolean,
 *   useLlm?: boolean,
 *   uniRagAvailable?: boolean,
 *   ragAdapter?: object,
 *   knowledgeSearch?: Function,
 *   searchMemory?: Function,
 *   onEvent?: Function,
 *   abortSignal?: AbortSignal,
 *   signal?: AbortSignal,
 *   lessonsPrompt?: string,
 *   experienceStore?: object|null,
 *   runAgent?: Function,
 *   createOptions?: Function,
 *   createVibeCard?: Function,
 *   exportNote?: Function,
 *   runDocumentQa?: Function,
 *   storage?: object|null,
 *   envValue?: boolean|null,
 *   images?: Array|null,
 * }} [options]
 * @returns {Promise<{
 *   used: boolean,
 *   status: string,
 *   content: string,
 *   sourceRefs: object[],
 *   skillType: string,
 *   goal: string,
 *   error?: string,
 *   agentResult: object|null,
 *   via: string,
 * }>}
 */
export async function runDocumentQaFromChat(
    document,
    question,
    modelConfig = null,
    options = {},
) {
    const {
        skipGate = false,
        runDocumentQa = runDocumentQaAgent,
        images = null,
        storage = null,
        envValue,
        enabled,
        useAgentDocumentQa,
        ...agentOptions
    } = options;

    if (!skipGate && !shouldRunDocumentQaFromChat({
        enabled,
        useAgentDocumentQa,
        document,
        question,
        images,
        storage,
        envValue,
    })) {
        return Object.freeze({
            used: false,
            status: 'skipped',
            content: '',
            sourceRefs: Object.freeze([]),
            skillType: 'knowledge_qa_agent',
            goal: String(question ?? '').trim(),
            agentResult: null,
            via: 'document_qa_agent',
        });
    }

    const result = await runDocumentQa(
        document,
        question,
        modelConfig,
        agentOptions,
    );

    return Object.freeze({
        used: true,
        status: result?.status || 'error',
        content: result?.content || '',
        sourceRefs: Object.freeze(
            Array.isArray(result?.sourceRefs) ? [...result.sourceRefs] : [],
        ),
        skillType: result?.skillType || 'knowledge_qa_agent',
        goal: result?.goal || String(question ?? '').trim(),
        ...(result?.error ? { error: result.error } : {}),
        agentResult: result?.agentResult ?? result ?? null,
        via: 'document_qa_agent',
    });
}

/**
 * Bubble text when agent QA returns empty content.
 * @param {{ content?: string, error?: string, status?: string }} result
 * @returns {string}
 */
export function formatDocumentQaChatContent(result = {}) {
    const content = String(result?.content || '').trim();
    if (content) return content;
    if (result?.error) {
        return `文档工具问答失败：${result.error}`;
    }
    if (result?.status === 'invalid') {
        return '文档工具问答条件不满足（需要打开文档并输入问题）。';
    }
    return '文档工具问答未返回内容。';
}
