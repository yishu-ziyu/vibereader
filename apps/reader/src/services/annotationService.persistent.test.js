import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createAnnotation,
    listAnnotationsForDocument,
} from './annotationService';
import {
    createPersistentAnnotation,
    isPersistentStorageAvailable,
    listPersistentAnnotations,
} from './persistentStorage';

vi.mock('./persistentStorage', () => ({
    createPersistentAnnotation: vi.fn(),
    isPersistentStorageAvailable: vi.fn(),
    listPersistentAnnotations: vi.fn(),
}));

describe('annotationService persistent adapter', () => {
    beforeEach(() => {
        vi.mocked(isPersistentStorageAvailable).mockReturnValue(true);
        vi.mocked(createPersistentAnnotation).mockReset();
        vi.mocked(listPersistentAnnotations).mockReset();
    });

    it('creates annotations through persistent storage when available', async () => {
        vi.mocked(createPersistentAnnotation).mockResolvedValue({
            id: 'annotation-persistent',
            documentId: 'doc-1',
            page: 2,
            selectedText: 'Persistent text',
            color: 'yellow',
            createdAt: 100,
        });

        const annotation = await createAnnotation({
            documentId: 'doc-1',
            page: 2,
            selectedText: 'Persistent text',
            color: 'yellow',
        });

        expect(annotation.id).toBe('annotation-persistent');
        expect(createPersistentAnnotation).toHaveBeenCalledWith(expect.objectContaining({
            documentId: 'doc-1',
            selectedText: 'Persistent text',
        }));
    });

    it('lists annotations through persistent storage when available', async () => {
        vi.mocked(listPersistentAnnotations).mockResolvedValue([
            { id: 'annotation-persistent', documentId: 'doc-1' },
        ]);

        await expect(listAnnotationsForDocument('doc-1')).resolves.toEqual([
            { id: 'annotation-persistent', documentId: 'doc-1' },
        ]);
        expect(listPersistentAnnotations).toHaveBeenCalledWith('doc-1');
    });
});
