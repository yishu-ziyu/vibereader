import { describe, expect, it } from 'vitest';
import { createOcrSourceSpans, normalizeOcrConfidence } from './ocrSourceSpans';

describe('OCR source spans', () => {
    it('normalizes OCR words into page-bound source spans with bbox and confidence', () => {
        const spans = createOcrSourceSpans({
            documentId: 'doc-scan',
            page: 3,
            engine: 'tesseract.js',
            words: [
                {
                    text: '机器人',
                    confidence: 87,
                    bbox: { x0: 12, y0: 20, x1: 72, y1: 44 },
                },
                {
                    text: '健康',
                    confidence: 0.91,
                    bbox: { left: 80, top: 20, width: 48, height: 24 },
                },
                {
                    text: ' ',
                    confidence: 50,
                    bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
                },
            ],
        });

        expect(spans).toEqual([
            {
                documentId: 'doc-scan',
                page: 3,
                spanId: 'doc-scan:p3:ocr-20-12-fjfv0',
                text: '机器人',
                bbox: { left: 12, top: 20, width: 60, height: 24 },
                source: 'ocr',
                engine: 'tesseract.js',
                confidence: 0.87,
            },
            {
                documentId: 'doc-scan',
                page: 3,
                spanId: 'doc-scan:p3:ocr-20-80-e702',
                text: '健康',
                bbox: { left: 80, top: 20, width: 48, height: 24 },
                source: 'ocr',
                engine: 'tesseract.js',
                confidence: 0.91,
            },
        ]);
    });

    it('clamps malformed OCR confidence into a zero-to-one range', () => {
        expect(normalizeOcrConfidence(98)).toBe(0.98);
        expect(normalizeOcrConfidence(1.2)).toBe(0.012);
        expect(normalizeOcrConfidence(120)).toBe(1);
        expect(normalizeOcrConfidence(-10)).toBe(0);
        expect(normalizeOcrConfidence(undefined)).toBeNull();
    });
});
