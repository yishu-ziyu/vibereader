import {
    failsClaimHeavyWithoutGroundedEvidence,
    failsClaimHeavyWithoutTools,
    hasGroundedToolEvidence,
    hasUnsupportedCitationPattern,
    looksClaimHeavy,
} from '../groundingGate';

/**
 * Offline reading-agent eval harness.
 * Cases describe expected tool use and grounded content checks.
 * Live model runs stay outside this module (see scripts/agent-eval-grok.mjs).
 *
 * Env:
 *   AGENT_EVAL_STRICT_GROUNDING=1  hard-veto claim-heavy without retrieval evidence
 *                                  and unsupported citation patterns (default soft)
 */

function toolNamesFromTrace(trace = []) {
    if (!Array.isArray(trace)) return [];
    return trace
        .filter((entry) => entry?.type === 'tool' && entry.toolName)
        .map((entry) => entry.toolName);
}

function asArray(value) {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
}

/**
 * Soft checks are reported but do not fail the overall case score.
 * Use for preferred parallel / multi-tool patterns when sequential still counts as pass.
 */
function checkPass(name, pass, detail, options = {}) {
    return Object.freeze({
        name,
        pass: Boolean(pass),
        detail: detail || '',
        soft: Boolean(options.soft),
    });
}

/**
 * Resolve whether eval grounding checks hard-fail (strict) or report soft.
 * Precedence: options.strictGrounding → expectations.strictGrounding → env.
 * Default false keeps existing offline cases green when tools returned empty matches.
 *
 * @param {object} expectations
 * @param {{ strictGrounding?: boolean }} [options]
 * @returns {boolean}
 */
export function resolveEvalStrictGrounding(expectations = {}, options = {}) {
    if (options.strictGrounding === true) return true;
    if (options.strictGrounding === false) return false;
    if (expectations.strictGrounding === true) return true;
    if (expectations.strictGrounding === false) return false;

    const env = typeof process !== 'undefined' && process.env
        ? (process.env.AGENT_EVAL_STRICT_GROUNDING
            || process.env.VIBEREADER_AGENT_EVAL_STRICT_GROUNDING
            || '')
        : '';
    const normalized = String(env).trim().toLowerCase();
    return normalized === '1'
        || normalized === 'true'
        || normalized === 'strict'
        || normalized === 'yes';
}

/**
 * Count tool calls in the first tool-using iteration.
 * Runtime assigns the same `iteration` to all tools from one model multi tool_calls turn.
 * Also inspects the first model response with tool_calls for parallel count.
 *
 * @returns {{
 *   firstToolIteration: number|null,
 *   toolCount: number,
 *   toolNames: string[],
 *   modelParallelCount: number,
 *   modelParallelNames: string[],
 * }}
 */
export function measureFirstToolUsingIteration(trace = []) {
    if (!Array.isArray(trace)) {
        return {
            firstToolIteration: null,
            toolCount: 0,
            toolNames: [],
            modelParallelCount: 0,
            modelParallelNames: [],
        };
    }

    let modelParallelCount = 0;
    let modelParallelNames = [];
    for (const entry of trace) {
        if (entry?.type !== 'model') continue;
        const response = entry.response || {};
        const multi = response.toolCalls || response.tool_calls;
        if (Array.isArray(multi) && multi.length > 0) {
            modelParallelNames = multi
                .map((item) => item?.toolName || item?.name)
                .filter(Boolean);
            modelParallelCount = multi.length;
            break;
        }
        if (response.type === 'tool_call' && (response.toolName || response.name)) {
            modelParallelNames = [response.toolName || response.name];
            modelParallelCount = 1;
            break;
        }
    }

    const byIteration = new Map();
    for (const entry of trace) {
        if (entry?.type !== 'tool' || !entry.toolName) continue;
        const iteration = Number.isFinite(Number(entry.iteration))
            ? Number(entry.iteration)
            : 0;
        const list = byIteration.get(iteration) || [];
        list.push(entry.toolName);
        byIteration.set(iteration, list);
    }

    if (byIteration.size === 0) {
        return {
            firstToolIteration: null,
            toolCount: 0,
            toolNames: [],
            modelParallelCount,
            modelParallelNames,
        };
    }

    const firstToolIteration = Math.min(...byIteration.keys());
    const toolNames = byIteration.get(firstToolIteration) || [];
    return {
        firstToolIteration,
        toolCount: toolNames.length,
        toolNames: [...toolNames],
        modelParallelCount,
        modelParallelNames,
    };
}

/**
 * Sample offline cases with tiny documents and expected tool behaviors.
 */
export const READING_EVAL_CASES = Object.freeze([
    Object.freeze({
        id: 'search-document-keyword',
        description: 'Agent must search the document and mention a grounded keyword.',
        document: Object.freeze({
            id: 'eval-search-1',
            name: 'transformer-notes.md',
            kind: 'markdown',
            pages: Object.freeze([
                Object.freeze({
                    page: 1,
                    text: 'Self-attention lets each token attend to every other token in the sequence.',
                }),
                Object.freeze({
                    page: 2,
                    text: 'The multi-head mechanism projects queries, keys, and values into several subspaces.',
                }),
            ]),
        }),
        goal: 'Find what self-attention does and summarize it with a short grounded answer.',
        expectations: Object.freeze({
            status: 'completed',
            mustCallAnyTools: Object.freeze(['search_document', 'get_document_chunks']),
            contentMustIncludeAny: Object.freeze(['self-attention', 'Self-attention', 'token']),
        }),
    }),
    Object.freeze({
        id: 'get-chunks-method',
        description: 'Agent must load document chunks and mention the method keyword.',
        document: Object.freeze({
            id: 'eval-chunks-1',
            name: 'identification.md',
            kind: 'markdown',
            contentText: [
                'Abstract: We study local treatment effects under selection.',
                'Method: We use a difference-in-differences design with staggered adoption.',
                'Results: The average treatment effect on the treated is positive and significant.',
            ].join('\n\n'),
        }),
        goal: 'Explain the identification method used in this paper.',
        expectations: Object.freeze({
            status: 'completed',
            mustCallTools: Object.freeze(['get_document_chunks']),
            contentMustIncludeAny: Object.freeze([
                'difference-in-differences',
                'Difference-in-differences',
                'staggered',
            ]),
        }),
    }),
    Object.freeze({
        id: 'metadata-then-page',
        description: 'Agent should read metadata and page text before answering about page 1.',
        document: Object.freeze({
            id: 'eval-page-1',
            name: 'quantum-intro.txt',
            kind: 'text',
            pages: Object.freeze([
                Object.freeze({
                    page: 1,
                    text: 'Superposition allows a qubit to be in a combination of basis states.',
                }),
                Object.freeze({
                    page: 2,
                    text: 'Entanglement correlates measurement outcomes across qubits.',
                }),
            ]),
        }),
        goal: 'What is the main idea on page 1?',
        expectations: Object.freeze({
            status: 'completed',
            mustCallAnyTools: Object.freeze([
                'get_current_document',
                'get_page_text',
                'get_document_chunks',
                'search_document',
            ]),
            contentMustIncludeAny: Object.freeze(['Superposition', 'superposition', 'qubit']),
        }),
    }),
    Object.freeze({
        id: 'knowledge-search-local',
        description: 'Agent must use knowledge_search (local-keyword fallback) and ground the answer.',
        document: Object.freeze({
            id: 'eval-knowledge-1',
            name: 'rag-primer.md',
            kind: 'markdown',
            contentText: [
                'Retrieval-augmented generation (RAG) combines a retriever with a generator.',
                'The retriever fetches relevant passages from a local corpus before the model answers.',
                'Grounding answers in retrieved passages reduces unsupported hallucinations.',
            ].join('\n\n'),
        }),
        goal: 'What does retrieval-augmented generation combine, and why ground answers in passages?',
        expectations: Object.freeze({
            status: 'completed',
            mustCallTools: Object.freeze(['knowledge_search']),
            contentMustIncludeAny: Object.freeze([
                'retrieval',
                'Retrieval',
                'retriever',
                'RAG',
                'generator',
            ]),
        }),
    }),
    Object.freeze({
        id: 'paper-overview-multipage-pdf',
        type: 'paper_overview_agent',
        modelStrategy: 'paper_overview',
        description:
            'Local paper_overview path: multi-page academic PDF text (pages array) via createLocalPaperOverviewModel.',
        document: Object.freeze({
            id: 'eval-paper-pdf-1',
            name: 'staggered-did-local-treatment.pdf',
            kind: 'pdf',
            pageCount: 5,
            pages: Object.freeze([
                Object.freeze({
                    page: 1,
                    text: [
                        'Title: Local Treatment Effects under Staggered Adoption',
                        'Authors: A. Researcher, B. Scholar',
                        'Abstract: We study local treatment effects under staggered adoption using difference-in-differences.',
                        'Our contribution is an event-study estimator that remains valid when treatment timing varies across units.',
                    ].join('\n'),
                }),
                Object.freeze({
                    page: 2,
                    text: [
                        '1. Introduction',
                        'Recent empirical work relies on staggered adoption designs in panel data.',
                        'Parallel trends is the key identifying assumption for causal inference.',
                        'We motivate the problem of heterogeneous treatment timing across units.',
                    ].join('\n'),
                }),
                Object.freeze({
                    page: 3,
                    text: [
                        '2. Method',
                        'We use a two-way fixed effects estimator with event-study leads and lags.',
                        'The identification strategy compares early and late adopters under staggered treatment adoption.',
                    ].join('\n'),
                }),
                Object.freeze({
                    page: 4,
                    text: [
                        '3. Results',
                        'The average treatment effect on the treated is positive and significant at conventional levels.',
                        'Robustness checks confirm the main estimate under alternative event windows.',
                    ].join('\n'),
                }),
                Object.freeze({
                    page: 5,
                    text: [
                        '4. Conclusion',
                        'Staggered difference-in-differences recovers treatment effects when parallel trends hold.',
                        'Future work should address dynamic selection into treatment.',
                    ].join('\n'),
                }),
            ]),
        }),
        goal: 'Produce a grounded paper overview of this multi-page academic PDF.',
        expectations: Object.freeze({
            status: 'completed',
            mustCallTools: Object.freeze(['get_current_document', 'get_document_chunks']),
            contentMustIncludeAny: Object.freeze([
                'Paper overview',
                '# Paper overview',
                'difference-in-differences',
                'staggered',
                'treatment',
                'fixed effects',
            ]),
            contentNonEmpty: true,
            minSourceRefs: 1,
        }),
    }),
    Object.freeze({
        id: 'verify-citation-critic',
        description: 'Critic-style path: load evidence then verify_citation for a grounded claim.',
        document: Object.freeze({
            id: 'eval-critic-1',
            name: 'gat-claims.md',
            kind: 'markdown',
            pages: Object.freeze([
                Object.freeze({
                    page: 1,
                    text: 'Graph attention networks assign attention weights over neighboring nodes during message passing.',
                }),
                Object.freeze({
                    page: 2,
                    text: 'Multi-head attention stabilizes learning by averaging several attention subspaces.',
                }),
            ]),
        }),
        goal: 'Claim: Graph attention networks assign attention weights over neighboring nodes.',
        expectations: Object.freeze({
            status: 'completed',
            mustCallTools: Object.freeze(['get_document_chunks', 'verify_citation']),
            contentMustIncludeAny: Object.freeze([
                'supported',
                'Grounded',
                'Verdict',
                'partially_supported',
            ]),
        }),
    }),
    Object.freeze({
        id: 'multipage-page-aware-citation',
        description:
            'Multi-page PDF: page-aware get_page_text on a non-first page; answer must ground unique page-2 content and emit sourceRefs.',
        document: Object.freeze({
            id: 'eval-multipage-cite-1',
            name: 'instrumental-variables-primer.pdf',
            kind: 'pdf',
            pageCount: 3,
            pages: Object.freeze([
                Object.freeze({
                    page: 1,
                    text: 'Introduction: Causal inference separates association from causation in observational studies.',
                }),
                Object.freeze({
                    page: 2,
                    text: 'Identification: Instrumental variables recover local average treatment effects when exclusion restrictions hold.',
                }),
                Object.freeze({
                    page: 3,
                    text: 'Estimation: Two-stage least squares implements the instrumental variable estimator in practice.',
                }),
            ]),
        }),
        goal: 'What does page 2 say about instrumental variables and exclusion restrictions?',
        expectations: Object.freeze({
            status: 'completed',
            mustCallTools: Object.freeze(['get_page_text']),
            contentMustIncludeAny: Object.freeze([
                'Instrumental',
                'instrumental',
                'exclusion',
                'local average treatment',
            ]),
            contentNonEmpty: true,
            minSourceRefs: 1,
            requireGroundedEvidence: true,
        }),
    }),
]);

/**
 * Score one agent result against a case definition.
 * @param {object} caseDef
 * @param {object} result
 * @param {{ strictGrounding?: boolean }} [options]
 * @returns {{ pass: boolean, checks: Array<{name, pass, detail, soft?}>, strictGrounding: boolean }}
 */
export function scoreAgentResult(caseDef = {}, result = {}, options = {}) {
    const expectations = caseDef.expectations || caseDef.expected || {};
    const checks = [];
    const content = String(result.content || '');
    const calledTools = toolNamesFromTrace(result.trace);
    const calledSet = new Set(calledTools);
    const strictGrounding = resolveEvalStrictGrounding(expectations, options);
    const sourceRefs = Array.isArray(result.sourceRefs) ? result.sourceRefs : [];

    if (expectations.status) {
        const pass = result.status === expectations.status;
        checks.push(checkPass(
            'status',
            pass,
            pass
                ? `status is ${result.status}`
                : `expected status ${expectations.status}, got ${result.status || 'undefined'}`,
        ));
    }

    const mustCallTools = asArray(expectations.mustCallTools);
    if (mustCallTools.length > 0) {
        const missing = mustCallTools.filter((toolName) => !calledSet.has(toolName));
        const pass = missing.length === 0;
        checks.push(checkPass(
            'mustCallTools',
            pass,
            pass
                ? `called required tools: ${mustCallTools.join(', ')}`
                : `missing tools: ${missing.join(', ')}; called: ${calledTools.join(', ') || '(none)'}`,
        ));
    }

    const mustCallAnyTools = asArray(expectations.mustCallAnyTools);
    if (mustCallAnyTools.length > 0) {
        const matched = mustCallAnyTools.filter((toolName) => calledSet.has(toolName));
        const pass = matched.length > 0;
        checks.push(checkPass(
            'mustCallAnyTools',
            pass,
            pass
                ? `called at least one of: ${matched.join(', ')}`
                : `expected any of [${mustCallAnyTools.join(', ')}]; called: ${calledTools.join(', ') || '(none)'}`,
        ));
    }

    const contentMustInclude = asArray(expectations.contentMustInclude);
    for (const keyword of contentMustInclude) {
        const pass = content.includes(keyword);
        checks.push(checkPass(
            `contentMustInclude:${keyword}`,
            pass,
            pass ? `content includes "${keyword}"` : `content missing "${keyword}"`,
        ));
    }

    const contentMustIncludeAny = asArray(expectations.contentMustIncludeAny);
    if (contentMustIncludeAny.length > 0) {
        const matched = contentMustIncludeAny.filter((keyword) => content.includes(keyword));
        const pass = matched.length > 0;
        checks.push(checkPass(
            'contentMustIncludeAny',
            pass,
            pass
                ? `content includes: ${matched.join(', ')}`
                : `content missing any of [${contentMustIncludeAny.join(', ')}]`,
        ));
    }

    if (expectations.contentNonEmpty === true) {
        const trimmed = content.trim();
        const pass = trimmed.length > 0;
        checks.push(checkPass(
            'contentNonEmpty',
            pass,
            pass
                ? `content length=${trimmed.length}`
                : 'content is empty',
        ));
    }

    if (expectations.minSourceRefs != null) {
        const count = Array.isArray(result.sourceRefs) ? result.sourceRefs.length : 0;
        const min = Number(expectations.minSourceRefs);
        const pass = count >= min;
        checks.push(checkPass(
            'minSourceRefs',
            pass,
            pass ? `sourceRefs=${count} >= ${min}` : `sourceRefs=${count} < ${min}`,
        ));
    }

    // Final content non-empty OR at least one recorded card (write-skill paths).
    if (expectations.contentNonEmptyOrCardsRecorded === true) {
        const cards = Array.isArray(result.cardsRecorded)
            ? result.cardsRecorded
            : Array.isArray(result.cards)
                ? result.cards
                : [];
        const trimmed = content.trim();
        const pass = trimmed.length > 0 || cards.length > 0;
        checks.push(checkPass(
            'contentNonEmptyOrCardsRecorded',
            pass,
            pass
                ? `content length=${trimmed.length}, cardsRecorded=${cards.length}`
                : 'content empty and no cards recorded (model may have refused write)',
        ));
    }

    if (expectations.minCardsRecorded != null) {
        const cards = Array.isArray(result.cardsRecorded)
            ? result.cardsRecorded
            : Array.isArray(result.cards)
                ? result.cards
                : [];
        const count = cards.length;
        const min = Number(expectations.minCardsRecorded);
        const pass = count >= min;
        checks.push(checkPass(
            'minCardsRecorded',
            pass,
            pass
                ? `cardsRecorded=${count} >= ${min}`
                : `cardsRecorded=${count} < ${min}`,
        ));
    }

    // Final content non-empty OR at least one recorded export (note_export write path).
    if (expectations.contentNonEmptyOrNotesExported === true) {
        const notes = Array.isArray(result.notesExported)
            ? result.notesExported
            : Array.isArray(result.exports)
                ? result.exports
                : [];
        const trimmed = content.trim();
        // Soft success if export_note was invoked even when notesExported attach is missing.
        const calledExport = calledSet.has('export_note');
        const pass = trimmed.length > 0 || notes.length > 0 || calledExport;
        checks.push(checkPass(
            'contentNonEmptyOrNotesExported',
            pass,
            pass
                ? `content length=${trimmed.length}, notesExported=${notes.length}, export_note_called=${calledExport}`
                : 'content empty, no notesExported, and export_note never called (model may have refused export/assembly)',
        ));
    }

    // Multi-tool gate: total tool invocations (toolsCalled.length).
    // soft: true on expectation makes this informational only.
    if (expectations.minToolCalls != null) {
        const count = calledTools.length;
        const min = Number(expectations.minToolCalls);
        const pass = count >= min;
        checks.push(checkPass(
            'minToolCalls',
            pass,
            pass
                ? `toolsCalled=${count} >= ${min}`
                : `toolsCalled=${count} < ${min}; called: ${calledTools.join(', ') || '(none)'}`,
            { soft: expectations.softMinToolCalls === true },
        ));
    }

    // Distinct tool names (e.g. get_current_document + search_document).
    if (expectations.minDistinctTools != null) {
        const distinct = [...calledSet];
        const count = distinct.length;
        const min = Number(expectations.minDistinctTools);
        const pass = count >= min;
        checks.push(checkPass(
            'minDistinctTools',
            pass,
            pass
                ? `distinctTools=${count} >= ${min} [${distinct.join(', ')}]`
                : `distinctTools=${count} < ${min}; called: ${calledTools.join(', ') || '(none)'}`,
            { soft: expectations.softMinDistinctTools === true },
        ));
    }

    // Prefer parallel multi tool_calls: count tools in first tool-using iteration.
    // Soft by default so sequential multi-tool still passes the suite.
    if (expectations.minToolCallsInFirstToolIteration != null) {
        const measured = measureFirstToolUsingIteration(result.trace);
        const min = Number(expectations.minToolCallsInFirstToolIteration);
        // Prefer tool-trace same-iteration count; fall back to first model multi toolCalls length.
        const count = Math.max(measured.toolCount, measured.modelParallelCount);
        const pass = count >= min;
        const soft = expectations.softMinToolCallsInFirstToolIteration !== false;
        const names = measured.toolNames.length > 0
            ? measured.toolNames
            : measured.modelParallelNames;
        checks.push(checkPass(
            'minToolCallsInFirstToolIteration',
            pass,
            pass
                ? `firstToolIter=${measured.firstToolIteration ?? '?'} toolCount=${count} >= ${min}`
                    + ` [${names.join(', ') || '-'}]`
                    + (measured.modelParallelCount >= 2 ? ' (same-turn parallel)' : '')
                : `firstToolIter=${measured.firstToolIteration ?? 'none'} toolCount=${count} < ${min}`
                    + `; tools=[${names.join(', ') || '-'}]`
                    + `; modelParallel=${measured.modelParallelCount}`
                    + (soft ? ' (soft: sequential multi-tool still ok)' : ''),
            { soft },
        ));
    }

    // Hard fail: claim-heavy final with zero tools cannot pass offline scores.
    if (failsClaimHeavyWithoutTools({ content, trace: result.trace })) {
        checks.push(checkPass(
            'claimHeavyWithoutTools',
            false,
            'claim-heavy final with zero tools (ungrounded)',
        ));
    }

    // Stronger hallucination veto: claim-heavy without retrieval evidence content
    // (search_document / get_document_chunks / knowledge_search / get_page_text with text).
    // Soft by default so empty-match tool stubs still pass; hard when:
    //   AGENT_EVAL_STRICT_GROUNDING=1 | expectations.strictGrounding | requireGroundedEvidence
    const forceGroundedEvidence = expectations.requireGroundedEvidence === true;
    const hardGroundedEvidence = forceGroundedEvidence || strictGrounding;
    if (looksClaimHeavy(content) || forceGroundedEvidence) {
        const hasEvidence = hasGroundedToolEvidence(result.trace);
        const claimFail = failsClaimHeavyWithoutGroundedEvidence({
            content,
            trace: result.trace,
        });
        // forceGroundedEvidence: always require evidence regardless of claim-heavy heuristic.
        const passEvidence = forceGroundedEvidence
            ? hasEvidence
            : !claimFail;
        checks.push(checkPass(
            'claimHeavyWithoutGroundedEvidence',
            passEvidence,
            passEvidence
                ? 'answer backed by retrieval tool evidence content'
                : 'claim-heavy answer without search/chunks/knowledge/page evidence content',
            { soft: !hardGroundedEvidence },
        ));
    }

    // Unsupported citation pattern: page/ref markers without sourceRefs.
    // Soft by default; hard under strictGrounding or requireSupportedCitations.
    const forceSupportedCitations = expectations.requireSupportedCitations === true;
    const hardSupportedCitations = forceSupportedCitations || strictGrounding;
    const unsupportedCitation = hasUnsupportedCitationPattern({ content, sourceRefs });
    if (unsupportedCitation || forceSupportedCitations) {
        checks.push(checkPass(
            'unsupportedCitationPattern',
            !unsupportedCitation,
            unsupportedCitation
                ? 'citation-like pattern without sourceRefs (ungrounded citation)'
                : 'no unsupported citation pattern',
            { soft: !hardSupportedCitations },
        ));
    }

    if (checks.length === 0) {
        checks.push(checkPass('noExpectations', false, 'case has no scorable expectations'));
    }

    // Soft checks are reported but never fail the case (preferred parallel patterns).
    const hardChecks = checks.filter((check) => !check.soft);
    const pass = hardChecks.every((check) => check.pass);
    return Object.freeze({
        pass,
        checks: Object.freeze(checks),
        strictGrounding,
    });
}

/**
 * Run a suite of eval cases via a provided runCase(caseDef) → agentResult.
 * @param {{
 *   runCase: (caseDef) => Promise<object>|object,
 *   cases?: Array,
 *   strictGrounding?: boolean,
 * }} options
 */
export async function runReadingEvalSuite(options = {}) {
    const {
        runCase,
        cases = READING_EVAL_CASES,
        strictGrounding,
    } = options;

    if (typeof runCase !== 'function') {
        throw new Error('runReadingEvalSuite requires a runCase(caseDef) function');
    }

    const scoreOptions = strictGrounding === undefined
        ? {}
        : { strictGrounding: Boolean(strictGrounding) };

    const results = [];
    for (const caseDef of cases) {
        let agentResult = null;
        let error = null;
        try {
            agentResult = await runCase(caseDef);
        } catch (err) {
            error = err?.message || String(err);
            agentResult = {
                status: 'error',
                content: '',
                trace: [],
                error,
            };
        }

        const score = scoreAgentResult(caseDef, agentResult, scoreOptions);
        results.push(Object.freeze({
            id: caseDef.id,
            pass: score.pass,
            checks: score.checks,
            strictGrounding: score.strictGrounding,
            agentResult,
            error,
        }));
    }

    const passed = results.filter((entry) => entry.pass).length;
    const failed = results.length - passed;

    return Object.freeze({
        total: results.length,
        passed,
        failed,
        strictGrounding: resolveEvalStrictGrounding({}, scoreOptions),
        results: Object.freeze(results),
    });
}
