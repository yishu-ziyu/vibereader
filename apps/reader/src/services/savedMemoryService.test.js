import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    SAVED_MEMORY_INGEST_TASK_TYPE,
    buildSavedMemoryPayload,
    canIngestSavedMemoryArtifact,
    startSavedMemoryIngest,
} from './savedMemoryService';
import { savePersistentTask } from './persistentStorage';

vi.mock('./persistentStorage', () => ({
    savePersistentTask: vi.fn(async (task) => task),
}));

const document = {
    id: 'doc-memory',
    name: 'Memory Paper.pdf',
    kind: 'pdf',
    fingerprint: 'fp-memory',
};

const artifact = {
    id: 'artifact-answer',
    documentId: 'doc-memory',
    type: 'explain_card',
    goal: 'AI 回答：核心循环',
    verificationStatus: 'grounded',
    createdAt: 100,
    currentContent: {
        question: 'What is the core loop?',
        answer: 'Read, ask, verify, save.',
        sourceRefs: [
            {
                documentId: 'doc-memory',
                documentName: 'Memory Paper.pdf',
                page: 2,
                paragraphId: 'page-2-para-0',
                label: 'P2',
                text: 'The core loop is read, ask, verify, save.',
                grounding: {
                    precision: 'paragraph',
                    matchedBy: 'text',
                    score: 1,
                },
            },
        ],
    },
};

describe('savedMemoryService', () => {
    beforeEach(() => {
        vi.mocked(savePersistentTask).mockClear();
    });

    it('builds a saved memory payload with source refs and grounding precision', () => {
        const payload = buildSavedMemoryPayload(artifact, document);

        expect(payload).toEqual(expect.objectContaining({
            source: 'vibereader',
            kind: 'saved_artifact',
            artifactId: 'artifact-answer',
            artifactType: 'explain_card',
            title: 'AI 回答：核心循环',
            verificationStatus: 'grounded',
            document: expect.objectContaining({
                id: 'doc-memory',
                name: 'Memory Paper.pdf',
            }),
            sourceRefs: [
                expect.objectContaining({
                    page: 2,
                    paragraphId: 'page-2-para-0',
                    grounding: expect.objectContaining({
                        precision: 'paragraph',
                    }),
                }),
            ],
            text: expect.stringContaining('Read, ask, verify, save.'),
        }));
    });

    it('recognizes saved cards and notes as ingestible memory artifacts', () => {
        expect(canIngestSavedMemoryArtifact(artifact)).toBe(true);
        expect(canIngestSavedMemoryArtifact({
            ...artifact,
            id: 'note-1',
            type: 'reading_note',
            currentContent: { body: 'A verified reading note.' },
        })).toBe(true);
        expect(canIngestSavedMemoryArtifact({
            ...artifact,
            id: 'unsupported',
            type: 'random_widget',
        })).toBe(false);
    });

    it('starts saved memory ingest, polls completion, and records task state', async () => {
        const adapter = {
            ingestMemory: vi.fn(async () => ({
                jobId: 'memory-job-1',
                statusUrl: '/api/memory/jobs/memory-job-1',
            })),
            getMemoryIngestStatus: vi.fn(async () => ({
                jobId: 'memory-job-1',
                status: 'completed',
                step: 'done',
                percent: 100,
                message: '记忆沉淀完成',
                result: {
                    memory_id: 'memory-1',
                    chunks: 2,
                },
            })),
        };
        const seenStatuses = [];

        const result = await startSavedMemoryIngest({
            artifact,
            document,
            adapter,
            pollIntervalMs: 0,
            onStatus: (status) => seenStatuses.push(status),
        });

        expect(adapter.ingestMemory).toHaveBeenCalledWith({
            memory: expect.objectContaining({
                artifactId: 'artifact-answer',
                sourceRefs: [
                    expect.objectContaining({
                        grounding: expect.objectContaining({ precision: 'paragraph' }),
                    }),
                ],
            }),
        });
        expect(adapter.getMemoryIngestStatus).toHaveBeenCalledWith('memory-job-1');
        expect(result.status).toBe('completed');
        expect(seenStatuses.map((status) => status.status)).toEqual(['queued', 'completed']);
        expect(savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
            id: 'task-saved-memory-ingest-artifact-answer',
            documentId: 'doc-memory',
            type: SAVED_MEMORY_INGEST_TASK_TYPE,
            status: 'succeeded',
            progress: 100,
        }));
    });

    it('records failed saved memory ingest without hiding the error', async () => {
        const adapter = {
            ingestMemory: vi.fn(async () => {
                throw new Error('memory backend unavailable');
            }),
            getMemoryIngestStatus: vi.fn(),
        };

        await expect(startSavedMemoryIngest({
            artifact,
            document,
            adapter,
            pollIntervalMs: 0,
        })).rejects.toThrow('memory backend unavailable');

        expect(savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
            type: SAVED_MEMORY_INGEST_TASK_TYPE,
            status: 'failed',
            errorMessage: 'memory backend unavailable',
        }));
    });
});
