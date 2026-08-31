import { describe, expect, it } from 'vitest';
import {
    GROUNDING_EVIDENCE_TOOLS,
    GROUNDING_MODES,
    applyGroundingGateToResult,
    assertGroundedFinal,
    collectGroundingFailures,
    detectCitationPatterns,
    failsClaimHeavyWithoutGroundedEvidence,
    failsClaimHeavyWithoutTools,
    hasGroundedToolEvidence,
    hasUnsupportedCitationPattern,
    looksClaimHeavy,
    resolveGroundingMode,
    resolveRequireSourceRefsForClaims,
    resolveRequireTools,
    toolResultHasEvidenceContent,
    toolsUsedInTrace,
} from './groundingGate';

const toolTrace = Object.freeze([
    { type: 'model', iteration: 1 },
    { type: 'tool', toolName: 'get_page_text', iteration: 1 },
    { type: 'model', iteration: 2 },
]);

const groundedFinal = Object.freeze({
    content: 'The abstract is a short summary of the paper findings.',
    sourceRefs: [{ page: 1, text: 'Abstract body' }],
    trace: toolTrace,
});

describe('resolveGroundingMode', () => {
    it('defaults to off', () => {
        expect(resolveGroundingMode()).toBe('off');
        expect(resolveGroundingMode({})).toBe('off');
    });

    it('accepts off|warn|strict (case-insensitive)', () => {
        expect(resolveGroundingMode({ groundingMode: 'off' })).toBe('off');
        expect(resolveGroundingMode({ groundingMode: 'WARN' })).toBe('warn');
        expect(resolveGroundingMode({ groundingMode: 'Strict' })).toBe('strict');
    });

    it('groundingGate true enables warn; strict string enables strict', () => {
        expect(resolveGroundingMode({ groundingGate: true })).toBe('warn');
        expect(resolveGroundingMode({ groundingGate: 'warn' })).toBe('warn');
        expect(resolveGroundingMode({ groundingGate: 'strict' })).toBe('strict');
        expect(resolveGroundingMode({ groundingGate: false })).toBe('off');
        expect(resolveGroundingMode({ groundingGate: 'off' })).toBe('off');
    });

    it('groundingMode wins over groundingGate', () => {
        expect(resolveGroundingMode({
            groundingMode: 'strict',
            groundingGate: true,
        })).toBe('strict');
        expect(resolveGroundingMode({
            groundingMode: 'off',
            groundingGate: true,
        })).toBe('off');
    });

    it('explicit off stays off; warn and strict still resolve', () => {
        expect(resolveGroundingMode({ groundingMode: 'off' })).toBe('off');
        expect(resolveGroundingMode({ groundingMode: 'warn' })).toBe('warn');
        expect(resolveGroundingMode({ groundingMode: 'strict' })).toBe('strict');
        // Runtime default remains off when product does not set a mode
        // (product llm path sets groundingMode: 'warn' via createReadingAgentOptions).
        expect(resolveGroundingMode({})).toBe('off');
    });

    it('exports known modes', () => {
        expect(GROUNDING_MODES).toEqual(['off', 'warn', 'strict']);
    });
});

describe('toolsUsedInTrace', () => {
    it('returns true when a tool entry exists', () => {
        expect(toolsUsedInTrace(toolTrace)).toBe(true);
    });

    it('returns false for empty / model-only / non-array', () => {
        expect(toolsUsedInTrace([])).toBe(false);
        expect(toolsUsedInTrace([{ type: 'model' }])).toBe(false);
        expect(toolsUsedInTrace(null)).toBe(false);
        expect(toolsUsedInTrace(undefined)).toBe(false);
    });
});

describe('looksClaimHeavy', () => {
    it('detects digits in a sentence', () => {
        expect(looksClaimHeavy('Accuracy reached 92 percent on the holdout set.')).toBe(true);
        expect(looksClaimHeavy('样本量为 128。')).toBe(true);
    });

    it('detects Chinese 证明', () => {
        expect(looksClaimHeavy('实验证明该方法有效。')).toBe(true);
    });

    it('detects long English "is" claims', () => {
        expect(looksClaimHeavy('Attention is all you need for this task.')).toBe(true);
    });

    it('is false for short non-claim prose', () => {
        expect(looksClaimHeavy('Hello world.')).toBe(false);
        expect(looksClaimHeavy('ok')).toBe(false);
        expect(looksClaimHeavy('')).toBe(false);
        expect(looksClaimHeavy('   ')).toBe(false);
    });
});

describe('collectGroundingFailures / assertGroundedFinal', () => {
    it('passes a grounded final with tools and sourceRefs', () => {
        expect(collectGroundingFailures(groundedFinal)).toEqual([]);
        expect(assertGroundedFinal(groundedFinal)).toBe(true);
        expect(assertGroundedFinal({ ...groundedFinal, soft: true })).toEqual({
            ok: true,
            warnings: [],
        });
    });

    it('fails when requireTools and no tool was used', () => {
        const input = {
            content: 'Plain note without evidence.',
            sourceRefs: [],
            trace: [{ type: 'model', iteration: 1 }],
            requireTools: true,
        };
        expect(collectGroundingFailures(input)).toContain(
            'no tools used when requireTools=true',
        );
        expect(() => assertGroundedFinal(input)).toThrow(/no tools used/);
        expect(assertGroundedFinal({ ...input, soft: true })).toEqual({
            ok: false,
            warnings: ['no tools used when requireTools=true'],
        });
    });

    it('skips tool requirement when requireTools is false', () => {
        const input = {
            content: 'Short note.',
            sourceRefs: [],
            trace: [],
            requireTools: false,
        };
        expect(collectGroundingFailures(input)).toEqual([]);
        expect(assertGroundedFinal(input)).toBe(true);
    });

    it('fails on empty content', () => {
        const input = {
            content: '   ',
            sourceRefs: [{ page: 1 }],
            trace: toolTrace,
        };
        expect(collectGroundingFailures(input)).toContain('empty content');
        expect(() => assertGroundedFinal(input)).toThrow(/empty content/);
    });

    it('fails claim-heavy content without sourceRefs', () => {
        const input = {
            content: 'The transformer is the core architecture of modern NLP.',
            sourceRefs: [],
            trace: toolTrace,
        };
        expect(collectGroundingFailures(input)).toContain(
            'claim-heavy content without sourceRefs',
        );
        expect(() => assertGroundedFinal(input)).toThrow(/claim-heavy/);
    });

    it('allows claim-heavy content when sourceRefs present', () => {
        const input = {
            content: 'The transformer is the core architecture of modern NLP.',
            sourceRefs: [{ page: 3, text: 'Transformer' }],
            trace: toolTrace,
        };
        expect(collectGroundingFailures(input)).toEqual([]);
    });


    it('skips claim-heavy sourceRefs check when requireSourceRefsForClaims is false', () => {
        const input = {
            content: 'The transformer is the core architecture of modern NLP.',
            sourceRefs: [],
            trace: toolTrace,
            requireTools: true,
            requireSourceRefsForClaims: false,
        };
        expect(collectGroundingFailures(input)).toEqual([]);
        expect(assertGroundedFinal(input)).toBe(true);
    });

    it('allows non-claim-heavy content without sourceRefs when tools used', () => {
        const input = {
            content: 'Done.',
            sourceRefs: [],
            trace: toolTrace,
        };
        expect(collectGroundingFailures(input)).toEqual([]);
    });

    it('soft mode returns multiple warnings without throwing', () => {
        const result = assertGroundedFinal({
            content: '',
            sourceRefs: [],
            trace: [],
            requireTools: true,
            soft: true,
        });
        expect(result.ok).toBe(false);
        expect(result.warnings).toContain('no tools used when requireTools=true');
        expect(result.warnings).toContain('empty content');
    });

    it('hard mode error message joins reasons', () => {
        expect(() => assertGroundedFinal({
            content: '',
            trace: [],
            requireTools: true,
        })).toThrow(/Grounding gate failed:.*no tools used.*empty content/);
    });
});


describe('resolveRequireTools / resolveRequireSourceRefsForClaims', () => {
    it('defaults requireTools true for warn and strict, false for off', () => {
        expect(resolveRequireTools({}, 'warn')).toBe(true);
        expect(resolveRequireTools({}, 'strict')).toBe(true);
        expect(resolveRequireTools({}, 'off')).toBe(false);
        expect(resolveRequireTools({ requireTools: false }, 'strict')).toBe(false);
        expect(resolveRequireTools({ requireTools: true }, 'off')).toBe(true);
    });

    it('defaults requireSourceRefsForClaims true for warn/strict', () => {
        expect(resolveRequireSourceRefsForClaims({}, 'warn')).toBe(true);
        expect(resolveRequireSourceRefsForClaims({}, 'strict')).toBe(true);
        expect(resolveRequireSourceRefsForClaims({}, 'off')).toBe(false);
        expect(resolveRequireSourceRefsForClaims({
            requireSourceRefsForClaims: false,
        }, 'warn')).toBe(false);
        expect(resolveRequireSourceRefsForClaims({
            requireSourceRefsForClaims: true,
        }, 'off')).toBe(true);
    });
});

describe('failsClaimHeavyWithoutTools', () => {
    it('is true for claim-heavy content with zero tools', () => {
        expect(failsClaimHeavyWithoutTools({
            content: 'The transformer is the core architecture of modern NLP.',
            trace: [{ type: 'model', iteration: 1 }],
        })).toBe(true);
        expect(failsClaimHeavyWithoutTools({
            content: 'Accuracy reached 92 percent.',
            trace: [],
        })).toBe(true);
    });

    it('is false when tools were used or content is not claim-heavy', () => {
        expect(failsClaimHeavyWithoutTools({
            content: 'The transformer is the core architecture of modern NLP.',
            trace: toolTrace,
        })).toBe(false);
        expect(failsClaimHeavyWithoutTools({
            content: 'Done.',
            trace: [],
        })).toBe(false);
    });
});

describe('grounded tool evidence helpers', () => {
    it('lists retrieval tools', () => {
        expect(GROUNDING_EVIDENCE_TOOLS).toEqual(expect.arrayContaining([
            'search_document',
            'get_document_chunks',
            'knowledge_search',
            'get_page_text',
        ]));
    });

    it('toolResultHasEvidenceContent detects matches/chunks/text', () => {
        expect(toolResultHasEvidenceContent({ matches: [] })).toBe(false);
        expect(toolResultHasEvidenceContent({ matches: [{ text: '  ' }] })).toBe(false);
        expect(toolResultHasEvidenceContent({
            matches: [{ text: 'Self-attention' }],
        })).toBe(true);
        expect(toolResultHasEvidenceContent({
            chunks: [{ sourceText: 'chunk body' }],
        })).toBe(true);
        expect(toolResultHasEvidenceContent({ text: 'page body' })).toBe(true);
        expect(toolResultHasEvidenceContent(null)).toBe(false);
    });

    it('hasGroundedToolEvidence ignores empty matches and metadata tools', () => {
        expect(hasGroundedToolEvidence([
            { type: 'tool', toolName: 'get_current_document', result: { name: 'x' } },
            { type: 'tool', toolName: 'search_document', result: { matches: [] } },
        ])).toBe(false);
        expect(hasGroundedToolEvidence([
            {
                type: 'tool',
                toolName: 'knowledge_search',
                result: { matches: [{ text: 'RAG combines retriever' }] },
            },
        ])).toBe(true);
        expect(hasGroundedToolEvidence([
            { type: 'tool', toolName: 'get_page_text', result: { text: 'page one' } },
        ])).toBe(true);
    });

    it('failsClaimHeavyWithoutGroundedEvidence is stricter than without-tools', () => {
        const claim = 'The transformer is the core architecture of modern NLP.';
        const emptySearch = [
            { type: 'tool', toolName: 'search_document', result: { matches: [] } },
        ];
        expect(failsClaimHeavyWithoutTools({ content: claim, trace: emptySearch })).toBe(false);
        expect(failsClaimHeavyWithoutGroundedEvidence({
            content: claim,
            trace: emptySearch,
        })).toBe(true);
        expect(failsClaimHeavyWithoutGroundedEvidence({
            content: claim,
            trace: [
                {
                    type: 'tool',
                    toolName: 'get_document_chunks',
                    result: { chunks: [{ text: 'Transformer' }] },
                },
            ],
        })).toBe(false);
    });
});

describe('unsupported citation patterns', () => {
    it('detects common citation shapes', () => {
        expect(detectCitationPatterns('See [1] and [2].')).toContain('bracket-ref');
        expect(detectCitationPatterns('Defined (p. 3) in text.')).toContain('paren-page');
        expect(detectCitationPatterns('On page 12 the author')).toContain('page-word');
        expect(detectCitationPatterns('详见第 3 页')).toContain('cn-page');
        expect(detectCitationPatterns('No refs here.')).toEqual([]);
    });

    it('hasUnsupportedCitationPattern requires missing sourceRefs', () => {
        expect(hasUnsupportedCitationPattern({
            content: 'Claim on page 4.',
            sourceRefs: [],
        })).toBe(true);
        expect(hasUnsupportedCitationPattern({
            content: 'Claim on page 4.',
            sourceRefs: [{ page: 4, text: 'x' }],
        })).toBe(false);
        expect(hasUnsupportedCitationPattern({
            content: 'Plain summary.',
            sourceRefs: [],
        })).toBe(false);
    });
});

describe('applyGroundingGateToResult', () => {
    const completed = Object.freeze({
        status: 'completed',
        content: groundedFinal.content,
        sourceRefs: groundedFinal.sourceRefs,
        trace: groundedFinal.trace,
        iterations: 2,
        artifact: null,
        artifacts: Object.freeze([]),
    });

    it('off leaves result unchanged', () => {
        const out = applyGroundingGateToResult(completed, { groundingMode: 'off' });
        expect(out).toBe(completed);
    });

    it('warn pass attaches ok grounding metadata', () => {
        const out = applyGroundingGateToResult(completed, { groundingMode: 'warn' });
        expect(out.status).toBe('completed');
        expect(out.content).toBe(completed.content);
        expect(out.grounding).toEqual({ ok: true, warnings: [] });
    });

    it('warn fail appends warning and keeps completed', () => {
        const weak = {
            ...completed,
            content: 'The model is better than baselines by a wide margin.',
            sourceRefs: [],
        };
        const out = applyGroundingGateToResult(weak, { groundingMode: 'warn' });
        expect(out.status).toBe('completed');
        expect(out.content).toContain(weak.content);
        expect(out.content).toContain('[grounding warning]');
        expect(out.content).toContain('claim-heavy content without sourceRefs');
        expect(out.grounding.ok).toBe(false);
        expect(out.grounding.warnings).toContain('claim-heavy content without sourceRefs');
    });

    it('strict fail sets status ungrounded', () => {
        const weak = {
            ...completed,
            content: '实验证明有效。',
            sourceRefs: [],
            trace: [],
        };
        const out = applyGroundingGateToResult(weak, { groundingMode: 'strict' });
        expect(out.status).toBe('ungrounded');
        expect(out.error).toMatch(/no tools used|claim-heavy|empty content/);
        expect(out.grounding.ok).toBe(false);
    });

    it('strict pass returns completed without status change', () => {
        const out = applyGroundingGateToResult(completed, { groundingMode: 'strict' });
        expect(out.status).toBe('completed');
        expect(out.error).toBeUndefined();
    });

    it('ignores non-completed results', () => {
        const limited = { status: 'max_iterations', trace: [], iterations: 2, error: 'cap' };
        expect(applyGroundingGateToResult(limited, { groundingMode: 'strict' })).toBe(limited);
    });

    it('groundingGate true behaves as warn', () => {
        const weak = {
            ...completed,
            content: 'Accuracy is 99 on the private test.',
            sourceRefs: [],
        };
        const out = applyGroundingGateToResult(weak, { groundingGate: true });
        expect(out.status).toBe('completed');
        expect(out.content).toContain('[grounding warning]');
    });

    it('respects requireTools false on warn mode', () => {
        const weak = {
            ...completed,
            content: 'Short note.',
            sourceRefs: [],
            trace: [{ type: 'model' }],
        };
        const out = applyGroundingGateToResult(weak, {
            groundingMode: 'warn',
            requireTools: false,
            requireSourceRefsForClaims: false,
        });
        expect(out.status).toBe('completed');
        expect(out.grounding).toEqual({ ok: true, warnings: [] });
        expect(out.content).toBe(weak.content);
    });

    it('soft warn sets grounding ok false with warnings for UI', () => {
        const weak = {
            ...completed,
            content: 'The model is better than baselines by a wide margin.',
            sourceRefs: [],
            trace: [],
        };
        const out = applyGroundingGateToResult(weak, { groundingMode: 'warn' });
        expect(out.status).toBe('completed');
        expect(out.grounding).toEqual({
            ok: false,
            warnings: expect.arrayContaining([
                'no tools used when requireTools=true',
                'claim-heavy content without sourceRefs',
            ]),
        });
    });

});
