import {
    createPersistentAnnotation,
    isPersistentStorageAvailable,
    listPersistentAnnotations,
} from './persistentStorage';

const ANNOTATIONS_KEY = 'vibereader.annotations';

function readAnnotations() {
    try {
        const raw = localStorage.getItem(ANNOTATIONS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function writeAnnotations(annotations) {
    localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(annotations));
}

export async function createAnnotation(input) {
    const annotation = {
        id: `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        documentId: input.documentId,
        page: input.page,
        selectedText: input.selectedText,
        note: input.note || '',
        color: input.color || 'yellow',
        rect: input.rect || null,
        createdAt: Date.now(),
    };

    if (isPersistentStorageAvailable()) {
        return createPersistentAnnotation(annotation);
    }

    writeAnnotations([annotation, ...readAnnotations()]);
    return annotation;
}

export async function listAnnotationsForDocument(documentId) {
    if (isPersistentStorageAvailable()) {
        return listPersistentAnnotations(documentId);
    }

    return readAnnotations()
        .filter((annotation) => annotation.documentId === documentId)
        .sort((a, b) => b.createdAt - a.createdAt);
}

export async function clearAnnotationsForDocument(documentId) {
    writeAnnotations(readAnnotations().filter((annotation) => annotation.documentId !== documentId));
}
