import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfViewer } from './PdfViewer';
import { usePdfStore } from './store';
import { recognizeCurrentPdfPage } from './services/ocrService';

const pdfjsState = vi.hoisted(() => ({
    textItems: [],
}));

vi.mock('antd', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        message: {
            success: vi.fn(),
            warning: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
        },
    };
});

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {
        workerSrc: '',
    },
    Util: {
        transform: vi.fn(() => [1, 0, 0, 12, 20, 40]),
    },
    getDocument: vi.fn().mockReturnValue({
        promise: Promise.resolve({
            numPages: 1,
            getPage: vi.fn().mockResolvedValue({
                getViewport: vi.fn().mockReturnValue({ width: 320, height: 480, scale: 1 }),
                render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
                getTextContent: vi.fn().mockImplementation(() => Promise.resolve({ items: pdfjsState.textItems })),
            }),
            getOutline: vi.fn().mockResolvedValue([]),
        }),
    }),
}));

vi.mock('./services/annotationService', () => ({
    createAnnotation: vi.fn(),
    listAnnotationsForDocument: vi.fn().mockResolvedValue([]),
}));

vi.mock('./services/ocrService', () => ({
    recognizeCurrentPdfPage: vi.fn().mockResolvedValue([
        {
            documentId: 'scan-doc',
            page: 1,
            spanId: 'scan-doc:p1:ocr-40-20-test',
            text: '扫描文字',
            bbox: { left: 20, top: 40, width: 80, height: 24 },
            source: 'ocr',
            engine: 'tesseract.js',
            confidence: 0.92,
        },
    ]),
}));

describe('PDF current page OCR', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        pdfjsState.textItems = [];
        window.HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
            clearRect: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
        }));
        act(() => {
            usePdfStore.getState().clearPdf();
            usePdfStore.getState().setPdfFile(new Uint8Array([1, 2, 3]));
            usePdfStore.getState().finishParsing('', 1);
        });
    });

    afterEach(() => {
        cleanup();
        usePdfStore.getState().clearPdf();
    });

    it('keeps scanned PDFs visible and offers explicit current-page OCR', async () => {
        render(<PdfViewer documentId="scan-doc" />);

        expect(await screen.findByText('PDF')).toBeTruthy();
        expect(await screen.findByText('当前页没有可选文字', {}, { timeout: 10000 })).toBeTruthy();
        expect(screen.getByRole('button', { name: /识别当前页/i })).toBeTruthy();
        expect(recognizeCurrentPdfPage).not.toHaveBeenCalled();
    });

    it('shows a native-text status instead of OCR when the page is already selectable', async () => {
        pdfjsState.textItems = [
            {
                str: '可选文字',
                width: 48,
                transform: [1, 0, 0, 12, 20, 40],
                fontName: 'sans-serif',
            },
        ];

        render(<PdfViewer documentId="native-doc" />);

        expect(await screen.findByText('当前页可划词')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /识别当前页/i })).toBeNull();
    });

    it('renders OCR result as selectable source spans after explicit recognition', async () => {
        render(<PdfViewer documentId="scan-doc" />);

        await screen.findByText('当前页没有可选文字', {}, { timeout: 10000 });
        fireEvent.click(screen.getByRole('button', { name: /识别当前页/i }));

        await Promise.resolve();
        await Promise.resolve();

        expect(recognizeCurrentPdfPage).toHaveBeenCalled();
        const span = document.querySelector('[data-source="ocr"]');
        expect(span?.textContent).toBe('扫描文字');
        expect(span?.getAttribute('data-span-id')).toBe('scan-doc:p1:ocr-40-20-test');
        expect(span?.getAttribute('data-confidence')).toBe('0.92');
    });
});
