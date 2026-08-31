import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationStore, useDocumentStore, useModelStore, usePdfStore, useUIStore, useVibeStore } from './store';

const mockChatStream = vi.hoisted(() => vi.fn());
const mockSetPaperContext = vi.hoisted(() => vi.fn());
const attentionPanelMock = vi.hoisted(() => ({
    lastProps: null,
}));
const summaryPanelMock = vi.hoisted(() => ({
    lastProps: null,
}));
const artifactServiceMock = vi.hoisted(() => ({
    createArtifact: vi.fn(async (artifact) => ({
        id: 'artifact-answer-card',
        ...artifact,
    })),
    listArtifactsForDocument: vi.fn(async () => []),
}));
const ragEngineAdapterMock = vi.hoisted(() => ({
    query: vi.fn(async () => ({
        answer: 'UniRAG says the identification strategy uses matched controls.',
        sourceRefs: [
            {
                documentId: 'working-paper.pdf',
                documentName: 'working-paper.pdf',
                page: 2,
                paragraphId: 'working-paper.pdf:2',
                chunkId: 'working-paper.pdf:2',
                label: 'P2',
                text: 'The identification strategy uses matched controls.',
            },
        ],
        ragEngine: {
            engine: 'uni-rag',
            available: true,
            degraded: false,
        },
    })),
    health: vi.fn(async () => ({
        available: true,
        engine: 'uni-rag',
        adapter: 'uni-rag',
        degraded: false,
        baseUrl: 'http://127.0.0.1:8766',
    })),
    ingestMemory: vi.fn(async () => ({
        jobId: 'memory-job-1',
        statusUrl: '/api/memory/jobs/memory-job-1',
    })),
    getMemoryIngestStatus: vi.fn(async () => ({
        jobId: 'memory-job-1',
        status: 'completed',
        percent: 100,
        message: '记忆沉淀完成',
        result: {
            memory_id: 'memory-1',
            chunks: 1,
        },
    })),
}));
const documentKnowledgeServiceMock = vi.hoisted(() => ({
    isDocumentKnowledgeQueryReady: vi.fn(() => false),
    loadDocumentKnowledgeLink: vi.fn(() => null),
    refreshDocumentKnowledgeLinkFromStore: vi.fn(async () => null),
    startDocumentKnowledgeIngest: vi.fn(async () => null),
}));

vi.mock('./storage', () => ({
    bootstrapModelApiKeys: vi.fn().mockResolvedValue(0),
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

vi.mock('./services/persistentStorage', () => ({
    initializePersistentStorage: vi.fn(async () => ({ initialized: false })),
    isPersistentStorageAvailable: vi.fn(() => false),
    listPersistentDocuments: vi.fn(async () => []),
    listPersistentSourceSpans: vi.fn(async () => []),
    listPersistentTasks: vi.fn(async () => []),
    loadPersistentSourceIndexStatus: vi.fn(async () => null),
    replacePersistentSourceSpans: vi.fn(async () => []),
    savePersistentSourceIndexStatus: vi.fn(async () => null),
    savePersistentTask: vi.fn(async (task) => task),
    savePersistentDocument: vi.fn(async () => ({ ok: true })),
    searchPersistentSourceSpans: vi.fn(async () => []),
    loadPersistentReadingPosition: vi.fn(async () => null),
    savePersistentReadingPosition: vi.fn(async () => null),
    TASK_UPDATED_EVENT: 'vibereader:test-task-updated',
}));

vi.mock('./services/artifactService', () => artifactServiceMock);

vi.mock('./services/ragEngineAdapter', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        createUniRagHttpAdapter: vi.fn(() => ragEngineAdapterMock),
    };
});

vi.mock('./services/documentKnowledgeService', () => ({
    KNOWLEDGE_INGEST_TASK_TYPE: 'knowledge_ingest',
    isDocumentKnowledgeQueryReady: documentKnowledgeServiceMock.isDocumentKnowledgeQueryReady,
    loadDocumentKnowledgeLink: documentKnowledgeServiceMock.loadDocumentKnowledgeLink,
    refreshDocumentKnowledgeLinkFromStore: documentKnowledgeServiceMock.refreshDocumentKnowledgeLinkFromStore,
    startDocumentKnowledgeIngest: documentKnowledgeServiceMock.startDocumentKnowledgeIngest,
}));

vi.mock('./aiService', () => ({
    default: {
        addMessage: vi.fn(),
        chatStream: mockChatStream,
        clearHistory: vi.fn(),
        setConfig: vi.fn(),
        setPaperContext: mockSetPaperContext,
    },
}));

vi.mock('@ant-design/x', () => ({
    Bubble: ({ content }) => content,
}));

vi.mock('./ChatInput', () => ({
    default: ({ onSubmit }) => (
        <div>
            <button type="button" onClick={() => onSubmit('What is the identification strategy?', [])}>
                Ask mocked retrieval question
            </button>
            <button type="button" onClick={() => onSubmit('Explain this page.', [])}>
                Ask mocked current page question
            </button>
        </div>
    ),
}));

vi.mock('./PdfViewer', () => ({
    PdfViewer: ({ onPageChange }) => {
        React.useEffect(() => {
            const timer = window.setTimeout(() => onPageChange?.(3), 0);
            return () => window.clearTimeout(timer);
        }, [onPageChange]);
        return <div data-testid="mock-pdf-viewer">PDF Viewer</div>;
    },
}));

vi.mock('./ThinkingTreePanel', () => ({
    ThinkingTreePanel: () => <div>Skim Map</div>,
    default: () => <div>Skim Map</div>,
}));

function MockSummaryPanel(props) {
    summaryPanelMock.lastProps = props;
    return (
        <div>
            <div>Summary</div>
            <button
                type="button"
                onClick={() => props.onArtifactCreated?.({
                    id: 'artifact-summary-concept',
                    documentId: 'doc-retrieval',
                    type: 'concept_card',
                    goal: 'Concept Card：Methods',
                    currentContent: {
                        summary: 'Mocked summary card',
                    },
                })}
            >
                Save mocked summary concept card
            </button>
        </div>
    );
}

vi.mock('./SummaryPanel', () => ({
    SummaryPanel: MockSummaryPanel,
    default: MockSummaryPanel,
}));

vi.mock('./FlashcardDeck', () => ({
    FlashcardDeck: () => <div>Cards</div>,
    default: () => <div>Cards</div>,
}));

vi.mock('./AttentionNavigatorPanel', () => ({
    AttentionNavigatorPanel: (props) => {
        attentionPanelMock.lastProps = props;
        return (
            <div>
                <div>Attention</div>
                <button type="button" onClick={() => props.onAskAI?.('Explain this attention insight.')}>
                    Ask mocked attention insight
                </button>
                <button
                    type="button"
                    onClick={() => props.onArtifactCreated?.({
                        id: 'artifact-route-card',
                        documentId: 'doc-retrieval',
                        type: 'concept_card',
                        goal: 'Concept Card：Methods',
                        currentContent: {
                            summary: 'Mocked route card',
                        },
                    })}
                >
                    Save mocked route card
                </button>
            </div>
        );
    },
    default: (props) => {
        attentionPanelMock.lastProps = props;
        return (
            <div>
                <div>Attention</div>
                <button type="button" onClick={() => props.onAskAI?.('Explain this attention insight.')}>
                    Ask mocked attention insight
                </button>
                <button
                    type="button"
                    onClick={() => props.onArtifactCreated?.({
                        id: 'artifact-route-card',
                        documentId: 'doc-retrieval',
                        type: 'concept_card',
                        goal: 'Concept Card：Methods',
                        currentContent: {
                            summary: 'Mocked route card',
                        },
                    })}
                >
                    Save mocked route card
                </button>
            </div>
        );
    },
}));

function MockArtifactPanel({ artifacts = [], onNavigateToSource }) {
    return (
        <div>
            <div>Notes</div>
            {artifacts.map((artifact) => (
                <article key={artifact.id}>
                    <h2>{artifact.goal}</h2>
                    <p>{artifact.currentContent?.summary}</p>
                    <p>{artifact.currentContent?.answer}</p>
                    <button type="button" onClick={() => onNavigateToSource?.(artifact)}>
                        回到原文
                    </button>
                </article>
            ))}
        </div>
    );
}

vi.mock('./ArtifactPanel', () => ({
    ArtifactPanel: MockArtifactPanel,
    default: MockArtifactPanel,
}));

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
    useUIStore.setState({ rightToolTab: 'chat', workspaceSplitRatio: 0.58 });
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
                providerKey: 'minimax',
            },
        },
        visionCapable: false,
    });
    useVibeStore.getState().clearVibeData();
}

describe('App retrieval context', () => {
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
                fullMessage: 'The answer cites the document source.',
            });
        });
        attentionPanelMock.lastProps = null;
        summaryPanelMock.lastProps = null;
        artifactServiceMock.createArtifact.mockClear();
        artifactServiceMock.listArtifactsForDocument.mockClear();
        ragEngineAdapterMock.query.mockClear();
        ragEngineAdapterMock.health.mockClear();
        ragEngineAdapterMock.ingestMemory.mockClear();
        ragEngineAdapterMock.getMemoryIngestStatus.mockClear();
        documentKnowledgeServiceMock.isDocumentKnowledgeQueryReady.mockReset();
        documentKnowledgeServiceMock.isDocumentKnowledgeQueryReady.mockReturnValue(false);
        documentKnowledgeServiceMock.loadDocumentKnowledgeLink.mockReset();
        documentKnowledgeServiceMock.loadDocumentKnowledgeLink.mockReturnValue(null);
        documentKnowledgeServiceMock.startDocumentKnowledgeIngest.mockReset();
        documentKnowledgeServiceMock.startDocumentKnowledgeIngest.mockResolvedValue(null);
        resetStores();
        act(() => {
            useDocumentStore.getState().addDocument({
                id: 'doc-retrieval',
                name: 'working-paper.pdf',
                kind: 'pdf',
                pdfPages: 3,
                contentText: [
                    '--- 第 1 页 ---',
                    'The abstract introduces a placebo exercise and broad motivation.',
                    '',
                    '--- 第 2 页 ---',
                    'The identification strategy uses a difference in differences design with treated firms and matched controls.',
                    '',
                    '--- 第 3 页 ---',
                    'The conclusion discusses policy implications for market design.',
                ].join('\n'),
                pdfText: [
                    '--- 第 1 页 ---',
                    'The abstract introduces a placebo exercise and broad motivation.',
                    '',
                    '--- 第 2 页 ---',
                    'The identification strategy uses a difference in differences design with treated firms and matched controls.',
                    '',
                    '--- 第 3 页 ---',
                    'The conclusion discusses policy implications for market design.',
                ].join('\n'),
                vibeData: {
                    title: 'Working Paper',
                    sections: [
                        { id: 'sec-abstract', title: 'Abstract', pageStart: 1, pageEnd: 1 },
                        { id: 'sec-methods', title: 'Methods', pageStart: 2, pageEnd: 2 },
                        { id: 'sec-conclusion', title: 'Conclusion', pageStart: 3, pageEnd: 3 },
                    ],
                },
            });
        });
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        resetStores();
        document.body.innerHTML = '';
    });

    it('sends retrieved source excerpts to chat and stores assistant source refs', async () => {
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));

        await waitFor(() => {
            expect(mockChatStream).toHaveBeenCalled();
        });

        const messageContent = mockChatStream.mock.calls[0][0];
        expect(messageContent).toContain('What is the identification strategy?');
        expect(messageContent).toContain('Relevant source excerpts');
        expect(messageContent).toContain('[source:doc-retrieval:p2:page-2-para-0]');
        expect(messageContent).toContain('difference in differences');
        expect(messageContent).not.toContain('placebo exercise');
        expect(messageContent).not.toContain('policy implications');
        expect(mockSetPaperContext).not.toHaveBeenCalledWith(expect.stringContaining('placebo exercise'));

        await waitFor(() => {
            const assistantMessage = useConversationStore.getState().messages.find((message) => message.role === 'assistant');
            expect(assistantMessage).toEqual(expect.objectContaining({
                content: 'The answer cites the document source.',
                sourceRefs: [
                    expect.objectContaining({
                        documentId: 'doc-retrieval',
                        page: 2,
                        paragraphId: 'page-2-para-0',
                    }),
                ],
            }));
        });
        expect(await screen.findByText('原文依据')).toBeTruthy();
        expect(screen.getByRole('button', { name: /P2/ })).toBeTruthy();
    });

    it('routes text-only chat through UniRAG when the current document is ingested', async () => {
        documentKnowledgeServiceMock.isDocumentKnowledgeQueryReady.mockReturnValue(true);

        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));

        await waitFor(() => {
            expect(ragEngineAdapterMock.query).toHaveBeenCalledWith(expect.objectContaining({
                question: 'What is the identification strategy?',
                includeMemory: true,
                memoryTopK: 3,
                providerKey: 'minimax',
                apiKey: 'test-key',
                mode: 'chat',
            }));
        });
        expect(mockChatStream).not.toHaveBeenCalled();

        await waitFor(() => {
            const assistantMessage = useConversationStore.getState().messages.find((message) => message.role === 'assistant');
            expect(assistantMessage).toEqual(expect.objectContaining({
                content: 'UniRAG says the identification strategy uses matched controls.',
                sourceRefs: [
                    expect.objectContaining({
                        documentId: 'doc-retrieval',
                        documentName: 'working-paper.pdf',
                        page: 2,
                        paragraphId: 'page-2-para-0',
                        label: 'P2',
                        grounding: expect.objectContaining({
                            precision: 'paragraph',
                        }),
                    }),
                ],
                ragEngine: expect.objectContaining({
                    engine: 'uni-rag',
                    available: true,
                }),
            }));
        });
        expect(await screen.findByText('原文依据')).toBeTruthy();
    });

    it('shows saved memory citations and navigates them back to Notes cards', async () => {
        documentKnowledgeServiceMock.isDocumentKnowledgeQueryReady.mockReturnValue(true);
        ragEngineAdapterMock.query.mockResolvedValueOnce({
            answer: '你的已保存卡片认为，真 Agent 的关键是任务规划和可审计闭环。',
            sourceRefs: [
                {
                    id: 'artifact-answer-card',
                    evidenceType: 'memory',
                    sourceType: 'saved_memory',
                    artifactId: 'artifact-answer-card',
                    artifactType: 'explain_card',
                    memoryId: 'memory-1',
                    memoryTitle: 'AI 回答：What is the identification strategy?',
                    label: '记忆 1',
                    text: 'The saved card says auditable execution matters.',
                    sourceRefs: [
                        {
                            documentId: 'doc-retrieval',
                            documentName: 'working-paper.pdf',
                            page: 2,
                            paragraphId: 'page-2-para-0',
                            text: 'The identification strategy uses a difference in differences design.',
                        },
                    ],
                },
            ],
            ragEngine: {
                engine: 'uni-rag',
                available: true,
                degraded: false,
            },
        });
        const navigateArtifactListener = vi.fn();
        window.addEventListener('vibereader:navigate-artifact', navigateArtifactListener);

        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));

        expect(await screen.findByText('我的记忆')).toBeTruthy();
        const memoryButton = await screen.findByRole('button', {
            name: /打开我的记忆 记忆 1: AI 回答/,
        });
        fireEvent.click(memoryButton);

        await waitFor(() => {
            expect(useUIStore.getState().rightToolTab).toBe('artifacts');
        });
        await waitFor(() => {
            expect(navigateArtifactListener).toHaveBeenCalledTimes(1);
        });
        expect(navigateArtifactListener.mock.calls[0][0].detail).toEqual(expect.objectContaining({
            artifactId: 'artifact-answer-card',
            memoryId: 'memory-1',
        }));

        window.removeEventListener('vibereader:navigate-artifact', navigateArtifactListener);
    });

    it('dispatches grounded UniRAG citations to the matched Reader paragraph', async () => {
        documentKnowledgeServiceMock.isDocumentKnowledgeQueryReady.mockReturnValue(true);
        const navigateListener = vi.fn();
        window.addEventListener('vibereader:navigate-paragraph', navigateListener);

        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));

        const sourceButton = await screen.findByRole('button', {
            name: /打开原文依据 P2: The identification strategy/i,
        });
        fireEvent.click(sourceButton);

        expect(navigateListener).toHaveBeenCalledTimes(1);
        expect(navigateListener.mock.calls[0][0].detail).toEqual(expect.objectContaining({
            documentId: 'doc-retrieval',
            page: 2,
            paragraphId: 'page-2-para-0',
            text: expect.stringContaining('matched controls'),
        }));

        window.removeEventListener('vibereader:navigate-paragraph', navigateListener);
    });

    it('dispatches a paragraph navigation event with source text when a source ref is clicked', async () => {
        const navigateListener = vi.fn();
        window.addEventListener('vibereader:navigate-paragraph', navigateListener);
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));

        const sourceButton = await screen.findByRole('button', {
            name: /打开原文依据 P2: The identification strategy/i,
        });
        fireEvent.click(sourceButton);

        expect(navigateListener).toHaveBeenCalledTimes(1);
        expect(navigateListener.mock.calls[0][0].detail).toEqual(expect.objectContaining({
            documentId: 'doc-retrieval',
            page: 2,
            paragraphId: 'page-2-para-0',
            text: expect.stringContaining('difference in differences'),
        }));

        window.removeEventListener('vibereader:navigate-paragraph', navigateListener);
    });

    it('uses the current PDF page when current-page chat context is selected', async () => {
        const { App } = await import('./App.jsx');
        render(<App />);

        await screen.findByText(/P3/);
        fireEvent.click(await screen.findByRole('radio', { name: '当前页' }));
        fireEvent.click(await screen.findByText('Ask mocked current page question'));

        await waitFor(() => {
            expect(mockChatStream).toHaveBeenCalled();
        });

        const messageContent = mockChatStream.mock.calls[0][0];
        expect(messageContent).toContain('Current page source excerpts');
        expect(messageContent).toContain('[source:doc-retrieval:p3:page-3-para-0]');
        expect(messageContent).toContain('policy implications');
        expect(messageContent).not.toContain('difference in differences');
        expect(messageContent).not.toContain('placebo exercise');
    });

    it('uses the current section when current-section chat context is selected', async () => {
        const { App } = await import('./App.jsx');
        render(<App />);

        await screen.findByText(/P3.*Conclusion/);
        fireEvent.click(await screen.findByRole('radio', { name: '当前章节' }));
        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));

        await waitFor(() => {
            expect(mockChatStream).toHaveBeenCalled();
        });

        const messageContent = mockChatStream.mock.calls[0][0];
        expect(messageContent).toContain('Current section source excerpts');
        expect(messageContent).toContain('[source:doc-retrieval:p3:page-3-para-0]');
        expect(messageContent).toContain('policy implications');
        expect(messageContent).not.toContain('difference in differences');
        expect(messageContent).not.toContain('placebo exercise');
    });

    it('uses the selected paragraph when selected-paragraph chat context is selected', async () => {
        const { App } = await import('./App.jsx');
        render(<App />);

        act(() => {
            window.dispatchEvent(new CustomEvent('vibereader:select-paragraph', {
                detail: { paragraphId: 'page-1-para-0' },
            }));
        });
        fireEvent.click(await screen.findByRole('radio', { name: '选中段落' }));
        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));

        await waitFor(() => {
            expect(mockChatStream).toHaveBeenCalled();
        });

        const messageContent = mockChatStream.mock.calls[0][0];
        expect(messageContent).toContain('Selected paragraph source excerpts');
        expect(messageContent).toContain('[source:doc-retrieval:p1:page-1-para-0]');
        expect(messageContent).toContain('placebo exercise');
        expect(messageContent).not.toContain('difference in differences');
        expect(messageContent).not.toContain('policy implications');
    });

    it('lets the attention navigator send a focused insight question to chat', async () => {
        useUIStore.setState({ rightToolTab: 'navigator' });
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Ask mocked attention insight'));

        await waitFor(() => {
            expect(mockChatStream).toHaveBeenCalled();
        });
        expect(attentionPanelMock.lastProps?.onAskAI).toEqual(expect.any(Function));
        expect(mockChatStream.mock.calls[0][0]).toContain('Explain this attention insight.');
    });

    it('receives reading route cards and switches the right pane to Notes', async () => {
        useUIStore.setState({ rightToolTab: 'navigator' });
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Save mocked route card'));

        await waitFor(() => {
            expect(useUIStore.getState().rightToolTab).toBe('artifacts');
            expect(screen.getByText('Mocked route card')).toBeTruthy();
        });
        await waitFor(() => {
            expect(ragEngineAdapterMock.ingestMemory).toHaveBeenCalledWith({
                memory: expect.objectContaining({
                    artifactId: 'artifact-route-card',
                    artifactType: 'concept_card',
                    title: 'Concept Card：Methods',
                    text: expect.stringContaining('Mocked route card'),
                }),
            });
        });
        expect(attentionPanelMock.lastProps?.onArtifactCreated).toEqual(expect.any(Function));
    });

    it('saves an assistant answer as a source-bound explain card', async () => {
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));

        const saveButton = await screen.findByRole('button', {
            name: /保存回答卡片/,
        });
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(artifactServiceMock.createArtifact).toHaveBeenCalledWith(expect.objectContaining({
                documentId: 'doc-retrieval',
                type: 'explain_card',
                goal: 'AI 回答：What is the identification strategy?',
                originalContent: expect.objectContaining({
                    question: 'What is the identification strategy?',
                    answer: 'The answer cites the document source.',
                    sourceRefs: [
                        expect.objectContaining({
                            documentId: 'doc-retrieval',
                            page: 2,
                            paragraphId: 'page-2-para-0',
                        }),
                    ],
                }),
                verificationStatus: 'grounded',
            }));
        });
        await waitFor(() => {
            expect(screen.getAllByText('Notes').length).toBeGreaterThan(0);
        });
        await waitFor(() => {
            expect(ragEngineAdapterMock.ingestMemory).toHaveBeenCalledWith({
                memory: expect.objectContaining({
                    artifactId: 'artifact-answer-card',
                    artifactType: 'explain_card',
                    title: 'AI 回答：What is the identification strategy?',
                    sourceRefs: [
                        expect.objectContaining({
                            documentId: 'doc-retrieval',
                            page: 2,
                            paragraphId: 'page-2-para-0',
                        }),
                    ],
                    text: expect.stringContaining('The answer cites the document source.'),
                }),
            });
        });
        expect(await screen.findByText('记忆沉淀：已完成')).toBeTruthy();
    });

    it('navigates a saved source-ref card back to its paragraph source from Notes', async () => {
        const navigateListener = vi.fn();
        window.addEventListener('vibereader:navigate-paragraph', navigateListener);
        const { App } = await import('./App.jsx');
        render(<App />);

        fireEvent.click(await screen.findByText('Ask mocked retrieval question'));
        fireEvent.click(await screen.findByRole('button', {
            name: /保存回答卡片/,
        }));

        await screen.findByText('The answer cites the document source.');
        fireEvent.click(screen.getByRole('button', { name: '回到原文' }));

        expect(navigateListener).toHaveBeenCalledTimes(1);
        expect(navigateListener.mock.calls[0][0].detail).toEqual(expect.objectContaining({
            documentId: 'doc-retrieval',
            page: 2,
            paragraphId: 'page-2-para-0',
            text: expect.stringContaining('difference in differences'),
        }));

        window.removeEventListener('vibereader:navigate-paragraph', navigateListener);
    });
});
