/**
 * Lightweight OTel-style span tree export for reading-agent runs.
 * Pure transform of run result / trace - no OTel SDK dependency.
 *
 * Span names:
 * - agent.run (root)
 * - llm.iteration (per model call)
 * - tool.call (generic tools)
 * - retrieval (knowledge_search / memory_search / search_document)
 */

const RETRIEVAL_TOOLS = new Set([
    'knowledge_search',
    'memory_search',
    'search_document',
]);

export function isRetrievalTool(toolName) {
    return RETRIEVAL_TOOLS.has(String(toolName || '').trim());
}

/**
 * Map tool result payload to ok|error (mirrors trajectory summarizeToolStep).
 */
export function toolStatusFromResult(result) {
    if (result && typeof result === 'object') {
        if (result.error || result.status === 'error' || result.ok === false) {
            return 'error';
        }
        if (result.status === 'unavailable' || result.status === 'failed') {
            return 'error';
        }
    }
    return 'ok';
}

function durationFromStep(step = {}) {
    const candidates = [
        step.durationMs,
        step.elapsedMs,
        step.duration,
        step.result?.durationMs,
        step.result?.elapsedMs,
    ];
    for (const value of candidates) {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) return n;
    }
    return undefined;
}

function makeSpanId(prefix, index) {
    return `${prefix}.${index}`;
}

function freezeSpan(span) {
    if (Array.isArray(span.children)) {
        span.children = Object.freeze(span.children.map((child) => freezeSpan({ ...child })));
    } else {
        span.children = Object.freeze([]);
    }
    if (span.attributes && typeof span.attributes === 'object') {
        span.attributes = Object.freeze({ ...span.attributes });
    }
    return Object.freeze(span);
}

/**
 * Resolve a run-like object: direct agent result or taskRunner wrapper.
 */
function resolveRunPayload(input) {
    if (!input || typeof input !== 'object') return null;

    if (Array.isArray(input.trace)) {
        return {
            status: input.status || 'unknown',
            error: input.error || '',
            iterations: input.iterations,
            content: input.content,
            trace: input.trace,
            goal: input.goal,
            metrics: input.metrics || null,
        };
    }

    const nested = input.agentResult;
    if (nested && typeof nested === 'object') {
        return {
            status: nested.status || input.status || 'unknown',
            error: nested.error || input.errorMessage || input.error || '',
            iterations: nested.iterations,
            content: nested.content,
            trace: Array.isArray(nested.trace) ? nested.trace : [],
            goal: nested.goal || input.goal,
            metrics: nested.metrics || input.metrics || null,
        };
    }

    return {
        status: input.status || 'unknown',
        error: input.error || input.errorMessage || '',
        iterations: input.iterations,
        content: input.content,
        trace: [],
        goal: input.goal,
        metrics: input.metrics || null,
    };
}

function rootStatus(runStatus, error) {
    if (error) return 'error';
    if (!runStatus || runStatus === 'completed' || runStatus === 'succeeded') return 'ok';
    if (runStatus === 'invalid' || runStatus === 'unknown') return 'error';
    // max_iterations, timeout, permission_denied, tool_not_found, etc.
    return 'error';
}

function buildLlmSpan(step, spanId, index) {
    const response = step.response || {};
    const responseType = response.type || 'unknown';
    const iteration = Number.isFinite(Number(step.iteration))
        ? Number(step.iteration)
        : index + 1;
    const attributes = {
        'llm.iteration': iteration,
        'llm.response_type': responseType,
    };
    if (responseType === 'tool_call') {
        const multi = response.toolCalls || response.tool_calls;
        if (Array.isArray(multi) && multi.length > 0) {
            attributes['llm.tool_names'] = multi
                .map((item) => item.toolName || item.name || 'tool')
                .join(',');
        } else {
            attributes['llm.tool_name'] = response.toolName || response.name || 'tool';
        }
    }
    const durationMs = durationFromStep(step);
    return {
        name: 'llm.iteration',
        spanId,
        status: 'ok',
        attributes,
        ...(durationMs !== undefined ? { durationMs } : {}),
        children: [],
    };
}

function buildToolOrRetrievalSpan(step, spanId, index) {
    const toolName = String(step.toolName || 'unknown');
    const status = toolStatusFromResult(step.result);
    const iteration = Number.isFinite(Number(step.iteration))
        ? Number(step.iteration)
        : undefined;
    const retrieval = isRetrievalTool(toolName);
    const attributes = retrieval
        ? {
            'retrieval.tool': toolName,
            'tool.name': toolName,
            'tool.status': status,
        }
        : {
            'tool.name': toolName,
            'tool.status': status,
        };
    if (iteration != null) {
        attributes['tool.iteration'] = iteration;
    }
    if (step.result && typeof step.result === 'object') {
        if (typeof step.result.matchCount === 'number') {
            attributes['retrieval.match_count'] = step.result.matchCount;
        } else if (Array.isArray(step.result.matches)) {
            attributes['retrieval.match_count'] = step.result.matches.length;
        } else if (Array.isArray(step.result.results)) {
            attributes['retrieval.match_count'] = step.result.results.length;
        } else if (Array.isArray(step.result.memories)) {
            attributes['retrieval.match_count'] = step.result.memories.length;
        }
        if (step.result.status != null && step.result.status !== '') {
            attributes['tool.result_status'] = String(step.result.status);
        }
    }
    const durationMs = durationFromStep(step);
    return {
        name: retrieval ? 'retrieval' : 'tool.call',
        spanId,
        status,
        attributes,
        ...(durationMs !== undefined ? { durationMs } : {}),
        children: [],
    };
}

/**
 * Convert an agent run result (or taskRunner wrapper) into a root span tree.
 *
 * @param {object|null|undefined} result Agent result with `trace`, or task wrapper with `agentResult`.
 * @param {{ goal?: string }} [options]
 * @returns {object|null} Frozen root span, or null when input is missing.
 */
export function exportAgentSpans(result, options = {}) {
    const run = resolveRunPayload(result);
    if (!run) return null;

    const goal = String(options.goal ?? run.goal ?? '').trim();
    const iterations = Number.isFinite(Number(run.iterations))
        ? Number(run.iterations)
        : 0;
    const status = rootStatus(run.status, run.error);
    const attributes = {
        'agent.status': String(run.status || 'unknown'),
        'agent.iterations': iterations,
    };
    if (goal) attributes['agent.goal'] = goal.slice(0, 200);
    if (run.error) attributes['agent.error'] = String(run.error).slice(0, 300);
    if (run.metrics && typeof run.metrics === 'object') {
        if (Number.isFinite(Number(run.metrics.wallMs))) {
            attributes['agent.wall_ms'] = Number(run.metrics.wallMs);
        }
        if (Number.isFinite(Number(run.metrics.llmCallCount))) {
            attributes['agent.llm_call_count'] = Number(run.metrics.llmCallCount);
        }
        if (Number.isFinite(Number(run.metrics.toolCallCount))) {
            attributes['agent.tool_call_count'] = Number(run.metrics.toolCallCount);
        }
    }

    const root = {
        name: 'agent.run',
        spanId: '1',
        status,
        attributes,
        ...(run.metrics && Number.isFinite(Number(run.metrics.wallMs))
            ? { durationMs: Number(run.metrics.wallMs) }
            : {}),
        children: [],
    };

    const trace = Array.isArray(run.trace) ? run.trace : [];
    /** @type {Map<number, object>} latest llm span per iteration */
    const llmByIteration = new Map();
    let llmCounter = 0;
    let toolCounter = 0;
    let lastLlm = null;

    for (let i = 0; i < trace.length; i += 1) {
        const step = trace[i];
        if (!step || typeof step !== 'object') continue;

        if (step.type === 'model' || step.response) {
            llmCounter += 1;
            const span = buildLlmSpan(step, makeSpanId('1', llmCounter), i);
            root.children.push(span);
            lastLlm = span;
            const iter = span.attributes['llm.iteration'];
            if (Number.isFinite(iter)) llmByIteration.set(iter, span);
            continue;
        }

        if (step.type === 'tool' || step.toolName) {
            toolCounter += 1;
            const span = buildToolOrRetrievalSpan(
                step,
                makeSpanId(lastLlm ? lastLlm.spanId : '1', toolCounter),
                i,
            );
            const iter = Number(step.iteration);
            const parent = (Number.isFinite(iter) && llmByIteration.get(iter))
                || lastLlm
                || root;
            // Re-id under actual parent for clearer trees.
            span.spanId = makeSpanId(parent.spanId, parent.children.length + 1);
            parent.children.push(span);
        }
    }

    return freezeSpan(root);
}

/**
 * JSON-serialize a span tree (or any exportAgentSpans output).
 * @param {object|null} spans
 * @param {number} [space=0] JSON.stringify space
 * @returns {string}
 */
export function serializeAgentSpans(spans, space = 0) {
    if (spans == null) return 'null';
    const n = Number(space);
    return JSON.stringify(spans, null, Number.isFinite(n) && n > 0 ? n : undefined);
}

/**
 * Convenience: export + serialize in one call.
 * @param {object|null|undefined} result
 * @param {{ goal?: string, space?: number }} [options]
 * @returns {string}
 */
export function exportAgentSpansJson(result, options = {}) {
    return serializeAgentSpans(exportAgentSpans(result, options), options.space);
}
