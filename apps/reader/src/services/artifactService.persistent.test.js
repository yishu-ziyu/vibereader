import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createArtifact,
    deleteArtifact,
    listArtifactsForDocument,
    updateArtifact,
} from './artifactService';
import {
    createPersistentVibeCard,
    deletePersistentVibeCard,
    isPersistentStorageAvailable,
    listPersistentVibeCards,
} from './persistentStorage';

vi.mock('./persistentStorage', () => ({
    createPersistentVibeCard: vi.fn(),
    deletePersistentVibeCard: vi.fn(),
    isPersistentStorageAvailable: vi.fn(),
    listPersistentVibeCards: vi.fn(),
}));

describe('artifactService persistent adapter', () => {
    beforeEach(() => {
        vi.mocked(isPersistentStorageAvailable).mockReturnValue(true);
        vi.mocked(createPersistentVibeCard).mockReset();
        vi.mocked(deletePersistentVibeCard).mockReset();
        vi.mocked(listPersistentVibeCards).mockReset();
    });

    it('stores Lens Card artifacts as persistent VibeCards when available', async () => {
        vi.mocked(createPersistentVibeCard).mockResolvedValue({ id: 'artifact-1' });

        const artifact = await createArtifact({
            id: 'artifact-1',
            documentId: 'doc-1',
            type: 'lens_card',
            goal: 'Explain selection',
            source: { page: 3, paragraphId: 'page-3-para-1', selectedText: 'Source text' },
            originalContent: { explanation: 'AI explanation' },
            verificationStatus: 'grounded',
            createdAt: 100,
        });

        expect(artifact.id).toBe('artifact-1');
        expect(createPersistentVibeCard).toHaveBeenCalledWith(expect.objectContaining({
            id: 'artifact-1',
            documentId: 'doc-1',
            type: 'lens_card',
            title: 'Explain selection',
            sourceText: 'Source text',
            verificationStatus: 'grounded',
        }));
    });

    it('lists persistent VibeCards as artifact records when available', async () => {
        vi.mocked(listPersistentVibeCards).mockResolvedValue([
            {
                id: 'card-1',
                documentId: 'doc-1',
                type: 'lens_card',
                title: 'Explain selection',
                sourceText: 'Source text',
                aiContent: '{"explanation":"AI explanation"}',
                userNote: '',
                page: 3,
                paragraphId: 'page-3-para-1',
                sourceJson: '{"page":3,"selectedText":"Source text"}',
                createdAt: 100,
                verificationStatus: 'grounded',
            },
        ]);

        await expect(listArtifactsForDocument('doc-1')).resolves.toEqual([
            expect.objectContaining({
                id: 'card-1',
                documentId: 'doc-1',
                type: 'lens_card',
                goal: 'Explain selection',
                sourceSpanIds: ['page-3-para-1'],
                source: { page: 3, selectedText: 'Source text' },
                originalContent: expect.objectContaining({
                    explanation: 'AI explanation',
                    sourceText: 'Source text',
                    source: { page: 3, selectedText: 'Source text' },
                }),
                currentContent: expect.objectContaining({
                    explanation: 'AI explanation',
                    sourceText: 'Source text',
                    source: { page: 3, selectedText: 'Source text' },
                }),
                verificationStatus: 'grounded',
            }),
        ]);
        expect(listPersistentVibeCards).toHaveBeenCalledWith('doc-1');
    });

    it('updates persistent VibeCards by upserting the merged artifact and preserving source', async () => {
        vi.mocked(listPersistentVibeCards).mockResolvedValue([
            {
                id: 'card-1',
                documentId: 'doc-1',
                type: 'concept_card',
                title: 'Concept Card：Introduction',
                sourceText: 'Source text',
                aiContent: '{"summary":"Original summary","sourceRefs":[{"page":2,"paragraphId":"page-2-para-1"}]}',
                userNote: 'old note',
                page: 2,
                paragraphId: 'page-2-para-1',
                sourceJson: '{"page":2,"paragraphId":"page-2-para-1","selectedText":"Source text"}',
                createdAt: 100,
                updatedAt: 100,
                verificationStatus: 'grounded',
            },
        ]);
        vi.mocked(createPersistentVibeCard).mockResolvedValue({ id: 'card-1' });

        const updated = await updateArtifact('card-1', {
            documentId: 'doc-1',
            currentContent: {
                summary: 'Original summary',
                userNote: 'revised note',
                sourceRefs: [{ page: 2, paragraphId: 'page-2-para-1' }],
            },
            updatedAt: 200,
        });

        expect(updated).toEqual(expect.objectContaining({
            id: 'card-1',
            documentId: 'doc-1',
            source: { page: 2, paragraphId: 'page-2-para-1', selectedText: 'Source text' },
            currentContent: expect.objectContaining({ userNote: 'revised note' }),
        }));
        expect(createPersistentVibeCard).toHaveBeenCalledWith(expect.objectContaining({
            id: 'card-1',
            documentId: 'doc-1',
            type: 'concept_card',
            userNote: 'revised note',
            page: 2,
            paragraphId: 'page-2-para-1',
            verificationStatus: 'grounded',
        }));
    });

    it('deletes persistent VibeCards when storage is available', async () => {
        vi.mocked(deletePersistentVibeCard).mockResolvedValue(true);

        await expect(deleteArtifact('card-1')).resolves.toBe(true);

        expect(deletePersistentVibeCard).toHaveBeenCalledWith('card-1');
    });
});
