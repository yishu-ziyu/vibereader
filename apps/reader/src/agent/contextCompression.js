import { estimateTokens } from './contextPacker';

export { estimateTokens };

const DEFAULT_TRACE_MAX_TOKENS = 1500;
const SMALL_TOOL_RESULT_CHARS = 800;
const SNIPPET_CHARS = 160;

/** Priority for packed context chunks (lower = drop first). */
const CHUNK_DROP_PRIORITY = Object.freeze({
    body: 0,
    annotation: 1,
    outline: 2,
    metadata: 10,
    selection: 11,
    goal: 12,
});

function safeJsonSnippet(value, maxChars = SNIPPET_CHARS) {
    let raw;
    try {
        raw = typeof value === 'string' ? value : JSON.stringify(value);
    } catch {
        raw = String(value);
    }
    raw = String(raw || '');
    if (raw.length <= maxChars) return raw;
    return `${raw.slice(0, maxChars)}…`;
}

function objectKeys(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    return Object.keys(value).slice(0, 20);
}

function toolResultStatus(result) {
    if (result == null) return 'empty';
    if (typeof result !== 'object') return 'ok';
    if (result.error || result.ok === false || result.status === 'error') return 'error';
    if (result.status) return String(result.status);
    return 'ok';
}

function summarizeToolResult(step) {
    const result = step.result;
    return Object.freeze({
        type: 'tool',
        iteration: step.iteration,
        toolName: step.toolName,
        args: step.args,
        result: Object.freeze({
            toolName: step.toolName || 'unknown',
            status: toolResultStatus(result),
            keys: Object.freeze(objectKeys(result)),
            snippet: safeJsonSnippet(result),
        }),
        compressed: true,
    });
}

function isSmallToolResult(result) {
    if (result == null) return true;
    try {
        const raw = typeof result === 'string' ? result : JSON.stringify(result);
        return String(raw || '').length <= SMALL_TOOL_RESULT_CHARS;
    } catch {
        return true;
    }
}

function stepTokenCost(step) {
    try {
        return estimateTokens(JSON.stringify(step));
    } catch {
        return estimateTokens(String(step));
    }
}

/**
 * Compress a runtime trace for model context:
 * - keep latest tool results fully when small
 * - summarize older tool results to { toolName, status, keys, snippet }
 * - always keep the last 2 model steps intact
 */
export function compressTraceForModel(trace = [], { maxTokens = DEFAULT_TRACE_MAX_TOKENS } = {}) {
    if (!Array.isArray(trace) || trace.length === 0) {
        return Object.freeze([]);
    }

    const budget = Math.max(1, Number(maxTokens) || DEFAULT_TRACE_MAX_TOKENS);
    const modelIndexes = [];
    for (let i = 0; i < trace.length; i += 1) {
        if (trace[i]?.type === 'model' || trace[i]?.response) {
            modelIndexes.push(i);
        }
    }
    const keepModelSet = new Set(modelIndexes.slice(-2));

    // Latest tool region = contiguous tool steps ending at the last tool
    // (ignore trailing model steps such as a final answer).
    let lastToolIndex = -1;
    for (let i = trace.length - 1; i >= 0; i -= 1) {
        if (trace[i]?.type === 'tool' || trace[i]?.toolName) {
            lastToolIndex = i;
            break;
        }
    }
    let latestToolStart = lastToolIndex;
    if (lastToolIndex >= 0) {
        for (let i = lastToolIndex - 1; i >= 0; i -= 1) {
            if (trace[i]?.type === 'tool' || trace[i]?.toolName) {
                latestToolStart = i;
            } else {
                break;
            }
        }
    }

    const withToolPolicy = trace.map((step, index) => {
        if (!step || typeof step !== 'object') return step;
        if (!(step.type === 'tool' || step.toolName)) return step;

        const isLatest = lastToolIndex >= 0
            && index >= latestToolStart
            && index <= lastToolIndex;
        if (isLatest && isSmallToolResult(step.result)) {
            return step;
        }
        // Large latest result, or any older tool: summarize to compact shape.
        return summarizeToolResult(step);
    });

    // Always preserve last 2 model steps unsummarized; drop older non-protected steps if needed.
    let working = withToolPolicy;
    let total = working.reduce((sum, step) => sum + stepTokenCost(step), 0);
    if (total <= budget) {
        return Object.freeze(working.map((step) => (
            step && typeof step === 'object' ? Object.freeze({ ...step }) : step
        )));
    }

    // Drop from the front, never dropping the last 2 model steps.
    const droppable = [];
    for (let i = 0; i < working.length; i += 1) {
        if (!keepModelSet.has(i)) droppable.push(i);
    }

    const removed = new Set();
    for (const index of droppable) {
        if (total <= budget) break;
        const cost = stepTokenCost(working[index]);
        removed.add(index);
        total -= cost;
    }

    working = working.filter((_, index) => !removed.has(index));
    total = working.reduce((sum, step) => sum + stepTokenCost(step), 0);

    // If still over budget, further compress remaining tool steps (already summarized).
    if (total > budget) {
        working = working.map((step) => {
            if (step?.type === 'model' || step?.response) return step;
            if (step?.compressed) return step;
            if (step?.type === 'tool' || step?.toolName) return summarizeToolResult(step);
            return step;
        });
    }

    return Object.freeze(working.map((step) => (
        step && typeof step === 'object' ? Object.freeze({ ...step }) : step
    )));
}

function chunkPriority(chunk) {
    const type = chunk?.type || 'body';
    if (CHUNK_DROP_PRIORITY[type] != null) return CHUNK_DROP_PRIORITY[type];
    return 0;
}

function packedTokenTotal(chunks) {
    return chunks.reduce((sum, chunk) => {
        if (chunk?.tokenEstimate != null) return sum + chunk.tokenEstimate;
        return sum + estimateTokens(`${chunk?.label || ''}\n${chunk?.text || ''}`);
    }, 0);
}

/**
 * Drop lowest-priority chunks from a packed context until under maxTokens.
 * goal / metadata / selection are highest priority (kept longest).
 */
export function compressPackedContext(packed = {}, { maxTokens } = {}) {
    if (!packed || !Array.isArray(packed.chunks)) {
        return packed;
    }

    const budget = Math.max(1, Number(maxTokens ?? packed.maxTokens) || DEFAULT_TRACE_MAX_TOKENS);
    let chunks = [...packed.chunks];
    let estimatedTokens = packedTokenTotal(chunks);

    if (estimatedTokens <= budget) {
        return Object.freeze({
            ...packed,
            chunks: Object.freeze(chunks),
            estimatedTokens,
            maxTokens: budget,
            truncated: Boolean(packed.truncated),
        });
    }

    // Sort drop order: lowest priority first; within same priority, drop later chunks first (body tails).
    const indexes = chunks.map((_, index) => index);
    indexes.sort((a, b) => {
        const pa = chunkPriority(chunks[a]);
        const pb = chunkPriority(chunks[b]);
        if (pa !== pb) return pa - pb;
        return b - a;
    });

    const remove = new Set();
    for (const index of indexes) {
        if (estimatedTokens <= budget) break;
        const chunk = chunks[index];
        const cost = chunk?.tokenEstimate != null
            ? chunk.tokenEstimate
            : estimateTokens(`${chunk?.label || ''}\n${chunk?.text || ''}`);
        remove.add(index);
        estimatedTokens -= cost;
    }

    chunks = chunks.filter((_, index) => !remove.has(index));
    estimatedTokens = packedTokenTotal(chunks);

    const prompt = chunks
        .map((chunk) => `${chunk.label || ''}\n${chunk.text || ''}`.trim())
        .filter(Boolean)
        .join('\n\n');

    return Object.freeze({
        ...packed,
        chunks: Object.freeze(chunks),
        prompt,
        estimatedTokens,
        maxTokens: budget,
        truncated: true,
    });
}
