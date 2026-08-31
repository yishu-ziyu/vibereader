import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtifactPanel } from './ArtifactPanel';

const DRAG_INJECT_MIME = 'application/x-vibereader-drag-inject';

const persistentMock = vi.hoisted(() => ({
    exportPersistentReadingNote: vi.fn(),
    importPersistentReadingNoteJson: vi.fn(),
}));

vi.mock('./services/persistentStorage', () => persistentMock);

function createDataTransfer() {
    const data = new Map();
    const transfer = {
        dropEffect: 'none',
        effectAllowed: 'none',
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

function appendedDownloads(appendChildSpy) {
    return appendChildSpy.mock.calls
        .map((call) => call[0]?.download)
        .filter(Boolean);
}

describe('ArtifactPanel', () => {
    let createObjectURLSpy;
    let revokeObjectURLSpy;
    let appendChildSpy;

    beforeEach(() => {
        persistentMock.exportPersistentReadingNote.mockReset();
        persistentMock.importPersistentReadingNoteJson.mockReset();
        createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
        revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        appendChildSpy = vi.spyOn(document.body, 'appendChild');
        Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: vi.fn(),
        });
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
            const element = originalCreateElement(tagName, options);
            if (tagName === 'a') {
                element.click = vi.fn();
                element.remove = vi.fn();
            }
            return element;
        });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('renders Lens Card artifacts with source and inference labels', () => {
        const onNavigateToSource = vi.fn();
        const artifacts = [
            {
                id: 'artifact-1',
                type: 'lens_card',
                goal: '解释选区',
                sourceSpanIds: ['span-1'],
                verificationStatus: 'grounded',
                createdAt: 200,
                originalContent: {
                    selectionText: 'Selected source text.',
                    explanation: '这是解释。',
                    claims: [
                        { text: '来自原文的结论。', sourceSpanIds: ['span-1'], inference: false },
                        { text: '模型推断。', sourceSpanIds: [], inference: true },
                    ],
                    source: { documentId: 'doc-1', page: 2, spanId: 'span-1' },
                },
            },
        ];

        render(<ArtifactPanel artifacts={artifacts} onNavigateToSource={onNavigateToSource} />);

        expect(screen.getByText('阅读卡片')).toBeTruthy();
        expect(screen.getByText('Selected source text.')).toBeTruthy();
        expect(screen.getByText('这是解释。')).toBeTruthy();
        expect(screen.getByText('span-1')).toBeTruthy();
        expect(screen.getByText('inference')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /回到原文|source/i }));
        expect(onNavigateToSource).toHaveBeenCalledWith(artifacts[0]);
    });

    it('renders Explain Card artifacts with question, answer, and source refs', () => {
        const onNavigateToSource = vi.fn();
        const artifacts = [
            {
                id: 'artifact-answer-card',
                type: 'explain_card',
                goal: 'AI 回答：What is the identification strategy?',
                verificationStatus: 'grounded',
                sourceSpanIds: ['page-2-para-0'],
                currentContent: {
                    question: 'What is the identification strategy?',
                    answer: 'The answer cites the document source.',
                    sourceRefs: [
                        {
                            documentId: 'doc-1',
                            page: 2,
                            paragraphId: 'page-2-para-0',
                            text: 'The identification strategy uses difference in differences.',
                        },
                    ],
                },
            },
        ];

        render(<ArtifactPanel artifacts={artifacts} onNavigateToSource={onNavigateToSource} />);

        expect(screen.getByText('解释卡片')).toBeTruthy();
        expect(screen.getByText('What is the identification strategy?')).toBeTruthy();
        expect(screen.getByText('The answer cites the document source.')).toBeTruthy();
        expect(screen.getByText('P2 · page-2-para-0')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /回到原文|source/i }));
        expect(onNavigateToSource).toHaveBeenCalledWith(artifacts[0]);
    });

    it('scrolls and highlights a card when a saved memory citation targets it', async () => {
        const artifacts = [
            {
                id: 'artifact-answer-card',
                type: 'explain_card',
                goal: 'AI 回答：What is the identification strategy?',
                verificationStatus: 'grounded',
                currentContent: {
                    question: 'What is the identification strategy?',
                    answer: 'The answer cites saved memory.',
                },
            },
        ];

        render(<ArtifactPanel artifacts={artifacts} />);

        const card = screen.getByText('The answer cites saved memory.').closest('article');
        act(() => {
            window.dispatchEvent(new CustomEvent('vibereader:navigate-artifact', {
                detail: { artifactId: 'artifact-answer-card' },
            }));
        });

        await waitFor(() => {
            expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({
                block: 'center',
                inline: 'nearest',
            }));
            expect(card.classList.contains('artifact-pulse-highlight')).toBe(true);
        });
    });

    it('renders Concept Card artifacts with section summary, key points, and source refs', () => {
        const artifacts = [
            {
                id: 'artifact-concept-card',
                type: 'concept_card',
                goal: 'Concept Card：Introduction',
                verificationStatus: 'grounded',
                currentContent: {
                    sectionTitle: 'Introduction',
                    summary: 'This section introduces the main idea.',
                    keyPoints: ['Research question', 'Core contribution'],
                    sourceRefs: [
                        {
                            documentId: 'doc-1',
                            page: 1,
                            paragraphId: 'section-0',
                        },
                    ],
                },
            },
        ];

        render(<ArtifactPanel artifacts={artifacts} />);

        expect(screen.getByText('概念卡片')).toBeTruthy();
        expect(screen.getByText('Introduction')).toBeTruthy();
        expect(screen.getByText('This section introduces the main idea.')).toBeTruthy();
        expect(screen.getByText('Research question')).toBeTruthy();
        expect(screen.getByText('Core contribution')).toBeTruthy();
        expect(screen.getByText('P1 · section-0')).toBeTruthy();
    });

    it('renders Reading Note artifacts with title and body', () => {
        const artifacts = [
            {
                id: 'artifact-reading-note',
                type: 'reading_note',
                goal: 'Paper overview',
                verificationStatus: 'ungrounded',
                currentContent: {
                    title: 'Paper overview',
                    body: '# Paper overview\n\nImportant source-backed finding.',
                },
            },
        ];

        render(<ArtifactPanel artifacts={artifacts} />);

        expect(screen.getByText('阅读笔记')).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Paper overview' })).toBeTruthy();
        expect(screen.getByText(/Important source-backed finding/)).toBeTruthy();
    });

    it('renders Reading Note source refs when task results are grounded', () => {
        const artifacts = [
            {
                id: 'artifact-reading-note-grounded',
                type: 'reading_note',
                goal: 'Paper overview',
                verificationStatus: 'grounded',
                currentContent: {
                    title: 'Paper overview',
                    body: '# Paper overview\n\nImportant source-backed finding.',
                    sourceRefs: [
                        {
                            documentId: 'doc-1',
                            page: 2,
                            paragraphId: 'page-2-para-0',
                        },
                    ],
                },
            },
        ];

        render(<ArtifactPanel artifacts={artifacts} />);

        expect(screen.getByText('阅读笔记')).toBeTruthy();
        expect(screen.getByText('P2 · page-2-para-0')).toBeTruthy();
    });

    it('renders agent-generated VibeCards with readable source-grounded content', () => {
        const onNavigateToSource = vi.fn();
        const artifacts = [
            {
                id: 'agent-card-1',
                documentId: 'doc-1',
                type: 'concept',
                goal: 'VibeCard 1: Research problem',
                verificationStatus: 'grounded',
                source: {
                    documentId: 'doc-1',
                    page: 1,
                    paragraphId: 'chunk-3',
                    selectedText: 'The research problem source text.',
                    sourceType: 'agent-card-generation',
                },
                currentContent: {
                    title: 'VibeCard 1: Research problem',
                    type: 'concept',
                    sourceText: 'The research problem source text.',
                    aiContent: 'Review this source-backed point: The research problem source text.',
                    tags: ['agent-generated', 'vibecard'],
                    source: {
                        documentId: 'doc-1',
                        page: 1,
                        paragraphId: 'chunk-3',
                        selectedText: 'The research problem source text.',
                        sourceType: 'agent-card-generation',
                    },
                },
            },
        ];

        render(<ArtifactPanel artifacts={artifacts} onNavigateToSource={onNavigateToSource} />);

        expect(screen.getByText('VibeCard 1: Research problem')).toBeTruthy();
        expect(screen.getByText('The research problem source text.')).toBeTruthy();
        expect(screen.getByText('Review this source-backed point: The research problem source text.')).toBeTruthy();
        expect(screen.getByText('P1 · chunk-3')).toBeTruthy();
        expect(screen.getByText('有原文依据')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: '回到原文 P1 · chunk-3' }));
        expect(onNavigateToSource).toHaveBeenCalledWith(artifacts[0]);
    });

    it('makes saved VibeCards draggable into Chat as a drag-inject payload', () => {
        const artifacts = [
            {
                id: 'artifact-concept-card',
                type: 'concept_card',
                goal: 'Concept Card：Introduction',
                verificationStatus: 'grounded',
                currentContent: {
                    sectionTitle: 'Introduction',
                    summary: 'This section introduces the main idea.',
                    keyPoints: ['Research question', 'Core contribution'],
                    sourceRefs: [
                        {
                            documentId: 'doc-1',
                            page: 3,
                            paragraphId: 'section-0',
                        },
                    ],
                },
            },
        ];
        render(<ArtifactPanel artifacts={artifacts} />);

        const card = screen.getByText('概念卡片').closest('article');
        const dataTransfer = createDataTransfer();
        fireEvent.dragStart(card, { dataTransfer });

        expect(card.getAttribute('draggable')).toBe('true');
        expect(dataTransfer.effectAllowed).toBe('copy');
        expect(dataTransfer.getData('text/plain')).toContain('Concept Card：Introduction');
        expect(dataTransfer.getData('text/plain')).toContain('This section introduces the main idea.');
        expect(JSON.parse(dataTransfer.getData(DRAG_INJECT_MIME))).toMatchObject({
            page: 3,
            text: expect.stringContaining('Research question'),
        });
    });

    it('edits a VibeCard user note while preserving source-backed content', () => {
        const onArtifactUpdated = vi.fn();
        const artifact = {
            id: 'artifact-concept-card',
            type: 'concept_card',
            goal: 'Concept Card：Introduction',
            verificationStatus: 'grounded',
            source: { page: 3, paragraphId: 'section-0' },
            currentContent: {
                sectionTitle: 'Introduction',
                summary: 'This section introduces the main idea.',
                userNote: 'old note',
                sourceRefs: [
                    {
                        documentId: 'doc-1',
                        page: 3,
                        paragraphId: 'section-0',
                    },
                ],
            },
        };

        render(<ArtifactPanel artifacts={[artifact]} onArtifactUpdated={onArtifactUpdated} />);

        fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
        fireEvent.change(screen.getByLabelText('卡片备注'), {
            target: { value: 'revised note' },
        });
        fireEvent.click(screen.getByRole('button', { name: /保存/ }));

        expect(onArtifactUpdated).toHaveBeenCalledWith(artifact, {
            currentContent: expect.objectContaining({
                sectionTitle: 'Introduction',
                summary: 'This section introduces the main idea.',
                userNote: 'revised note',
                sourceRefs: [
                    {
                        documentId: 'doc-1',
                        page: 3,
                        paragraphId: 'section-0',
                    },
                ],
            }),
        });
    });

    it('asks for confirmation before deleting a VibeCard', () => {
        const onArtifactDeleted = vi.fn();
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const artifact = {
            id: 'artifact-concept-card',
            type: 'concept_card',
            goal: 'Concept Card：Introduction',
            verificationStatus: 'grounded',
            currentContent: {
                summary: 'This section introduces the main idea.',
            },
        };

        render(<ArtifactPanel artifacts={[artifact]} onArtifactDeleted={onArtifactDeleted} />);

        fireEvent.click(screen.getByRole('button', { name: /删除/ }));

        expect(confirmSpy).toHaveBeenCalledWith('删除这张卡片？');
        expect(onArtifactDeleted).toHaveBeenCalledWith(artifact);
        confirmSpy.mockRestore();
    });

    it('previews Markdown for selected VibeCards only with source references', () => {
        const artifacts = [
            {
                id: 'selected-card',
                type: 'concept_card',
                goal: 'Concept Card：Introduction',
                verificationStatus: 'grounded',
                currentContent: {
                    sectionTitle: 'Introduction',
                    summary: 'Selected summary only.',
                    keyPoints: ['Selected point'],
                    userNote: 'Selected note',
                    sourceRefs: [
                        {
                            documentId: 'doc-1',
                            page: 3,
                            paragraphId: 'section-0',
                        },
                    ],
                },
            },
            {
                id: 'unselected-card',
                type: 'explain_card',
                goal: 'AI 回答：Unselected question',
                verificationStatus: 'grounded',
                currentContent: {
                    question: 'Unselected question',
                    answer: 'Unselected answer should not be exported.',
                    sourceRefs: [
                        {
                            documentId: 'doc-1',
                            page: 8,
                            paragraphId: 'page-8-para-2',
                        },
                    ],
                },
            },
        ];

        render(<ArtifactPanel documentId="doc-1" artifacts={artifacts} />);

        fireEvent.click(screen.getByRole('checkbox', { name: /选择卡片 Concept Card：Introduction/ }));
        fireEvent.click(screen.getByRole('button', { name: /导出所选/ }));

        const preview = screen.getByText(/# Selected VibeCards/);
        expect(preview.textContent).toContain('Selected summary only.');
        expect(preview.textContent).toContain('Selected point');
        expect(preview.textContent).toContain('Selected note');
        expect(preview.textContent).toContain('P3 · section-0');
        expect(preview.textContent).not.toContain('Unselected answer should not be exported.');
    });

    it('previews Obsidian Markdown for selected VibeCards only with frontmatter and source links', () => {
        const artifacts = [
            {
                id: 'selected-card',
                type: 'concept_card',
                goal: 'Concept Card：Introduction',
                verificationStatus: 'grounded',
                currentContent: {
                    sectionTitle: 'Introduction',
                    summary: 'Selected summary only.',
                    keyPoints: ['Selected point'],
                    selectionText: 'Original selected quote.',
                    userNote: 'Selected note',
                    sourceRefs: [
                        {
                            documentId: 'doc-1',
                            page: 3,
                            paragraphId: 'section-0',
                        },
                    ],
                },
            },
            {
                id: 'unselected-card',
                type: 'explain_card',
                goal: 'AI 回答：Unselected question',
                verificationStatus: 'grounded',
                currentContent: {
                    question: 'Unselected question',
                    answer: 'Unselected answer should not be exported to Obsidian.',
                    sourceRefs: [
                        {
                            documentId: 'doc-1',
                            page: 8,
                            paragraphId: 'page-8-para-2',
                        },
                    ],
                },
            },
        ];

        render(<ArtifactPanel documentId="doc-1" artifacts={artifacts} />);

        fireEvent.click(screen.getByRole('checkbox', { name: /选择卡片 Concept Card：Introduction/ }));
        fireEvent.click(screen.getByRole('button', { name: /Obsidian/ }));

        const preview = screen.getByText(/type: vibereader_vibecard_export/);
        expect(preview.textContent).toContain('document_id: doc-1');
        expect(preview.textContent).toContain('card_count: 1');
        expect(preview.textContent).toContain('- vibereader');
        expect(preview.textContent).toContain('# Selected VibeCards');
        expect(preview.textContent).toContain('## Concept Card：Introduction');
        expect(preview.textContent).toContain('Source: [[doc-1#P3]] · `section-0`');
        expect(preview.textContent).toContain('> [!quote]');
        expect(preview.textContent).toContain('Original selected quote.');
        expect(preview.textContent).toContain('Selected note');
        expect(preview.textContent).not.toContain('Unselected answer should not be exported to Obsidian.');
    });

    it('clears stale Obsidian preview when no VibeCard remains selected', () => {
        const artifacts = [
            {
                id: 'selected-card',
                type: 'concept_card',
                goal: 'Concept Card：Introduction',
                verificationStatus: 'grounded',
                currentContent: {
                    summary: 'Selected summary only.',
                    sourceRefs: [
                        {
                            documentId: 'doc-1',
                            page: 3,
                            paragraphId: 'section-0',
                        },
                    ],
                },
            },
        ];

        render(<ArtifactPanel documentId="doc-1" artifacts={artifacts} />);

        const checkbox = screen.getByRole('checkbox', { name: /选择卡片 Concept Card：Introduction/ });
        const clickObsidianPreview = () => {
            fireEvent.click(screen.getAllByRole('button', { name: /Obsidian/ })[0]);
        };
        fireEvent.click(checkbox);
        clickObsidianPreview();
        expect(screen.getByText(/type: vibereader_vibecard_export/)).toBeTruthy();

        fireEvent.click(checkbox);
        clickObsidianPreview();

        expect(screen.queryByText(/type: vibereader_vibecard_export/)).toBeNull();
    });

    it('shows an empty state when there are no artifacts', () => {
        render(<ArtifactPanel artifacts={[]} />);

        expect(screen.getByText('还没有保存的阅读卡片')).toBeTruthy();
    });

    it('previews Markdown and JSON exports for the current document', async () => {
        persistentMock.exportPersistentReadingNote.mockResolvedValue({
            exportedAt: Date.parse('2026-06-10T08:00:00.000Z'),
            markdown: '# Reading Note\n\n## Metadata\n- Title: Export Paper.pdf',
            json: '{"document":{"id":"doc-1"}}',
        });

        render(<ArtifactPanel documentId="doc-1" documentName="Export Paper.pdf" artifacts={[]} />);

        fireEvent.click(screen.getByRole('button', { name: /Preview Export|预览导出/ }));

        expect(await screen.findByText(/# Reading Note/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Markdown/ }));
        fireEvent.click(screen.getByRole('button', { name: /下载 JSON/ }));

        expect(appendedDownloads(appendChildSpy)).toEqual([
            'vibereader-export-paper-2026-06-10.md',
            'vibereader-export-paper-2026-06-10.json',
        ]);
        expect(createObjectURLSpy).toHaveBeenCalledTimes(2);
        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:export');
        expect(persistentMock.exportPersistentReadingNote).toHaveBeenCalledWith('doc-1');
    });

    it('imports pasted Reading Note JSON from the export toolbar', async () => {
        persistentMock.importPersistentReadingNoteJson.mockResolvedValue({
            document: 'doc-imported',
            summaryCount: 1,
        });
        const onReadingNoteImported = vi.fn();
        const json = '{"exportType":"reading_note","schemaVersion":1}';

        render(
            <ArtifactPanel
                documentId="doc-1"
                artifacts={[]}
                onReadingNoteImported={onReadingNoteImported}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /导入 JSON/ }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Reading Note JSON' }), {
            target: { value: json },
        });
        fireEvent.click(screen.getByRole('button', { name: /导入阅读笔记/ }));

        await waitFor(() => {
            expect(persistentMock.importPersistentReadingNoteJson).toHaveBeenCalledWith(json);
        });
        expect(onReadingNoteImported).toHaveBeenCalledWith({
            document: 'doc-imported',
            summaryCount: 1,
        });
    });

    it('imports a chosen Reading Note JSON file through the same import flow', async () => {
        persistentMock.importPersistentReadingNoteJson.mockResolvedValue({
            document: 'doc-file-imported',
        });
        const json = '{"exportType":"reading_note","schemaVersion":1,"document":{"id":"doc-file"}}';
        const file = new File([json], 'reading-note.json', { type: 'application/json' });

        render(<ArtifactPanel documentId="doc-1" artifacts={[]} />);

        fireEvent.click(screen.getByRole('button', { name: /导入 JSON/ }));
        fireEvent.change(screen.getByLabelText('Reading Note JSON file'), {
            target: { files: [file] },
        });

        await waitFor(() => {
            expect(screen.getByRole('textbox', { name: 'Reading Note JSON' }).value).toBe(json);
        });
        fireEvent.click(screen.getByRole('button', { name: /导入阅读笔记/ }));

        await waitFor(() => {
            expect(persistentMock.importPersistentReadingNoteJson).toHaveBeenCalledWith(json);
        });
    });

    it('downloads selected VibeCard exports with document-name based filenames', () => {
        const artifacts = [
            {
                id: 'selected-card',
                type: 'concept_card',
                goal: 'Concept Card：Introduction',
                verificationStatus: 'grounded',
                currentContent: {
                    summary: 'Selected summary only.',
                    sourceRefs: [{ documentId: 'doc-1', page: 3, paragraphId: 'section-0' }],
                },
            },
        ];

        render(<ArtifactPanel documentId="doc-1" documentName="Export Paper.pdf" artifacts={artifacts} />);

        fireEvent.click(screen.getByRole('checkbox', { name: /选择卡片 Concept Card：Introduction/ }));
        fireEvent.click(screen.getByRole('button', { name: /导出所选/ }));
        fireEvent.click(screen.getByRole('button', { name: /下载 Markdown/ }));
        fireEvent.click(screen.getByRole('button', { name: /Obsidian/ }));
        fireEvent.click(screen.getByRole('button', { name: /下载 Obsidian Markdown/ }));

        const date = new Date().toISOString().slice(0, 10);
        expect(appendedDownloads(appendChildSpy)).toEqual([
            `vibereader-export-paper-selected-vibecards-${date}.md`,
            `vibereader-export-paper-selected-vibecards-obsidian-${date}.md`,
        ]);
    });
});
