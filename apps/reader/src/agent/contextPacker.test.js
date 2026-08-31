import { describe, expect, it } from 'vitest';
import {
    estimateTokens,
    packDocumentContext,
} from './contextPacker';

describe('contextPacker', () => {
    it('prioritizes selection, metadata, outline, and annotations before body chunks', () => {
        const packed = packDocumentContext({
            goal: 'Assess the argument.',
            document: {
                id: 'doc-1',
                name: 'paper.md',
                kind: 'markdown',
                contentText: 'Body paragraph with the longer argument.',
                outline: [
                    { title: 'Introduction', page: 1 },
                    { title: 'Method', page: 4 },
                ],
            },
            selection: {
                text: 'Selected claim text.',
                page: 2,
                spanId: 'span-2',
            },
            annotations: [
                {
                    id: 'annotation-1',
                    page: 2,
                    selectedText: 'Selected claim text.',
                    note: 'Check evidence.',
                },
            ],
        }, { maxTokens: 220 });

        expect(packed.goal).toBe('Assess the argument.');
        expect(packed.chunks.map((chunk) => chunk.type)).toEqual([
            'goal',
            'metadata',
            'selection',
            'outline',
            'annotation',
            'body',
        ]);
        expect(packed.prompt).toContain('[selection:span-2 p.2]');
        expect(packed.prompt).toContain('[annotation:annotation-1 p.2]');
    });

    it('respects the token budget and marks truncated body context', () => {
        const contentText = Array.from({ length: 80 }, (_, index) => `Sentence ${index}.`).join(' ');

        const packed = packDocumentContext({
            goal: 'Summarize the document.',
            document: {
                id: 'doc-2',
                name: 'long.txt',
                kind: 'text',
                contentText,
            },
        }, {
            maxTokens: 80,
            chunkTokenBudget: 24,
        });

        expect(packed.estimatedTokens).toBeLessThanOrEqual(80);
        expect(packed.truncated).toBe(true);
        expect(packed.chunks.length).toBeGreaterThan(1);
        expect(packed.prompt).toContain('[body:doc-2:');
    });

    it('preserves source anchors when a chunk is trimmed to fit the budget', () => {
        const packed = packDocumentContext({
            document: {
                id: 'doc-3',
                name: 'tight.md',
                kind: 'markdown',
            },
            selection: {
                text: 'This selected passage is intentionally long enough to be trimmed by a tight budget.',
                page: 9,
                spanId: 'span-tight',
            },
        }, { maxTokens: 36 });

        expect(packed.truncated).toBe(true);
        expect(packed.prompt).toContain('[selection:span-tight p.9]');
    });

    it('uses a stable approximate token estimator', () => {
        expect(estimateTokens('12345678')).toBe(2);
        expect(estimateTokens('')).toBe(0);
    });
});
