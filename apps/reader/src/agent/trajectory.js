let nextEventId = 1;

function nowTs() {
    return Date.now();
}

function makeId() {
    const id = `traj-${nextEventId}`;
    nextEventId += 1;
    return id;
}

function normalizeEvent(event = {}) {
    const summary = String(event.summary || '').trim();
    if (!summary) {
        throw new Error('Trajectory event requires a non-empty summary');
    }

    const type = String(event.type || 'note').trim() || 'note';
    const entry = {
        id: event.id || makeId(),
        ts: Number.isFinite(event.ts) ? event.ts : nowTs(),
        type,
        summary,
    };

    if (event.iteration != null && Number.isFinite(Number(event.iteration))) {
        entry.iteration = Number(event.iteration);
    }
    if (event.toolName) {
        entry.toolName = String(event.toolName);
    }
    if (event.detail !== undefined) {
        entry.detail = event.detail;
    }

    return Object.freeze(entry);
}

/**
 * In-memory trajectory recorder for reading-agent runs (browser-safe, no file I/O).
 * @param {{ maxEntries?: number }} [options]
 */
export function createTrajectoryRecorder({ maxEntries = 200 } = {}) {
    const cap = Math.max(1, Number(maxEntries) || 200);
    let events = [];

    return Object.freeze({
        append(event) {
            const entry = normalizeEvent(event);
            events = [...events, entry];
            if (events.length > cap) {
                events = events.slice(events.length - cap);
            }
            return entry;
        },
        list() {
            return Object.freeze([...events]);
        },
        toJSON() {
            return events.map((entry) => ({ ...entry }));
        },
        clear() {
            events = [];
        },
    });
}

function summarizeModelStep(step, index) {
    const response = step.response || {};
    const responseType = response.type || 'unknown';
    let summary = `model #${step.iteration ?? index + 1}: ${responseType}`;

    if (responseType === 'tool_call') {
        const toolName = response.toolName || response.name || 'tool';
        summary = `model #${step.iteration ?? index + 1}: tool_call ${toolName}`;
    } else if (responseType === 'final') {
        const content = String(response.content || '').trim();
        const snippet = content.slice(0, 80);
        summary = `model #${step.iteration ?? index + 1}: final${snippet ? ` - ${snippet}` : ''}`;
    }

    return Object.freeze({
        kind: 'model',
        iteration: step.iteration,
        type: responseType,
        summary,
    });
}

function summarizeToolStep(step, index) {
    const toolName = step.toolName || 'unknown';
    const result = step.result;
    let status = 'ok';
    if (result && typeof result === 'object') {
        if (result.error || result.status === 'error' || result.ok === false) {
            status = 'error';
        } else if (result.status) {
            status = String(result.status);
        }
    }

    return Object.freeze({
        kind: 'tool',
        iteration: step.iteration,
        toolName,
        status,
        summary: `tool #${step.iteration ?? index + 1}: ${toolName} (${status})`,
    });
}

/**
 * Compact list of model/tool steps for UI and logs.
 * Accepts runtime trace steps ({ type: 'model'|'tool', ... }) or trajectory events.
 */
export function summarizeTrace(trace = []) {
    if (!Array.isArray(trace)) return Object.freeze([]);

    return Object.freeze(trace.map((step, index) => {
        if (!step || typeof step !== 'object') {
            return Object.freeze({
                kind: 'unknown',
                summary: `step #${index + 1}: (invalid)`,
            });
        }

        if (step.type === 'model' || step.response) {
            return summarizeModelStep(step, index);
        }
        if (step.type === 'tool' || step.toolName) {
            return summarizeToolStep(step, index);
        }
        if (step.summary) {
            return Object.freeze({
                kind: step.type || 'event',
                iteration: step.iteration,
                toolName: step.toolName,
                summary: step.summary,
            });
        }

        return Object.freeze({
            kind: step.type || 'unknown',
            summary: `step #${index + 1}: ${step.type || 'unknown'}`,
        });
    }));
}

/**
 * Format trajectory events into a bounded prompt string for context injection.
 */
export function formatTrajectoryForPrompt(events = [], { maxChars = 2000 } = {}) {
    if (!Array.isArray(events) || events.length === 0) return '';

    const budget = Math.max(0, Number(maxChars) || 2000);
    if (budget === 0) return '';

    const lines = events.map((event, index) => {
        if (!event || typeof event !== 'object') return `${index + 1}. (invalid)`;
        const parts = [];
        if (event.iteration != null) parts.push(`i${event.iteration}`);
        if (event.type) parts.push(event.type);
        if (event.toolName) parts.push(event.toolName);
        const head = parts.length > 0 ? `[${parts.join('|')}] ` : '';
        return `${index + 1}. ${head}${event.summary || ''}`.trim();
    });

    let text = lines.join('\n');
    if (text.length <= budget) return text;

    // Prefer latest events when over budget.
    const kept = [];
    let used = 0;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        const cost = line.length + (kept.length > 0 ? 1 : 0);
        if (used + cost > budget) break;
        kept.unshift(line);
        used += cost;
    }

    if (kept.length === 0) {
        return lines[lines.length - 1].slice(0, budget);
    }

    const omitted = lines.length - kept.length;
    if (omitted > 0) {
        const prefix = `...(${omitted} earlier steps omitted)\n`;
        const body = kept.join('\n');
        if (prefix.length + body.length <= budget) {
            return prefix + body;
        }
        return body.slice(0, budget);
    }

    return kept.join('\n');
}
