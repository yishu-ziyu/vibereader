import { describe, expect, it } from 'vitest';
import { configurePdfWorker, getPdfWorkerSrc } from './pdfWorker';

describe('pdf worker configuration', () => {
    it('uses the locally bundled pdf.js worker instead of a CDN URL', () => {
        const workerSrc = getPdfWorkerSrc();

        expect(workerSrc).toContain('pdf.worker.min.mjs');
        expect(workerSrc).not.toContain('cdnjs');
        expect(workerSrc).not.toContain('unpkg');
        expect(workerSrc).not.toContain('jsdelivr');
    });

    it('applies the worker src to the provided pdfjs module', () => {
        const pdfjsModule = { GlobalWorkerOptions: {} };

        configurePdfWorker(pdfjsModule);

        expect(pdfjsModule.GlobalWorkerOptions.workerSrc).toBe(getPdfWorkerSrc());
    });
});
