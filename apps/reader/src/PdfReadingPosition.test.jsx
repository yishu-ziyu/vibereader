import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfViewer } from './PdfViewer';
import { usePdfStore } from './store';

const antdMessage = vi.hoisted(() => ({
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
}));

vi.mock('antd', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        message: antdMessage,
    };
});

// 注意：不 mock ./services/persistentStorage —— 其与 ./storage.js 存在循环引用，
// 工厂替换会破坏 store → storage.js 的导入。这里使用真实模块的浏览器回退
// （localStorage key vibereader.readingPositions）来验证保存/恢复。

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {
        workerSrc: '',
    },
    Util: {
        transform: vi.fn(() => [1, 0, 0, 12, 20, 40]),
    },
    getDocument: vi.fn().mockReturnValue({
        promise: Promise.resolve({
            numPages: 3,
            getPage: vi.fn().mockResolvedValue({
                getViewport: vi.fn().mockReturnValue({ width: 320, height: 480, scale: 1 }),
                render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
                getTextContent: vi.fn().mockResolvedValue({ items: [] }),
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
    recognizeCurrentPdfPage: vi.fn().mockResolvedValue([]),
}));

const POSITIONS_KEY = 'vibereader.readingPositions';

function readStoredPosition(documentId) {
    try {
        const map = JSON.parse(localStorage.getItem(POSITIONS_KEY) || '{}');
        return map[documentId] || null;
    } catch (_) {
        return null;
    }
}

describe('PdfViewer reading position memory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        window.HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
            clearRect: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
        }));
        act(() => {
            usePdfStore.getState().clearPdf();
            usePdfStore.getState().setPdfFile(new Uint8Array([1, 2, 3]));
            usePdfStore.getState().finishParsing('', 3);
        });
    });

    afterEach(() => {
        cleanup();
        usePdfStore.getState().clearPdf();
        localStorage.clear();
    });

    it('restores the saved page and zoom after the PDF loads and notifies the reader', async () => {
        localStorage.setItem(POSITIONS_KEY, JSON.stringify({
            'pos-doc': { page: 2, scrollRatio: 0.5, zoom: 1.5, updatedAt: 100 },
        }));

        render(<PdfViewer documentId="pos-doc" />);

        expect(await screen.findByText('150%', {}, { timeout: 10000 })).toBeTruthy();
        expect(screen.getByDisplayValue('2')).toBeTruthy();
        expect(antdMessage.success).toHaveBeenCalledWith('已恢复到上次阅读位置');

        // 恢复完成后写回的位置应是恢复后的页码/缩放（而不是初始值）
        await vi.waitFor(() => {
            expect(readStoredPosition('pos-doc')).toEqual(
                expect.objectContaining({ page: 2, zoom: 1.5 }),
            );
        });
    }, 20000);

    it('does not notify when no position was saved before', async () => {
        render(<PdfViewer documentId="pos-doc" />);

        expect(await screen.findByText('当前页没有可选文字', {}, { timeout: 10000 })).toBeTruthy();
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(antdMessage.success).not.toHaveBeenCalled();
        expect(screen.getByDisplayValue('1')).toBeTruthy();
    }, 20000);

    it('persists the position when the reader navigates to another page', async () => {
        render(<PdfViewer documentId="pos-doc" />);

        await screen.findByText('当前页没有可选文字', {}, { timeout: 10000 });
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '2' } });

        await vi.waitFor(() => {
            expect(readStoredPosition('pos-doc')).toEqual(
                expect.objectContaining({ page: 2 }),
            );
        });
        expect(antdMessage.success).not.toHaveBeenCalled();
    }, 20000);
});
