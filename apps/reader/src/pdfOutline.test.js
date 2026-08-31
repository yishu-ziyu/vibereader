import { describe, expect, it, vi } from 'vitest';
import {
    flattenPdfOutline,
    resolveOutlinePageNumber,
} from './pdfOutline';

describe('pdfOutline', () => {
    it('flattens nested PDF outline entries while preserving depth and destination', () => {
        const entries = flattenPdfOutline([
            {
                title: 'Introduction',
                dest: [{ num: 5 }],
                items: [
                    { title: 'Background', dest: 'chapter-1', items: [] },
                ],
            },
        ]);

        expect(entries).toEqual([
            expect.objectContaining({ title: 'Introduction', level: 0, dest: [{ num: 5 }] }),
            expect.objectContaining({ title: 'Background', level: 1, dest: 'chapter-1' }),
        ]);
    });

    it('resolves array and named destinations into one-based page numbers', async () => {
        const pdfDoc = {
            getDestination: vi.fn().mockResolvedValue([{ num: 9 }]),
            getPageIndex: vi
                .fn()
                .mockResolvedValueOnce(4)
                .mockResolvedValueOnce(8),
        };

        await expect(resolveOutlinePageNumber(pdfDoc, { dest: [{ num: 5 }] })).resolves.toBe(5);
        await expect(resolveOutlinePageNumber(pdfDoc, { dest: 'chapter-2' })).resolves.toBe(9);
        expect(pdfDoc.getDestination).toHaveBeenCalledWith('chapter-2');
    });

    it('returns null when an outline destination cannot be resolved', async () => {
        const pdfDoc = {
            getDestination: vi.fn().mockResolvedValue(null),
            getPageIndex: vi.fn(),
        };

        await expect(resolveOutlinePageNumber(pdfDoc, { dest: 'missing' })).resolves.toBeNull();
    });
});
