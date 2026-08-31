import { packDocumentContext } from './contextPacker';
import { applyGroundingGateToResult } from './groundingGate';
import { buildStatusBar } from './observation';
import {
    DEFAULT_READING_PERMISSIONS,
    assertToolAllowed,
} from './permissions';
import { exportAgentSpans } from './spanExport';
import { summarizeTrace } from './trajectory';

const DEFAULT_MAX_ITERATIONS = 4;
const DEFAULT_TIMEOUT_MS = 30000;

/** Recommended defaults for LLM-backed agent runs (does not change harness defaults used by tests). */
export const LLM_AGENT_DEFAULTS = Object.freeze({
    maxIterations: 8,
    timeoutMs: 120000,
});

function normalizeIterations(maxIterations) {
    const value = Number(maxIterations || DEFAULT_MAX_ITERATIONS);
    if (!Number.isInteger(value) || value < 1) return DEFAULT_MAX_ITERATIONS;
    return value;
}

function normalizeTimeout(timeoutMs) {
    const value = Number(timeoutMs || DEFAULT_TIMEOUT_MS);
    if (!Number.isFinite(value) || value < 1) return DEFAULT_TIMEOUT_MS;
    return value;
}

function createModelTrace(response, iteration) {
    return Object.freeze({
        type: 'model',
        iteration,
        response,
    });
}

function createToolTrace(toolName, args, result, iteration, durationMs) {
    const entry = {
        type: 'tool',
        iteration,
        toolName,
        args,
        result,
    };
    if (Number.isFinite(durationMs)) {
        entry.durationMs = Math.max(0, durationMs);
    }
    return Object.freeze(entry);
}

/**
 * Per-run cost/latency counters (P1 gap 6.7).
 * Always attached on agent results as `metrics` for product/eval.
 */
function createRunMetrics() {
    const startedAt = Date.now();
    let llmCallCount = 0;
    let toolCallCount = 0;
    const toolDurations = [];

    return {
        markLlmCall() {
            llmCallCount += 1;
        },
        /**
         * @returns {number} start timestamp (Date.now)
         */
        beginTool() {
            return Date.now();
        },
        /**
         * @param {string} toolName
         * @param {number} iteration
         * @param {number} toolStartedAt
         * @returns {number} durationMs
         */
        endTool(toolName, iteration, toolStartedAt) {
            const durationMs = Math.max(0, Date.now() - Number(toolStartedAt || Date.now()));
            toolCallCount += 1;
            toolDurations.push(Object.freeze({
                toolName: String(toolName || ''),
                durationMs,
                iteration: Number.isFinite(Number(iteration)) ? Number(iteration) : 0,
            }));
            return durationMs;
        },
        /**
         * @param {number} [iterations]
         */
        snapshot(iterations) {
            const iter = Number.isFinite(Number(iterations)) ? Number(iterations) : 0;
            return Object.freeze({
                wallMs: Math.max(0, Date.now() - startedAt),
                iterations: iter,
                toolCallCount,
                llmCallCount,
                toolDurations: Object.freeze(toolDurations.slice()),
            });
        },
    };
}

function attachMetrics(result, metrics) {
    if (!result || typeof result !== 'object' || !metrics) return result;
    return Object.freeze({
        ...result,
        metrics: metrics.snapshot(result.iterations),
    });
}

function finalResult(response, trace, iterations) {
    const sourceRefs = Array.isArray(response.sourceRefs) ? response.sourceRefs : [];
    return Object.freeze({
        status: 'completed',
        content: response.content || '',
        artifact: response.artifact || null,
        artifacts: Object.freeze([...(response.artifacts || [])]),
        sourceRefs: Object.freeze(sourceRefs.map((sourceRef) => Object.freeze({ ...sourceRef }))),
        trace: Object.freeze(trace),
        iterations,
    });
}

function limitResult(status, trace, iterations, error = '') {
    return Object.freeze({
        status,
        trace: Object.freeze(trace),
        iterations,
        error,
    });
}

function lastToolFromTrace(trace = []) {
    if (!Array.isArray(trace)) return '';
    for (let i = trace.length - 1; i >= 0; i -= 1) {
        const step = trace[i];
        if (step?.type === 'tool' && step?.toolName) return String(step.toolName);
        if (step?.toolName) return String(step.toolName);
    }
    return '';
}

/**
 * Light observability payload for product/eval (opt-in via includeObservability).
 * Attaches compact steps (summarizeTrace), iterations, and last statusBar.
 * Default off so harness/tests stay free of extra payload.
 *
 * Optional `exportSpans: true` attaches a lightweight OTel-style span tree
 * (see spanExport.js). Pure/cheap; still opt-in so default result shape is stable.
 */
function withObservability(result, options = {}) {
    if (!result) return result;

    let next = result;

    if (options.includeObservability === true) {
        const trace = Array.isArray(next.trace) ? next.trace : [];
        const iterations = Number.isFinite(Number(next.iterations))
            ? Number(next.iterations)
            : 0;
        const maxIterations = normalizeIterations(options.maxIterations);
        const statusBar = buildStatusBar({
            iteration: iterations,
            maxIterations,
            goal: options.goal || '',
            lastTool: lastToolFromTrace(trace),
        });

        next = Object.freeze({
            ...next,
            observability: Object.freeze({
                steps: summarizeTrace(trace),
                iterations,
                statusBar,
            }),
        });
    }

    if (options.exportSpans === true) {
        const spans = exportAgentSpans(next, { goal: options.goal || '' });
        if (spans) {
            next = Object.freeze({
                ...next,
                spans,
            });
        }
    }

    return next;
}

/**
 * Normalize model response into a list of tool calls.
 * Supports:
 * - `{ type:'tool_call', toolName, args }`
 * - `{ type:'tool_call', toolCalls: [{ toolName, args }, ...] }`
 * - `{ type:'tool_call', tool_calls: [...] }` (snake_case)
 * - `{ type:'tool_call', toolCalls }` with items using `name` instead of `toolName`
 */
function toolCallsFromResponse(response = {}) {
    if (response.type !== 'tool_call') return null;

    const multi = response.toolCalls || response.tool_calls;
    if (Array.isArray(multi) && multi.length > 0) {
        return multi.map((item) => Object.freeze({
            toolName: item.toolName || item.name,
            args: Object.freeze({ ...(item.args || {}) }),
        }));
    }

    const toolName = response.toolName || response.name;
    if (!toolName) return [];

    return [
        Object.freeze({
            toolName,
            args: Object.freeze({ ...(response.args || {}) }),
        }),
    ];
}

function buildPackedContext(goal, context, contextOptions) {
    if (!context) return null;
    if (context.prompt && Array.isArray(context.chunks)) return context;
    return packDocumentContext({ goal, ...context }, contextOptions);
}

function eventSummary(event = {}) {
    if (event.summary) return String(event.summary);
    if (event.type === 'model') {
        const responseType = event.response?.type || 'unknown';
        if (responseType === 'tool_call') {
            const multi = event.response.toolCalls || event.response.tool_calls;
            if (Array.isArray(multi) && multi.length > 0) {
                const names = multi.map((item) => item.toolName || item.name || 'tool').join(', ');
                return `model #${event.iteration ?? '?'}: tool_call [${names}]`;
            }
            const toolName = event.response.toolName || event.response.name || 'tool';
            return `model #${event.iteration ?? '?'}: tool_call ${toolName}`;
        }
        if (responseType === 'final') {
            const snippet = String(event.response.content || '').trim().slice(0, 80);
            return `model #${event.iteration ?? '?'}: final${snippet ? ` - ${snippet}` : ''}`;
        }
        return `model #${event.iteration ?? '?'}: ${responseType}`;
    }
    if (event.type === 'tool') {
        return `tool #${event.iteration ?? '?'}: ${event.toolName || 'unknown'}`;
    }
    if (event.type === 'final') {
        const snippet = String(event.content || '').trim().slice(0, 80);
        return `final${snippet ? ` - ${snippet}` : ''}`;
    }
    if (event.type === 'error') {
        return `error: ${event.status || ''}${event.error ? ` - ${event.error}` : ''}`.trim();
    }
    return String(event.type || 'event');
}

function emit(onEvent, trajectoryRecorder, event) {
    const payload = Object.freeze({
        ...event,
        summary: eventSummary(event),
    });
    try {
        onEvent?.(payload);
    } catch {
        // Listener failures must not break the agent loop.
    }
    try {
        trajectoryRecorder?.append?.(payload);
    } catch {
        // Recorder failures must not break the agent loop.
    }
}

function shortStatus(trace, iteration, maxIterations) {
    const last = trace[trace.length - 1];
    if (!last) return `start iteration=${iteration}/${maxIterations}`;
    if (last.type === 'tool') {
        return `after tool=${last.toolName} iteration=${iteration}/${maxIterations}`;
    }
    return `iteration=${iteration}/${maxIterations}`;
}

/**
 * Invoke tool.run(args) or tool.run(args, { signal }) when the tool accepts a signal.
 * Tools with run.length >= 2 or acceptsAbortSignal get the second arg.
 */
function invokeToolRun(tool, args, abortSignal) {
    const run = tool.run;
    const acceptsSignal = Boolean(tool.acceptsAbortSignal) || run.length >= 2;
    if (acceptsSignal && abortSignal) {
        return run(args, { signal: abortSignal, abortSignal });
    }
    return run(args);
}

function isAbortError(error) {
    if (!error) return false;
    if (error.name === 'AbortError') return true;
    const message = String(error.message || error || '').toLowerCase();
    return message.includes('aborted') || message.includes('abort');
}

async function runLoop(options) {
    const {
        goal = '',
        model,
        tools = {},
        permissions = DEFAULT_READING_PERMISSIONS,
        context = null,
        contextOptions = {},
        onEvent = null,
        trajectoryRecorder = null,
        abortSignal = null,
        metrics = null,
    } = options;
    const maxIterations = normalizeIterations(options.maxIterations);
    const packedContext = buildPackedContext(goal, context, contextOptions);
    let trace = [];

    if (typeof model !== 'function') {
        const result = limitResult('invalid_model', trace, 0, 'A model function is required');
        emit(onEvent, trajectoryRecorder, { type: 'error', status: result.status, error: result.error });
        return result;
    }

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
        if (abortSignal?.aborted) {
            const result = limitResult(
                'timeout',
                trace,
                iteration - 1,
                'Reading agent aborted',
            );
            emit(onEvent, trajectoryRecorder, {
                type: 'error',
                status: result.status,
                error: result.error,
                iteration: result.iterations,
            });
            return result;
        }

        const status = shortStatus(trace, iteration, maxIterations);
        const response = await model({
            goal,
            context: packedContext,
            iteration,
            maxIterations,
            trace: Object.freeze([...trace]),
            tools,
            permissions,
            status,
            abortSignal: abortSignal || undefined,
            signal: abortSignal || undefined,
        });
        metrics?.markLlmCall?.();
        const modelTrace = createModelTrace(response, iteration);
        trace = [...trace, modelTrace];
        emit(onEvent, trajectoryRecorder, {
            type: 'model',
            iteration,
            response,
        });

        if (response?.type === 'final') {
            const completed = finalResult(response, trace, iteration);
            const result = applyGroundingGateToResult(completed, options);
            emit(onEvent, trajectoryRecorder, {
                type: 'final',
                status: result.status,
                content: result.content,
                iterations: result.iterations,
                ...(result.grounding ? { grounding: result.grounding } : {}),
                ...(result.error ? { error: result.error } : {}),
            });
            return result;
        }

        const toolCalls = toolCallsFromResponse(response);
        if (!toolCalls || toolCalls.length === 0 || toolCalls.some((tc) => !tc.toolName)) {
            const result = limitResult(
                'invalid_response',
                trace,
                iteration,
                'Model response must be final or tool_call',
            );
            emit(onEvent, trajectoryRecorder, {
                type: 'error',
                status: result.status,
                error: result.error,
                iteration,
            });
            return result;
        }

        // Sequential execution for v1; each call gets its own tool trace entry.
        for (const toolCall of toolCalls) {
            if (abortSignal?.aborted) {
                const result = limitResult(
                    'timeout',
                    trace,
                    iteration,
                    'Reading agent aborted',
                );
                emit(onEvent, trajectoryRecorder, {
                    type: 'error',
                    status: result.status,
                    error: result.error,
                    iteration,
                });
                return result;
            }

            try {
                assertToolAllowed(toolCall.toolName, permissions);
            } catch (error) {
                const result = limitResult('permission_denied', trace, iteration, error.message);
                emit(onEvent, trajectoryRecorder, {
                    type: 'error',
                    status: result.status,
                    error: result.error,
                    iteration,
                    toolName: toolCall.toolName,
                });
                return result;
            }

            const tool = tools[toolCall.toolName];
            if (!tool?.run) {
                const result = limitResult(
                    'tool_not_found',
                    trace,
                    iteration,
                    `Tool "${toolCall.toolName}" is not registered`,
                );
                emit(onEvent, trajectoryRecorder, {
                    type: 'error',
                    status: result.status,
                    error: result.error,
                    iteration,
                    toolName: toolCall.toolName,
                });
                return result;
            }

            const toolStartedAt = metrics?.beginTool?.() ?? Date.now();
            let toolResult;
            try {
                toolResult = await invokeToolRun(tool, toolCall.args, abortSignal);
            } catch (error) {
                const durationMs = metrics?.endTool?.(toolCall.toolName, iteration, toolStartedAt)
                    ?? Math.max(0, Date.now() - toolStartedAt);
                if (abortSignal?.aborted || isAbortError(error)) {
                    const result = limitResult(
                        'timeout',
                        trace,
                        iteration,
                        error?.message || 'Reading agent aborted',
                    );
                    emit(onEvent, trajectoryRecorder, {
                        type: 'error',
                        status: result.status,
                        error: result.error,
                        iteration,
                        toolName: toolCall.toolName,
                        durationMs,
                    });
                    return result;
                }
                const result = limitResult(
                    'error',
                    trace,
                    iteration,
                    error?.message || `Tool "${toolCall.toolName}" failed`,
                );
                emit(onEvent, trajectoryRecorder, {
                    type: 'error',
                    status: result.status,
                    error: result.error,
                    iteration,
                    toolName: toolCall.toolName,
                    durationMs,
                });
                return result;
            }
            const durationMs = metrics?.endTool?.(toolCall.toolName, iteration, toolStartedAt)
                ?? Math.max(0, Date.now() - toolStartedAt);
            const toolTrace = createToolTrace(
                toolCall.toolName,
                toolCall.args,
                toolResult,
                iteration,
                durationMs,
            );
            trace = [...trace, toolTrace];
            emit(onEvent, trajectoryRecorder, {
                type: 'tool',
                iteration,
                toolName: toolCall.toolName,
                args: toolCall.args,
                result: toolResult,
                durationMs,
            });
        }
    }

    const result = limitResult('max_iterations', trace, maxIterations);
    emit(onEvent, trajectoryRecorder, {
        type: 'error',
        status: result.status,
        error: result.error || 'max_iterations',
        iterations: maxIterations,
    });
    return result;
}

/**
 * Race work against a wall-clock timeout. On timeout, resolve timeout first, then invoke
 * onTimeout (e.g. abort controller) so abort-driven rejections cannot win the race.
 * Late work rejections after settle are swallowed.
 */
function withTimeout(work, timeoutMs, onTimeout) {
    let timeoutId;
    let settled = false;
    const timeoutMessage = `Reading agent timed out after ${timeoutMs}ms`;

    return new Promise((resolve, reject) => {
        const settle = (fn) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            fn();
        };

        timeoutId = setTimeout(() => {
            // Resolve timeout before abort so sync AbortError from in-flight work
            // cannot replace the timeout result with undefined/error.
            settle(() => resolve(limitResult('timeout', [], 0, timeoutMessage)));
            try {
                onTimeout?.();
            } catch {
                // Abort side effects must not break timeout resolution.
            }
        }, timeoutMs);

        Promise.resolve()
            .then(() => work())
            .then(
                (result) => {
                    settle(() => resolve(result));
                },
                (error) => {
                    settle(() => reject(error));
                },
            );
    });
}

function linkExternalAbortSignal(controller, externalSignal) {
    if (!externalSignal || typeof externalSignal !== 'object') {
        return () => {};
    }
    if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
        return () => {};
    }
    const onAbort = () => {
        controller.abort(externalSignal.reason);
    };
    externalSignal.addEventListener('abort', onAbort, { once: true });
    return () => {
        externalSignal.removeEventListener('abort', onAbort);
    };
}

export async function runReadingAgent(options = {}) {
    const timeoutMs = normalizeTimeout(options.timeoutMs);
    const { onEvent = null, trajectoryRecorder = null } = options;
    const externalSignal = options.abortSignal || options.signal || null;
    const metrics = createRunMetrics();

    const controller = new AbortController();
    const unlinkExternal = linkExternalAbortSignal(controller, externalSignal);
    const abortSignal = controller.signal;
    const loopOptions = {
        ...options,
        abortSignal,
        metrics,
    };

    const finish = (result) => attachMetrics(withObservability(result, options), metrics);

    try {
        const result = await withTimeout(
            () => runLoop(loopOptions),
            timeoutMs,
            () => {
                controller.abort();
            },
        );
        if (result?.status === 'timeout') {
            emit(onEvent, trajectoryRecorder, {
                type: 'error',
                status: 'timeout',
                error: result.error,
            });
        }
        return finish(result);
    } catch (error) {
        if (abortSignal.aborted || isAbortError(error)) {
            const result = limitResult(
                'timeout',
                [],
                0,
                error.message || 'Reading agent aborted',
            );
            emit(onEvent, trajectoryRecorder, {
                type: 'error',
                status: result.status,
                error: result.error,
            });
            return finish(result);
        }
        const result = limitResult('error', [], 0, error.message || 'Reading agent failed');
        emit(onEvent, trajectoryRecorder, {
            type: 'error',
            status: result.status,
            error: result.error,
        });
        return finish(result);
    } finally {
        unlinkExternal();
    }
}
