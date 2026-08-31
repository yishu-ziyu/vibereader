import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearArtifactsForDocument,
    createArtifact,
    deleteArtifact,
    getArtifactById,
    listArtifactsForDocument,
    updateArtifact,
} from './artifactService';

describe('artifactService', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('persists artifacts and lists only the current document artifacts first', async () => {
        const older = await createArtifact({
            id: 'artifact-old',
            documentId: 'doc-1',
            type: 'lens_card',
            createdAt: 100,
            originalContent: { explanation: 'Old card' },
        });
        const newer = await createArtifact({
            id: 'artifact-new',
            documentId: 'doc-1',
            type: 'lens_card',
            createdAt: 200,
            originalContent: { explanation: 'New card' },
        });
        await createArtifact({
            id: 'artifact-other',
            documentId: 'doc-2',
            type: 'lens_card',
            createdAt: 300,
            originalContent: { explanation: 'Other card' },
        });

        const artifacts = await listArtifactsForDocument('doc-1');

        expect(artifacts).toEqual([newer, older]);
    });

    it('deletes and clears artifacts without touching other documents', async () => {
        await createArtifact({ id: 'artifact-1', documentId: 'doc-1', createdAt: 100 });
        await createArtifact({ id: 'artifact-2', documentId: 'doc-1', createdAt: 200 });
        await createArtifact({ id: 'artifact-3', documentId: 'doc-2', createdAt: 300 });

        await deleteArtifact('artifact-1');
        expect((await listArtifactsForDocument('doc-1')).map((item) => item.id)).toEqual(['artifact-2']);

        await clearArtifactsForDocument('doc-1');
        expect(await listArtifactsForDocument('doc-1')).toEqual([]);
        expect((await listArtifactsForDocument('doc-2')).map((item) => item.id)).toEqual(['artifact-3']);
    });

    it('preserves immutable source metadata when edited content omits source', async () => {
        await createArtifact({
            id: 'artifact-source',
            documentId: 'doc-1',
            type: 'lens_card',
            source: {
                documentId: 'doc-1',
                page: 2,
                rects: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.04 }],
                coordinateSpace: 'page-normalized',
                sourceType: 'pdf-selection',
            },
            originalContent: {
                explanation: 'Original explanation.',
                source: {
                    documentId: 'doc-1',
                    page: 2,
                    rects: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.04 }],
                    coordinateSpace: 'page-normalized',
                    sourceType: 'pdf-selection',
                },
            },
        });

        const updated = await updateArtifact('artifact-source', {
            currentContent: { explanation: 'Edited explanation without source.' },
        });

        expect(updated.source).toEqual({
            documentId: 'doc-1',
            page: 2,
            rects: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.04 }],
            coordinateSpace: 'page-normalized',
            sourceType: 'pdf-selection',
        });
        expect(updated.currentContent).toEqual({ explanation: 'Edited explanation without source.' });
    });
    it('resolves getArtifactById by id and optional document scope', async () => {
        await createArtifact({
            id: 'artifact-target',
            documentId: 'doc-1',
            type: 'explain_card',
            originalContent: { answer: 'Scoped card' },
        });
        await createArtifact({
            id: 'artifact-other',
            documentId: 'doc-2',
            type: 'explain_card',
            originalContent: { answer: 'Other doc' },
        });

        await expect(getArtifactById('artifact-target')).resolves.toEqual(
            expect.objectContaining({ id: 'artifact-target', documentId: 'doc-1' }),
        );
        await expect(getArtifactById('artifact-target', { documentId: 'doc-1' })).resolves.toEqual(
            expect.objectContaining({ id: 'artifact-target' }),
        );
        await expect(getArtifactById('artifact-target', { documentId: 'doc-2' })).resolves.toBeNull();
        await expect(getArtifactById('missing')).resolves.toBeNull();
        await expect(getArtifactById('')).resolves.toBeNull();
    });

});
