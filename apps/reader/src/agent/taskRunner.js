import { savePersistentTask } from '../services/persistentStorage';
import { buildStatusBar } from './observation';
import { runReadingAgent } from './runtime';
import { exportAgentSpans } from './spanExport';
import { summarizeTrace } from './trajectory';

function timestamp(now) {
    return typeof now === 'function' ? now() : Date.now();
}

function generatedTaskId(task = {}, now) {
    if (task.id) return task.id;
    const documentId = task.documentId || 'document';
    const type = task.type || 'reading_agent';
    return `task-${type}-${documentId}-${timestamp(now)}`;
}

function compactTraceSteps(agentResult = {}) {
    const steps = summarizeTrace(agentResult.trace || []);
    return steps.map((step) => {
        const entry = {
            kind: step.kind || step.type || 'event',
            summary: step.summary || '',
        };
        if (step.iteration != null) entry.iteration = step.iteration;
        if (step.toolName) entry.toolName = step.toolName;
        if (step.type) entry.type = step.type;
        return entry;
    });
}

function lastToolFromTrace(trace = []) {
    for (let i = trace.length - 1; i >= 0; i -= 1) {
        const step = trace[i];
        if (step?.toolName) return step.toolName;
        if (step?.kind === 'tool' && step?.toolName) return step.toolName;
    }
    return '';
}

/**
 * 从 agent trace 的工具调用记录聚合结构化结果（D7）：
 * - vibecardsCreated: create_vibecard 成功调用次数（status 'created' 且有 cardId）
 * - noteExported: export_note 是否真正成功（status 'exported'）
 * UI 依据该结构化字段决定 toast，不再匹配最终文案字符串。
 */
function toolOutcomeFromAgentResult(agentResult = {}) {
    const trace = Array.isArray(agentResult.trace) ? agentResult.trace : [];
    let vibecardsCreated = 0;
    let noteExported = false;
    for (const step of trace) {
        if (step?.type !== 'tool' || !step.toolName) continue;
        if (step.toolName === 'create_vibecard'
            && step.result?.status === 'created'
            && step.result?.cardId) {
            vibecardsCreated += 1;
        }
        if (step.toolName === 'export_note' && step.result?.status === 'exported') {
            noteExported = true;
        }
    }
    return { vibecardsCreated, noteExported };
}

function agentResultSummary(agentResult = {}, {
    goal = '',
    maxIterations = 0,
    exportSpans = false,
} = {}) {
    const artifacts = Array.isArray(agentResult.artifacts) ? agentResult.artifacts : [];
    const sourceRefs = Array.isArray(agentResult.sourceRefs)
        ? agentResult.sourceRefs.map((sourceRef) => ({ ...sourceRef }))
        : [];
    const trace = compactTraceSteps(agentResult);
    const iterations = Number.isFinite(Number(agentResult.iterations))
        ? Number(agentResult.iterations)
        : 0;
    const lastTool = lastToolFromTrace(trace);
    const statusBar = buildStatusBar({
        iteration: iterations,
        maxIterations,
        goal,
        lastTool,
    });

    // Prefer spans already attached by runtime (exportSpans option); else build cheaply.
    let spans = agentResult.spans || null;
    if (exportSpans && !spans) {
        spans = exportAgentSpans(agentResult, { goal });
    }

    return {
        agentStatus: agentResult.status || 'unknown',
        content: agentResult.content || '',
        artifactCount: artifacts.length + (agentResult.artifact ? 1 : 0),
        toolOutcome: toolOutcomeFromAgentResult(agentResult),
        ...(sourceRefs.length > 0 ? { sourceRefs } : {}),
        ...(trace.length > 0 ? { trace } : {}),
        ...(iterations > 0 ? { iterations } : {}),
        ...(statusBar ? { statusBar } : {}),
        ...(lastTool ? { lastTool } : {}),
        ...(spans ? { spans } : {}),
    };
}

function errorMessageForAgentResult(agentResult = {}) {
    return agentResult.error || `Reading agent ended with status: ${agentResult.status || 'unknown'}`;
}

function parsePayload(task = {}) {
    if (task.payload && typeof task.payload === 'object' && !Array.isArray(task.payload)) {
        return { ...task.payload };
    }

    if (typeof task.payloadJson === 'string' && task.payloadJson.trim()) {
        try {
            const parsed = JSON.parse(task.payloadJson);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    return {};
}

function taskPayload(task = {}, agentOptions = {}) {
    const payload = parsePayload(task);
    if (!agentOptions || Object.keys(agentOptions).length === 0) return payload;
    if (payload.agentOptions) return payload;
    return {
        ...payload,
        agentOptions,
    };
}

function taskBase(task = {}, now, agentOptions = {}) {
    const id = generatedTaskId(task, now);
    return {
        id,
        documentId: task.documentId || null,
        type: task.type || 'reading_agent',
        title: task.title || 'Reading agent task',
        payload: taskPayload(task, agentOptions),
        createdAt: timestamp(now),
    };
}

function runningProgress(iteration, maxIterations) {
    const iter = Math.max(0, Number(iteration) || 0);
    const max = Math.max(1, Number(maxIterations) || 4);
    return Math.min(90, 10 + Math.round((iter / max) * 70));
}

function partialResultFromEvent(event = {}, state = {}, { goal = '', maxIterations = 0 } = {}) {
    const iteration = Number(event.iteration) || state.iteration || 0;
    const lastTool = event.toolName || state.lastTool || '';
    const steps = Array.isArray(state.trace) ? [...state.trace] : [];
    if (event.summary || event.type) {
        const step = {
            kind: event.type || 'event',
            summary: event.summary || event.type || '',
        };
        if (iteration) step.iteration = iteration;
        if (event.toolName) step.toolName = event.toolName;
        steps.push(step);
    }
    // Keep result payload bounded for mid-run UI.
    const boundedTrace = steps.slice(-12);
    const statusBar = buildStatusBar({
        iteration,
        maxIterations,
        goal,
        lastTool,
    });
    return {
        statusBar,
        ...(lastTool ? { lastTool } : {}),
        ...(iteration > 0 ? { iterations: iteration } : {}),
        ...(boundedTrace.length > 0 ? { trace: boundedTrace } : {}),
    };
}

function composeOnEvent(primary, secondary) {
    if (!primary && !secondary) return null;
    if (!primary) return secondary;
    if (!secondary) return primary;
    return (event) => {
        try {
            primary(event);
        } catch {
            // Listener failures must not break the agent loop.
        }
        try {
            secondary(event);
        } catch {
            // Listener failures must not break the agent loop.
        }
    };
}

function goalFromTask(task = {}, agentOptions = {}) {
    if (agentOptions?.goal) return String(agentOptions.goal);
    if (task.goal) return String(task.goal);
    const payload = parsePayload(task);
    if (payload.goal) return String(payload.goal);
    if (payload.agentOptions?.goal) return String(payload.agentOptions.goal);
    return '';
}

/**
 * Optional Ch8 experience recording. No-op when experienceStore is missing.
 */
function recordExperience(experienceStore, {
    task = {},
    agentOptions = {},
    agentResult = null,
    errorMessage = '',
} = {}) {
    if (!experienceStore || typeof experienceStore.recordRun !== 'function') return null;
    try {
        return experienceStore.recordRun({
            goal: goalFromTask(task, agentOptions),
            skillType: task.type || agentOptions.taskType || 'reading_agent',
            status: agentResult?.status || (errorMessage ? 'failed' : 'unknown'),
            trace: Array.isArray(agentResult?.trace) ? agentResult.trace : [],
            sourceRefs: Array.isArray(agentResult?.sourceRefs) ? agentResult.sourceRefs : [],
            contentSummary: agentResult?.content
                || agentResult?.error
                || errorMessage
                || '',
            error: agentResult?.error || errorMessage || undefined,
        });
    } catch (_) {
        return null;
    }
}

export async function runReadingAgentTask(options = {}) {
    const {
        task = {},
        agentOptions = {},
        runAgent = runReadingAgent,
        saveTask = savePersistentTask,
        experienceStore = null,
        onEvent = null,
        now,
    } = options;
    const base = taskBase(task, now, agentOptions);
    const startedAt = timestamp(now);
    const goal = agentOptions.goal || task.goal || '';
    const maxIterations = Number(agentOptions.maxIterations) || 0;
    const runState = {
        iteration: 0,
        lastTool: '',
        trace: [],
    };

    await saveTask({
        ...base,
        status: 'pending',
        progress: 0,
        updatedAt: startedAt,
    });

    await saveTask({
        ...base,
        status: 'running',
        progress: 10,
        startedAt,
        updatedAt: startedAt,
        result: {
            statusBar: buildStatusBar({
                iteration: 0,
                maxIterations,
                goal,
                lastTool: '',
            }),
        },
    });

    const handleEvent = (event = {}) => {
        if (event.iteration != null && Number.isFinite(Number(event.iteration))) {
            runState.iteration = Number(event.iteration);
        }
        if (event.toolName) {
            runState.lastTool = event.toolName;
        }

        const partial = partialResultFromEvent(event, runState, { goal, maxIterations });
        runState.trace = partial.trace || runState.trace;

        // Fire-and-forget mid-run UI updates; final save still awaits.
        Promise.resolve(
            saveTask({
                ...base,
                status: 'running',
                progress: runningProgress(runState.iteration, maxIterations || 4),
                result: partial,
                startedAt,
                updatedAt: timestamp(now),
            }),
        ).catch(() => {
            // Persistence failures must not break the agent loop.
        });
    };

    const combinedOnEvent = composeOnEvent(handleEvent, composeOnEvent(onEvent, agentOptions.onEvent));

    try {
        const agentResult = await runAgent({
            ...agentOptions,
            onEvent: combinedOnEvent,
        });
        const completedAt = timestamp(now);
        const result = agentResultSummary(agentResult, {
            goal,
            maxIterations,
            exportSpans: agentOptions.exportSpans === true,
        });

        recordExperience(experienceStore, {
            task: base,
            agentOptions,
            agentResult,
        });

        if (agentResult?.status === 'completed') {
            const taskRecord = await saveTask({
                ...base,
                status: 'succeeded',
                progress: 100,
                result,
                startedAt,
                completedAt,
                updatedAt: completedAt,
            });

            return Object.freeze({
                status: 'succeeded',
                taskId: base.id,
                task: taskRecord,
                agentResult,
                toolOutcome: result.toolOutcome,
            });
        }

        const errorMessage = errorMessageForAgentResult(agentResult);
        const taskRecord = await saveTask({
            ...base,
            status: 'failed',
            progress: 100,
            result,
            errorMessage,
            startedAt,
            completedAt,
            updatedAt: completedAt,
        });

        return Object.freeze({
            status: 'failed',
            taskId: base.id,
            task: taskRecord,
            agentResult,
            toolOutcome: result.toolOutcome,
            errorMessage,
        });
    } catch (error) {
        const completedAt = timestamp(now);
        const errorMessage = error?.message || String(error);
        recordExperience(experienceStore, {
            task: base,
            agentOptions,
            agentResult: null,
            errorMessage,
        });
        const taskRecord = await saveTask({
            ...base,
            status: 'failed',
            progress: 100,
            errorMessage,
            startedAt,
            completedAt,
            updatedAt: completedAt,
        });

        return Object.freeze({
            status: 'failed',
            taskId: base.id,
            task: taskRecord,
            agentResult: null,
            errorMessage,
        });
    }
}

export async function retryReadingAgentTask(taskRecord = {}, options = {}) {
    const payload = parsePayload(taskRecord);
    const agentOptions = options.agentOptions || payload.agentOptions;

    if (!agentOptions) {
        throw new Error('retryReadingAgentTask requires payload.agentOptions');
    }

    return runReadingAgentTask({
        ...options,
        task: {
            id: taskRecord.id,
            documentId: taskRecord.documentId || taskRecord.document_id || null,
            type: taskRecord.type || taskRecord.taskType || 'reading_agent',
            title: taskRecord.title || 'Reading agent task',
            payload,
        },
        agentOptions,
    });
}
