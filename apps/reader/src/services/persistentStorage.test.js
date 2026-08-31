import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createPersistentAnnotation,
    createPersistentVibeCard,
    deletePersistentVibeCard,
    initializePersistentStorage,
    isPersistentStorageAvailable,
    deletePersistentConversation,
    listPersistentAttentionInsights,
    listPersistentConversations,
    listPersistentAnnotations,
    listPersistentDocuments,
    listPersistentFlashcardDecks,
    listPersistentTasks,
    listPersistentVibeCards,
    listPersistentSourceSpans,
    loadPersistentSourceIndexStatus,
    loadPersistentDocumentContent,
    loadPersistentReadingPosition,
    savePersistentReadingPosition,
    loadPersistentTask,
    loadPersistentThinkingTree,
    loadPersistentConversation,
    loadPersistentSummary,
    exportPersistentReadingNote,
    importPersistentReadingNoteJson,
    savePersistentDocument,
    savePersistentDocumentContent,
    savePersistentConversation,
    savePersistentAttentionInsights,
    savePersistentFlashcardDecks,
    savePersistentSummary,
    savePersistentTask,
    replacePersistentSourceSpans,
    savePersistentSourceIndexStatus,
    searchPersistentSourceSpans,
    savePersistentThinkingTree,
    TASK_UPDATED_EVENT,
} from './persistentStorage';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args) => invokeMock(...args),
}));

describe('persistentStorage', () => {
    beforeEach(() => {
        delete window.__TAURI__;
        delete window.__TAURI_INTERNALS__;
        localStorage.clear();
        invokeMock.mockReset();
    });

    it('reports unavailable in browser runtime and returns safe empty lists', async () => {
        expect(isPersistentStorageAvailable()).toBe(false);

        await expect(initializePersistentStorage()).resolves.toEqual({
            initialized: false,
            reason: 'tauri-unavailable',
        });
        await expect(listPersistentDocuments()).resolves.toEqual([]);
        await expect(loadPersistentDocumentContent('doc-1')).resolves.toBeNull();
        await expect(savePersistentDocumentContent('doc-1', 'Browser text')).resolves.toBeNull();
        await expect(listPersistentConversations()).resolves.toEqual([]);
        await expect(loadPersistentConversation('session-1')).resolves.toBeNull();
        await expect(deletePersistentConversation('session-1')).resolves.toBe(false);
        await expect(loadPersistentThinkingTree('doc-1')).resolves.toBeNull();
        await expect(listPersistentAttentionInsights('doc-1')).resolves.toEqual([]);
        await expect(loadPersistentSummary('doc-1', 'section', 'section-0')).resolves.toBeNull();
        await expect(exportPersistentReadingNote('doc-1')).resolves.toBeNull();
        await expect(importPersistentReadingNoteJson('{"exportType":"reading_note"}')).resolves.toBeNull();
        await expect(listPersistentFlashcardDecks('doc-1')).resolves.toEqual([]);
        await expect(listPersistentAnnotations('doc-1')).resolves.toEqual([]);
        await expect(listPersistentVibeCards('doc-1')).resolves.toEqual([]);
        await expect(listPersistentSourceSpans('doc-1')).resolves.toEqual([]);
        await expect(replacePersistentSourceSpans('doc-1', [{ id: 'span-1' }])).resolves.toEqual([]);
        await expect(searchPersistentSourceSpans('doc-1', 'method')).resolves.toEqual([]);
        await expect(loadPersistentSourceIndexStatus('doc-1')).resolves.toBeNull();
        await expect(savePersistentSourceIndexStatus('doc-1', {
            indexSignature: 'sig-browser',
            spanCount: 2,
        })).resolves.toBeNull();
        await expect(savePersistentTask({
            id: 'task-browser',
            documentId: 'doc-1',
            type: 'source_index',
            status: 'running',
        })).resolves.toBeNull();
        await expect(loadPersistentTask('task-browser')).resolves.toBeNull();
        await expect(listPersistentTasks('doc-1')).resolves.toEqual([]);
        await expect(deletePersistentVibeCard('card-1')).resolves.toBe(false);
        expect(invokeMock).not.toHaveBeenCalled();
    });

    it('uses Tauri invoke commands when persistent storage is available', async () => {
        window.__TAURI_INTERNALS__ = {};
        invokeMock
            .mockResolvedValueOnce({ initialized: true, path: '/tmp/vibereader.sqlite3' })
            .mockResolvedValueOnce([{ id: 'doc-1', name: 'Paper.pdf' }])
            .mockResolvedValueOnce({ id: 'doc-1', name: 'Paper.pdf' })
            .mockResolvedValueOnce({ sessionId: 'session-1' })
            .mockResolvedValueOnce({ sessionId: 'session-1', messagesJson: '[{"role":"user"}]' })
            .mockResolvedValueOnce([{ sessionId: 'session-1' }])
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce({ documentId: 'doc-1' })
            .mockResolvedValueOnce({ documentId: 'doc-1', treeJson: '{"id":"root"}' })
            .mockResolvedValueOnce([{ id: 'attention-1' }])
            .mockResolvedValueOnce([{ id: 'attention-1' }])
            .mockResolvedValueOnce({ id: 'summary-1', keyPointsJson: '["point"]' })
            .mockResolvedValueOnce({ id: 'summary-1', keyPointsJson: '["point"]' })
            .mockResolvedValueOnce({
                markdown: '# Reading Note',
                json: '{"document":{},"documentContent":{"contentText":"Persisted body"}}',
                documentContent: {
                    documentId: 'doc-1',
                    contentText: 'Persisted body',
                    sourceType: 'markdown',
                },
            })
            .mockResolvedValueOnce({ document: { id: 'doc-1' }, summaryCount: 1 })
            .mockResolvedValueOnce([{ id: 'deck-1', cards: [{ id: 'card-1' }] }])
            .mockResolvedValueOnce([{ id: 'deck-1', cards: [{ id: 'card-1' }] }])
            .mockResolvedValueOnce({ id: 'annotation-1' })
            .mockResolvedValueOnce([{ id: 'annotation-1' }])
            .mockResolvedValueOnce({ id: 'card-1' })
            .mockResolvedValueOnce([{ id: 'card-1' }])
            .mockResolvedValueOnce([{ id: 'span-1', text: 'source text' }])
            .mockResolvedValueOnce([{ id: 'span-1', text: 'source text' }])
            .mockResolvedValueOnce([{ id: 'span-1', text: 'source text' }])
            .mockResolvedValueOnce({ documentId: 'doc-1', indexSignature: 'sig-1', spanCount: 1 })
            .mockResolvedValueOnce({ documentId: 'doc-1', indexSignature: 'sig-1', spanCount: 1 })
            .mockResolvedValueOnce({ id: 'task-1', documentId: 'doc-1', type: 'source_index', status: 'running' })
            .mockResolvedValueOnce({ id: 'task-1', documentId: 'doc-1', type: 'source_index', status: 'running' })
            .mockResolvedValueOnce([{ id: 'task-1', documentId: 'doc-1', type: 'source_index', status: 'running' }])
            .mockResolvedValueOnce(true);

        await expect(initializePersistentStorage()).resolves.toEqual({
            initialized: true,
            path: '/tmp/vibereader.sqlite3',
        });
        await expect(listPersistentDocuments()).resolves.toEqual([{ id: 'doc-1', name: 'Paper.pdf' }]);
        await expect(savePersistentDocument({ id: 'doc-1', name: 'Paper.pdf' })).resolves.toEqual({
            id: 'doc-1',
            name: 'Paper.pdf',
        });
        await expect(savePersistentConversation('session-1', [{ role: 'user' }])).resolves.toEqual({
            sessionId: 'session-1',
        });
        await expect(loadPersistentConversation('session-1')).resolves.toEqual({
            sessionId: 'session-1',
            messagesJson: '[{"role":"user"}]',
        });
        await expect(listPersistentConversations()).resolves.toEqual([{ sessionId: 'session-1' }]);
        await expect(deletePersistentConversation('session-1')).resolves.toBe(true);
        await expect(savePersistentThinkingTree('doc-1', { id: 'root' })).resolves.toEqual({
            documentId: 'doc-1',
        });
        await expect(loadPersistentThinkingTree('doc-1')).resolves.toEqual({
            documentId: 'doc-1',
            treeJson: '{"id":"root"}',
        });
        await expect(savePersistentAttentionInsights('doc-1', [{ id: 'attention-1' }])).resolves.toEqual([
            expect.objectContaining({ id: 'attention-1' }),
        ]);
        await expect(listPersistentAttentionInsights('doc-1')).resolves.toEqual([
            expect.objectContaining({ id: 'attention-1' }),
        ]);
        await expect(savePersistentSummary({
            id: 'summary-1',
            documentId: 'doc-1',
            summaryKind: 'section',
            sectionId: 'section-0',
            sectionTitle: 'Introduction',
            summary: 'Summary',
            keyPoints: ['point'],
        })).resolves.toEqual(expect.objectContaining({
            id: 'summary-1',
            keyPoints: ['point'],
        }));
        await expect(loadPersistentSummary('doc-1', 'section', 'section-0')).resolves.toEqual(
            expect.objectContaining({
                id: 'summary-1',
                keyPoints: ['point'],
            })
        );
        await expect(exportPersistentReadingNote('doc-1')).resolves.toEqual({
            markdown: '# Reading Note',
            json: '{"document":{},"documentContent":{"contentText":"Persisted body"}}',
            documentContent: {
                documentId: 'doc-1',
                contentText: 'Persisted body',
                sourceType: 'markdown',
            },
        });
        await expect(importPersistentReadingNoteJson('{"exportType":"reading_note"}')).resolves.toEqual({
            document: { id: 'doc-1' },
            summaryCount: 1,
        });
        await expect(savePersistentFlashcardDecks('doc-1', [{
            id: 'deck-1',
            title: 'Methods',
            cards: [{
                id: 'card-1',
                front: 'Question',
                back: 'Answer',
                known: true,
                unknown: false,
            }],
        }])).resolves.toEqual([{ id: 'deck-1', cards: [{ id: 'card-1' }] }]);
        await expect(listPersistentFlashcardDecks('doc-1')).resolves.toEqual([
            { id: 'deck-1', cards: [{ id: 'card-1' }] },
        ]);
        await expect(createPersistentAnnotation({ id: 'annotation-1' })).resolves.toEqual({ id: 'annotation-1' });
        await expect(listPersistentAnnotations('doc-1')).resolves.toEqual([{ id: 'annotation-1' }]);
        await expect(createPersistentVibeCard({ id: 'card-1' })).resolves.toEqual({ id: 'card-1' });
        await expect(listPersistentVibeCards('doc-1')).resolves.toEqual([{ id: 'card-1' }]);
        await expect(replacePersistentSourceSpans('doc-1', [{
            id: 'span-1',
            page: 2,
            paragraphId: 'page-2-para-0',
            chunkId: 'page-2-para-0',
            text: 'source text',
            orderIndex: 0,
            sourceType: 'pdf_text',
            metadata: { bbox: [] },
        }])).resolves.toEqual([{ id: 'span-1', text: 'source text' }]);
        await expect(listPersistentSourceSpans('doc-1')).resolves.toEqual([{ id: 'span-1', text: 'source text' }]);
        await expect(searchPersistentSourceSpans('doc-1', 'source', { limit: 3 })).resolves.toEqual([{ id: 'span-1', text: 'source text' }]);
        await expect(savePersistentSourceIndexStatus('doc-1', {
            indexSignature: 'sig-1',
            spanCount: 1,
            indexedAt: 1234,
        })).resolves.toEqual({ documentId: 'doc-1', indexSignature: 'sig-1', spanCount: 1 });
        await expect(loadPersistentSourceIndexStatus('doc-1')).resolves.toEqual({
            documentId: 'doc-1',
            indexSignature: 'sig-1',
            spanCount: 1,
        });
        await expect(savePersistentTask({
            id: 'task-1',
            documentId: 'doc-1',
            type: 'source_index',
            status: 'running',
            title: 'Index source spans',
            progress: 20,
            payload: { documentId: 'doc-1' },
            startedAt: 1234,
        })).resolves.toEqual({
            id: 'task-1',
            documentId: 'doc-1',
            type: 'source_index',
            status: 'running',
        });
        await expect(loadPersistentTask('task-1')).resolves.toEqual({
            id: 'task-1',
            documentId: 'doc-1',
            type: 'source_index',
            status: 'running',
        });
        await expect(listPersistentTasks('doc-1')).resolves.toEqual([
            {
                id: 'task-1',
                documentId: 'doc-1',
                type: 'source_index',
                status: 'running',
            },
        ]);
        await expect(deletePersistentVibeCard('card-1')).resolves.toBe(true);

        expect(invokeMock.mock.calls.map(([command]) => command)).toEqual([
            'storage_init',
            'storage_list_documents',
            'storage_upsert_document',
            'storage_upsert_conversation',
            'storage_load_conversation',
            'storage_list_conversations',
            'storage_delete_conversation',
            'storage_upsert_thinking_tree',
            'storage_load_thinking_tree',
            'storage_replace_attention_insights',
            'storage_list_attention_insights',
            'storage_upsert_summary',
            'storage_load_summary',
            'storage_export_reading_note',
            'storage_import_reading_note_json',
            'storage_replace_flashcard_decks',
            'storage_list_flashcard_decks',
            'storage_create_annotation',
            'storage_list_annotations',
            'storage_create_vibecard',
            'storage_list_vibecards',
            'storage_replace_source_spans',
            'storage_list_source_spans',
            'storage_search_source_spans',
            'storage_upsert_source_index_status',
            'storage_load_source_index_status',
            'storage_upsert_task',
            'storage_load_task',
            'storage_list_tasks',
            'storage_delete_vibecard',
        ]);
        expect(invokeMock).toHaveBeenCalledWith('storage_replace_source_spans', {
            documentId: 'doc-1',
            spans: [expect.objectContaining({
                id: 'span-1',
                documentId: 'doc-1',
                page: 2,
                paragraphId: 'page-2-para-0',
                chunkId: 'page-2-para-0',
                text: 'source text',
                orderIndex: 0,
                sourceType: 'pdf_text',
                metadataJson: '{"bbox":[]}',
            })],
        });
        expect(invokeMock).toHaveBeenCalledWith('storage_search_source_spans', {
            documentId: 'doc-1',
            query: 'source',
            limit: 3,
        });
        expect(invokeMock).toHaveBeenCalledWith('storage_upsert_source_index_status', {
            input: expect.objectContaining({
                documentId: 'doc-1',
                indexSignature: 'sig-1',
                spanCount: 1,
                indexedAt: 1234,
            }),
        });
        expect(invokeMock).toHaveBeenCalledWith('storage_load_source_index_status', {
            documentId: 'doc-1',
        });
        expect(invokeMock).toHaveBeenCalledWith('storage_upsert_task', {
            input: expect.objectContaining({
                id: 'task-1',
                documentId: 'doc-1',
                type: 'source_index',
                status: 'running',
                title: 'Index source spans',
                progress: 20,
                payloadJson: '{"documentId":"doc-1"}',
                startedAt: 1234,
            }),
        });
        expect(invokeMock).toHaveBeenCalledWith('storage_import_reading_note_json', {
            json: '{"exportType":"reading_note"}',
        });
        expect(invokeMock).toHaveBeenCalledWith('storage_load_task', {
            id: 'task-1',
        });
        expect(invokeMock).toHaveBeenCalledWith('storage_list_tasks', {
            documentId: 'doc-1',
        });
    });

    it('persists document content through Tauri storage commands', async () => {
        window.__TAURI_INTERNALS__ = {};
        invokeMock
            .mockResolvedValueOnce({
                documentId: 'doc-1',
                contentText: '# Persisted note',
                sourceType: 'markdown',
                createdAt: 100,
                updatedAt: 100,
            })
            .mockResolvedValueOnce({
                documentId: 'doc-1',
                contentText: '# Persisted note',
                sourceType: 'markdown',
                createdAt: 100,
                updatedAt: 100,
            });

        await expect(savePersistentDocumentContent('doc-1', '# Persisted note', {
            sourceType: 'markdown',
            createdAt: 100,
            updatedAt: 100,
        })).resolves.toEqual({
            documentId: 'doc-1',
            contentText: '# Persisted note',
            sourceType: 'markdown',
            createdAt: 100,
            updatedAt: 100,
        });
        await expect(loadPersistentDocumentContent('doc-1')).resolves.toEqual({
            documentId: 'doc-1',
            contentText: '# Persisted note',
            sourceType: 'markdown',
            createdAt: 100,
            updatedAt: 100,
        });

        expect(invokeMock).toHaveBeenCalledWith('storage_upsert_document_content', {
            input: {
                documentId: 'doc-1',
                contentText: '# Persisted note',
                sourceType: 'markdown',
                createdAt: 100,
                updatedAt: 100,
            },
        });
        expect(invokeMock).toHaveBeenCalledWith('storage_load_document_content', {
            documentId: 'doc-1',
        });
    });

    it('saves and loads reading positions through Tauri storage commands', async () => {
        window.__TAURI_INTERNALS__ = {};
        invokeMock
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce('{"page":3,"scrollRatio":0.5,"zoom":1.25,"updatedAt":123}');

        await expect(savePersistentReadingPosition('doc-1', {
            page: 3,
            scrollRatio: 0.5,
            zoom: 1.25,
            updatedAt: 123,
        })).resolves.toBeNull();
        await expect(loadPersistentReadingPosition('doc-1')).resolves.toEqual({
            page: 3,
            scrollRatio: 0.5,
            zoom: 1.25,
            updatedAt: 123,
        });

        expect(invokeMock).toHaveBeenNthCalledWith(1, 'storage_set_reading_position', {
            documentId: 'doc-1',
            positionJson: '{"page":3,"scrollRatio":0.5,"zoom":1.25,"updatedAt":123}',
        });
        expect(invokeMock).toHaveBeenNthCalledWith(2, 'storage_get_reading_position', {
            documentId: 'doc-1',
        });
    });

    it('falls back to localStorage for reading positions in browser runtime', async () => {
        expect(isPersistentStorageAvailable()).toBe(false);

        await expect(savePersistentReadingPosition('doc-web', {
            page: 2,
            scrollRatio: 0.75,
            updatedAt: 456,
        })).resolves.toEqual({
            documentId: 'doc-web',
            position: { page: 2, scrollRatio: 0.75, updatedAt: 456 },
        });

        const stored = JSON.parse(localStorage.getItem('vibereader.readingPositions'));
        expect(stored['doc-web']).toEqual({ page: 2, scrollRatio: 0.75, updatedAt: 456 });

        await expect(loadPersistentReadingPosition('doc-web')).resolves.toEqual({
            page: 2,
            scrollRatio: 0.75,
            updatedAt: 456,
        });
        await expect(loadPersistentReadingPosition('doc-missing')).resolves.toBeNull();
        await expect(loadPersistentReadingPosition('')).resolves.toBeNull();
        expect(invokeMock).not.toHaveBeenCalled();
    });

    it('persists browser document records locally for Web refresh recovery', async () => {
        expect(isPersistentStorageAvailable()).toBe(false);

        await expect(savePersistentDocument({
            id: 'doc-old',
            name: 'Older Paper.pdf',
            kind: 'pdf',
            source: 'browser-upload',
            openedAt: 100,
            contentText: 'must not be stored in recent record',
        })).resolves.toEqual(expect.objectContaining({
            id: 'doc-old',
            name: 'Older Paper.pdf',
            kind: 'pdf',
            openedAt: 100,
        }));
        await expect(savePersistentDocument({
            id: 'doc-new',
            name: 'Newer Notes.md',
            kind: 'markdown',
            source: 'browser-upload',
            openedAt: 200,
            contentText: 'must not be stored in recent record',
        })).resolves.toEqual(expect.objectContaining({
            id: 'doc-new',
            name: 'Newer Notes.md',
            kind: 'markdown',
            openedAt: 200,
        }));

        await expect(listPersistentDocuments()).resolves.toEqual([
            expect.objectContaining({
                id: 'doc-new',
                name: 'Newer Notes.md',
                kind: 'markdown',
                openedAt: 200,
            }),
            expect.objectContaining({
                id: 'doc-old',
                name: 'Older Paper.pdf',
                kind: 'pdf',
                openedAt: 100,
            }),
        ]);
        expect(JSON.stringify(await listPersistentDocuments())).not.toContain('must not be stored');
        expect(invokeMock).not.toHaveBeenCalled();
    });

    it('maps command errors into readable JavaScript errors', async () => {
        window.__TAURI_INTERNALS__ = {};
        invokeMock.mockRejectedValueOnce({
            code: 'validation_error',
            message: 'document id is required',
        });

        await expect(savePersistentDocument({ id: '' })).rejects.toMatchObject({
            code: 'validation_error',
            message: 'document id is required',
        });
    });

    it('emits a local update event after a Tauri task is saved', async () => {
        window.__TAURI_INTERNALS__ = {};
        const listener = vi.fn();
        window.addEventListener(TASK_UPDATED_EVENT, listener);
        invokeMock.mockResolvedValueOnce({
            id: 'task-live',
            documentId: 'doc-1',
            type: 'section_summary',
            status: 'running',
            progress: 30,
        });

        await expect(savePersistentTask({
            id: 'task-live',
            documentId: 'doc-1',
            type: 'section_summary',
            status: 'running',
            progress: 30,
        })).resolves.toEqual(expect.objectContaining({
            id: 'task-live',
            documentId: 'doc-1',
            status: 'running',
        }));

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0].detail).toEqual({
            documentId: 'doc-1',
            task: expect.objectContaining({
                id: 'task-live',
                documentId: 'doc-1',
                status: 'running',
            }),
        });
        window.removeEventListener(TASK_UPDATED_EVENT, listener);
    });
});
