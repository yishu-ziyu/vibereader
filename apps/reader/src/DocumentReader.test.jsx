import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentReader } from './DocumentReader';

describe('DocumentReader', () => {
    beforeEach(() => {
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        window.getSelection()?.removeAllRanges();
    });

    it('renders Markdown documents as readable content', () => {
        render(
            <DocumentReader
                document={{
                    id: 'doc-md',
                    name: 'note.md',
                    kind: 'markdown',
                    contentText: '# Research Note\n\n**Important** finding.',
                }}
            />
        );

        expect(screen.getByRole('heading', { name: 'Research Note' })).toBeTruthy();
        expect(screen.getByText('Important')).toBeTruthy();
    });

    it('navigates readable document source refs back to chunk paragraphs', () => {
        render(
            <DocumentReader
                document={{
                    id: 'doc-md',
                    name: 'note.md',
                    kind: 'markdown',
                    contentText: [
                        '# Research Note',
                        'Problem source paragraph.',
                        'Method source paragraph.',
                        'Evidence source paragraph.',
                    ].join('\n\n'),
                }}
            />
        );

        window.dispatchEvent(new CustomEvent('vibereader:navigate-paragraph', {
            detail: {
                documentId: 'doc-md',
                paragraphId: 'chunk-3',
            },
        }));

        const target = document.querySelector('[data-paragraph-id="chunk-3"]');
        expect(target).toBeTruthy();
        expect(target.textContent).toContain('Method source paragraph.');
        expect(target.classList.contains('paragraph-pulse-highlight')).toBe(true);
        expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
            block: 'center',
            inline: 'nearest',
        });
    });

    it('falls back to citation text when source paragraph ids use index naming', () => {
        render(
            <DocumentReader
                document={{
                    id: 'doc-md',
                    name: 'note.md',
                    kind: 'markdown',
                    contentText: [
                        '# Research Note',
                        'Problem source paragraph.',
                        'Method source paragraph.',
                        'Evidence source paragraph.',
                    ].join('\n\n'),
                }}
            />
        );

        window.dispatchEvent(new CustomEvent('vibereader:navigate-paragraph', {
            detail: {
                documentId: 'doc-md',
                paragraphId: 'page-1-para-1',
                text: 'Method source paragraph.',
            },
        }));

        const target = document.querySelector('[data-paragraph-id="chunk-3"]');
        expect(target).toBeTruthy();
        expect(target.textContent).toContain('Method source paragraph.');
        expect(target.classList.contains('paragraph-pulse-highlight')).toBe(true);
    });

    it('renders text documents with their line breaks preserved', () => {
        render(
            <DocumentReader
                document={{
                    id: 'doc-txt',
                    name: 'notes.txt',
                    kind: 'text',
                    contentText: 'Line one\nLine two',
                }}
            />
        );

        const content = screen.getByTestId('text-document-content');
        expect(content.textContent).toContain('Line one');
        expect(content.textContent).toContain('Line two');
        expect(content.style.whiteSpace).toBe('pre-wrap');
    });

    it('renders HTML documents as sanitized readable text', () => {
        render(
            <DocumentReader
                document={{
                    id: 'doc-html',
                    name: 'article.html',
                    kind: 'html',
                    contentText: '<h1>Article Title</h1><script>alert(1)</script><p>Body text.</p>',
                }}
            />
        );

        expect(screen.getByText(/Article Title/)).toBeTruthy();
        expect(screen.getByText(/Body text/)).toBeTruthy();
        expect(screen.queryByText(/alert/)).toBeNull();
    });

    it('injects the selected text into AI context', async () => {
        const onInject = vi.fn();
        render(
            <DocumentReader
                document={{
                    id: 'doc-txt',
                    name: 'notes.txt',
                    kind: 'text',
                    contentText: 'Selected passage for AI.',
                }}
                onInject={onInject}
            />
        );

        const content = screen.getByTestId('text-document-content');
        const range = document.createRange();
        range.selectNodeContents(content);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        fireEvent(document, new Event('selectionchange'));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /注入 AI/i })).toBeTruthy();
        });

        fireEvent.click(screen.getByRole('button', { name: /注入 AI/i }));

        expect(onInject).toHaveBeenCalledWith('Selected passage for AI.');
    });
});
