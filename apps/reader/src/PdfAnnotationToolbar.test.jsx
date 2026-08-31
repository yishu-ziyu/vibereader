import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfAnnotationToolbar } from './PdfAnnotationToolbar';

describe('PdfAnnotationToolbar', () => {
    afterEach(() => cleanup());

    it('lets the reader inject, highlight, and save a note for the current selection', () => {
        const onInject = vi.fn();
        const onHighlight = vi.fn();
        const onSaveNote = vi.fn();
        const onGenerateLensCard = vi.fn();
        const selection = { text: 'Selected PDF passage', x: 40, y: 30, spanId: 'span-1' };

        render(
            <PdfAnnotationToolbar
                selection={selection}
                onInject={onInject}
                onHighlight={onHighlight}
                onSaveNote={onSaveNote}
                onGenerateLensCard={onGenerateLensCard}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /生成卡片|lens/i }));
        fireEvent.click(screen.getByRole('button', { name: /注入|inject/i }));
        fireEvent.click(screen.getByRole('button', { name: /高亮/i }));
        fireEvent.click(screen.getByRole('button', { name: /保存笔记/i }));
        fireEvent.change(screen.getByPlaceholderText(/笔记/i), {
            target: { value: 'My note' },
        });
        fireEvent.click(screen.getByRole('button', { name: /保存笔记/i }));

        expect(onGenerateLensCard).toHaveBeenCalledWith(selection);
        expect(onInject).toHaveBeenCalledWith('Selected PDF passage');
        expect(onHighlight).toHaveBeenCalledWith('Selected PDF passage');
        expect(onSaveNote).toHaveBeenCalledWith('Selected PDF passage', 'My note');
    });
});
