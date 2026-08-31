import { describe, expect, it, vi } from 'vitest';
import { generateLensCardArtifact } from './lensCard';

describe('lensCard agent flow', () => {
    it('packs selected source context and returns a source-grounded Lens Card artifact', async () => {
        const generateText = vi.fn().mockResolvedValue([
            '这段话说明：通用阅读器要保留可追溯来源。',
            '第二点：卡片必须能回到原文。',
        ].join('\n'));

        const artifact = await generateLensCardArtifact({
            id: 'artifact-1',
            selection: {
                documentId: 'doc-1',
                text: 'VibeReader should preserve source spans.',
                page: 3,
                spanId: 'span-3',
                rect: { left: 10, top: 20, width: 100, height: 18 },
                rects: [
                    { left: 10, top: 20, width: 100, height: 18 },
                    { left: 10, top: 42, width: 80, height: 18 },
                ],
            },
            document: {
                id: 'doc-1',
                name: 'paper.pdf',
                kind: 'pdf',
                outline: [{ title: 'Introduction', page: 1 }],
            },
            modelId: 'MiniMax-M3',
            createdAt: '2026-06-02T10:00:00.000Z',
            generateText,
        });

        expect(generateText.mock.calls[0][0]).toContain('[selection:span-3 p.3]');
        expect(artifact).toEqual(expect.objectContaining({
            id: 'artifact-1',
            documentId: 'doc-1',
            type: 'lens_card',
            sourceSpanIds: ['span-3'],
            modelId: 'MiniMax-M3',
            verificationStatus: 'grounded',
        }));
        expect(artifact.originalContent).toEqual(expect.objectContaining({
            selectionText: 'VibeReader should preserve source spans.',
            explanation: [
                '这段话说明：通用阅读器要保留可追溯来源。',
                '第二点：卡片必须能回到原文。',
            ].join('\n'),
            source: {
                documentId: 'doc-1',
                page: 3,
                spanId: 'span-3',
                rect: { left: 10, top: 20, width: 100, height: 18 },
                rects: [
                    { left: 10, top: 20, width: 100, height: 18 },
                    { left: 10, top: 42, width: 80, height: 18 },
                ],
                sourceType: 'selection',
            },
        }));
        expect(artifact.originalContent.claims[0]).toEqual({
            text: [
                '这段话说明：通用阅读器要保留可追溯来源。',
                '第二点：卡片必须能回到原文。',
            ].join('\n'),
            sourceSpanIds: ['span-3'],
            inference: false,
        });
    });

    it('marks claims as inference when the selection has no stable source span', async () => {
        const artifact = await generateLensCardArtifact({
            selection: {
                documentId: 'doc-1',
                text: 'Loose selected text.',
            },
            generateText: vi.fn().mockResolvedValue('这是一个解释。'),
        });

        expect(artifact.sourceSpanIds).toEqual([]);
        expect(artifact.verificationStatus).toBe('contains_inference');
        expect(artifact.originalContent.claims[0]).toEqual({
            text: '这是一个解释。',
            sourceSpanIds: [],
            inference: true,
        });
    });
});
