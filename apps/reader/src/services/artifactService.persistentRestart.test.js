import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistentMock = vi.hoisted(() => ({
    createPersistentVibeCard: vi.fn(),
    deletePersistentVibeCard: vi.fn(),
    isPersistentStorageAvailable: vi.fn(),
    listPersistentVibeCards: vi.fn(),
}));

vi.mock('./persistentStorage', () => persistentMock);

describe('artifactService persistent restart behavior', () => {
    beforeEach(() => {
        vi.resetModules();
        persistentMock.createPersistentVibeCard.mockReset();
        persistentMock.deletePersistentVibeCard.mockReset();
        persistentMock.isPersistentStorageAvailable.mockReturnValue(true);
        persistentMock.listPersistentVibeCards.mockReset();
    });

    it('restores persisted VibeCards with source refs needed for return-to-source', async () => {
        persistentMock.listPersistentVibeCards.mockResolvedValue([
            {
                id: 'card-persisted-1',
                documentId: 'doc-md',
                type: 'concept',
                title: 'VibeCard 1: Method',
                sourceText: 'Method source paragraph.',
                aiContent: JSON.stringify({
                    title: 'VibeCard 1: Method',
                    type: 'concept',
                    sourceText: 'Method source paragraph.',
                    aiContent: 'Review this source-backed point: Method source paragraph.',
                    tags: ['agent-generated', 'vibecard'],
                    source: {
                        documentId: 'doc-md',
                        page: 1,
                        paragraphId: 'chunk-3',
                        selectedText: 'Method source paragraph.',
                        sourceType: 'agent-card-generation',
                    },
                }),
                userNote: '',
                page: 1,
                paragraphId: 'chunk-3',
                tagsJson: JSON.stringify(['agent-generated', 'vibecard']),
                sourceJson: JSON.stringify({
                    documentId: 'doc-md',
                    page: 1,
                    paragraphId: 'chunk-3',
                    selectedText: 'Method source paragraph.',
                    sourceType: 'agent-card-generation',
                }),
                createdAt: 200,
                updatedAt: 200,
                verificationStatus: 'grounded',
            },
        ]);
        const { listArtifactsForDocument } = await import('./artifactService');

        const artifacts = await listArtifactsForDocument('doc-md');

        expect(persistentMock.listPersistentVibeCards).toHaveBeenCalledWith('doc-md');
        expect(artifacts).toEqual([
            expect.objectContaining({
                id: 'card-persisted-1',
                documentId: 'doc-md',
                type: 'concept',
                goal: 'VibeCard 1: Method',
                sourceSpanIds: ['chunk-3'],
                source: expect.objectContaining({
                    documentId: 'doc-md',
                    page: 1,
                    paragraphId: 'chunk-3',
                    selectedText: 'Method source paragraph.',
                }),
                currentContent: expect.objectContaining({
                    title: 'VibeCard 1: Method',
                    sourceText: 'Method source paragraph.',
                    aiContent: 'Review this source-backed point: Method source paragraph.',
                    source: expect.objectContaining({
                        paragraphId: 'chunk-3',
                    }),
                }),
                verificationStatus: 'grounded',
            }),
        ]);
    });

    it('restores plain persisted VibeCard records without losing source text or AI content', async () => {
        persistentMock.listPersistentVibeCards.mockResolvedValue([
            {
                id: 'card-plain-1',
                documentId: 'doc-md',
                type: 'concept',
                title: 'VibeCard 2: Result',
                sourceText: 'Result source paragraph.',
                aiContent: 'Review this source-backed point: Result source paragraph.',
                userNote: 'PM note',
                page: 1,
                paragraphId: 'chunk-4',
                tagsJson: JSON.stringify(['agent-generated', 'vibecard']),
                sourceJson: JSON.stringify({
                    documentId: 'doc-md',
                    page: 1,
                    paragraphId: 'chunk-4',
                    selectedText: 'Result source paragraph.',
                    sourceType: 'agent-card-generation',
                }),
                createdAt: 300,
                updatedAt: 300,
                verificationStatus: 'grounded',
            },
        ]);
        const { listArtifactsForDocument } = await import('./artifactService');

        const [artifact] = await listArtifactsForDocument('doc-md');

        expect(artifact.currentContent).toEqual(expect.objectContaining({
            sourceText: 'Result source paragraph.',
            aiContent: 'Review this source-backed point: Result source paragraph.',
            userNote: 'PM note',
            source: expect.objectContaining({
                paragraphId: 'chunk-4',
            }),
        }));
        expect(artifact.sourceSpanIds).toEqual(['chunk-4']);
    });
});
