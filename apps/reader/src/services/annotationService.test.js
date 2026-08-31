import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearAnnotationsForDocument,
    createAnnotation,
    listAnnotationsForDocument,
} from './annotationService';

describe('annotationService', () => {
    beforeEach(async () => {
        localStorage.clear();
        await clearAnnotationsForDocument('doc-1');
        await clearAnnotationsForDocument('doc-2');
    });

    it('creates a highlight annotation with document id, page, selected text, color and rect', async () => {
        const annotation = await createAnnotation({
            documentId: 'doc-1',
            page: 3,
            selectedText: 'Important passage',
            color: 'yellow',
            rect: { left: 10, top: 20, width: 100, height: 15 },
        });

        expect(annotation).toEqual(expect.objectContaining({
            documentId: 'doc-1',
            page: 3,
            selectedText: 'Important passage',
            color: 'yellow',
            rect: { left: 10, top: 20, width: 100, height: 15 },
        }));
        expect(annotation.id).toMatch(/^annotation-/);
        expect(typeof annotation.createdAt).toBe('number');
    });

    it('persists note annotations and only lists annotations for the requested document', async () => {
        await createAnnotation({
            documentId: 'doc-1',
            page: 1,
            selectedText: 'Note target',
            note: 'My interpretation',
            color: 'blue',
        });
        await createAnnotation({
            documentId: 'doc-2',
            page: 1,
            selectedText: 'Other document',
            color: 'green',
        });

        const annotations = await listAnnotationsForDocument('doc-1');

        expect(annotations).toHaveLength(1);
        expect(annotations[0]).toEqual(expect.objectContaining({
            documentId: 'doc-1',
            selectedText: 'Note target',
            note: 'My interpretation',
            color: 'blue',
        }));
    });
});
