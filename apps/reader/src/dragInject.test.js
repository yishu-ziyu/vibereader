import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatInput from './ChatInput';
import { DocumentReader } from './DocumentReader';
import { useConversationStore, useDocumentStore, usePdfStore, useUIStore, useVibeStore } from './store';

const DRAG_INJECT_MIME = 'application/x-vibereader-drag-inject';

vi.mock('./storage', () => ({
    deleteConversation: vi.fn().mockResolvedValue(true),
    getFontScale: vi.fn(() => 1),
    getModelConfigs: vi.fn(() => []),
    getSelectedConfigId: vi.fn(() => null),
    listConversations: vi.fn().mockResolvedValue([]),
    loadConversation: vi.fn().mockResolvedValue(null),
    saveConversation: vi.fn().mockResolvedValue(true),
    setFontScale: vi.fn(),
    setSelectedConfigId: vi.fn(),
    saveModelConfigs: vi.fn(() => true),
}));

vi.mock('./aiService', () => ({
    default: {
        addMessage: vi.fn(),
        chatStream: vi.fn(),
        clearHistory: vi.fn(),
        setConfig: vi.fn(),
        setPaperContext: vi.fn(),
    },
}));

vi.mock('@ant-design/x', () => ({
    Bubble: ({ content }) => content,
}));

function createDataTransfer(initialData = {}) {
    const data = new Map(Object.entries(initialData));
    const transfer = {
        dropEffect: 'none',
        effectAllowed: 'none',
        clearData: vi.fn((type) => {
            if (type) {
                data.delete(type);
                return;
            }
            data.clear();
        }),
        getData: vi.fn((type) => data.get(type) || ''),
        setData: vi.fn((type, value) => {
            data.set(type, value);
        }),
    };
    Object.defineProperty(transfer, 'types', {
        get: () => [...data.keys()],
    });
    return transfer;
}

function selectNodeText(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent(document, new Event('selectionchange'));
}

function resetStores() {
    useConversationStore.setState({
        messages: [],
        currentSessionId: null,
        sessions: [],
        loading: false,
        historyLoaded: false,
    });
    useDocumentStore.getState().clearDocuments();
    usePdfStore.getState().clearPdf();
    useUIStore.setState({ rightToolTab: 'chat', workspaceSplitRatio: 0.55 });
    useVibeStore.getState().clearVibeData();
}

describe('Drag-to-Inject', () => {
    beforeEach(() => {
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        cleanup();
        resetStores();
        window.getSelection()?.removeAllRanges();
        document.body.innerHTML = '';
    });

    it('makes selected reader text draggable with source metadata', async () => {
        render(
            React.createElement(DocumentReader, {
                document: {
                    id: 'doc-text',
                    name: 'notes.txt',
                    kind: 'text',
                    contentText: 'Dragged source passage.',
                },
                onInject: vi.fn(),
            })
        );

        const content = screen.getByTestId('text-document-content');
        selectNodeText(content);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /注入 AI/i })).toBeTruthy();
        });

        const dataTransfer = createDataTransfer();
        fireEvent.dragStart(content, { dataTransfer });

        expect(dataTransfer.effectAllowed).toBe('copy');
        expect(dataTransfer.getData('text/plain')).toBe('Dragged source passage.');
        expect(JSON.parse(dataTransfer.getData(DRAG_INJECT_MIME))).toMatchObject({
            text: 'Dragged source passage.',
            page: 1,
        });
    });

    it('drops a reader quote on the AI pane without sending it', async () => {
        document.body.innerHTML = '<div id="root"></div>';
        const { App } = await import('./App.jsx');
        render(React.createElement(App));

        await screen.findByText('工作台');

        act(() => {
            useDocumentStore.getState().addDocument({
                id: 'drop-doc',
                name: 'paper-notes.txt',
                kind: 'text',
                contentText: 'Readable document body.',
            });
        });

        const payload = JSON.stringify({ text: 'Important claim', page: 3 });
        const dataTransfer = createDataTransfer({ [DRAG_INJECT_MIME]: payload });
        const aiPane = document.querySelector('.workspace-ai-pane');

        fireEvent.dragOver(aiPane, { dataTransfer });
        fireEvent.drop(aiPane, { dataTransfer });

        const editor = document.querySelector('[data-slate-editor="true"]');
        await waitFor(() => {
            expect(editor.textContent).toContain('> Important claim [P3]');
        });
        expect(useConversationStore.getState().messages).toEqual([]);
    });

    it('cancels when the quote is dropped outside the AI pane', () => {
        const onSubmit = vi.fn();
        const { container } = render(
            React.createElement(ChatInput, {
                currentModel: { label: 'Test Model' },
                onModelChange: vi.fn(),
                onSubmit,
                onStop: vi.fn(),
                loading: false,
                visionCapable: false,
            })
        );

        const dataTransfer = createDataTransfer({
            [DRAG_INJECT_MIME]: JSON.stringify({ text: 'Outside quote', page: 4 }),
        });
        fireEvent.drop(document.body, { dataTransfer });

        const editor = container.querySelector('[data-slate-editor="true"]');
        expect(editor.textContent).not.toContain('Outside quote');
        expect(onSubmit).not.toHaveBeenCalled();
    });
});
