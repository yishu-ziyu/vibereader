const DEFAULT_MAX_CHARS = 4000;

function truncate(text, maxChars) {
    const value = String(text || '');
    if (value.length <= maxChars) return value;
    if (maxChars <= 1) return value.slice(0, maxChars);
    return `${value.slice(0, maxChars - 1)}…`;
}

function formatResultBody(result) {
    if (result == null) return '(empty)';
    if (typeof result === 'string') return result;
    try {
        return JSON.stringify(result, null, 2);
    } catch {
        return String(result);
    }
}

/**
 * Format a tool result as tool-message content for the model.
 */
export function formatToolObservation(toolName, result, { maxChars = DEFAULT_MAX_CHARS } = {}) {
    const name = String(toolName || 'tool').trim() || 'tool';
    const budget = Math.max(0, Number(maxChars) || DEFAULT_MAX_CHARS);
    const header = `Tool result: ${name}\n`;
    const body = formatResultBody(result);
    const full = header + body;

    if (full.length <= budget) return full;
    if (budget <= header.length) return truncate(full, budget);

    const bodyBudget = budget - header.length;
    return header + truncate(body, bodyBudget);
}

/**
 * Short status line for UI (book Ch2 status bar idea).
 */
export function buildStatusBar({
    iteration,
    maxIterations,
    goal = '',
    lastTool = '',
} = {}) {
    const iter = Number.isFinite(Number(iteration)) ? Number(iteration) : 0;
    const max = Number.isFinite(Number(maxIterations)) ? Number(maxIterations) : 0;
    const goalText = String(goal || '').trim().replace(/\s+/g, ' ');
    const toolText = String(lastTool || '').trim();

    const goalSnippet = goalText.length > 48 ? `${goalText.slice(0, 47)}…` : goalText;
    const parts = [
        max > 0 ? `iter ${iter}/${max}` : `iter ${iter}`,
    ];

    if (toolText) {
        parts.push(`last: ${toolText}`);
    }
    if (goalSnippet) {
        parts.push(`goal: ${goalSnippet}`);
    }

    return parts.join(' · ');
}
