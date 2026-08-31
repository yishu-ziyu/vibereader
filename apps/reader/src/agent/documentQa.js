/**
 * Thin document Q&A entry over the knowledge_qa_agent reading skill.
 *
 * Chat already does local retrieval injection + optional UniRAG query
 * (see App handleSubmit). This helper is the agent-tool path: run
 * knowledge_qa_agent with goal = user question so tools
 * (knowledge_search / search_document / get_document_chunks) ground the answer.
 *
 * Optional Chat product wiring lives in documentQaChat.js
 * (runDocumentQaFromChat / isAgentDocumentQaEnabled). Default OFF;
 * App only takes this path when the flag is enabled.
 */

import { createReadingAgentOptions } from './readingAgentOptions';
import { runReadingAgent } from './runtime';

const KNOWLEDGE_QA_TYPE = 'knowledge_qa_agent';

function hasRunnableLlmConfig(modelConfig) {
    if (!modelConfig || typeof modelConfig !== 'object') return false;
    const baseUrl = String(modelConfig.baseUrl || modelConfig.baseURL || '').trim();
    const apiKey = String(modelConfig.apiKey || '').trim();
    const model = String(modelConfig.model || modelConfig.modelName || modelConfig.name || '').trim();
    return Boolean(baseUrl && apiKey && model);
}

function invalidResult(error) {
    return Object.freeze({
        status: 'invalid',
        error,
        content: '',
        sourceRefs: Object.freeze([]),
        skillType: KNOWLEDGE_QA_TYPE,
        goal: '',
        agentResult: null,
    });
}

/**
 * Run knowledge_qa_agent for one document question.
 *
 * @param {object|null|undefined} document Current open document (needs id + text fields for tools).
 * @param {string} question User message / QA goal.
 * @param {object|null} [modelConfig] Product model config; when runnable, prefer LLM.
 * @param {{
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
 *   groundingMode?: string,
 *   groundingGate?: boolean|string,
 *   requireSourceRefsForClaims?: boolean,
 *   runAgent?: Function,
 *   createOptions?: Function,
 *   createVibeCard?: Function,
 *   exportNote?: Function,
 * }} [options]
 * @returns {Promise<{
 *   status: string,
 *   content: string,
 *   sourceRefs: object[],
 *   skillType: string,
 *   goal: string,
 *   error?: string,
 *   agentResult: object|null,
 * }>}
 */
export async function runDocumentQaAgent(document, question, modelConfig = null, options = {}) {
    const goal = String(question ?? '').trim();
    if (!document || typeof document !== 'object' || !document.id) {
        return invalidResult('document with id is required');
    }
    if (!goal) {
        return invalidResult('question is required');
    }

    const {
        runAgent = runReadingAgent,
        createOptions = createReadingAgentOptions,
        useLlm: useLlmOpt,
        onEvent = null,
        abortSignal = null,
        signal = null,
        ...adapters
    } = options;

    const preferLlm = useLlmOpt === true
        || (useLlmOpt !== false && hasRunnableLlmConfig(modelConfig));

    // adapters may include groundingMode / groundingGate (off for quiet offline mocks;
    // product createReadingAgentOptions defaults llm → warn).
    const agentOptions = createOptions(KNOWLEDGE_QA_TYPE, document, {
        ...adapters,
        modelConfig: modelConfig || null,
        useLlm: preferLlm,
    });

    if (!agentOptions?.model) {
        return Object.freeze({
            status: 'error',
            error: 'Could not build knowledge_qa agent options',
            content: '',
            sourceRefs: Object.freeze([]),
            skillType: KNOWLEDGE_QA_TYPE,
            goal,
            agentResult: null,
        });
    }

    const agentResult = await runAgent({
        ...agentOptions,
        // User question replaces the static skill goal for this one-shot QA run.
        goal,
        ...(onEvent ? { onEvent } : {}),
        ...(abortSignal || signal
            ? { abortSignal: abortSignal || signal }
            : {}),
    });

    return Object.freeze({
        status: agentResult?.status || 'error',
        content: agentResult?.content || '',
        sourceRefs: Object.freeze(
            Array.isArray(agentResult?.sourceRefs) ? [...agentResult.sourceRefs] : [],
        ),
        skillType: KNOWLEDGE_QA_TYPE,
        goal,
        ...(agentResult?.error ? { error: agentResult.error } : {}),
        agentResult: agentResult || null,
    });
}

export const DOCUMENT_QA_SKILL_TYPE = KNOWLEDGE_QA_TYPE;
