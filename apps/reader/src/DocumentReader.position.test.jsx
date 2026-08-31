import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentReader } from './DocumentReader';

const antdMessage = vi.hoisted(() => ({
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
}));

const positionMocks = vi.hoisted(() => ({
    loadPersistentReadingPosition: vi.fn(async () => null),
    savePersistentReadingPosition: vi.fn(async () => null),
}));

vi.mock('antd', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        message: antdMessage,
    };
});

vi.mock('./services/persistentStorage', () => ({
    loadPersistentReadingPosition: positionMocks.loadPersistentReadingPosition,
    savePersistentReadingPosition: positionMocks.savePersistentReadingPosition,
}));

const markdownDocument = {
    id: 'doc-position-md',
    name: 'note.md',
    kind: 'markdown',
    contentText: '# Research Note\n\nFirst paragraph body.\n\nSecond paragraph body.',
};

describe('DocumentReader reading position memory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
        // 给滚动容器一个可计算的滚动高度（jsdom 默认全为 0）
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
            configurable: true,
            get: () => 1000,
        });
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
            configurable: true,
            get: () => 200,
        });
    });

    afterEach(() => {
        cleanup();
        delete HTMLElement.prototype.scrollHeight;
        delete HTMLElement.prototype.clientHeight;
        vi.useRealTimers();
    });

    it('restores the saved scroll ratio on open and notifies the reader', async () => {
        positionMocks.loadPersistentReadingPosition.mockResolvedValueOnce({
            variant: 'text',
            page: 1,
            scrollRatio: 0.42,
            updatedAt: 100,
        });

        render(<DocumentReader document={markdownDocument} />);

        await vi.waitFor(() => {
            const container = document.querySelector('.document-reader-scroll');
            expect(container.scrollTop).toBe(0.42 * (1000 - 200));
        });
        expect(antdMessage.success).toHaveBeenCalledWith('已恢复到上次阅读位置');
    });

    it('ignores positions saved by the PDF reader (variant mismatch) and near-top ratios', async () => {
        // 审查修复（I2）：PDF 阅读器的位置不供文本阅读器消费，防止页级记忆被覆盖
        positionMocks.loadPersistentReadingPosition.mockResolvedValueOnce({
            variant: 'pdf',
            page: 8,
            scrollRatio: 0.9,
            updatedAt: 100,
        });
        render(<DocumentReader document={markdownDocument} />);
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(antdMessage.success).not.toHaveBeenCalled();
        expect(document.querySelector('.document-reader-scroll').scrollTop).toBe(0);

        // 审查修复（I5）：接近页首（<0.05）不恢复也不弹提示
        cleanup();
        positionMocks.loadPersistentReadingPosition.mockResolvedValueOnce({
            variant: 'text',
            page: 1,
            scrollRatio: 0.01,
            updatedAt: 100,
        });
        render(<DocumentReader document={markdownDocument} />);
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(antdMessage.success).not.toHaveBeenCalled();
        expect(document.querySelector('.document-reader-scroll').scrollTop).toBe(0);
    });

    it('does not notify or scroll when no position was saved before', async () => {
        render(<DocumentReader document={markdownDocument} />);

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(antdMessage.success).not.toHaveBeenCalled();
        expect(document.querySelector('.document-reader-scroll').scrollTop).toBe(0);
    });

    it('persists the scroll ratio with a 500ms debounce while scrolling', async () => {
        vi.useFakeTimers();
        render(<DocumentReader document={markdownDocument} />);

        const container = document.querySelector('.document-reader-scroll');
        container.scrollTop = 400;
        fireEvent.scroll(container);
        fireEvent.scroll(container);

        // 防抖窗口内不写入
        expect(positionMocks.savePersistentReadingPosition).not.toHaveBeenCalled();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
        });

        expect(positionMocks.savePersistentReadingPosition).toHaveBeenCalledTimes(1);
        expect(positionMocks.savePersistentReadingPosition).toHaveBeenCalledWith(
            'doc-position-md',
            expect.objectContaining({ variant: 'text', page: 1, scrollRatio: 0.5 }),
        );
    });
});
