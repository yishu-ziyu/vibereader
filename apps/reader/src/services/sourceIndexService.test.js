import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildIndexedRetrievalContext,
    clearSourceIndexCache,
    groundSourceRefsForDocument,
    indexDocumentSourceSpans,
    sourceSpansFromChunks,
} from './sourceIndexService';

const persistentStorageMock = vi.hoisted(() => ({
    isPersistentStorageAvailable: vi.fn(),
    replacePersistentSourceSpans: vi.fn(),
    searchPersistentSourceSpans: vi.fn(),
    listPersistentSourceSpans: vi.fn(),
    loadPersistentSourceIndexStatus: vi.fn(),
    savePersistentSourceIndexStatus: vi.fn(),
    savePersistentTask: vi.fn(),
}));

vi.mock('./persistentStorage', () => persistentStorageMock);

describe('sourceIndexService', () => {
    const document = {
        id: 'doc-index',
        name: 'Indexed Paper.pdf',
        kind: 'pdf',
        contentText: [
            '--- 第 1 页 ---',
            'The abstract introduces placebo evidence.',
            '',
            '--- 第 2 页 ---',
            'The identification strategy uses matched controls and treatment timing.',
            '',
            '--- 第 3 页 ---',
            'The conclusion discusses policy implications.',
        ].join('\n'),
    };

    beforeEach(() => {
        persistentStorageMock.isPersistentStorageAvailable.mockReset();
        persistentStorageMock.replacePersistentSourceSpans.mockReset();
        persistentStorageMock.searchPersistentSourceSpans.mockReset();
        persistentStorageMock.listPersistentSourceSpans.mockReset();
        persistentStorageMock.loadPersistentSourceIndexStatus.mockReset();
        persistentStorageMock.savePersistentSourceIndexStatus.mockReset();
        persistentStorageMock.savePersistentTask.mockReset();
        clearSourceIndexCache();
    });

    it('maps retrieval chunks into Rust source span inputs', () => {
        const spans = sourceSpansFromChunks([
            {
                id: 'doc-index:p2:page-2-para-0',
                documentId: 'doc-index',
                documentName: 'Indexed Paper.pdf',
                page: 2,
                paragraphId: 'page-2-para-0',
                chunkId: 'page-2-para-0',
                order: 1,
                text: 'The identification strategy uses matched controls.',
            },
        ]);

        expect(spans).toEqual([
            expect.objectContaining({
                id: 'doc-index:p2:page-2-para-0',
                documentId: 'doc-index',
                page: 2,
                paragraphId: 'page-2-para-0',
                chunkId: 'page-2-para-0',
                orderIndex: 1,
                sourceType: 'document_chunk',
                text: 'The identification strategy uses matched controls.',
                metadata: expect.objectContaining({
                    documentName: 'Indexed Paper.pdf',
                }),
            }),
        ]);
    });

    it('grounds UniRAG citations to the closest local paragraph span', () => {
        const grounded = groundSourceRefsForDocument([
            {
                id: 'remote-citation-1',
                chunkId: 'paper.pdf:2',
                documentId: 'paper.pdf',
                documentName: 'paper.pdf',
                page: 2,
                paragraphId: 'paper.pdf:2',
                label: 'P2',
                text: 'identification strategy uses matched controls',
            },
        ], document, { maxCharsPerChunk: 240 });

        expect(grounded).toEqual([
            expect.objectContaining({
                documentId: 'doc-index',
                documentName: 'Indexed Paper.pdf',
                page: 2,
                paragraphId: 'page-2-para-0',
                originalDocumentId: 'paper.pdf',
                originalParagraphId: 'paper.pdf:2',
                grounding: expect.objectContaining({
                    precision: 'paragraph',
                    matchedBy: 'text',
                }),
            }),
        ]);
    });

    it('keeps page-level grounding when citation text cannot be matched', () => {
        const grounded = groundSourceRefsForDocument([
            {
                id: 'remote-citation-2',
                documentId: 'paper.pdf',
                page: 3,
                label: 'P3',
                text: 'unrelated hallucinated wording',
            },
        ], document, { maxCharsPerChunk: 240 });

        expect(grounded).toEqual([
            expect.objectContaining({
                documentId: 'doc-index',
                page: 3,
                paragraphId: '',
                grounding: expect.objectContaining({
                    precision: 'page',
                }),
            }),
        ]);
    });

    it('marks citations without page or text match as document-level evidence', () => {
        const grounded = groundSourceRefsForDocument([
            {
                id: 'remote-citation-3',
                documentId: 'paper.pdf',
                label: '来源 1',
            },
        ], document, { maxCharsPerChunk: 240 });

        expect(grounded).toEqual([
            expect.objectContaining({
                documentId: 'doc-index',
                paragraphId: '',
                label: '来源 1',
                grounding: expect.objectContaining({
                    precision: 'document',
                }),
            }),
        ]);
    });

    it('indexes document chunks through persistent source span storage when Tauri is available', async () => {
        persistentStorageMock.isPersistentStorageAvailable.mockReturnValue(true);
        persistentStorageMock.replacePersistentSourceSpans.mockResolvedValue([
            { id: 'doc-index:p2:page-2-para-0' },
        ]);
        persistentStorageMock.savePersistentTask.mockResolvedValue({});

        const saved = await indexDocumentSourceSpans(document, { maxCharsPerChunk: 240 });

        expect(saved).toEqual([{ id: 'doc-index:p2:page-2-para-0' }]);
        expect(persistentStorageMock.replacePersistentSourceSpans).toHaveBeenCalledWith(
            'doc-index',
            expect.arrayContaining([
                expect.objectContaining({
                    documentId: 'doc-index',
                    page: 2,
                    paragraphId: 'page-2-para-0',
                    text: expect.stringContaining('identification strategy'),
                }),
            ]),
            expect.objectContaining({
                documentName: 'Indexed Paper.pdf',
            })
        );
    });

    it('records source indexing task state when indexing succeeds', async () => {
        persistentStorageMock.isPersistentStorageAvailable.mockReturnValue(true);
        persistentStorageMock.replacePersistentSourceSpans.mockResolvedValue([
            { id: 'doc-index:p2:page-2-para-0' },
        ]);
        persistentStorageMock.savePersistentTask.mockResolvedValue({});

        await indexDocumentSourceSpans(document, { maxCharsPerChunk: 240 });

        expect(persistentStorageMock.savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
            documentId: 'doc-index',
            type: 'source_index',
            status: 'running',
            progress: 10,
        }));
        expect(persistentStorageMock.savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
            documentId: 'doc-index',
            type: 'source_index',
            status: 'succeeded',
            progress: 100,
            result: expect.objectContaining({
                spanCount: 3,
            }),
        }));
    });

    it('records failed source indexing task state before rethrowing index errors', async () => {
        persistentStorageMock.isPersistentStorageAvailable.mockReturnValue(true);
        persistentStorageMock.replacePersistentSourceSpans.mockRejectedValue(new Error('disk full'));
        persistentStorageMock.savePersistentTask.mockResolvedValue({});

        await expect(indexDocumentSourceSpans(document, { maxCharsPerChunk: 240 })).rejects.toThrow(
            'disk full'
        );

        expect(persistentStorageMock.savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
            documentId: 'doc-index',
            type: 'source_index',
            status: 'running',
        }));
        expect(persistentStorageMock.savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
            documentId: 'doc-index',
            type: 'source_index',
            status: 'failed',
            progress: 100,
            errorMessage: 'disk full',
        }));
    });

    it('builds relevant retrieval context from Rust search results when available', async () => {
        persistentStorageMock.isPersistentStorageAvailable.mockReturnValue(true);
        persistentStorageMock.replacePersistentSourceSpans.mockResolvedValue([]);
        persistentStorageMock.searchPersistentSourceSpans.mockResolvedValue([
            {
                id: 'doc-index:p2:page-2-para-0',
                documentId: 'doc-index',
                page: 2,
                paragraphId: 'page-2-para-0',
                chunkId: 'page-2-para-0',
                orderIndex: 1,
                text: 'The identification strategy uses matched controls and treatment timing.',
                metadataJson: JSON.stringify({ documentName: 'Indexed Paper.pdf' }),
            },
        ]);

        const context = await buildIndexedRetrievalContext({
            document,
            query: 'What is the identification strategy?',
            maxChunks: 1,
            maxCharsPerChunk: 240,
        });

        expect(context.usedRetrieval).toBe(true);
        expect(context.prompt).toContain('Relevant source excerpts');
        expect(context.prompt).toContain('[source:doc-index:p2:page-2-para-0]');
        expect(context.prompt).toContain('matched controls');
        expect(context.prompt).not.toContain('placebo evidence');
        expect(context.sourceRefs).toEqual([
            expect.objectContaining({
                documentId: 'doc-index',
                documentName: 'Indexed Paper.pdf',
                page: 2,
                paragraphId: 'page-2-para-0',
            }),
        ]);
        expect(persistentStorageMock.searchPersistentSourceSpans).toHaveBeenCalledWith(
            'doc-index',
            'What is the identification strategy?',
            { limit: 1 }
        );
    });

    it('keeps browser retrieval on the existing JS path without storage calls', async () => {
        persistentStorageMock.isPersistentStorageAvailable.mockReturnValue(false);

        const context = await buildIndexedRetrievalContext({
            document,
            query: 'What is the identification strategy?',
            maxChunks: 1,
            maxCharsPerChunk: 240,
        });

        expect(context.prompt).toContain('[source:doc-index:p2:page-2-para-0]');
        expect(context.prompt).toContain('matched controls');
        expect(context.ragEngine).toEqual(expect.objectContaining({
            engine: 'local-keyword',
            available: true,
            degraded: false,
        }));
        expect(persistentStorageMock.replacePersistentSourceSpans).not.toHaveBeenCalled();
        expect(persistentStorageMock.searchPersistentSourceSpans).not.toHaveBeenCalled();
        expect(persistentStorageMock.listPersistentSourceSpans).not.toHaveBeenCalled();
    });

    it('falls back to JS retrieval when Rust search returns no matching spans', async () => {
        persistentStorageMock.isPersistentStorageAvailable.mockReturnValue(true);
        persistentStorageMock.replacePersistentSourceSpans.mockResolvedValue([]);
        persistentStorageMock.searchPersistentSourceSpans.mockResolvedValue([]);

        const context = await buildIndexedRetrievalContext({
            document,
            query: 'What is the identification strategy?',
            maxChunks: 1,
            maxCharsPerChunk: 240,
        });

        expect(context.prompt).toContain('[source:doc-index:p2:page-2-para-0]');
        expect(context.prompt).toContain('matched controls');
        expect(context.prompt).not.toContain('policy implications');
    });

    it('does not replace source spans again for repeated retrieval on the same document version', async () => {
        persistentStorageMock.isPersistentStorageAvailable.mockReturnValue(true);
        persistentStorageMock.replacePersistentSourceSpans.mockResolvedValue([]);
        persistentStorageMock.searchPersistentSourceSpans.mockResolvedValue([
            {
                id: 'doc-index:p2:page-2-para-0',
                documentId: 'doc-index',
                page: 2,
                paragraphId: 'page-2-para-0',
                chunkId: 'page-2-para-0',
                orderIndex: 1,
                text: 'The identification strategy uses matched controls and treatment timing.',
                metadataJson: JSON.stringify({ documentName: 'Indexed Paper.pdf' }),
            },
        ]);

        await buildIndexedRetrievalContext({
            document,
            query: 'What is the identification strategy?',
            maxChunks: 1,
            maxCharsPerChunk: 240,
        });
        await buildIndexedRetrievalContext({
            document,
            query: 'Explain the matched controls.',
            maxChunks: 1,
            maxCharsPerChunk: 240,
        });

        expect(persistentStorageMock.replacePersistentSourceSpans).toHaveBeenCalledTimes(1);
        expect(persistentStorageMock.searchPersistentSourceSpans).toHaveBeenCalledTimes(2);
    });

    it('replaces source spans again when the same document id has changed text', async () => {
        persistentStorageMock.isPersistentStorageAvailable.mockReturnValue(true);
        persistentStorageMock.replacePersistentSourceSpans.mockResolvedValue([]);
        persistentStorageMock.searchPersistentSourceSpans.mockResolvedValue([]);

        await buildIndexedRetrievalContext({
            document,
            query: 'What is the identification strategy?',
            maxChunks: 1,
            maxCharsPerChunk: 240,
        });
        await buildIndexedRetrievalContext({
            document: {
                ...document,
                contentText: [
                    '--- 第 1 页 ---',
                    'The abstract introduces placebo evidence.',
                    '',
                    '--- 第 2 页 ---',
                    'The identification strategy now uses an instrumental variables design.',
                ].join('\n'),
            },
            query: 'What is the identification strategy?',
            maxChunks: 1,
            maxCharsPerChunk: 240,
        });

        expect(persistentStorageMock.replacePersistentSourceSpans).toHaveBeenCalledTimes(2);
        expect(persistentStorageMock.replacePersistentSourceSpans.mock.calls[1][1]).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    text: expect.stringContaining('instrumental variables'),
                }),
            ])
        );
    });

    it('uses persisted source index status after renderer cache is cleared', async () => {
        persistentStorageMock.isPersistentStorageAvailable.mockReturnValue(true);
        persistentStorageMock.replacePersistentSourceSpans.mockResolvedValue([]);
        persistentStorageMock.searchPersistentSourceSpans.mockResolvedValue([
            {
                id: 'doc-index:p2:page-2-para-0',
                documentId: 'doc-index',
                page: 2,
                paragraphId: 'page-2-para-0',
                chunkId: 'page-2-para-0',
                orderIndex: 1,
                text: 'The identification strategy uses matched controls and treatment timing.',
                metadataJson: JSON.stringify({ documentName: 'Indexed Paper.pdf' }),
            },
        ]);
        persistentStorageMock.loadPersistentSourceIndexStatus
            .mockResolvedValueOnce(null)
            .mockImplementation(async () => persistentStorageMock.savePersistentSourceIndexStatus.mock.calls[0][1]);
        persistentStorageMock.savePersistentSourceIndexStatus.mockImplementation(async (_documentId, status) => ({
            documentId: 'doc-index',
            ...status,
        }));

        await buildIndexedRetrievalContext({
            document,
            query: 'What is the identification strategy?',
            maxChunks: 1,
            maxCharsPerChunk: 240,
        });
        clearSourceIndexCache();
        await buildIndexedRetrievalContext({
            document,
            query: 'Explain the matched controls.',
            maxChunks: 1,
            maxCharsPerChunk: 240,
        });

        expect(persistentStorageMock.replacePersistentSourceSpans).toHaveBeenCalledTimes(1);
        expect(persistentStorageMock.savePersistentSourceIndexStatus).toHaveBeenCalledWith(
            'doc-index',
            expect.objectContaining({
                indexSignature: expect.any(String),
                spanCount: 3,
            })
        );
        expect(persistentStorageMock.loadPersistentSourceIndexStatus).toHaveBeenCalledTimes(2);
        expect(persistentStorageMock.searchPersistentSourceSpans).toHaveBeenCalledTimes(2);
    });
});
