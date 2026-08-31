import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    KNOWLEDGE_INGEST_TASK_TYPE,
    loadDocumentKnowledgeLink,
    refreshDocumentKnowledgeLinkFromStore,
    saveDocumentKnowledgeLink,
    startDocumentKnowledgeIngest,
} from './documentKnowledgeService';
import {
    loadPersistentDocumentKnowledge,
    savePersistentDocumentKnowledge,
    savePersistentTask,
} from './persistentStorage';

vi.mock('./persistentStorage', () => ({
    loadPersistentDocumentKnowledge: vi.fn(async () => null),
    savePersistentDocumentKnowledge: vi.fn(async () => null),
    savePersistentTask: vi.fn(async (task) => task),
}));

const document = {
    id: 'doc-knowledge',
    name: 'Knowledge.pdf',
    kind: 'pdf',
    fingerprint: 'fp-1',
    openedAt: 100,
    contentText: 'A source-grounded reading document.',
};

describe('documentKnowledgeService', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(savePersistentTask).mockClear();
        vi.mocked(savePersistentDocumentKnowledge).mockClear();
        vi.mocked(loadPersistentDocumentKnowledge).mockClear();
        vi.mocked(loadPersistentDocumentKnowledge).mockResolvedValue(null);
    });

    it('saves and loads a DocumentKnowledgeLink', () => {
        const link = saveDocumentKnowledgeLink({
            readerDocumentId: 'doc-1',
            uniRagJobId: 'job-1',
            uniRagSourceId: 'source-1',
            uniRagFilename: 'paper.pdf',
            status: 'completed',
            percent: 100,
        });

        expect(link).toEqual(expect.objectContaining({
            readerDocumentId: 'doc-1',
            uniRagJobId: 'job-1',
            uniRagSourceId: 'source-1',
            uniRagFilename: 'paper.pdf',
            status: 'completed',
        }));
        expect(loadDocumentKnowledgeLink('doc-1')).toEqual(expect.objectContaining({
            uniRagSourceId: 'source-1',
        }));
    });

    it('routes link persistence through the persistentStorage wrapper (D4)', async () => {
        saveDocumentKnowledgeLink({
            readerDocumentId: 'doc-store',
            uniRagSourceId: 'source-store',
            status: 'completed',
            percent: 100,
        });

        // 写路径经过 persistentStorage 包装（Tauri → SQLite；浏览器 → wrapper 回退）
        await Promise.resolve();
        expect(savePersistentDocumentKnowledge).toHaveBeenCalledWith('doc-store', {
            uniragSourceId: 'source-store',
            knowledgeStatus: 'completed',
        });
    });

    it('refreshes the cache from the persistent store (D4)', async () => {
        vi.mocked(loadPersistentDocumentKnowledge).mockResolvedValue({
            uniragSourceId: 'source-sqlite',
            knowledgeStatus: 'completed',
        });

        const merged = await refreshDocumentKnowledgeLinkFromStore('doc-hydrate');

        expect(merged).toEqual(expect.objectContaining({
            readerDocumentId: 'doc-hydrate',
            uniRagSourceId: 'source-sqlite',
            status: 'completed',
        }));
        expect(loadDocumentKnowledgeLink('doc-hydrate')).toEqual(expect.objectContaining({
            uniRagSourceId: 'source-sqlite',
            status: 'completed',
        }));
    });

    it('keeps the cached link untouched when the store has no record', async () => {
        saveDocumentKnowledgeLink({
            readerDocumentId: 'doc-keep',
            uniRagSourceId: 'source-cache',
            status: 'completed',
        });

        vi.mocked(loadPersistentDocumentKnowledge).mockResolvedValue(null);
        await refreshDocumentKnowledgeLinkFromStore('doc-keep');

        expect(loadDocumentKnowledgeLink('doc-keep')).toEqual(expect.objectContaining({
            uniRagSourceId: 'source-cache',
            status: 'completed',
        }));
    });

    it('starts document ingest, polls status, records task state, and stores the link', async () => {
        const adapter = {
            ingestDocument: vi.fn(async () => ({
                jobId: 'job-123',
                statusUrl: '/api/ingest/jobs/job-123',
            })),
            getIngestStatus: vi.fn(async () => ({
                jobId: 'job-123',
                status: 'completed',
                step: 'done',
                percent: 100,
                message: '入库完成，可以开始提问。',
                filename: 'Knowledge.pdf',
                result: {
                    sourceId: 'source-123',
                    chunks: 4,
                    format: 'pdf',
                    filename: 'Knowledge.pdf',
                },
                error: null,
            })),
        };
        const seenStatuses = [];

        const result = await startDocumentKnowledgeIngest({
            document,
            adapter,
            pollIntervalMs: 0,
            onStatus: (status) => seenStatuses.push(status),
        });

        expect(adapter.ingestDocument).toHaveBeenCalledWith({ document });
        expect(adapter.getIngestStatus).toHaveBeenCalledWith('job-123');
        expect(result.status).toBe('completed');
        expect(seenStatuses.map((status) => status.status)).toEqual(['queued', 'completed']);
        expect(loadDocumentKnowledgeLink(document.id)).toEqual(expect.objectContaining({
            readerDocumentId: document.id,
            uniRagJobId: 'job-123',
            uniRagSourceId: 'source-123',
            status: 'completed',
            percent: 100,
        }));
        expect(savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
            id: 'task-knowledge-ingest-doc-knowledge',
            documentId: document.id,
            type: KNOWLEDGE_INGEST_TASK_TYPE,
            status: 'succeeded',
            progress: 100,
        }));
    });

    it('records failed ingest status and surfaces the error', async () => {
        const adapter = {
            ingestDocument: vi.fn(async () => ({
                jobId: 'job-failed',
                statusUrl: '/api/ingest/jobs/job-failed',
            })),
            getIngestStatus: vi.fn(async () => ({
                jobId: 'job-failed',
                status: 'failed',
                step: 'failed',
                percent: 100,
                message: '入库失败',
                filename: 'Knowledge.pdf',
                result: null,
                error: 'parse failed',
            })),
        };

        await expect(startDocumentKnowledgeIngest({
            document,
            adapter,
            pollIntervalMs: 0,
        })).rejects.toThrow('parse failed');

        expect(loadDocumentKnowledgeLink(document.id)).toEqual(expect.objectContaining({
            status: 'failed',
            error: 'parse failed',
        }));
        expect(savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
            type: KNOWLEDGE_INGEST_TASK_TYPE,
            status: 'failed',
            errorMessage: 'parse failed',
        }));
    });
});
