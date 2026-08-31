import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationStore, useDocumentStore, useModelStore, usePdfStore, useUIStore, useVibeStore } from './store';

const mockSelection = vi.hoisted(() => ({
    documentId: 'doc-pdf',
    text: 'Traceable selected passage.',
    page: 2,
    spanId: 'span-2',
    sourceRect: { left: 0.1, top: 0.2, width: 0.3, height: 0.04 },
    sourceRects: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.04 }],
    coordinateSpace: 'page-normalized',
    sourceType: 'pdf-selection',
}));

const mockChatStream = vi.hoisted(() => vi.fn());

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
        chatStream: mockChatStream,
        clearHistory: vi.fn(),
        setConfig: vi.fn(),
        setPaperContext: vi.fn(),
    },
}));

vi.mock('./pdfService', () => ({
    extractTextFromPDF: vi.fn(),
}));

vi.mock('./services/documentService', () => ({
    SUPPORTED_DOCUMENT_EXTENSIONS: ['.pdf', '.md', '.txt'],
    fileToDocument: vi.fn(),
    fileToDocumentWithContent: vi.fn(),
    openTauriDocument: vi.fn(),
}));

vi.mock('./services/artifactService', () => ({
    createArtifact: vi.fn(async (artifact) => artifact),
    listArtifactsForDocument: vi.fn(async () => []),
}));

vi.mock('./agent', () => ({
    generateLensCardArtifact: vi.fn(async ({ selection }) => ({
        id: 'artifact-test-lens-card',
        type: 'lens_card',
        documentId: selection.documentId,
        verificationStatus: 'grounded',
        currentContent: {
            selectionText: selection.text,
            explanation: '第一点：解释选区。\n第二点：保留回源。',
            claims: [
                {
                    text: '第一点：解释选区。\n第二点：保留回源。',
                    sourceSpanIds: [selection.spanId],
                    inference: false,
                },
            ],
            source: {
                documentId: selection.documentId,
                page: selection.page,
                spanId: selection.spanId,
                rect: selection.sourceRect,
                rects: selection.sourceRects,
                coordinateSpace: selection.coordinateSpace,
                sourceType: selection.sourceType,
            },
        },
    })),
}));

vi.mock('@ant-design/x', () => ({
    Bubble: ({ content }) => content,
}));

vi.mock('./ThinkingTreePanel', () => ({
    ThinkingTreePanel: () => <div data-testid="mock-skim-map-panel">Skim Map</div>,
    default: () => <div data-testid="mock-skim-map-panel">Skim Map</div>,
}));

vi.mock('./ChatInput', () => ({
    default: ({ configOpenSignal }) => (
        <div className="mock-chat-input">
            {configOpenSignal ? <div>自定义模型设置</div> : null}
        </div>
    ),
}));

vi.mock('./PdfViewer', async () => {
    const ReactModule = await import('react');
    return {
        PdfViewer: ({ onGenerateLensCard }) => ReactModule.createElement(
            'button',
            {
                type: 'button',
                onClick: () => onGenerateLensCard(mockSelection),
            },
            'Generate mocked Lens Card'
        ),
    };
});

vi.mock('./ArtifactPanel', () => {
    const MockArtifactPanel = ({ artifacts, onNavigateToSource }) => (
        <div data-testid="mock-artifact-panel">
            {artifacts.map((artifact) => (
                <article key={artifact.id}>
                    <h2>Lens Card</h2>
                    <p>{artifact.currentContent?.selectionText}</p>
                    {artifact.currentContent?.claims?.map((claim, index) => (
                        <p key={index}>{claim.text}</p>
                    ))}
                    <button type="button" onClick={() => onNavigateToSource?.(artifact)}>
                        回到原文
                    </button>
                </article>
            ))}
        </div>
    );

    return {
        ArtifactPanel: MockArtifactPanel,
        default: MockArtifactPanel,
    };
});

function resetStores() {
    useConversationStore.setState({
        messages: [],
        currentSessionId: null,
        sessions: [],
        loading: false,
        historyLoaded: true,
    });
    useDocumentStore.getState().clearDocuments();
    usePdfStore.getState().clearPdf();
    useUIStore.setState({ rightToolTab: 'artifacts', workspaceSplitRatio: 0.58 });
    useModelStore.setState({
        selectedModel: {
            key: 'custom',
            label: 'Test Model',
            config: {
                id: 'test-model',
                baseUrl: 'https://example.test/v1',
                apiKey: 'test-key',
                modelName: 'test-model',
                apiFormat: 'openai',
            },
        },
        visionCapable: false,
    });
    useVibeStore.getState().clearVibeData();
}

describe('App Lens Card closure', () => {
    beforeEach(() => {
        localStorage.clear();
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
        mockChatStream.mockImplementation(async (_prompt, onUpdate) => {
            onUpdate({
                done: true,
                fullMessage: '第一点：解释选区。\n第二点：保留回源。',
            });
        });
        resetStores();
        act(() => {
            useDocumentStore.getState().addDocument({
                id: 'doc-pdf',
                name: 'paper.pdf',
                kind: 'pdf',
                contentText: 'Traceable selected passage.',
            });
            usePdfStore.getState().finishParsing('Traceable selected passage.', 2);
        });
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        resetStores();
        document.body.innerHTML = '';
    });

    it('saves a generated Lens Card and renders it in Notes', async () => {
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Generate mocked Lens Card'));

        await waitFor(() => {
            expect(screen.getByText('Lens Card')).toBeTruthy();
            expect(screen.getByText('Traceable selected passage.')).toBeTruthy();
            expect(screen.getAllByText(/第一点：解释选区。/).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/第二点：保留回源。/).length).toBeGreaterThan(0);
        });
        expect(useUIStore.getState().rightToolTab).toBe('artifacts');
    });

    it('navigates a generated PDF Lens Card back to the selected source span', async () => {
        const navigateListener = vi.fn();
        window.addEventListener('vibereader:navigate-source-span', navigateListener);
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Generate mocked Lens Card'));

        await screen.findByText('Traceable selected passage.');
        fireEvent.click(screen.getByRole('button', { name: '回到原文' }));

        expect(navigateListener).toHaveBeenCalledTimes(1);
        expect(navigateListener.mock.calls[0][0].detail).toEqual(expect.objectContaining({
            documentId: 'doc-pdf',
            page: 2,
            spanId: 'span-2',
            rect: mockSelection.sourceRect,
            rects: mockSelection.sourceRects,
            coordinateSpace: 'page-normalized',
            sourceType: 'pdf-selection',
        }));

        window.removeEventListener('vibereader:navigate-source-span', navigateListener);
    });

    it('keeps model service setup reachable from Notes before chat is open', async () => {
        useModelStore.setState({
            selectedModel: {
                key: 'custom',
                label: 'Custom Model',
                config: null,
            },
            visionCapable: false,
        });
        const { App } = await import('./App.jsx');
        render(<App />);

        expect(useUIStore.getState().rightToolTab).toBe('artifacts');
        const modelConfigButton = screen.getAllByText(/配置模型服务|Configure model service|Model service/i)[0].closest('button');
        expect(modelConfigButton).toBeTruthy();
        fireEvent.click(modelConfigButton);

        await waitFor(() => {
            expect(useUIStore.getState().rightToolTab).toBe('artifacts');
            expect(screen.getByText(/模型配置|Model Configuration/i)).toBeTruthy();
        });
    });
});
