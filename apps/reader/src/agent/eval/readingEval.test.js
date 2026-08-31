import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    READING_EVAL_CASES,
    measureFirstToolUsingIteration,
    resolveEvalStrictGrounding,
    runReadingEvalSuite,
    scoreAgentResult,
} from './readingEval';

describe('READING_EVAL_CASES', () => {
    it('provides at least three offline cases with documents and expectations', () => {
        expect(READING_EVAL_CASES.length).toBeGreaterThanOrEqual(5);
        for (const caseDef of READING_EVAL_CASES) {
            expect(caseDef.id).toBeTruthy();
            expect(caseDef.document).toBeTruthy();
            expect(caseDef.goal).toBeTruthy();
            expect(caseDef.expectations || caseDef.expected).toBeTruthy();
        }
    });

    it('includes multipage page-aware citation case requiring get_page_text', () => {
        const caseDef = READING_EVAL_CASES.find((entry) => entry.id === 'multipage-page-aware-citation');
        expect(caseDef).toBeTruthy();
        expect(caseDef.document.kind).toBe('pdf');
        expect(Array.isArray(caseDef.document.pages)).toBe(true);
        expect(caseDef.document.pages.length).toBeGreaterThanOrEqual(2);
        expect(caseDef.expectations.mustCallTools).toContain('get_page_text');
        expect(caseDef.goal).toMatch(/page\s*2/i);
        expect(caseDef.expectations.minSourceRefs).toBeGreaterThanOrEqual(1);
        expect(caseDef.expectations.requireGroundedEvidence).toBe(true);
    });
});

describe('scoreAgentResult', () => {
    it('passes when required tools and keywords are present', () => {
        const caseDef = READING_EVAL_CASES.find((entry) => entry.id === 'search-document-keyword');
        const result = {
            status: 'completed',
            content: 'Self-attention lets each token attend to every other token.',
            sourceRefs: [{ page: 1, text: 'Self-attention' }],
            trace: [
                { type: 'model', iteration: 1 },
                {
                    type: 'tool',
                    toolName: 'search_document',
                    args: { query: 'self-attention' },
                    result: { matches: [] },
                    iteration: 1,
                },
                { type: 'model', iteration: 2 },
            ],
        };

        const score = scoreAgentResult(caseDef, result);
        expect(score.pass).toBe(true);
        expect(score.checks.every((check) => check.pass)).toBe(true);
    });

    it('fails when a required tool was never called', () => {
        const caseDef = {
            id: 'require-search',
            expectations: {
                status: 'completed',
                mustCallTools: ['search_document'],
                contentMustInclude: ['alpha'],
            },
        };
        const result = {
            status: 'completed',
            content: 'alpha without tools',
            trace: [{ type: 'model', iteration: 1 }],
        };

        const score = scoreAgentResult(caseDef, result);
        expect(score.pass).toBe(false);
        const toolCheck = score.checks.find((check) => check.name === 'mustCallTools');
        expect(toolCheck.pass).toBe(false);
        expect(toolCheck.detail).toMatch(/search_document/);
    });

    it('accepts any-of tool and keyword lists', () => {
        const score = scoreAgentResult(
            {
                expectations: {
                    mustCallAnyTools: ['search_document', 'get_document_chunks'],
                    contentMustIncludeAny: ['foo', 'bar'],
                },
            },
            {
                status: 'completed',
                content: 'the bar appears here',
                trace: [
                    {
                        type: 'tool',
                        toolName: 'get_document_chunks',
                        args: {},
                        result: {},
                        iteration: 1,
                    },
                ],
            },
        );

        expect(score.pass).toBe(true);
    });

    it('fails when content is missing expected keywords', () => {
        const score = scoreAgentResult(
            {
                expectations: {
                    contentMustInclude: ['quantum'],
                },
            },
            {
                status: 'completed',
                content: 'unrelated summary',
                trace: [],
            },
        );

        expect(score.pass).toBe(false);
        expect(score.checks.some((check) => !check.pass)).toBe(true);
    });

    it('enforces contentNonEmpty when requested', () => {
        const empty = scoreAgentResult(
            { expectations: { contentNonEmpty: true } },
            { status: 'completed', content: '   ', trace: [] },
        );
        expect(empty.pass).toBe(false);
        expect(empty.checks.find((check) => check.name === 'contentNonEmpty').pass).toBe(false);

        const filled = scoreAgentResult(
            { expectations: { contentNonEmpty: true } },
            { status: 'completed', content: 'grounded overview', trace: [] },
        );
        expect(filled.pass).toBe(true);
    });

    it('enforces minToolCalls as soft toolsCalled.length check', () => {
        const fail = scoreAgentResult(
            { expectations: { minToolCalls: 2 } },
            {
                status: 'completed',
                content: 'one tool only',
                trace: [{ type: 'tool', toolName: 'search_document', args: {}, result: {} }],
            },
        );
        expect(fail.pass).toBe(false);
        expect(fail.checks.find((check) => check.name === 'minToolCalls').pass).toBe(false);

        const pass = scoreAgentResult(
            { expectations: { minToolCalls: 2 } },
            {
                status: 'completed',
                content: 'two calls',
                trace: [
                    { type: 'tool', toolName: 'search_document', args: {}, result: {} },
                    { type: 'tool', toolName: 'search_document', args: {}, result: {} },
                ],
            },
        );
        expect(pass.pass).toBe(true);
    });

    it('enforces minDistinctTools for two different tools', () => {
        const fail = scoreAgentResult(
            { expectations: { minDistinctTools: 2 } },
            {
                status: 'completed',
                content: 'same tool twice',
                trace: [
                    { type: 'tool', toolName: 'search_document', args: {}, result: {} },
                    { type: 'tool', toolName: 'search_document', args: {}, result: {} },
                ],
            },
        );
        expect(fail.pass).toBe(false);

        const pass = scoreAgentResult(
            { expectations: { minDistinctTools: 2 } },
            {
                status: 'completed',
                content: 'two different tools',
                trace: [
                    { type: 'tool', toolName: 'get_current_document', args: {}, result: {} },
                    { type: 'tool', toolName: 'search_document', args: {}, result: {} },
                ],
            },
        );
        expect(pass.pass).toBe(true);
        const check = pass.checks.find((entry) => entry.name === 'minDistinctTools');
        expect(check.detail).toMatch(/get_current_document/);
        expect(check.detail).toMatch(/search_document/);
    });

    it('measures tool count in first tool-using iteration (same-turn parallel)', () => {
        const measured = measureFirstToolUsingIteration([
            {
                type: 'model',
                iteration: 1,
                response: {
                    type: 'tool_call',
                    toolCalls: [
                        { toolName: 'get_current_document', args: {} },
                        { toolName: 'search_document', args: { query: 'self-attention' } },
                    ],
                },
            },
            { type: 'tool', iteration: 1, toolName: 'get_current_document', args: {}, result: {} },
            { type: 'tool', iteration: 1, toolName: 'search_document', args: {}, result: {} },
            { type: 'model', iteration: 2, response: { type: 'final', content: 'ok' } },
        ]);
        expect(measured.firstToolIteration).toBe(1);
        expect(measured.toolCount).toBe(2);
        expect(measured.modelParallelCount).toBe(2);
        expect(measured.toolNames).toEqual(['get_current_document', 'search_document']);
    });

    it('scores soft minToolCallsInFirstToolIteration without failing sequential multi-tool', () => {
        const sequential = scoreAgentResult(
            {
                expectations: {
                    minToolCalls: 2,
                    minToolCallsInFirstToolIteration: 2,
                    softMinToolCallsInFirstToolIteration: true,
                },
            },
            {
                status: 'completed',
                content: 'sequential',
                trace: [
                    { type: 'tool', iteration: 1, toolName: 'get_current_document', args: {}, result: {} },
                    { type: 'tool', iteration: 2, toolName: 'search_document', args: {}, result: {} },
                ],
            },
        );
        expect(sequential.pass).toBe(true);
        const soft = sequential.checks.find((c) => c.name === 'minToolCallsInFirstToolIteration');
        expect(soft.soft).toBe(true);
        expect(soft.pass).toBe(false);
        expect(soft.detail).toMatch(/soft/);

        const parallel = scoreAgentResult(
            {
                expectations: {
                    minToolCalls: 2,
                    minToolCallsInFirstToolIteration: 2,
                    softMinToolCallsInFirstToolIteration: true,
                },
            },
            {
                status: 'completed',
                content: 'parallel',
                trace: [
                    {
                        type: 'model',
                        iteration: 1,
                        response: {
                            type: 'tool_call',
                            toolCalls: [
                                { toolName: 'get_current_document', args: {} },
                                { toolName: 'search_document', args: {} },
                            ],
                        },
                    },
                    { type: 'tool', iteration: 1, toolName: 'get_current_document', args: {}, result: {} },
                    { type: 'tool', iteration: 1, toolName: 'search_document', args: {}, result: {} },
                ],
            },
        );
        expect(parallel.pass).toBe(true);
        const softPass = parallel.checks.find((c) => c.name === 'minToolCallsInFirstToolIteration');
        expect(softPass.pass).toBe(true);
        expect(softPass.detail).toMatch(/same-turn parallel|toolCount=2/);
    });

    it('allows soft minDistinctTools failure without failing the case', () => {
        const score = scoreAgentResult(
            {
                expectations: {
                    minToolCalls: 2,
                    minDistinctTools: 2,
                    softMinDistinctTools: true,
                },
            },
            {
                status: 'completed',
                content: 'same tool twice',
                trace: [
                    { type: 'tool', toolName: 'search_document', args: {}, result: {} },
                    { type: 'tool', toolName: 'search_document', args: {}, result: {} },
                ],
            },
        );
        expect(score.pass).toBe(true);
        expect(score.checks.find((c) => c.name === 'minDistinctTools').pass).toBe(false);
        expect(score.checks.find((c) => c.name === 'minDistinctTools').soft).toBe(true);
    });

    it('passes contentNonEmptyOrCardsRecorded when content is empty but cards exist', () => {
        const score = scoreAgentResult(
            { expectations: { contentNonEmptyOrCardsRecorded: true } },
            {
                status: 'completed',
                content: '',
                cardsRecorded: [{ id: 'c1', title: 'Self-attention' }],
                trace: [],
            },
        );
        expect(score.pass).toBe(true);
        expect(score.checks.find((c) => c.name === 'contentNonEmptyOrCardsRecorded').pass).toBe(true);
    });

    it('fails contentNonEmptyOrCardsRecorded when both empty', () => {
        const score = scoreAgentResult(
            { expectations: { contentNonEmptyOrCardsRecorded: true } },
            { status: 'completed', content: '  ', cardsRecorded: [], trace: [] },
        );
        expect(score.pass).toBe(false);
    });


    it('passes contentNonEmptyOrNotesExported when content is empty but notes exist', () => {
        const score = scoreAgentResult(
            { expectations: { contentNonEmptyOrNotesExported: true } },
            {
                status: 'completed',
                content: '',
                notesExported: [{ path: 'reading-note-doc.md', status: 'exported' }],
                trace: [],
            },
        );
        expect(score.pass).toBe(true);
        expect(score.checks.find((c) => c.name === 'contentNonEmptyOrNotesExported').pass).toBe(true);
    });

    it('passes contentNonEmptyOrNotesExported when export_note was called', () => {
        const score = scoreAgentResult(
            { expectations: { contentNonEmptyOrNotesExported: true } },
            {
                status: 'completed',
                content: '',
                notesExported: [],
                trace: [{ type: 'tool', toolName: 'export_note' }],
            },
        );
        expect(score.pass).toBe(true);
    });

    it('fails contentNonEmptyOrNotesExported when content, notes, and export tool are all empty', () => {
        const score = scoreAgentResult(
            { expectations: { contentNonEmptyOrNotesExported: true } },
            { status: 'completed', content: '  ', notesExported: [], trace: [] },
        );
        expect(score.pass).toBe(false);
    });


    it('fails claim-heavy final with zero tools via grounding helper', () => {
        const score = scoreAgentResult(
            {
                expectations: {
                    status: 'completed',
                    contentNonEmpty: true,
                },
            },
            {
                status: 'completed',
                content: 'The transformer is the core architecture of modern NLP.',
                sourceRefs: [],
                trace: [{ type: 'model', iteration: 1 }],
            },
        );
        expect(score.pass).toBe(false);
        const check = score.checks.find((entry) => entry.name === 'claimHeavyWithoutTools');
        expect(check).toBeTruthy();
        expect(check.pass).toBe(false);
        expect(check.detail).toMatch(/zero tools/);
    });

    it('does not fail claimHeavyWithoutTools when tools were used', () => {
        const score = scoreAgentResult(
            {
                expectations: {
                    status: 'completed',
                    contentNonEmpty: true,
                },
            },
            {
                status: 'completed',
                content: 'The transformer is the core architecture of modern NLP.',
                sourceRefs: [{ page: 1, text: 'Transformer' }],
                trace: [
                    { type: 'tool', toolName: 'search_document', args: {}, result: {}, iteration: 1 },
                ],
            },
        );
        // Default (non-strict): empty matches only soft-fail grounded evidence; overall still pass.
        expect(score.pass).toBe(true);
        expect(score.checks.find((entry) => entry.name === 'claimHeavyWithoutTools')).toBeUndefined();
        const evidence = score.checks.find((entry) => entry.name === 'claimHeavyWithoutGroundedEvidence');
        expect(evidence).toBeTruthy();
        expect(evidence.pass).toBe(false);
        expect(evidence.soft).toBe(true);
    });

    it('soft-fails claimHeavyWithoutGroundedEvidence when tools returned empty matches (default)', () => {
        const score = scoreAgentResult(
            { expectations: { status: 'completed', contentNonEmpty: true } },
            {
                status: 'completed',
                content: 'Accuracy is 99 on the private benchmark.',
                sourceRefs: [],
                trace: [
                    {
                        type: 'tool',
                        toolName: 'search_document',
                        args: { query: 'accuracy' },
                        result: { matches: [] },
                        iteration: 1,
                    },
                ],
            },
        );
        expect(score.pass).toBe(true);
        expect(score.strictGrounding).toBe(false);
        const check = score.checks.find((c) => c.name === 'claimHeavyWithoutGroundedEvidence');
        expect(check.pass).toBe(false);
        expect(check.soft).toBe(true);
    });

    it('hard-fails claim-heavy without evidence when strictGrounding option is set', () => {
        const score = scoreAgentResult(
            { expectations: { status: 'completed', contentNonEmpty: true } },
            {
                status: 'completed',
                content: 'Accuracy is 99 on the private benchmark.',
                sourceRefs: [],
                trace: [
                    {
                        type: 'tool',
                        toolName: 'search_document',
                        result: { matches: [] },
                        iteration: 1,
                    },
                ],
            },
            { strictGrounding: true },
        );
        expect(score.pass).toBe(false);
        expect(score.strictGrounding).toBe(true);
        const check = score.checks.find((c) => c.name === 'claimHeavyWithoutGroundedEvidence');
        expect(check.pass).toBe(false);
        expect(check.soft).toBe(false);
    });

    it('passes claimHeavyWithoutGroundedEvidence when search returns match text', () => {
        const score = scoreAgentResult(
            { expectations: { status: 'completed', contentNonEmpty: true } },
            {
                status: 'completed',
                content: 'The transformer is the core architecture of modern NLP.',
                sourceRefs: [{ page: 1, text: 'Transformer architecture' }],
                trace: [
                    {
                        type: 'tool',
                        toolName: 'search_document',
                        result: {
                            matches: [{ page: 1, text: 'Transformer architecture' }],
                        },
                        iteration: 1,
                    },
                ],
            },
            { strictGrounding: true },
        );
        expect(score.pass).toBe(true);
        const check = score.checks.find((c) => c.name === 'claimHeavyWithoutGroundedEvidence');
        expect(check.pass).toBe(true);
        expect(check.soft).toBe(false);
    });

    it('hard-fails when requireGroundedEvidence even without strict env', () => {
        const score = scoreAgentResult(
            {
                expectations: {
                    status: 'completed',
                    requireGroundedEvidence: true,
                },
            },
            {
                status: 'completed',
                content: 'short ok',
                sourceRefs: [],
                trace: [
                    { type: 'tool', toolName: 'get_current_document', result: { name: 'doc' } },
                ],
            },
        );
        expect(score.pass).toBe(false);
        const check = score.checks.find((c) => c.name === 'claimHeavyWithoutGroundedEvidence');
        expect(check.pass).toBe(false);
        expect(check.soft).toBe(false);
    });

    it('soft-fails unsupported citation pattern by default; hard under strict', () => {
        const result = {
            status: 'completed',
            content: 'The effect is large on page 12 of the paper.',
            sourceRefs: [],
            trace: [
                {
                    type: 'tool',
                    toolName: 'get_document_chunks',
                    result: { chunks: [{ page: 1, text: 'some chunk' }] },
                },
            ],
        };
        const soft = scoreAgentResult(
            { expectations: { status: 'completed' } },
            result,
        );
        expect(soft.pass).toBe(true);
        const softCheck = soft.checks.find((c) => c.name === 'unsupportedCitationPattern');
        expect(softCheck.pass).toBe(false);
        expect(softCheck.soft).toBe(true);

        const hard = scoreAgentResult(
            { expectations: { status: 'completed' } },
            result,
            { strictGrounding: true },
        );
        expect(hard.pass).toBe(false);
        const hardCheck = hard.checks.find((c) => c.name === 'unsupportedCitationPattern');
        expect(hardCheck.pass).toBe(false);
        expect(hardCheck.soft).toBe(false);
    });

    it('passes unsupportedCitationPattern when sourceRefs back the answer', () => {
        const score = scoreAgentResult(
            { expectations: { status: 'completed', requireSupportedCitations: true } },
            {
                status: 'completed',
                content: 'See page 2 for the method.',
                sourceRefs: [{ page: 2, text: 'Method section' }],
                trace: [
                    {
                        type: 'tool',
                        toolName: 'get_page_text',
                        result: { page: 2, text: 'Method section' },
                    },
                ],
            },
        );
        expect(score.pass).toBe(true);
        const check = score.checks.find((c) => c.name === 'unsupportedCitationPattern');
        expect(check.pass).toBe(true);
    });

    it('enforces minCardsRecorded when requested', () => {
        const low = scoreAgentResult(
            { expectations: { minCardsRecorded: 2 } },
            { cardsRecorded: [{ id: 'c1' }], content: 'ok', trace: [] },
        );
        expect(low.pass).toBe(false);

        const ok = scoreAgentResult(
            { expectations: { minCardsRecorded: 2 } },
            { cardsRecorded: [{ id: 'c1' }, { id: 'c2' }], content: 'ok', trace: [] },
        );
        expect(ok.pass).toBe(true);
    });
});

describe('runReadingEvalSuite', () => {
    it('aggregates pass/fail across cases via runCase', async () => {
        const runCase = vi.fn(async (caseDef) => {
            const expectations = caseDef.expectations || caseDef.expected || {};
            const required = Array.isArray(expectations.mustCallTools)
                ? [...expectations.mustCallTools]
                : [];
            const anyOf = Array.isArray(expectations.mustCallAnyTools)
                ? [...expectations.mustCallAnyTools]
                : [];
            const tools = required.length > 0
                ? required
                : anyOf.length > 0
                    ? [anyOf[0]]
                    : ['search_document'];
            const keywords = [
                ...(Array.isArray(expectations.contentMustInclude)
                    ? expectations.contentMustInclude
                    : []),
                ...(Array.isArray(expectations.contentMustIncludeAny)
                    ? expectations.contentMustIncludeAny
                    : []),
            ];

            const minRefs = Number(expectations.minSourceRefs) || 0;
            const sourceRefs = minRefs > 0
                ? Array.from({ length: minRefs }, (_, index) => ({
                    documentId: caseDef.document?.id || 'doc',
                    page: index + 1,
                    paragraphId: `chunk-${index + 1}`,
                    text: keywords[0] || 'grounded',
                }))
                : [];
            const groundedSnippet = keywords[0] || 'grounded evidence';
            return {
                status: expectations.status || 'completed',
                content: keywords.join(' ') || 'ok',
                sourceRefs,
                trace: tools.map((toolName, index) => {
                    let result = {};
                    // Cases with requireGroundedEvidence need retrieval payload text.
                    if (toolName === 'get_page_text') {
                        result = { page: 2, text: groundedSnippet, source: 'page' };
                    } else if (
                        toolName === 'search_document'
                        || toolName === 'get_document_chunks'
                        || toolName === 'knowledge_search'
                    ) {
                        result = {
                            matches: [{ page: 1, text: groundedSnippet }],
                            chunks: [{ page: 1, text: groundedSnippet }],
                        };
                    }
                    return {
                        type: 'tool',
                        toolName,
                        args: {},
                        result,
                        iteration: index + 1,
                    };
                }),
            };
        });

        const summary = await runReadingEvalSuite({ runCase });

        expect(summary.total).toBe(READING_EVAL_CASES.length);
        expect(summary.passed + summary.failed).toBe(summary.total);
        expect(summary.passed).toBe(READING_EVAL_CASES.length);
        expect(summary.failed).toBe(0);
        expect(runCase).toHaveBeenCalledTimes(READING_EVAL_CASES.length);
    });

    it('counts thrown runCase errors as failed cases', async () => {
        const summary = await runReadingEvalSuite({
            cases: [
                {
                    id: 'throws',
                    expectations: { status: 'completed' },
                },
            ],
            runCase: async () => {
                throw new Error('model offline');
            },
        });

        expect(summary.total).toBe(1);
        expect(summary.passed).toBe(0);
        expect(summary.failed).toBe(1);
        expect(summary.results[0].error).toMatch(/model offline/);
        expect(summary.results[0].pass).toBe(false);
    });

    it('requires a runCase function', async () => {
        await expect(runReadingEvalSuite({})).rejects.toThrow(/runCase/);
    });
});

describe('resolveEvalStrictGrounding', () => {
    const original = process.env.AGENT_EVAL_STRICT_GROUNDING;

    afterEach(() => {
        if (original === undefined) {
            delete process.env.AGENT_EVAL_STRICT_GROUNDING;
        } else {
            process.env.AGENT_EVAL_STRICT_GROUNDING = original;
        }
    });

    it('defaults to false', () => {
        delete process.env.AGENT_EVAL_STRICT_GROUNDING;
        expect(resolveEvalStrictGrounding()).toBe(false);
        expect(resolveEvalStrictGrounding({})).toBe(false);
    });

    it('reads AGENT_EVAL_STRICT_GROUNDING=1', () => {
        process.env.AGENT_EVAL_STRICT_GROUNDING = '1';
        expect(resolveEvalStrictGrounding()).toBe(true);
    });

    it('case expectations.strictGrounding overrides env off', () => {
        delete process.env.AGENT_EVAL_STRICT_GROUNDING;
        expect(resolveEvalStrictGrounding({ strictGrounding: true })).toBe(true);
        process.env.AGENT_EVAL_STRICT_GROUNDING = '1';
        expect(resolveEvalStrictGrounding({ strictGrounding: false })).toBe(false);
    });

    it('options.strictGrounding wins over env and expectations', () => {
        process.env.AGENT_EVAL_STRICT_GROUNDING = '1';
        expect(resolveEvalStrictGrounding({ strictGrounding: false }, { strictGrounding: true }))
            .toBe(true);
        expect(resolveEvalStrictGrounding({ strictGrounding: true }, { strictGrounding: false }))
            .toBe(false);
    });
});

describe('offline ungrounded path (mock model)', () => {
    it('intentionally fails score for claim-heavy final with zero tools', async () => {
        const caseDef = {
            id: 'ungrounded-claim-heavy-no-tools',
            description: 'Mock LLM skips tools and invents a claim-heavy final.',
            document: {
                id: 'eval-ungrounded-1',
                name: 'stub.md',
                kind: 'markdown',
                contentText: 'Only this short stub exists.',
            },
            goal: 'Summarize the paper with evidence.',
            expectations: {
                status: 'completed',
                contentNonEmpty: true,
                minToolCalls: 1,
            },
        };

        // Mock model path: no live network; returns claim-heavy final with empty trace tools.
        const runCase = async () => ({
            status: 'completed',
            content: 'Accuracy is 99 on the private benchmark without reading the document.',
            sourceRefs: [],
            trace: [{ type: 'model', iteration: 1 }],
        });

        const summary = await runReadingEvalSuite({
            cases: [caseDef],
            runCase,
        });

        expect(summary.total).toBe(1);
        expect(summary.passed).toBe(0);
        expect(summary.failed).toBe(1);
        const entry = summary.results[0];
        expect(entry.pass).toBe(false);
        const names = entry.checks.filter((c) => !c.pass).map((c) => c.name);
        expect(names).toEqual(expect.arrayContaining([
            'claimHeavyWithoutTools',
            'minToolCalls',
            'claimHeavyWithoutGroundedEvidence',
        ]));
    });

    it('strict suite hard-fails claim-heavy tools-with-empty-matches', async () => {
        const caseDef = {
            id: 'ungrounded-empty-matches',
            document: { id: 'd1', name: 'stub.md', contentText: 'stub' },
            goal: 'Summarize with evidence.',
            expectations: {
                status: 'completed',
                contentNonEmpty: true,
            },
        };
        const summary = await runReadingEvalSuite({
            cases: [caseDef],
            strictGrounding: true,
            runCase: async () => ({
                status: 'completed',
                content: 'The accuracy is 99 without real retrieval.',
                sourceRefs: [],
                trace: [
                    {
                        type: 'tool',
                        toolName: 'knowledge_search',
                        result: { matches: [] },
                    },
                ],
            }),
        });
        expect(summary.failed).toBe(1);
        expect(summary.strictGrounding).toBe(true);
        const check = summary.results[0].checks.find(
            (c) => c.name === 'claimHeavyWithoutGroundedEvidence',
        );
        expect(check.pass).toBe(false);
        expect(check.soft).toBe(false);
    });
});
