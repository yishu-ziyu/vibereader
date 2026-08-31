/**
 * Light Ch8-style experience store: record agent runs, list failures,
 * and build short rule-based lessons for system-prompt injection.
 * In-memory by default; optional localStorage-like adapter (getItem/setItem).
 */

const DEFAULT_STORAGE_KEY = 'vibereader.agent.experience.v1';
const DEFAULT_MAX_RUNS = 80;
const DEFAULT_LESSON_LIMIT = 5;
const DEFAULT_PROPOSAL_LIMIT = 5;
const CONTENT_SUMMARY_MAX = 240;
const TRACE_SUMMARY_MAX = 12;

const FAILURE_STATUSES = new Set([
    'failed',
    'tool_not_found',
    'permission_denied',
    'max_iterations',
    'invalid_response',
    'invalid_model',
    'timeout',
    'error',
]);

const LESSON_RULES = Object.freeze([
    {
        id: 'tool_not_found',
        match: (run) => statusOf(run) === 'tool_not_found'
            || textBlob(run).includes('tool_not_found')
            || /tool\s+"[^"]+"\s+is not registered/i.test(textBlob(run)),
        lesson: 'Only call tools that appear in the available tool list; never invent tool names.',
    },
    {
        id: 'permission_denied',
        match: (run) => statusOf(run) === 'permission_denied'
            || textBlob(run).includes('permission_denied')
            || /not allowed|permission/i.test(textBlob(run)),
        lesson: 'Do not call write tools (e.g. create_vibecard) unless the skill and permissions allow them; prefer read-only tools first.',
    },
    {
        id: 'max_iterations',
        match: (run) => statusOf(run) === 'max_iterations'
            || textBlob(run).includes('max_iterations'),
        lesson: 'Stay within the iteration budget: gather evidence early, then produce a final answer instead of open-ended tool loops.',
    },
    {
        id: 'empty_chunks',
        match: (run) => hasEmptyChunksSignal(run),
        lesson: 'When document chunks come back empty, broaden or rephrase the query, try get_current_document, or answer from available metadata instead of inventing text.',
    },
]);

let nextRunId = 1;

function makeRunId() {
    const id = `exp-${nextRunId}`;
    nextRunId += 1;
    return id;
}

function statusOf(run = {}) {
    return String(run.status || '').trim();
}

function textBlob(run = {}) {
    const parts = [
        run.status,
        run.error,
        run.contentSummary,
        run.goal,
    ];
    if (Array.isArray(run.trace)) {
        for (const step of run.trace) {
            if (!step || typeof step !== 'object') continue;
            parts.push(step.toolName, step.summary);
            if (step.result && typeof step.result === 'object') {
                try {
                    parts.push(JSON.stringify(step.result).slice(0, 400));
                } catch (_) {
                    // ignore
                }
            }
            if (step.error) parts.push(step.error);
        }
    }
    return parts.filter(Boolean).join(' ').toLowerCase();
}

function hasEmptyChunksSignal(run = {}) {
    if (/empty\s*chunks?|no\s*chunks?|chunks?\s*:\s*\[\s*\]/i.test(textBlob(run))) {
        return true;
    }
    if (!Array.isArray(run.trace)) return false;
    for (const step of run.trace) {
        if (!step || typeof step !== 'object') continue;
        // compactTrace keeps chunkCount/resultCount instead of full result bodies.
        if (step.chunkCount === 0 || step.resultCount === 0) return true;
        const toolName = String(step.toolName || step.response?.toolName || '');
        if (toolName !== 'get_document_chunks' && toolName !== 'search_document') continue;
        const result = step.result;
        if (!result || typeof result !== 'object') continue;
        if (Array.isArray(result.chunks) && result.chunks.length === 0) return true;
        if (Array.isArray(result.results) && result.results.length === 0) return true;
        if (result.count === 0 || result.total === 0) return true;
        if (result.empty === true) return true;
    }
    return false;
}

function compactTrace(trace) {
    if (!Array.isArray(trace)) return [];
    return trace.slice(-TRACE_SUMMARY_MAX).map((step) => {
        if (!step || typeof step !== 'object') return { type: 'unknown' };
        const entry = {
            type: step.type || 'step',
        };
        if (step.iteration != null) entry.iteration = step.iteration;
        if (step.toolName) entry.toolName = String(step.toolName);
        if (step.response?.type) entry.responseType = step.response.type;
        if (step.response?.toolName) entry.toolName = String(step.response.toolName);
        if (step.result && typeof step.result === 'object') {
            if (Array.isArray(step.result.chunks)) {
                entry.chunkCount = step.result.chunks.length;
            } else if (Array.isArray(step.result.results)) {
                entry.resultCount = step.result.results.length;
            } else if (step.result.error || step.result.status === 'error') {
                entry.error = String(step.result.error || step.result.status);
            }
        }
        if (step.error) entry.error = String(step.error);
        return entry;
    });
}

function normalizeRun(input = {}, now = Date.now()) {
    const status = String(input.status || 'unknown').trim() || 'unknown';
    const goal = String(input.goal || '').trim();
    const skillType = String(input.skillType || input.taskType || input.type || '').trim();
    const contentSummary = String(input.contentSummary || input.content || input.error || '')
        .trim()
        .slice(0, CONTENT_SUMMARY_MAX);
    const sourceRefs = Array.isArray(input.sourceRefs)
        ? input.sourceRefs.slice(0, 20).map((ref) => (
            ref && typeof ref === 'object' ? { ...ref } : ref
        ))
        : [];

    return Object.freeze({
        id: input.id || makeRunId(),
        ts: Number.isFinite(input.ts) ? Number(input.ts) : now,
        goal,
        skillType,
        status,
        contentSummary,
        sourceRefs: Object.freeze(sourceRefs),
        trace: Object.freeze(compactTrace(input.trace)),
        error: input.error ? String(input.error).slice(0, CONTENT_SUMMARY_MAX) : undefined,
    });
}

function isFailureRun(run) {
    const status = statusOf(run);
    if (FAILURE_STATUSES.has(status)) return true;
    if (status === 'completed' || status === 'succeeded') return false;
    // Non-completed agent statuses from runtime are failures for learning.
    if (status && status !== 'unknown') return true;
    return false;
}

/**
 * Derive unique short lessons from failed runs (rule-based).
 * @param {Array} runs
 * @param {{ limit?: number }} [options]
 * @returns {string[]}
 */
export function deriveLessonsFromRuns(runs = [], { limit = DEFAULT_LESSON_LIMIT } = {}) {
    const cap = Math.max(0, Number(limit) || 0);
    if (cap === 0 || !Array.isArray(runs) || runs.length === 0) return [];

    const failures = runs.filter(isFailureRun);
    // Prefer newest failures.
    const ordered = [...failures].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const seen = new Set();
    const lessons = [];

    for (const run of ordered) {
        for (const rule of LESSON_RULES) {
            if (seen.has(rule.id)) continue;
            if (!rule.match(run)) continue;
            seen.add(rule.id);
            lessons.push(rule.lesson);
            if (lessons.length >= cap) return lessons;
        }
    }

    return lessons;
}

/**
 * Build a short bullet block for system-prompt injection.
 */
export function formatLessonsPrompt(lessons = []) {
    if (!Array.isArray(lessons) || lessons.length === 0) return '';
    const lines = lessons.map((lesson) => `- ${String(lesson).trim()}`);
    return ['Lessons from past failed runs:', ...lines].join('\n');
}

/**
 * Rule-based skill improvement signals.
 * Human-in-loop only: proposals never rewrite skill md files.
 */
const SKILL_PROPOSAL_RULES = Object.freeze([
    {
        id: 'tool_not_found',
        match: (run) => statusOf(run) === 'tool_not_found'
            || textBlob(run).includes('tool_not_found')
            || /tool\s+"[^"]+"\s+is not registered/i.test(textBlob(run)),
        issue: 'Agent calls unregistered or invented tool names',
        suggestedPromptTweak:
            'In Tools-first: restate that only tools listed in the available tool list may be called; never invent names (e.g. search_web). If a needed tool is missing, report the gap instead of improvising.',
    },
    {
        id: 'permission_denied',
        match: (run) => statusOf(run) === 'permission_denied'
            || textBlob(run).includes('permission_denied')
            || /not allowed|permission/i.test(textBlob(run)),
        issue: 'Agent hits write-tool permission gates',
        suggestedPromptTweak:
            'In Forbidden / Tools-first: require read evidence before any write tool (create_vibecard, export_note, memory_save); state that write tools are skill-gated and must not be guessed when denied.',
    },
    {
        id: 'max_iterations',
        match: (run) => statusOf(run) === 'max_iterations'
            || textBlob(run).includes('max_iterations'),
        issue: 'Runs exhaust the iteration budget without a final artifact',
        suggestedPromptTweak:
            'In Tools-first / Output: after the first useful tool results, produce the final artifact; avoid re-fetching the same chunks or open-ended tool loops within maxIterations.',
    },
    {
        id: 'empty_chunks',
        match: (run) => hasEmptyChunksSignal(run),
        issue: 'Document chunk retrieval returns empty; agent may invent content',
        suggestedPromptTweak:
            'In Evidence-first: when get_document_chunks / search_document returns empty, broaden or rephrase the query, fall back to get_current_document metadata, and explicitly say evidence is missing instead of inventing body text.',
    },
    {
        id: 'missing_source_refs',
        match: (run) => hasMissingSourceRefsSignal(run),
        issue: 'Completed run lacks source refs (weak grounding)',
        suggestedPromptTweak:
            'In Evidence-first / Output: require page, paragraph, or chunk ids on every claim; if tools yield no locations, state that refs are unavailable rather than emitting an unbound answer as grounded.',
    },
    {
        id: 'invalid_response',
        match: (run) => statusOf(run) === 'invalid_response'
            || textBlob(run).includes('invalid_response'),
        issue: 'Model returns invalid structured responses',
        suggestedPromptTweak:
            'In Output: restate the expected final shape (artifact type, required fields) and that tool_calls must use registered names with valid arguments; prefer one clear final over partial free-form text.',
    },
]);

function hasMissingSourceRefsSignal(run = {}) {
    const status = statusOf(run);
    if (status !== 'completed' && status !== 'succeeded') return false;
    const refs = run.sourceRefs;
    if (Array.isArray(refs) && refs.length > 0) return false;
    // Only flag when the run looks contentful (not an empty no-op success).
    const summary = String(run.contentSummary || '').trim();
    if (summary.length < 12) return false;
    // Prefer signal when tools actually ran (trace present) or summary claims an answer.
    if (Array.isArray(run.trace) && run.trace.length > 0) return true;
    return /answer|summary|overview|claim|found|结论|摘要|概述/i.test(summary);
}

function isProposalCandidateRun(run) {
    if (isFailureRun(run)) return true;
    // Low-quality completed runs: empty retrieval or missing grounding.
    if (hasEmptyChunksSignal(run) || hasMissingSourceRefsSignal(run)) return true;
    return false;
}

function listRunsFromStore(store) {
    if (!store || typeof store !== 'object') return [];
    if (typeof store.listRuns === 'function') {
        const listed = store.listRuns();
        return Array.isArray(listed) ? listed : [];
    }
    if (Array.isArray(store.runs)) return store.runs;
    return [];
}

/**
 * Analyze recent failed / low-quality runs and return skill improvement proposals.
 * Does NOT write skill md files - human review only.
 *
 * @param {{ listRuns?: Function, runs?: Array }|null} store
 * @param {{ skillType?: string, limit?: number }} [options]
 * @returns {Array<{
 *   skillType: string,
 *   issueId: string,
 *   issue: string,
 *   suggestedPromptTweak: string,
 *   evidenceRunIds: string[],
 *   count: number,
 * }>}
 */
export function proposeSkillImprovements(store, { skillType, limit = DEFAULT_PROPOSAL_LIMIT } = {}) {
    const cap = Math.max(0, Number(limit) || 0);
    if (cap === 0) return [];

    const skillFilter = skillType != null && String(skillType).trim()
        ? String(skillType).trim()
        : '';

    let runs = listRunsFromStore(store).filter(isProposalCandidateRun);
    if (skillFilter) {
        runs = runs.filter((run) => String(run.skillType || '').trim() === skillFilter);
    }
    if (runs.length === 0) return [];

    // Newest first so evidence ids prefer recent failures.
    const ordered = [...runs].sort((a, b) => (b.ts || 0) - (a.ts || 0));

    /** @type {Map<string, { skillType: string, issueId: string, issue: string, suggestedPromptTweak: string, evidenceRunIds: string[], count: number, latestTs: number }>} */
    const buckets = new Map();

    for (const run of ordered) {
        const runSkill = String(run.skillType || '').trim() || 'unknown';
        const runId = run.id ? String(run.id) : '';
        for (const rule of SKILL_PROPOSAL_RULES) {
            if (!rule.match(run)) continue;
            const key = `${runSkill}::${rule.id}`;
            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = {
                    skillType: runSkill,
                    issueId: rule.id,
                    issue: rule.issue,
                    suggestedPromptTweak: rule.suggestedPromptTweak,
                    evidenceRunIds: [],
                    count: 0,
                    latestTs: run.ts || 0,
                };
                buckets.set(key, bucket);
            }
            bucket.count += 1;
            if (run.ts > (bucket.latestTs || 0)) bucket.latestTs = run.ts || 0;
            if (runId && !bucket.evidenceRunIds.includes(runId)) {
                bucket.evidenceRunIds.push(runId);
            }
        }
    }

    const proposals = [...buckets.values()]
        .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return (b.latestTs || 0) - (a.latestTs || 0);
        })
        .slice(0, cap)
        .map((bucket) => Object.freeze({
            skillType: bucket.skillType,
            issueId: bucket.issueId,
            issue: bucket.issue,
            suggestedPromptTweak: bucket.suggestedPromptTweak,
            evidenceRunIds: Object.freeze(bucket.evidenceRunIds.slice()),
            count: bucket.count,
        }));

    return Object.freeze(proposals);
}

/**
 * Markdown report for docs / eval review (never auto-applied to skill files).
 * @param {Array} proposals
 * @returns {string}
 */
export function formatSkillProposalsMarkdown(proposals = []) {
    if (!Array.isArray(proposals) || proposals.length === 0) {
        return '# Skill improvement proposals\n\n_No proposals._\n';
    }

    const sections = proposals.map((p, index) => {
        const skill = String(p.skillType || 'unknown');
        const issue = String(p.issue || p.issueId || 'unspecified issue');
        const tweak = String(p.suggestedPromptTweak || '').trim();
        const ids = Array.isArray(p.evidenceRunIds) ? p.evidenceRunIds.filter(Boolean) : [];
        const count = Number(p.count) || ids.length || 0;
        const lines = [
            `## ${index + 1}. \`${skill}\` — ${issue}`,
            '',
            `- **issueId:** ${p.issueId || 'n/a'}`,
            `- **count:** ${count}`,
            `- **evidence run ids:** ${ids.length ? ids.join(', ') : '(none)'}`,
            `- **suggested prompt tweak:** ${tweak || '(none)'}`,
            '',
            '_Human review only — do not auto-write skill md._',
        ];
        return lines.join('\n');
    });

    return ['# Skill improvement proposals', '', ...sections].join('\n') + '\n';
}

function loadFromStorage(storage, storageKey) {
    if (!storage || typeof storage.getItem !== 'function') return [];
    try {
        const raw = storage.getItem(storageKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((item) => item && typeof item === 'object')
            .map((item) => normalizeRun(item, item.ts || Date.now()));
    } catch (_) {
        return [];
    }
}

function saveToStorage(storage, storageKey, runs) {
    if (!storage || typeof storage.setItem !== 'function') return;
    try {
        const payload = runs.map((run) => ({
            id: run.id,
            ts: run.ts,
            goal: run.goal,
            skillType: run.skillType,
            status: run.status,
            contentSummary: run.contentSummary,
            sourceRefs: run.sourceRefs,
            trace: run.trace,
            ...(run.error ? { error: run.error } : {}),
        }));
        storage.setItem(storageKey, JSON.stringify(payload));
    } catch (_) {
        // Quota / private mode: keep memory only.
    }
}

/**
 * @param {{
 *   storage?: { getItem: Function, setItem: Function }|null,
 *   storageKey?: string,
 *   maxRuns?: number,
 *   now?: () => number,
 * }} [options]
 */
export function createExperienceStore(options = {}) {
    const storage = options.storage || null;
    const storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
    const maxRuns = Math.max(1, Number(options.maxRuns) || DEFAULT_MAX_RUNS);
    const now = typeof options.now === 'function' ? options.now : () => Date.now();

    let runs = loadFromStorage(storage, storageKey);

    function persist() {
        saveToStorage(storage, storageKey, runs);
    }

    return Object.freeze({
        /**
         * @param {{
         *   goal?: string,
         *   skillType?: string,
         *   status?: string,
         *   trace?: Array,
         *   sourceRefs?: Array,
         *   contentSummary?: string,
         *   error?: string,
         * }} input
         */
        recordRun(input = {}) {
            const entry = normalizeRun(input, now());
            runs = [...runs, entry];
            if (runs.length > maxRuns) {
                runs = runs.slice(runs.length - maxRuns);
            }
            persist();
            return entry;
        },

        listRuns({ limit } = {}) {
            const list = [...runs];
            if (limit == null) return Object.freeze(list);
            const cap = Math.max(0, Number(limit) || 0);
            return Object.freeze(list.slice(Math.max(0, list.length - cap)));
        },

        listFailures({ limit } = {}) {
            const failures = runs.filter(isFailureRun);
            if (limit == null) return Object.freeze([...failures]);
            const cap = Math.max(0, Number(limit) || 0);
            return Object.freeze(failures.slice(Math.max(0, failures.length - cap)));
        },

        buildLessonsPrompt({ limit = DEFAULT_LESSON_LIMIT } = {}) {
            const lessons = deriveLessonsFromRuns(runs, { limit });
            return formatLessonsPrompt(lessons);
        },

        /**
         * Skill improvement proposals from failed / low-quality runs (human-in-loop).
         * Does not write skill md files.
         */
        proposeSkillImprovements({ skillType, limit = DEFAULT_PROPOSAL_LIMIT } = {}) {
            return proposeSkillImprovements({ listRuns: () => runs }, { skillType, limit });
        },

        clear() {
            runs = [];
            persist();
        },
    });
}

export {
    DEFAULT_STORAGE_KEY,
    DEFAULT_MAX_RUNS,
    DEFAULT_LESSON_LIMIT,
    DEFAULT_PROPOSAL_LIMIT,
    FAILURE_STATUSES,
    LESSON_RULES,
    SKILL_PROPOSAL_RULES,
};
