import {
    createPersistentVibeCard,
    deletePersistentVibeCard,
    isPersistentStorageAvailable,
    listPersistentVibeCards,
} from './persistentStorage';

const ARTIFACTS_KEY = 'vibereader.artifacts';

function readArtifacts() {
    try {
        const raw = localStorage.getItem(ARTIFACTS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function writeArtifacts(artifacts) {
    localStorage.setItem(ARTIFACTS_KEY, JSON.stringify(artifacts));
}

function createdAtMs(value) {
    if (typeof value === 'number') return value;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function safeJsonParse(value, fallback) {
    if (!value || typeof value !== 'string') return fallback;
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

function artifactToVibeCard(artifact) {
    const source = artifact.source || artifact.originalContent?.source || artifact.currentContent?.source || null;
    return {
        id: artifact.id,
        documentId: artifact.documentId,
        type: artifact.type || 'reading_note',
        title: artifact.goal || artifact.title || artifact.type || 'Reading card',
        sourceText: source?.selectedText || source?.text || artifact.originalContent?.sourceText || '',
        aiContent: JSON.stringify(artifact.originalContent || {}),
        userNote: artifact.currentContent?.userNote || artifact.userNote || '',
        page: typeof source?.page === 'number' ? source.page : null,
        paragraphId: source?.paragraphId || null,
        tags: artifact.tags || [],
        source,
        createdAt: artifact.createdAt || Date.now(),
        updatedAt: artifact.updatedAt || artifact.createdAt || Date.now(),
        verificationStatus: artifact.verificationStatus || 'ungrounded',
    };
}

function vibeCardToArtifact(card) {
    const source = safeJsonParse(card.sourceJson, null);
    const parsedContent = safeJsonParse(card.aiContent, null);
    const originalContent = {
        ...(parsedContent && typeof parsedContent === 'object'
            ? parsedContent
            : (card.aiContent ? { aiContent: card.aiContent } : {})),
        ...(card.sourceText ? { sourceText: card.sourceText } : {}),
        ...(source ? { source } : {}),
    };
    const currentContent = {
        ...originalContent,
        ...(card.userNote ? { userNote: card.userNote } : {}),
    };
    const sourceSpanIds = [card.paragraphId || source?.paragraphId].filter(Boolean);
    return {
        id: card.id,
        documentId: card.documentId,
        type: card.type || 'reading_note',
        goal: card.title || '',
        sourceSpanIds,
        ...(source ? { source } : {}),
        modelId: '',
        createdAt: card.createdAt,
        originalContent,
        currentContent,
        verificationStatus: card.verificationStatus || 'ungrounded',
    };
}

function mergeArtifact(artifact, patch = {}) {
    return {
        ...artifact,
        ...patch,
        source: patch.source || artifact.source,
        originalContent: patch.originalContent || artifact.originalContent,
        currentContent: patch.currentContent || artifact.currentContent,
        updatedAt: patch.updatedAt || Date.now(),
    };
}

export async function createArtifact(input = {}) {
    const source = input.source || input.originalContent?.source || input.currentContent?.source || null;
    const artifact = {
        id: input.id || `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        documentId: input.documentId,
        type: input.type || 'reading_note',
        goal: input.goal || '',
        sourceSpanIds: input.sourceSpanIds || [],
        ...(source ? { source } : {}),
        modelId: input.modelId || '',
        createdAt: input.createdAt || Date.now(),
        originalContent: input.originalContent || {},
        currentContent: input.currentContent || input.originalContent || {},
        verificationStatus: input.verificationStatus || 'ungrounded',
    };

    if (isPersistentStorageAvailable()) {
        await createPersistentVibeCard(artifactToVibeCard(artifact));
        return artifact;
    }

    writeArtifacts([artifact, ...readArtifacts().filter((item) => item.id !== artifact.id)]);
    return artifact;
}

export async function listArtifactsForDocument(documentId) {
    if (isPersistentStorageAvailable()) {
        const cards = await listPersistentVibeCards(documentId);
        return cards.map(vibeCardToArtifact);
    }

    return readArtifacts()
        .filter((artifact) => artifact.documentId === documentId)
        .sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt));
}

/**
 * Resolve one local artifact by id for memory_save and related product flows.
 * Persistent storage scopes by documentId when provided.
 */
export async function getArtifactById(artifactId, options = {}) {
    const id = String(artifactId || '').trim();
    if (!id) return null;

    const documentId = options.documentId || null;

    if (isPersistentStorageAvailable()) {
        if (!documentId) return null;
        const artifacts = await listArtifactsForDocument(documentId);
        return artifacts.find((artifact) => artifact.id === id) || null;
    }

    const match = readArtifacts().find((artifact) => artifact.id === id) || null;
    if (!match) return null;
    if (documentId && match.documentId !== documentId) return null;
    return match;
}

export async function updateArtifact(id, patch = {}) {
    if (isPersistentStorageAvailable()) {
        const documentId = patch.documentId;
        if (!documentId) return null;

        const artifacts = (await listPersistentVibeCards(documentId)).map(vibeCardToArtifact);
        const current = artifacts.find((artifact) => artifact.id === id);
        if (!current) return null;

        const updated = mergeArtifact(current, patch);
        await createPersistentVibeCard(artifactToVibeCard(updated));
        return updated;
    }

    const artifacts = readArtifacts();
    const index = artifacts.findIndex((artifact) => artifact.id === id);
    if (index === -1) return null;

    const updated = mergeArtifact(artifacts[index], patch);
    const next = [...artifacts];
    next[index] = updated;
    writeArtifacts(next);
    return updated;
}

export async function deleteArtifact(id) {
    if (isPersistentStorageAvailable()) {
        return deletePersistentVibeCard(id);
    }

    writeArtifacts(readArtifacts().filter((artifact) => artifact.id !== id));
    return true;
}

export async function clearArtifactsForDocument(documentId) {
    writeArtifacts(readArtifacts().filter((artifact) => artifact.documentId !== documentId));
}
