import {
    buildDocumentChunks,
    buildRetrievalContextFromChunks,
    sourceIdForChunk,
} from '../retrievalContext';
import {
    isPersistentStorageAvailable,
    loadPersistentSourceIndexStatus,
    listPersistentSourceSpans,
    replacePersistentSourceSpans,
    savePersistentSourceIndexStatus,
    savePersistentTask,
    searchPersistentSourceSpans,
} from './persistentStorage';
import { buildLocalKeywordRetrievalContext } from './ragEngineAdapter';

const DEFAULT_MAX_CHUNKS = 4;
const DEFAULT_MAX_CHARS_PER_CHUNK = 900;
const MIN_TEXT_MATCH_SCORE = 0.35;
const indexedDocumentSignatures = new Map();

function signatureTextForDocument(document = {}) {
    if (document.contentText) return String(document.contentText);
    if (document.pdfText) return String(document.pdfText);
    if (document.text) return String(document.text);
    if (!Array.isArray(document.pages)) return '';

    return document.pages
        .map((page, index) => {
            const pageNumber = page?.page || index + 1;
            const text = typeof page === 'string' ? page : page?.text;
            return text ? `[page:${pageNumber}]\n${text}` : '';
        })
        .filter(Boolean)
        .join('\n\n');
}

function hashString(value = '') {
    let hash = 5381;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
}

function sourceIndexSignature(document = {}, options = {}) {
    const maxCharsPerChunk = Math.max(
        80,
        options.maxCharsPerChunk || DEFAULT_MAX_CHARS_PER_CHUNK
    );
    return [
        document.id || '',
        document.fingerprint || '',
        document.updatedAt || '',
        document.size || '',
        document.kind || '',
        maxCharsPerChunk,
        hashString(signatureTextForDocument(document)),
    ].join('|');
}

function sourceIndexTaskId(documentId) {
    return `task-source-index-${documentId}`;
}

async function recordSourceIndexTask(document = {}, patch = {}) {
    if (!document?.id || !isPersistentStorageAvailable()) return null;

    try {
        return await savePersistentTask({
            id: sourceIndexTaskId(document.id),
            documentId: document.id,
            type: 'source_index',
            title: `Index ${document.name || document.title || 'document'}`,
            payload: {
                documentId: document.id,
                documentName: document.name || document.title || 'Untitled',
            },
            ...patch,
        });
    } catch (error) {
        console.warn('[sourceIndexService] Failed to record source index task:', error);
        return null;
    }
}

function parseJsonObject(value) {
    if (!value || typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
}

function normalizeComparableText(value = '') {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function comparableTokens(value = '') {
    return normalizeComparableText(value)
        .split(' ')
        .filter((token) => token.length >= 2);
}

function textMatchScore(needle = '', haystack = '') {
    const normalizedNeedle = normalizeComparableText(needle);
    const normalizedHaystack = normalizeComparableText(haystack);
    if (!normalizedNeedle || !normalizedHaystack) return 0;
    if (normalizedHaystack.includes(normalizedNeedle)) return 1;
    if (normalizedNeedle.includes(normalizedHaystack) && normalizedHaystack.length >= 24) return 0.9;

    const needleTokens = new Set(comparableTokens(normalizedNeedle));
    if (needleTokens.size === 0) return 0;
    const haystackTokens = new Set(comparableTokens(normalizedHaystack));
    let overlap = 0;
    needleTokens.forEach((token) => {
        if (haystackTokens.has(token)) overlap += 1;
    });
    return overlap / needleTokens.size;
}

function sourceRefCitationText(sourceRef = {}) {
    return sourceRef.text || sourceRef.sourceText || sourceRef.selectedText || sourceRef.excerpt || '';
}

function chunkFromSourceSpan(span = {}, fallbackDocument = {}) {
    const metadata = parseJsonObject(span.metadataJson);
    const chunk = {
        id: span.id || sourceIdForChunk({
            documentId: span.documentId || fallbackDocument.id || 'current-document',
            page: span.page || 1,
            paragraphId: span.paragraphId,
            chunkId: span.chunkId || span.paragraphId,
        }),
        chunkId: span.chunkId || span.paragraphId || '',
        documentId: span.documentId || fallbackDocument.id || 'current-document',
        documentName: metadata.documentName || fallbackDocument.name || fallbackDocument.title || 'Untitled',
        page: Number(span.page || 1),
        paragraphId: span.paragraphId || '',
        order: Number(span.orderIndex ?? span.order ?? 0),
        text: span.text || '',
    };
    return Object.freeze(chunk);
}

function selectIndexedChunksForMode(chunks, options = {}) {
    const mode = options.mode || 'relevant';
    const maxChunks = Math.max(1, options.maxChunks || DEFAULT_MAX_CHUNKS);

    if (mode === 'page') {
        const page = Number(options.page);
        if (!page) return [];
        return chunks.filter((chunk) => chunk.page === page).slice(0, maxChunks);
    }

    if (mode === 'section') {
        const section = options.section || {};
        const pageStart = Number(section.pageStart);
        const pageEnd = Number(section.pageEnd || section.pageStart);
        if (!pageStart || !pageEnd) return [];
        return chunks
            .filter((chunk) => chunk.page >= pageStart && chunk.page <= pageEnd)
            .slice(0, maxChunks);
    }

    if (mode === 'paragraph') {
        const paragraphId = String(options.paragraphId || '').trim();
        if (!paragraphId) return [];
        return chunks.filter((chunk) => chunk.paragraphId === paragraphId).slice(0, maxChunks);
    }

    return chunks.slice(0, maxChunks);
}

export function sourceSpansFromChunks(chunks = [], metadata = {}) {
    return (Array.isArray(chunks) ? chunks : [])
        .filter((chunk) => chunk?.documentId && chunk?.text)
        .map((chunk, index) => ({
            id: chunk.id || sourceIdForChunk(chunk),
            documentId: chunk.documentId,
            page: Number(chunk.page || 0),
            paragraphId: chunk.paragraphId || '',
            chunkId: chunk.chunkId || chunk.paragraphId || '',
            text: chunk.text,
            orderIndex: Number(chunk.order ?? chunk.orderIndex ?? index),
            sourceType: chunk.sourceType || 'document_chunk',
            metadata: {
                ...metadata,
                documentName: chunk.documentName || metadata.documentName,
            },
        }));
}

export function groundSourceRefsForDocument(sourceRefs = [], document = {}, options = {}) {
    if (!Array.isArray(sourceRefs) || sourceRefs.length === 0 || !document?.id) {
        return Object.freeze([]);
    }

    const chunks = buildDocumentChunks(document, {
        maxCharsPerChunk: options.maxCharsPerChunk || DEFAULT_MAX_CHARS_PER_CHUNK,
    });
    const documentName = document.name || document.title || 'Untitled';

    return Object.freeze(sourceRefs.map((sourceRef, index) => {
        const page = Number(sourceRef.page || 0);
        const citationText = sourceRefCitationText(sourceRef);
        const samePageChunks = page > 0 ? chunks.filter((chunk) => chunk.page === page) : [];
        const candidates = samePageChunks.length > 0 ? samePageChunks : chunks;
        const exactParagraph = sourceRef.paragraphId
            ? chunks.find((chunk) => chunk.paragraphId === sourceRef.paragraphId)
            : null;

        let best = exactParagraph ? { chunk: exactParagraph, score: 1, matchedBy: 'paragraphId' } : null;
        if (!best && citationText) {
            best = candidates
                .map((chunk) => ({
                    chunk,
                    score: textMatchScore(citationText, chunk.text),
                    matchedBy: 'text',
                }))
                .filter((item) => item.score >= MIN_TEXT_MATCH_SCORE)
                .sort((a, b) => b.score - a.score || a.chunk.order - b.chunk.order)[0] || null;
        }

        if (best?.chunk) {
            return Object.freeze({
                ...sourceRef,
                id: best.chunk.id || sourceRef.id,
                chunkId: best.chunk.chunkId || sourceRef.chunkId,
                originalDocumentId: sourceRef.documentId,
                originalParagraphId: sourceRef.paragraphId,
                documentId: document.id,
                documentName,
                page: best.chunk.page,
                paragraphId: best.chunk.paragraphId,
                label: sourceRef.label || `P${best.chunk.page || 1}`,
                text: citationText || best.chunk.text,
                matchedText: best.chunk.text,
                grounding: Object.freeze({
                    precision: 'paragraph',
                    matchedBy: best.matchedBy,
                    score: Number(best.score.toFixed(3)),
                }),
            });
        }

        if (page > 0) {
            return Object.freeze({
                ...sourceRef,
                originalDocumentId: sourceRef.documentId,
                originalParagraphId: sourceRef.paragraphId,
                documentId: document.id,
                documentName,
                page,
                paragraphId: '',
                label: sourceRef.label || `P${page}`,
                text: citationText,
                grounding: Object.freeze({
                    precision: 'page',
                    matchedBy: samePageChunks.length > 0 ? 'page' : 'citation-page',
                    score: 0,
                }),
            });
        }

        return Object.freeze({
            ...sourceRef,
            originalDocumentId: sourceRef.documentId,
            originalParagraphId: sourceRef.paragraphId,
            documentId: document.id,
            documentName,
            paragraphId: '',
            label: sourceRef.label || `来源 ${index + 1}`,
            text: citationText,
            grounding: Object.freeze({
                precision: 'document',
                matchedBy: 'document',
                score: 0,
            }),
        });
    }));
}

export async function indexDocumentSourceSpans(document = {}, options = {}) {
    if (!document?.id || !isPersistentStorageAvailable()) return [];

    const startedAt = Date.now();
    await recordSourceIndexTask(document, {
        status: 'running',
        progress: 10,
        createdAt: startedAt,
        updatedAt: startedAt,
        startedAt,
    });

    const maxCharsPerChunk = Math.max(
        80,
        options.maxCharsPerChunk || DEFAULT_MAX_CHARS_PER_CHUNK
    );
    const chunks = buildDocumentChunks(document, { maxCharsPerChunk });
    const metadata = {
        documentName: document.name || document.title || 'Untitled',
        documentKind: document.kind || 'unknown',
    };
    const spans = sourceSpansFromChunks(chunks, metadata);
    const indexSignature = sourceIndexSignature(document, { maxCharsPerChunk });

    try {
        const records = await replacePersistentSourceSpans(document.id, spans, metadata);
        const indexedAt = Date.now();
        await savePersistentSourceIndexStatus(document.id, {
            indexSignature,
            spanCount: spans.length,
            indexedAt,
        });
        await recordSourceIndexTask(document, {
            status: 'succeeded',
            progress: 100,
            result: {
                spanCount: spans.length,
                indexSignature,
            },
            createdAt: startedAt,
            updatedAt: indexedAt,
            startedAt,
            completedAt: indexedAt,
        });
        indexedDocumentSignatures.set(document.id, indexSignature);
        return records;
    } catch (error) {
        const failedAt = Date.now();
        await recordSourceIndexTask(document, {
            status: 'failed',
            progress: 100,
            errorMessage: error?.message || String(error),
            createdAt: startedAt,
            updatedAt: failedAt,
            startedAt,
            completedAt: failedAt,
        });
        throw error;
    }
}

export function clearSourceIndexCache(documentId = null) {
    if (documentId) {
        indexedDocumentSignatures.delete(documentId);
        return;
    }
    indexedDocumentSignatures.clear();
}

async function ensureDocumentSourceIndex(document = {}, options = {}) {
    if (!document?.id || !isPersistentStorageAvailable()) return [];

    const signature = sourceIndexSignature(document, options);
    if (indexedDocumentSignatures.get(document.id) === signature) {
        return [];
    }

    const persistedStatus = await loadPersistentSourceIndexStatus(document.id);
    if (persistedStatus?.indexSignature === signature) {
        indexedDocumentSignatures.set(document.id, signature);
        return [];
    }

    return indexDocumentSourceSpans(document, options);
}

async function indexedChunksForInput(input = {}) {
    const {
        document = {},
        query = '',
        mode = 'relevant',
        page = null,
        section = null,
        paragraphId = null,
        maxChunks = DEFAULT_MAX_CHUNKS,
        maxCharsPerChunk = DEFAULT_MAX_CHARS_PER_CHUNK,
    } = input;

    if (!document?.id || !isPersistentStorageAvailable()) return [];

    await ensureDocumentSourceIndex(document, { maxCharsPerChunk });

    if (mode === 'relevant') {
        const records = await searchPersistentSourceSpans(document.id, query, { limit: maxChunks });
        return (records || []).map((span) => chunkFromSourceSpan(span, document));
    }

    const records = await listPersistentSourceSpans(document.id);
    const chunks = (records || [])
        .map((span) => chunkFromSourceSpan(span, document))
        .sort((a, b) => a.order - b.order || a.page - b.page);
    return selectIndexedChunksForMode(chunks, { mode, page, section, paragraphId, maxChunks });
}

export async function buildIndexedRetrievalContext(input = {}) {
    if (!isPersistentStorageAvailable()) {
        return buildLocalKeywordRetrievalContext(input);
    }

    try {
        const chunks = await indexedChunksForInput(input);
        if (chunks.length > 0) {
            return buildRetrievalContextFromChunks(chunks, { mode: input.mode || 'relevant' });
        }
    } catch (error) {
        console.warn('[sourceIndexService] Falling back to JS retrieval:', error);
    }

    return buildLocalKeywordRetrievalContext(input);
}
