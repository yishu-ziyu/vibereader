import { describe, expect, it } from 'vitest';
import {
    buildDocumentChunks,
    buildRetrievalContext,
    retrieveDocumentChunks,
} from './retrievalContext';

describe('retrievalContext', () => {
    const document = {
        id: 'doc-1',
        name: 'working-paper.pdf',
        kind: 'pdf',
        contentText: [
            '--- 第 1 页 ---',
            'The abstract introduces a placebo exercise and broad motivation.',
            '',
            '--- 第 2 页 ---',
            'The identification strategy uses a difference in differences design with treated firms and matched controls.',
            '',
            'Robustness checks compare alternative event windows and clustered standard errors.',
            '',
            '--- 第 3 页 ---',
            'The conclusion discusses policy implications for market design.',
        ].join('\n'),
    };

    it('splits document text into page-aware chunks with stable paragraph anchors', () => {
        const chunks = buildDocumentChunks(document, { maxCharsPerChunk: 240 });

        expect(chunks).toEqual(expect.arrayContaining([
            expect.objectContaining({
                documentId: 'doc-1',
                page: 2,
                paragraphId: 'page-2-para-0',
                text: expect.stringContaining('identification strategy'),
            }),
            expect.objectContaining({
                documentId: 'doc-1',
                page: 3,
                paragraphId: 'page-3-para-0',
                text: expect.stringContaining('policy implications'),
            }),
        ]));
        expect(chunks.some((chunk) => chunk.text.includes('[page:'))).toBe(false);
        expect(chunks.some((chunk) => chunk.text.includes('--- 第'))).toBe(false);
    });

    it('retrieves chunks that match the user question before unrelated paragraphs', () => {
        const chunks = buildDocumentChunks(document, { maxCharsPerChunk: 240 });
        const selected = retrieveDocumentChunks(
            'What is the identification strategy?',
            chunks,
            { maxChunks: 1 }
        );

        expect(selected).toHaveLength(1);
        expect(selected[0]).toEqual(expect.objectContaining({
            page: 2,
            paragraphId: 'page-2-para-0',
            text: expect.stringContaining('difference in differences'),
        }));
        expect(selected[0].text).not.toContain('placebo exercise');
    });

    it('packs retrieved excerpts into a prompt and matching source refs', () => {
        const context = buildRetrievalContext({
            document,
            query: 'Explain the identification strategy.',
            maxChunks: 1,
            maxCharsPerChunk: 240,
        });

        expect(context.usedRetrieval).toBe(true);
        expect(context.prompt).toContain('Relevant source excerpts');
        expect(context.prompt).toContain('[source:doc-1:p2:page-2-para-0]');
        expect(context.prompt).toContain('difference in differences');
        expect(context.prompt).not.toContain('policy implications');
        expect(context.sourceRefs).toEqual([
            expect.objectContaining({
                documentId: 'doc-1',
                page: 2,
                paragraphId: 'page-2-para-0',
                label: 'P2',
                text: expect.stringContaining('difference in differences'),
            }),
        ]);
    });

    it('caps long-document context instead of packing the full text', () => {
        const longDocument = {
            id: 'doc-long',
            name: 'long.txt',
            kind: 'text',
            contentText: [
                '--- 第 1 页 ---',
                ...Array.from({ length: 24 }, (_, index) => `Background filler paragraph ${index + 1} with no target term.`),
                '',
                '--- 第 7 页 ---',
                'The treatment effect estimate is the only paragraph about heterogeneous treatment effects.',
                '',
                'A final appendix paragraph should not be included when the retrieval cap is one.',
            ].join('\n\n'),
        };

        const context = buildRetrievalContext({
            document: longDocument,
            query: 'heterogeneous treatment effects',
            maxChunks: 1,
            maxCharsPerChunk: 220,
        });

        expect(context.sourceRefs).toHaveLength(1);
        expect(context.prompt).toContain('heterogeneous treatment effects');
        expect(context.prompt).not.toContain('Background filler paragraph 1');
        expect(context.prompt).not.toContain('final appendix paragraph');
        expect(context.prompt.length).toBeLessThan(longDocument.contentText.length / 2);
    });

    it('keeps split chunk refs navigable to the base paragraph anchor', () => {
        const splitDocument = {
            id: 'doc-split',
            name: 'split.pdf',
            kind: 'pdf',
            contentText: [
                '--- 第 4 页 ---',
                [
                    'The identification strategy starts here.',
                    ...Array.from({ length: 20 }, () => 'identification evidence repeats in the same paragraph.'),
                    'The closing sentence is still part of the same paragraph.',
                ].join(' '),
            ].join('\n'),
        };

        const context = buildRetrievalContext({
            document: splitDocument,
            query: 'identification evidence',
            maxChunks: 2,
            maxCharsPerChunk: 120,
        });

        expect(context.sourceRefs.length).toBeGreaterThan(1);
        expect(context.sourceRefs.every((sourceRef) => sourceRef.paragraphId === 'page-4-para-0')).toBe(true);
        expect(context.prompt).toContain('[source:doc-split:p4:page-4-para-0:chunk-1]');
    });

    it('packs only current-page chunks when page mode is selected', () => {
        const context = buildRetrievalContext({
            document,
            query: 'Explain this page.',
            mode: 'page',
            page: 2,
            maxChunks: 4,
            maxCharsPerChunk: 240,
        });

        expect(context.usedRetrieval).toBe(true);
        expect(context.prompt).toContain('Current page source excerpts');
        expect(context.prompt).toContain('[source:doc-1:p2:page-2-para-0]');
        expect(context.prompt).toContain('[source:doc-1:p2:page-2-para-1]');
        expect(context.prompt).toContain('difference in differences');
        expect(context.prompt).toContain('Robustness checks');
        expect(context.prompt).not.toContain('placebo exercise');
        expect(context.prompt).not.toContain('policy implications');
        expect(context.sourceRefs.every((sourceRef) => sourceRef.page === 2)).toBe(true);
    });

    it('packs only current-section chunks when section mode is selected', () => {
        const context = buildRetrievalContext({
            document,
            query: 'Explain this section.',
            mode: 'section',
            section: {
                id: 'sec-methods',
                title: 'Methods',
                pageStart: 2,
                pageEnd: 2,
            },
            maxChunks: 4,
            maxCharsPerChunk: 240,
        });

        expect(context.usedRetrieval).toBe(true);
        expect(context.prompt).toContain('Current section source excerpts');
        expect(context.prompt).toContain('[source:doc-1:p2:page-2-para-0]');
        expect(context.prompt).toContain('[source:doc-1:p2:page-2-para-1]');
        expect(context.prompt).toContain('difference in differences');
        expect(context.prompt).toContain('Robustness checks');
        expect(context.prompt).not.toContain('placebo exercise');
        expect(context.prompt).not.toContain('policy implications');
        expect(context.sourceRefs.every((sourceRef) => sourceRef.page === 2)).toBe(true);
    });

    it('packs only the selected paragraph when paragraph mode is selected', () => {
        const context = buildRetrievalContext({
            document,
            query: 'What is the identification strategy?',
            mode: 'paragraph',
            paragraphId: 'page-1-para-0',
            maxChunks: 4,
            maxCharsPerChunk: 240,
        });

        expect(context.usedRetrieval).toBe(true);
        expect(context.prompt).toContain('Selected paragraph source excerpts');
        expect(context.prompt).toContain('[source:doc-1:p1:page-1-para-0]');
        expect(context.prompt).toContain('placebo exercise');
        expect(context.prompt).not.toContain('difference in differences');
        expect(context.prompt).not.toContain('policy implications');
        expect(context.sourceRefs).toEqual([
            expect.objectContaining({
                page: 1,
                paragraphId: 'page-1-para-0',
                text: expect.stringContaining('placebo exercise'),
            }),
        ]);
    });
});
