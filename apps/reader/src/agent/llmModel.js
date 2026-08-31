/**
 * OpenAI-compatible LLM adapter for the reading agent loop.
 * Model function shape matches local models in readingTaskModels.js:
 *   ({ goal, context, iteration, maxIterations, status, trace }) => Promise<tool_call | final>
 *
 * Uses native tool_calls when tools are provided; falls back to content JSON.
 * Each turn appends a Ch2 status-bar user trailer (runtime status or buildStatusBar).
 */

import { normalizeBaseUrl } from '../modelPresets';
import { resolveAiEndpointForRuntime } from '../aiEndpoint';
import {
    compressTraceForModel,
    estimateTokens,
} from './contextCompression';
import { buildStatusBar } from './observation';
import { toolToOpenAIFunction } from './toolSchemas';

export const DEFAULT_GROK_MODEL = 'grok-4.5';
export const DEFAULT_LOCAL_PROXY_BASE_URL = 'http://127.0.0.1:8317/v1';

/** Compress prior trace when estimated tokens exceed this (default on). */
export const DEFAULT_TRACE_COMPRESS_THRESHOLD_TOKENS = 1500;
/** Budget passed to compressTraceForModel when compression runs. */
export const DEFAULT_TRACE_COMPRESS_MAX_TOKENS = 1500;

export const DEFAULT_SYSTEM_PROMPT = [
    'You are a reading agent inside VibeReader.',
    'Use tools to inspect the current document before making claims.',
    'When multiple independent tools are needed, emit multiple tool_calls in a single response.',
    'Only state facts supported by tool results or provided context.',
    'When finished, answer in clear markdown.',
    'Optionally append a fenced json block with {"sourceRefs":[...]} for grounded citations.',
    'Never include API keys, headers, or secrets in content.',
].join('\n');

function firstNonEmpty(...values) {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return '';
}

/**
 * Resolve baseUrl / apiKey / model for agent LLM calls.
 * Order: explicit options → VIBEREADER_AGENT_* → OPENAI_API_KEY + local proxy → XAI_API_KEY + api.x.ai
 *
 * @param {object} [optionsOrEnv]
 * @returns {{ baseUrl: string, apiKey: string, model: string, source: string }}
 */
export function resolveAgentLlmConfig(optionsOrEnv = {}) {
    const bag = optionsOrEnv && typeof optionsOrEnv === 'object' ? optionsOrEnv : {};
    const env = typeof process !== 'undefined' && process?.env ? process.env : {};

    const explicitBaseUrl = firstNonEmpty(bag.baseUrl, bag.baseURL);
    const explicitApiKey = firstNonEmpty(bag.apiKey);
    const explicitModel = firstNonEmpty(bag.model, bag.modelName, bag.name);

    const vibeBase = firstNonEmpty(bag.VIBEREADER_AGENT_BASE_URL, env.VIBEREADER_AGENT_BASE_URL);
    const vibeKey = firstNonEmpty(bag.VIBEREADER_AGENT_API_KEY, env.VIBEREADER_AGENT_API_KEY);
    const vibeModel = firstNonEmpty(bag.VIBEREADER_AGENT_MODEL, env.VIBEREADER_AGENT_MODEL);

    const openaiKey = firstNonEmpty(bag.OPENAI_API_KEY, env.OPENAI_API_KEY);
    const xaiKey = firstNonEmpty(bag.XAI_API_KEY, env.XAI_API_KEY);

    // Priority 1: explicit options
    if (explicitBaseUrl || explicitApiKey || explicitModel) {
        let baseUrl = explicitBaseUrl;
        let apiKey = explicitApiKey;
        let model = explicitModel || DEFAULT_GROK_MODEL;
        let source = 'options';

        if (!baseUrl || !apiKey) {
            if (vibeBase || vibeKey) {
                baseUrl = baseUrl || vibeBase;
                apiKey = apiKey || vibeKey;
                model = explicitModel || vibeModel || DEFAULT_GROK_MODEL;
                source = 'options+vibereader_env';
            } else if (openaiKey) {
                baseUrl = baseUrl || firstNonEmpty(bag.OPENAI_BASE_URL, env.OPENAI_BASE_URL, DEFAULT_LOCAL_PROXY_BASE_URL);
                apiKey = apiKey || openaiKey;
                model = explicitModel || DEFAULT_GROK_MODEL;
                source = 'options+openai_env';
            } else if (xaiKey) {
                baseUrl = baseUrl || firstNonEmpty(bag.XAI_BASE_URL, env.XAI_BASE_URL, 'https://api.x.ai/v1');
                apiKey = apiKey || xaiKey;
                model = explicitModel || DEFAULT_GROK_MODEL;
                source = 'options+xai_env';
            }
        }

        return {
            baseUrl: baseUrl || '',
            apiKey: apiKey || '',
            model: model || DEFAULT_GROK_MODEL,
            source,
        };
    }

    // Priority 2: VIBEREADER_AGENT_*
    if (vibeBase || vibeKey || vibeModel) {
        return {
            baseUrl: vibeBase || DEFAULT_LOCAL_PROXY_BASE_URL,
            apiKey: vibeKey || '',
            model: vibeModel || DEFAULT_GROK_MODEL,
            source: 'vibereader_env',
        };
    }

    // Priority 3: OPENAI_API_KEY + local proxy + grok-4.5
    if (openaiKey) {
        return {
            baseUrl: firstNonEmpty(bag.OPENAI_BASE_URL, env.OPENAI_BASE_URL, DEFAULT_LOCAL_PROXY_BASE_URL),
            apiKey: openaiKey,
            model: firstNonEmpty(bag.OPENAI_MODEL, env.OPENAI_MODEL, DEFAULT_GROK_MODEL),
            source: 'openai_env',
        };
    }

    // Priority 4: XAI_API_KEY + api.x.ai + grok-4.5
    if (xaiKey) {
        return {
            baseUrl: firstNonEmpty(bag.XAI_BASE_URL, env.XAI_BASE_URL, 'https://api.x.ai/v1'),
            apiKey: xaiKey,
            model: firstNonEmpty(bag.XAI_MODEL, env.XAI_MODEL, DEFAULT_GROK_MODEL),
            source: 'xai_env',
        };
    }

    return {
        baseUrl: '',
        apiKey: '',
        model: DEFAULT_GROK_MODEL,
        source: 'unresolved',
    };
}

export function formatOpenAIChatCompletionsUrl(baseUrl) {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) return '';
    if (normalized.endsWith('/chat/completions')) return normalized;
    if (normalized.endsWith('/messages')) {
        return normalized.replace(/\/messages$/, '/chat/completions');
    }
    return `${normalized}/chat/completions`;
}

/**
 * Convert a createReadingTools-style registry into OpenAI tools[].
 * Prefer tool.parameters; else TOOL_PARAMETER_SCHEMAS via toolToOpenAIFunction;
 * else empty object schema.
 *
 * @param {object|Array} toolsRegistry
 * @returns {Array}
 */
export function buildOpenAIToolDefinitions(toolsRegistry = {}) {
    if (!toolsRegistry) return [];

    if (Array.isArray(toolsRegistry)) {
        return toolsRegistry.map((entry) => {
            if (entry?.type === 'function' && entry.function?.name) return entry;
            return toolToOpenAIFunction(entry);
        });
    }

    if (typeof toolsRegistry !== 'object') return [];

    return Object.keys(toolsRegistry).map((key) => {
        const tool = toolsRegistry[key] || {};
        if (tool?.type === 'function' && tool.function?.name) return tool;
        const name = tool.name || tool.toolName || key;
        return toolToOpenAIFunction({
            name,
            description: tool.description || tool.summary || '',
            ...(tool.parameters ? { parameters: tool.parameters } : {}),
        });
    });
}

function parseJsonSafe(text) {
    try {
        return JSON.parse(text);
    } catch (_) {
        return null;
    }
}

function parseToolArguments(raw) {
    if (raw == null) return {};
    if (typeof raw === 'object') return raw;
    const parsed = parseJsonSafe(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
}

/**
 * Normalize a single sourceRef-like value from LLM output.
 * @param {unknown} raw
 * @returns {object|null}
 */
export function normalizeParsedSourceRef(raw) {
    if (raw == null) return null;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
        return { page: Math.trunc(raw) };
    }
    if (typeof raw === 'string') {
        const page = pageNumberFromCitationToken(raw);
        if (page != null) return { page };
        const text = raw.trim();
        return text ? { text } : null;
    }
    if (typeof raw !== 'object' || Array.isArray(raw)) return null;

    const pageRaw = raw.page ?? raw.pageNumber ?? raw.page_number;
    let page = null;
    if (pageRaw != null && pageRaw !== '') {
        const n = Number(pageRaw);
        if (Number.isFinite(n) && n > 0) page = Math.trunc(n);
    }
    if (page == null && (raw.label || raw.citation || raw.ref)) {
        page = pageNumberFromCitationToken(raw.label || raw.citation || raw.ref);
    }

    const paragraphId = firstNonEmpty(
        raw.paragraphId,
        raw.paragraph_id,
        raw.spanId,
        raw.span_id,
        raw.chunkId,
        raw.chunk_id,
    ) || null;

    const documentId = firstNonEmpty(
        raw.documentId,
        raw.document_id,
        raw.docId,
        raw.doc_id,
    ) || undefined;

    const text = firstNonEmpty(
        raw.text,
        raw.sourceText,
        raw.selectedText,
        raw.snippet,
        raw.quote,
    );

    const label = firstNonEmpty(raw.label) || undefined;

    if (page == null && !paragraphId && !text && !documentId) return null;

    const ref = {};
    if (documentId) ref.documentId = documentId;
    if (page != null) ref.page = page;
    if (paragraphId) ref.paragraphId = paragraphId;
    if (text) ref.text = text;
    if (label) ref.label = label;
    return ref;
}

/**
 * Pull page number from tokens like "p.1", "P 2", "page:3", "[p.4]".
 * @param {unknown} token
 * @returns {number|null}
 */
export function pageNumberFromCitationToken(token) {
    const s = String(token || '').trim();
    if (!s) return null;
    const m = s.match(/(?:^|[\[(\s])(?:p(?:age)?\.?\s*|p(?:age)?\s*:\s*)(\d{1,5})(?:\b|[\])])/i)
        || s.match(/^\[?\s*p(?:age)?\.?\s*(\d{1,5})\s*\]?$/i)
        || s.match(/^(\d{1,5})$/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/**
 * Extract page citations from markdown body: [p.1], [p. 2], [page 3], [P4].
 * Order is first-seen; pages are unique.
 * @param {string} text
 * @returns {Array<{ page: number }>}
 */
export function extractMarkdownPageSourceRefs(text = '') {
    const source = String(text || '');
    if (!source) return [];
    // Bracket form preferred by system prompt / model style: [p.1]
    const re = /\[\s*(?:p(?:age)?\.?\s*|p(?:age)?\s*:\s*)(\d{1,5})\s*\]/gi;
    const seen = new Set();
    const refs = [];
    let match;
    while ((match = re.exec(source)) !== null) {
        const page = Number(match[1]);
        if (!Number.isFinite(page) || page < 1) continue;
        const key = Math.trunc(page);
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push({ page: key });
    }
    return refs;
}

function sourceRefsFromParsedObject(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const raw = parsed.sourceRefs ?? parsed.source_refs;
    if (!Array.isArray(raw)) return null;
    return raw;
}

function normalizeSourceRefsList(rawList) {
    if (!Array.isArray(rawList)) return [];
    const out = [];
    const seen = new Set();
    for (const item of rawList) {
        const ref = normalizeParsedSourceRef(item);
        if (!ref) continue;
        const key = [
            ref.documentId || '',
            ref.page != null ? String(ref.page) : '',
            ref.paragraphId || '',
            (ref.text || '').slice(0, 80),
        ].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(ref);
        if (out.length >= 40) break;
    }
    return out;
}

/**
 * Try to parse a trailing bare JSON object that carries sourceRefs.
 * Returns { content, sourceRefs } or null if not found.
 */
function extractTrailingSourceRefsJson(text) {
    const source = String(text || '').trimEnd();
    if (!source.includes('{')) return null;

    // From each `{` near the end, try parsing the remainder as a full JSON object.
    for (let i = source.lastIndexOf('{'); i >= 0; i = source.lastIndexOf('{', i - 1)) {
        const tail = source.slice(i);
        const parsed = parseJsonSafe(tail);
        const rawList = sourceRefsFromParsedObject(parsed);
        if (!rawList) continue;
        return {
            content: source.slice(0, i).trim(),
            sourceRefs: normalizeSourceRefsList(rawList),
        };
    }
    return null;
}

/**
 * Strip optional ```json {"sourceRefs":...}``` (or bare trailing JSON) and
 * return markdown content + sourceRefs for agentResult.
 *
 * Fallback: when no JSON sourceRefs, parse markdown citations like [p.1].
 *
 * @param {string} [rawText]
 * @returns {{ content: string, sourceRefs: Array<object> }}
 */
export function extractFinalContentAndSourceRefs(rawText = '') {
    const text = String(rawText || '');
    if (!text.trim()) {
        return { content: '', sourceRefs: [] };
    }

    const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
    let content = text;
    let sourceRefs = [];
    let matchedJsonRefs = false;
    let match;
    const fences = [];
    while ((match = fenceRe.exec(text)) !== null) {
        fences.push({ full: match[0], body: match[1].trim() });
    }

    // Prefer the last fenced block that carries sourceRefs (models often append meta last).
    for (let i = fences.length - 1; i >= 0; i -= 1) {
        const fence = fences[i];
        const parsed = parseJsonSafe(fence.body);
        const rawList = sourceRefsFromParsedObject(parsed);
        if (!rawList) continue;
        sourceRefs = normalizeSourceRefsList(rawList);
        content = content.replace(fence.full, '').trim();
        matchedJsonRefs = true;
        break;
    }

    if (!matchedJsonRefs) {
        const trailing = extractTrailingSourceRefsJson(content);
        if (trailing) {
            content = trailing.content;
            sourceRefs = trailing.sourceRefs;
        }
    }

    // Markdown citation fallback when JSON did not yield refs.
    if (sourceRefs.length === 0) {
        const fromMd = extractMarkdownPageSourceRefs(content);
        if (fromMd.length > 0) {
            sourceRefs = fromMd;
        }
    }

    return {
        content: content.trim(),
        sourceRefs,
    };
}

function toolCallId(iteration, toolName, index = 0) {
    return `call_${iteration || 1}_${toolName || 'tool'}_${index}`;
}

/**
 * Rough token cost of a runtime trace (same heuristic as contextPacker).
 * @param {Array} trace
 * @returns {number}
 */
export function estimateTraceTokens(trace = []) {
    if (!Array.isArray(trace) || trace.length === 0) return 0;
    try {
        return estimateTokens(JSON.stringify(trace));
    } catch {
        return estimateTokens(String(trace));
    }
}

/**
 * Whether prior-trace compression should run for model messages.
 * Default: compress when compressTrace is true (default) and trace is large.
 *
 * @param {Array} trace
 * @param {{ compressTrace?: boolean, compressThresholdTokens?: number }} [options]
 * @returns {boolean}
 */
export function shouldCompressTraceForModel(trace = [], {
    compressTrace = true,
    compressThresholdTokens = DEFAULT_TRACE_COMPRESS_THRESHOLD_TOKENS,
} = {}) {
    if (compressTrace === false) return false;
    if (!Array.isArray(trace) || trace.length === 0) return false;
    const threshold = Math.max(1, Number(compressThresholdTokens) || DEFAULT_TRACE_COMPRESS_THRESHOLD_TOKENS);
    return estimateTraceTokens(trace) > threshold;
}

/**
 * Optionally compress a large runtime trace before formatting as chat messages.
 *
 * @param {Array} trace
 * @param {{
 *   compressTrace?: boolean,
 *   compressThresholdTokens?: number,
 *   compressMaxTokens?: number,
 * }} [options]
 * @returns {Array}
 */
export function prepareTraceForMessages(trace = [], {
    compressTrace = true,
    compressThresholdTokens = DEFAULT_TRACE_COMPRESS_THRESHOLD_TOKENS,
    compressMaxTokens = DEFAULT_TRACE_COMPRESS_MAX_TOKENS,
} = {}) {
    const list = Array.isArray(trace) ? trace : [];
    if (!shouldCompressTraceForModel(list, { compressTrace, compressThresholdTokens })) {
        return list;
    }
    const budget = Math.max(1, Number(compressMaxTokens) || DEFAULT_TRACE_COMPRESS_MAX_TOKENS);
    return compressTraceForModel(list, { maxTokens: budget });
}

/**
 * Last tool name from a runtime trace (most recent type === 'tool' entry).
 * @param {Array} [trace]
 * @returns {string}
 */
export function lastToolNameFromTrace(trace = []) {
    if (!Array.isArray(trace) || trace.length === 0) return '';
    for (let i = trace.length - 1; i >= 0; i -= 1) {
        const entry = trace[i];
        if (entry?.type === 'tool') {
            const name = String(entry.toolName || entry.name || '').trim();
            if (name) return name;
        }
    }
    return '';
}

/**
 * Resolve the Ch2 status-bar line for one model turn.
 * Prefer an explicit runtime `status` string when present; otherwise build from
 * iteration / maxIterations / goal / last tool in trace.
 *
 * @param {{
 *   status?: string,
 *   iteration?: number,
 *   maxIterations?: number,
 *   goal?: string,
 *   trace?: Array,
 * }} [args]
 * @returns {string}
 */
export function resolveStatusBarForModelTurn({
    status = '',
    iteration,
    maxIterations,
    goal = '',
    trace = [],
} = {}) {
    const provided = status == null ? '' : String(status).trim();
    if (provided) return provided;
    return buildStatusBar({
        iteration,
        maxIterations,
        goal,
        lastTool: lastToolNameFromTrace(trace),
    });
}

/**
 * Append a short user trailer with the current status bar (book Ch2).
 * No-op when the bar is empty.
 *
 * @param {Array} messages
 * @param {string} statusBar
 * @returns {Array}
 */
export function appendStatusBarMessage(messages = [], statusBar = '') {
    const bar = String(statusBar || '').trim();
    if (!bar) return Array.isArray(messages) ? messages : [];
    const list = Array.isArray(messages) ? messages : [];
    return [...list, { role: 'user', content: `Status: ${bar}` }];
}

/**
 * Rebuild OpenAI chat messages from the agent loop trace.
 * When compressTrace is true (default) and the prior trace is large, older /
 * bulky tool results are summarized via compressTraceForModel first.
 * Appends a Ch2 status-bar user trailer from runtime status or buildStatusBar.
 */
export function buildMessagesFromTrace({
    goal = '',
    context = null,
    trace = [],
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    compressTrace = true,
    compressThresholdTokens = DEFAULT_TRACE_COMPRESS_THRESHOLD_TOKENS,
    compressMaxTokens = DEFAULT_TRACE_COMPRESS_MAX_TOKENS,
    status = '',
    iteration,
    maxIterations,
    includeStatusBar = true,
} = {}) {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }

    const userParts = [`Goal: ${goal || ''}`.trim()];
    if (context?.prompt) {
        userParts.push('', 'Context:', String(context.prompt));
    } else if (context && typeof context === 'object') {
        const packed = {
            chunks: Array.isArray(context.chunks)
                ? context.chunks.slice(0, 6).map((chunk) => ({
                    page: chunk.page || null,
                    paragraphId: chunk.paragraphId || chunk.id || null,
                    text: String(chunk.text || '').slice(0, 600),
                }))
                : undefined,
            document: context.document || context.metadata || undefined,
        };
        userParts.push('', 'Context JSON:', JSON.stringify(packed));
    }
    messages.push({ role: 'user', content: userParts.join('\n') });

    const list = prepareTraceForMessages(trace, {
        compressTrace,
        compressThresholdTokens,
        compressMaxTokens,
    });
    /** @type {Map<number|string, number>} next tool result index per iteration */
    const toolResultIndexByIteration = new Map();

    for (const entry of list) {
        if (entry?.type === 'model' && entry.response?.type === 'tool_call') {
            const multi = entry.response.toolCalls || entry.response.tool_calls;
            let openaiToolCalls;
            if (Array.isArray(multi) && multi.length > 0) {
                openaiToolCalls = multi.map((item, index) => {
                    const toolName = item.toolName || item.name || '';
                    const args = item.args || {};
                    return {
                        id: toolCallId(entry.iteration, toolName, index),
                        type: 'function',
                        function: {
                            name: toolName,
                            arguments: JSON.stringify(args),
                        },
                    };
                });
            } else {
                const toolName = entry.response.toolName || entry.response.name;
                const args = entry.response.args || {};
                openaiToolCalls = [{
                    id: toolCallId(entry.iteration, toolName, 0),
                    type: 'function',
                    function: {
                        name: toolName,
                        arguments: JSON.stringify(args),
                    },
                }];
            }
            messages.push({
                role: 'assistant',
                content: null,
                tool_calls: openaiToolCalls,
            });
        } else if (entry?.type === 'tool') {
            const iterKey = entry.iteration ?? 0;
            const index = toolResultIndexByIteration.get(iterKey) || 0;
            toolResultIndexByIteration.set(iterKey, index + 1);
            const id = toolCallId(entry.iteration, entry.toolName, index);
            messages.push({
                role: 'tool',
                tool_call_id: id,
                content: JSON.stringify(entry.result ?? null),
            });
        } else if (entry?.type === 'model' && entry.response?.type === 'final') {
            messages.push({
                role: 'assistant',
                content: String(entry.response.content || ''),
            });
        }
    }

    if (includeStatusBar === false) {
        return messages;
    }

    const statusBar = resolveStatusBarForModelTurn({
        status,
        iteration,
        maxIterations,
        goal,
        trace,
    });
    return appendStatusBarMessage(messages, statusBar);
}

function messageFromChoice(data) {
    return data?.choices?.[0]?.message || data?.choices?.[0]?.delta || {};
}

/**
 * Map OpenAI chat message → agent model response.
 * - 1 tool_call → legacy single shape `{ type, toolName, args }` (runtime accepts both)
 * - 2+ tool_calls → `{ type, toolCalls: [{ toolName, args }, ...] }`
 */
function mapOpenAIMessageToAgentResponse(message = {}) {
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (toolCalls.length > 0) {
        const mapped = toolCalls.map((tc) => ({
            toolName: tc?.function?.name || tc?.name || '',
            args: parseToolArguments(tc?.function?.arguments ?? tc?.arguments),
        }));
        if (mapped.length === 1) {
            return {
                type: 'tool_call',
                toolName: mapped[0].toolName,
                args: mapped[0].args,
            };
        }
        return {
            type: 'tool_call',
            toolCalls: mapped,
        };
    }

    const rawContent = typeof message.content === 'string'
        ? message.content
        : Array.isArray(message.content)
            ? message.content.map((part) => (
                typeof part === 'string' ? part : part?.text || ''
            )).join('')
            : '';

    const { content, sourceRefs } = extractFinalContentAndSourceRefs(rawContent);
    // Prefer extracted content even when empty (e.g. final was only a sourceRefs JSON block).
    // Falling back to rawContent would re-inject stripped fences / trailing JSON.
    const result = {
        type: 'final',
        content: typeof content === 'string' ? content : (rawContent || ''),
    };
    if (sourceRefs.length > 0) {
        result.sourceRefs = sourceRefs;
    }
    return result;
}

async function readErrorBody(response) {
    try {
        const data = await response.json();
        return data?.error?.message || data?.message || JSON.stringify(data);
    } catch (_) {
        try {
            return await response.text();
        } catch (__) {
            return response.statusText || '';
        }
    }
}

/**
 * Append optional lessons block (Ch8 experience) onto a system prompt.
 */
export function appendLessonsToSystemPrompt(systemPrompt = '', lessonsPrompt = '') {
    const base = String(systemPrompt || '').trimEnd();
    const lessons = String(lessonsPrompt || '').trim();
    if (!lessons) return base || DEFAULT_SYSTEM_PROMPT;
    if (!base) return lessons;
    return `${base}\n\n${lessons}`;
}

/**
 * @param {object} config
 * @param {string} [config.baseUrl]
 * @param {string} [config.apiKey]
 * @param {string} [config.model]
 * @param {string} [config.systemPrompt]
 * @param {string} [config.lessonsPrompt] optional lessons from experience store
 * @param {object} [config.tools] reading-agent tool registry
 * @param {string} [config.authType] bearer | api-key
 * @param {number} [config.temperature]
 * @param {boolean} [config.compressTrace=true] compress large prior traces before chat formatting
 * @param {number} [config.compressThresholdTokens] when to compress (default 1500)
 * @param {number} [config.compressMaxTokens] compression budget (default 1500)
 * @param {typeof fetch} [config.fetch]
 * @param {AbortSignal} [config.abortSignal] optional closed-over signal for every request
 * @param {AbortSignal} [config.signal] alias for abortSignal
 * @returns {function} model({ goal, context, iteration, maxIterations, status, trace, tools, abortSignal })
 *   Each turn appends a Ch2 status-bar user trailer (runtime `status` or buildStatusBar).
 */
export function createOpenAICompatibleAgentModel(config = {}) {
    const resolved = resolveAgentLlmConfig(config) || {};
    const baseUrl = firstNonEmpty(config.baseUrl, config.baseURL, resolved.baseUrl);
    const apiKey = firstNonEmpty(config.apiKey, resolved.apiKey);
    const model = firstNonEmpty(config.model, config.modelName, config.name, resolved.model, DEFAULT_GROK_MODEL);
    const systemPrompt = appendLessonsToSystemPrompt(
        config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        config.lessonsPrompt,
    );
    const authType = config.authType || 'bearer';
    const temperature = typeof config.temperature === 'number' ? config.temperature : 0.2;
    const maxTokens = config.maxTokens;
    // Default true: compressTraceForModel runs only when prior trace exceeds threshold.
    const compressTrace = config.compressTrace !== false;
    const compressThresholdTokens = Number.isFinite(Number(config.compressThresholdTokens))
        ? Number(config.compressThresholdTokens)
        : DEFAULT_TRACE_COMPRESS_THRESHOLD_TOKENS;
    const compressMaxTokens = Number.isFinite(Number(config.compressMaxTokens))
        ? Number(config.compressMaxTokens)
        : DEFAULT_TRACE_COMPRESS_MAX_TOKENS;
    const fetchImpl = config.fetch || config.fetchImpl || globalThis.fetch?.bind(globalThis);
    const staticTools = config.tools && typeof config.tools === 'object' ? config.tools : null;
    const staticToolDefs = staticTools ? buildOpenAIToolDefinitions(staticTools) : null;
    const closedOverSignal = config.abortSignal || config.signal || null;

    if (!baseUrl) {
        throw new Error('createOpenAICompatibleAgentModel requires baseUrl');
    }
    if (typeof fetchImpl !== 'function') {
        throw new Error('createOpenAICompatibleAgentModel requires fetch');
    }

    const endpoint = formatOpenAIChatCompletionsUrl(baseUrl);

    return async ({
        goal,
        context,
        iteration,
        maxIterations,
        status,
        trace,
        tools: inputTools,
        abortSignal: inputAbortSignal,
        signal: inputSignal,
    } = {}) => {
        const messages = buildMessagesFromTrace({
            goal,
            context,
            trace,
            systemPrompt,
            compressTrace,
            compressThresholdTokens,
            compressMaxTokens,
            status,
            iteration,
            maxIterations,
        });

        const toolDefs = staticToolDefs
            || (inputTools ? buildOpenAIToolDefinitions(inputTools) : []);

        const body = {
            model,
            messages,
            temperature,
            stream: false,
        };

        if (toolDefs.length > 0) {
            body.tools = toolDefs;
            body.tool_choice = 'auto';
        }

        if (Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0) {
            body.max_tokens = Number(maxTokens);
        }

        const headers = {
            'Content-Type': 'application/json',
        };
        if (apiKey) {
            if (authType === 'api-key') {
                headers['api-key'] = apiKey;
            } else {
                headers.Authorization = `Bearer ${apiKey}`;
            }
        }

        const abortSignal = inputAbortSignal || inputSignal || closedOverSignal || null;
        const fetchInit = {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        };
        if (abortSignal) {
            fetchInit.signal = abortSignal;
        }

        const response = await fetchImpl(resolveAiEndpointForRuntime(endpoint), fetchInit);

        if (!response.ok) {
            const errText = await readErrorBody(response);
            throw new Error(
                `Agent LLM request failed: ${response.status}${errText ? ` - ${String(errText).slice(0, 400)}` : ''}`
            );
        }

        const data = await response.json();
        return mapOpenAIMessageToAgentResponse(messageFromChoice(data));
    };
}
