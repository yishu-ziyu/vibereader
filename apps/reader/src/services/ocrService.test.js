import { describe, expect, it, vi } from 'vitest';
import { recognizeCurrentPdfPage } from './ocrService';

vi.mock('tesseract.js', () => {
    const worker = {
        recognize: vi.fn().mockResolvedValue({
            data: {
                words: [
                    {
                        text: '扫描文字',
                        confidence: 92,
                        bbox: { left: 20, top: 40, width: 80, height: 24 },
                    },
                ],
            },
        }),
        terminate: vi.fn().mockResolvedValue(undefined),
    };

    return {
        createWorker: vi.fn().mockResolvedValue(worker),
        __worker: worker,
    };
});

describe('OCR service', () => {
    it('recognizes the current PDF page through a tesseract worker and returns source spans', async () => {
        const tesseract = await import('tesseract.js');
        const canvas = document.createElement('canvas');

        const spans = await recognizeCurrentPdfPage({
            canvas,
            documentId: 'scan-doc',
            page: 1,
        });

        expect(tesseract.createWorker).toHaveBeenCalledWith(['chi_sim', 'eng']);
        expect(tesseract.__worker.recognize).toHaveBeenCalledWith(canvas);
        expect(tesseract.__worker.terminate).toHaveBeenCalled();
        expect(spans).toEqual([
            {
                documentId: 'scan-doc',
                page: 1,
                spanId: 'scan-doc:p1:ocr-40-20-ctzoms',
                text: '扫描文字',
                bbox: { left: 20, top: 40, width: 80, height: 24 },
                source: 'ocr',
                engine: 'tesseract.js',
                confidence: 0.92,
            },
        ]);
    });
});
