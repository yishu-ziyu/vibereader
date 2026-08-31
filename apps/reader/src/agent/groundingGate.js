/**
 * Process-level grounding gate for reading-agent finals.
 * Book-eval + evidence-first product: empty answers, tool-free runs, and
 * claim-heavy prose without sourceRefs are soft- or hard-failed.
 */

export const GROUNDING_MODES = Object.freeze(['off', 'warn', 'strict']);

const GROUNDING_WARNING_PREFIX = '[grounding warning]';

/**
 * Resolve product option into a mode. Default 'off' so existing tests stay green.
 * `groundingGate: true` enables soft product mode ('warn') when mode is unset.
 *
 * @param {{ groundingMode?: string, groundingGate?: boolean|string }} options
 * @returns {'off'|'warn'|'strict'}
 */
export function resolveGroundingMode(options = {}) {
    const rawMode = options.groundingMode;
    if (rawMode != null && String(rawMode).trim() !== '') {
        const mode = String(rawMode).toLowerCase().trim();
        if (mode === 'off' || mode === 'warn' || mode === 'strict') return mode;
    }

    const gate = options.groundingGate;
    if (gate === true || gate === 'warn') return 'warn';
    if (gate === 'strict') return 'strict';
    if (gate === false || gate === 'off') return 'off';

    return 'off';
}

/**
 * Whether the agent trace recorded at least one tool invocation.
 * @param {Array} trace
 * @returns {boolean}
 */
export function toolsUsedInTrace(trace) {
    if (!Array.isArray(trace)) return false;
    return trace.some((entry) => entry && entry.type === 'tool');
}

/**
 * Simple claim-heavy heuristic for evidence-first finals:
 * any sentence with digits, Chinese "证明", or a long English clause containing "is".
 *
 * @param {string} content
 * @returns {boolean}
 */
export function looksClaimHeavy(content) {
    const text = String(content || '').trim();
    if (!text) return false;

    const sentences = text
        .split(/[。.!?\n;；]+/)
        .map((part) => part.trim())
        .filter(Boolean);

    return sentences.some((sentence) => {
        if (/证明/.test(sentence)) return true;
        if (/\d/.test(sentence)) return true;
        // Assertive English claim of non-trivial length.
        if (/\bis\b/i.test(sentence) && sentence.length >= 20) return true;
        return false;
    });
}

function hasSourceRefs(sourceRefs) {
    return Array.isArray(sourceRefs) && sourceRefs.length > 0;
}

/**
 * Default requireTools for a grounding mode.
 * warn/strict: true (evidence-first). off: false (gate inactive).
 *
 * @param {'off'|'warn'|'strict'} mode
 * @returns {boolean}
 */
export function defaultRequireToolsForMode(mode) {
    return mode === 'warn' || mode === 'strict';
}

/**
 * Resolve requireTools from options + mode.
 * Explicit options.requireTools wins; else warn/strict default true.
 *
 * @param {{ requireTools?: boolean }} options
 * @param {'off'|'warn'|'strict'} [mode]
 * @returns {boolean}
 */
export function resolveRequireTools(options = {}, mode = resolveGroundingMode(options)) {
    if (options.requireTools === false) return false;
    if (options.requireTools === true) return true;
    return defaultRequireToolsForMode(mode);
}

/**
 * Resolve requireSourceRefsForClaims from options + mode.
 * Explicit option wins; else warn/strict (LLM product path) default true.
 *
 * @param {{ requireSourceRefsForClaims?: boolean }} options
 * @param {'off'|'warn'|'strict'} [mode]
 * @returns {boolean}
 */
export function resolveRequireSourceRefsForClaims(
    options = {},
    mode = resolveGroundingMode(options),
) {
    if (options.requireSourceRefsForClaims === false) return false;
    if (options.requireSourceRefsForClaims === true) return true;
    return mode === 'warn' || mode === 'strict';
}

/**
 * Retrieval tools that can return source-locatable evidence for grounding.
 * Metadata-only tools (get_current_document) do not count.
 */
export const GROUNDING_EVIDENCE_TOOLS = Object.freeze([
    'search_document',
    'get_document_chunks',
    'knowledge_search',
    'get_page_text',
]);

const GROUNDING_EVIDENCE_TOOL_SET = new Set(GROUNDING_EVIDENCE_TOOLS);

/**
 * Whether a single tool result payload contains non-empty evidence text.
 * Accepts search/chunks/knowledge matches arrays, page text, or nested sourceRefs.
 *
 * @param {object|null|undefined} result
 * @returns {boolean}
 */
export function toolResultHasEvidenceContent(result) {
    if (!result || typeof result !== 'object') return false;

    const text = String(result.text || result.content || '').trim();
    if (text.length > 0) return true;

    const items = [
        ...(Array.isArray(result.matches) ? result.matches : []),
        ...(Array.isArray(result.chunks) ? result.chunks : []),
        ...(Array.isArray(result.sourceRefs) ? result.sourceRefs : []),
    ];
    return items.some((item) => {
        if (!item || typeof item !== 'object') return false;
        return String(item.text || item.sourceText || item.content || '').trim().length > 0;
    });
}

/**
 * True when the agent trace includes at least one retrieval tool with evidence content.
 *
 * @param {Array} trace
 * @returns {boolean}
 */
export function hasGroundedToolEvidence(trace = []) {
    if (!Array.isArray(trace)) return false;
    return trace.some((entry) => {
        if (!entry || entry.type !== 'tool') return false;
        const name = entry.toolName || entry.name;
        if (!GROUNDING_EVIDENCE_TOOL_SET.has(name)) return false;
        return toolResultHasEvidenceContent(entry.result);
    });
}

/**
 * Eval helper: claim-heavy final with zero tool use must fail scoring.
 * Used by readingEval.scoreAgentResult so ungrounded LLM finals cannot pass offline scores.
 *
 * @param {{ content?: string, trace?: Array }} input
 * @returns {boolean} true when this hard fail condition holds
 */
export function failsClaimHeavyWithoutTools({ content = '', trace = [] } = {}) {
    return looksClaimHeavy(content) && !toolsUsedInTrace(trace);
}

/**
 * Eval helper: claim-heavy final without retrieval evidence content.
 * Stricter than failsClaimHeavyWithoutTools: calling tools with empty matches still fails.
 *
 * @param {{ content?: string, trace?: Array }} input
 * @returns {boolean}
 */
export function failsClaimHeavyWithoutGroundedEvidence({ content = '', trace = [] } = {}) {
    return looksClaimHeavy(content) && !hasGroundedToolEvidence(trace);
}

/**
 * Detect citation-like patterns that assert page/ref numbers in the answer.
 * Used by readingEval as an optional unsupported-citation veto.
 *
 * @param {string} content
 * @returns {string[]} matched pattern labels
 */
export function detectCitationPatterns(content = '') {
    const text = String(content || '');
    if (!text.trim()) return [];

    const found = [];
    const patterns = [
        { label: 'bracket-ref', re: /\[\d+\]/ },
        { label: 'paren-page', re: /\(\s*p{1,2}\.?\s*\d+/i },
        { label: 'page-word', re: /\bpages?\s+\d+/i },
        { label: 'p-dot', re: /\bpp?\.\s*\d+/i },
        { label: 'cn-page', re: /第\s*\d+\s*页/ },
    ];
    for (const { label, re } of patterns) {
        if (re.test(text)) found.push(label);
    }
    return found;
}

/**
 * True when answer uses citation patterns but has no sourceRefs to back them.
 *
 * @param {{ content?: string, sourceRefs?: Array }} input
 * @returns {boolean}
 */
export function hasUnsupportedCitationPattern({ content = '', sourceRefs = [] } = {}) {
    const patterns = detectCitationPatterns(content);
    if (patterns.length === 0) return false;
    const hasRefs = Array.isArray(sourceRefs) && sourceRefs.length > 0;
    return !hasRefs;
}

/**
 * Collect grounding failure reasons without throwing.
 *
 * @param {{
 *   content?: string,
 *   sourceRefs?: Array,
 *   trace?: Array,
 *   requireTools?: boolean,
 *   requireSourceRefsForClaims?: boolean,
 * }} input
 * @returns {string[]}
 */
export function collectGroundingFailures({
    content = '',
    sourceRefs = [],
    trace = [],
    requireTools = true,
    requireSourceRefsForClaims = true,
} = {}) {
    const failures = [];
    const trimmed = String(content || '').trim();

    if (requireTools && !toolsUsedInTrace(trace)) {
        failures.push('no tools used when requireTools=true');
    }

    if (!trimmed) {
        failures.push('empty content');
    }

    if (
        requireSourceRefsForClaims
        && trimmed
        && looksClaimHeavy(trimmed)
        && !hasSourceRefs(sourceRefs)
    ) {
        failures.push('claim-heavy content without sourceRefs');
    }

    return failures;
}

/**
 * Assert a final answer is grounded.
 *
 * Hard mode (soft=false, default): throws Error with joined reasons.
 * Soft mode (soft=true): returns { ok, warnings } and never throws.
 *
 * @param {{
 *   content?: string,
 *   sourceRefs?: Array,
 *   trace?: Array,
 *   requireTools?: boolean,
 *   requireSourceRefsForClaims?: boolean,
 *   soft?: boolean,
 * }} input
 * @returns {true|{ ok: boolean, warnings: string[] }}
 */
export function assertGroundedFinal({
    content = '',
    sourceRefs = [],
    trace = [],
    requireTools = true,
    requireSourceRefsForClaims = true,
    soft = false,
} = {}) {
    const warnings = collectGroundingFailures({
        content,
        sourceRefs,
        trace,
        requireTools,
        requireSourceRefsForClaims,
    });

    if (soft) {
        return Object.freeze({
            ok: warnings.length === 0,
            warnings: Object.freeze([...warnings]),
        });
    }

    if (warnings.length > 0) {
        throw new Error(`Grounding gate failed: ${warnings.join('; ')}`);
    }

    return true;
}

/**
 * Apply gate to a completed agent result based on groundingMode.
 * - off: return result unchanged
 * - warn: keep status completed; append warning to content; set grounding
 *         (ok: false + warnings on fail for UI)
 * - strict: status 'ungrounded' on failure; set error + grounding
 *
 * When mode is warn/strict: requireTools and requireSourceRefsForClaims default true
 * unless explicitly set false on options.
 *
 * @param {object} result  completed finalResult shape
 * @param {{
 *   groundingMode?: string,
 *   groundingGate?: boolean|string,
 *   requireTools?: boolean,
 *   requireSourceRefsForClaims?: boolean,
 * }} options
 * @returns {object}
 */
export function applyGroundingGateToResult(result, options = {}) {
    const mode = resolveGroundingMode(options);
    if (mode === 'off' || !result || result.status !== 'completed') {
        return result;
    }

    const requireTools = resolveRequireTools(options, mode);
    const requireSourceRefsForClaims = resolveRequireSourceRefsForClaims(options, mode);
    const check = assertGroundedFinal({
        content: result.content,
        sourceRefs: result.sourceRefs,
        trace: result.trace,
        requireTools,
        requireSourceRefsForClaims,
        soft: true,
    });

    if (check.ok) {
        if (mode === 'warn') {
            return Object.freeze({
                ...result,
                grounding: Object.freeze({ ok: true, warnings: Object.freeze([]) }),
            });
        }
        return result;
    }

    const warningLine = `${GROUNDING_WARNING_PREFIX} ${check.warnings.join('; ')}`;

    if (mode === 'warn') {
        const base = String(result.content || '').trim();
        const content = base ? `${base}\n\n${warningLine}` : warningLine;
        // Soft warn: status stays completed; UI reads result.grounding.ok === false.
        return Object.freeze({
            ...result,
            content,
            grounding: Object.freeze({
                ok: false,
                warnings: Object.freeze([...check.warnings]),
            }),
        });
    }

    // strict
    return Object.freeze({
        ...result,
        status: 'ungrounded',
        error: check.warnings.join('; '),
        grounding: Object.freeze({
            ok: false,
            warnings: Object.freeze([...check.warnings]),
        }),
    });
}
