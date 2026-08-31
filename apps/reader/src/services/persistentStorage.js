import { invoke } from '@tauri-apps/api/core';

import {
    deleteConversation as browserDeleteConversation,
    listConversations as browserListConversations,
    loadConversation as browserLoadConversation,
    saveConversation as browserSaveConversation,
} from '../storage';

const WEB_DOCUMENTS_KEY = 'vibereader.web.documents';
const DOCUMENT_KNOWLEDGE_LINKS_KEY = 'vibereader.documentKnowledgeLinks';
export const TASK_UPDATED_EVENT = 'vibereader:task-updated';

export function isPersistentStorageAvailable() {
    return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

function readWebDocuments() {
    try {
        const raw = localStorage.getItem(WEB_DOCUMENTS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function writeWebDocuments(documents) {
    try {
        localStorage.setItem(WEB_DOCUMENTS_KEY, JSON.stringify(documents));
    } catch (_) {
        // Browser storage can be unavailable in private or constrained contexts.
    }
}

function normalizeCommandError(error) {
    const normalized = new Error(error?.message || String(error));
    normalized.code = error?.code || 'persistent_storage_error';
    normalized.details = error;
    return normalized;
}

function emitTaskUpdated(task) {
    if (typeof window === 'undefined' || !task) return;
    window.dispatchEvent(new CustomEvent(TASK_UPDATED_EVENT, {
        detail: {
            documentId: task.documentId || null,
            task,
        },
    }));
}

async function invokeStorage(command, payload = {}) {
    if (!isPersistentStorageAvailable()) {
        return null;
    }

    try {
        return await invoke(command, payload);
    } catch (error) {
        throw normalizeCommandError(error);
    }
}

function nowMs(value) {
    return typeof value === 'number' ? value : Date.now();
}

function normalizeDocumentInput(document = {}) {
    return {
        id: document.id || '',
        name: document.name || 'Untitled',
        kind: document.kind || 'unknown',
        source: document.source || 'unknown',
        path: document.path || null,
        mimeType: document.mimeType || 'application/octet-stream',
        size: Number(document.size || 0),
        fingerprint: document.fingerprint || null,
        openedAt: nowMs(document.openedAt),
        updatedAt: nowMs(document.updatedAt || document.openedAt),
        parseStatus: document.parseStatus || 'unknown',
    };
}

function normalizeWebDocumentRecord(document = {}) {
    const normalized = normalizeDocumentInput(document);
    return {
        id: normalized.id,
        name: normalized.name,
        kind: normalized.kind,
        source: normalized.source,
        path: normalized.path,
        mimeType: normalized.mimeType,
        size: normalized.size,
        fingerprint: normalized.fingerprint,
        openedAt: normalized.openedAt,
        updatedAt: normalized.updatedAt,
        parseStatus: normalized.parseStatus,
    };
}

function normalizeDocumentContentInput(documentId, contentText = '', metadata = {}) {
    const now = nowMs(metadata.updatedAt);
    return {
        documentId: documentId || '',
        contentText: String(contentText || ''),
        sourceType: metadata.sourceType || metadata.kind || 'text',
        createdAt: nowMs(metadata.createdAt || now),
        updatedAt: now,
    };
}

function normalizeAnnotationInput(annotation = {}) {
    return {
        id: annotation.id || `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        documentId: annotation.documentId || '',
        page: Number(annotation.page || 0),
        paragraphId: annotation.paragraphId || null,
        selectedText: annotation.selectedText || '',
        note: annotation.note || '',
        color: annotation.color || 'yellow',
        rectJson: annotation.rectJson || (annotation.rect ? JSON.stringify(annotation.rect) : null),
        createdAt: nowMs(annotation.createdAt),
        updatedAt: nowMs(annotation.updatedAt || annotation.createdAt),
    };
}

function normalizeVibeCardInput(card = {}) {
    return {
        id: card.id || `card-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        documentId: card.documentId || '',
        type: card.type || 'note',
        title: card.title || '',
        sourceText: card.sourceText || '',
        aiContent: card.aiContent || '',
        userNote: card.userNote || '',
        page: typeof card.page === 'number' ? card.page : null,
        paragraphId: card.paragraphId || null,
        tagsJson: card.tagsJson || JSON.stringify(card.tags || []),
        sourceJson: card.sourceJson || JSON.stringify(card.source || null),
        createdAt: nowMs(card.createdAt),
        updatedAt: nowMs(card.updatedAt || card.createdAt),
        verificationStatus: card.verificationStatus || 'ungrounded',
    };
}

function extractTitleFromMessages(messages) {
    if (!Array.isArray(messages)) return '';
    const firstUserMsg = messages.find((message) => message.role === 'user');
    if (!firstUserMsg) return '';
    const text = typeof firstUserMsg.content === 'string' ? firstUserMsg.content : '';
    return text.replace(/[#*`\[\]()]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30) || '';
}

function normalizeConversationInput(sessionId, messages = [], metadata = {}) {
    const now = nowMs(metadata.updatedAt);
    return {
        sessionId: sessionId || '',
        documentId: metadata.documentId || null,
        title: metadata.title || extractTitleFromMessages(messages),
        messagesJson: JSON.stringify(Array.isArray(messages) ? messages : []),
        messageCount: Array.isArray(messages) ? messages.length : 0,
        createdAt: nowMs(metadata.createdAt || now),
        updatedAt: now,
    };
}

function normalizeThinkingTreeInput(documentId, tree, metadata = {}) {
    const now = nowMs(metadata.updatedAt);
    return {
        documentId: documentId || '',
        treeJson: typeof tree === 'string' ? tree : JSON.stringify(tree || null),
        createdAt: nowMs(metadata.createdAt || now),
        updatedAt: now,
    };
}

function normalizeAttentionInsightInput(documentId, insight = {}, index = 0, metadata = {}) {
    const now = nowMs(metadata.updatedAt);
    const location = insight.location || {};
    const page = Number(location.page || insight.page || 0);
    const paragraphIndex = Number(location.paragraph ?? insight.paragraphIndex ?? 0);

    return {
        id: insight.id || `attention-${documentId || 'doc'}-${page}-${paragraphIndex}-${index}`,
        documentId: documentId || '',
        type: insight.type || 'unknown',
        description: insight.description || '',
        page,
        paragraphIndex,
        paragraphId: insight.paragraphId || '',
        payloadJson: JSON.stringify(insight || {}),
        readStatus: insight.readStatus || 'unread',
        createdAt: nowMs(insight.createdAt || metadata.createdAt || now),
        updatedAt: nowMs(insight.updatedAt || now),
    };
}

function normalizeSummaryInput(summary = {}) {
    const now = nowMs(summary.updatedAt);
    const documentId = summary.documentId || '';
    const summaryKind = summary.summaryKind || 'section';
    const sectionId = summary.sectionId || null;

    return {
        id:
            summary.id ||
            `summary-${documentId || 'doc'}-${summaryKind}-${sectionId || 'document'}`,
        documentId,
        summaryKind,
        sectionId,
        sectionTitle: summary.sectionTitle || '',
        summary: summary.summary || '',
        keyPointsJson:
            summary.keyPointsJson ||
            JSON.stringify(Array.isArray(summary.keyPoints) ? summary.keyPoints : []),
        rawResponse: summary.rawResponse || '',
        createdAt: nowMs(summary.createdAt || now),
        updatedAt: now,
    };
}

function normalizeFlashcardDeckInput(documentId, deck = {}) {
    const now = nowMs(deck.updatedAt);
    const deckId = deck.id || `deck-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    return {
        id: deckId,
        documentId: documentId || '',
        title: deck.title || 'Untitled Deck',
        createdAt: nowMs(deck.createdAt || now),
        updatedAt: now,
        cards: (Array.isArray(deck.cards) ? deck.cards : []).map((card) => ({
            id: card.id || `flashcard-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            deckId,
            documentId: documentId || '',
            front: card.front || '',
            back: card.back || '',
            known: Boolean(card.known),
            unknown: Boolean(card.unknown),
            createdAt: nowMs(card.createdAt || now),
            updatedAt: nowMs(card.updatedAt || deck.updatedAt || now),
        })),
    };
}

function normalizeSourceSpanInput(documentId, span = {}, index = 0, metadata = {}) {
    const now = nowMs(span.updatedAt || metadata.updatedAt);
    const sourceMetadata = span.metadataJson
        ? span.metadataJson
        : JSON.stringify(span.metadata || {});

    return {
        id: span.id || `${documentId || 'doc'}:span-${index}`,
        documentId: span.documentId || documentId || '',
        page: Number(span.page || 0),
        paragraphId: span.paragraphId || '',
        chunkId: span.chunkId || span.paragraphId || '',
        text: span.text || '',
        orderIndex: Number(span.orderIndex ?? span.order ?? index),
        sourceType: span.sourceType || span.source || 'unknown',
        metadataJson: sourceMetadata,
        createdAt: nowMs(span.createdAt || metadata.createdAt || now),
        updatedAt: now,
    };
}

function normalizeSourceIndexStatusInput(documentId, status = {}) {
    const now = nowMs(status.updatedAt || status.indexedAt);
    return {
        documentId: status.documentId || documentId || '',
        indexSignature: status.indexSignature || '',
        spanCount: Number(status.spanCount || 0),
        indexedAt: nowMs(status.indexedAt || now),
        updatedAt: now,
    };
}

function normalizeJsonField(value, fallback = '') {
    if (typeof value === 'string') return value;
    if (value == null) return fallback;
    return JSON.stringify(value);
}

function normalizeTaskInput(task = {}) {
    const now = nowMs(task.updatedAt);
    return {
        id: task.id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        documentId: task.documentId || null,
        type: task.type || task.taskType || 'unknown',
        status: task.status || 'pending',
        title: task.title || '',
        progress: Number(task.progress || 0),
        payloadJson: normalizeJsonField(task.payloadJson ?? task.payload, '{}'),
        resultJson: normalizeJsonField(task.resultJson ?? task.result, ''),
        errorMessage: task.errorMessage || null,
        createdAt: nowMs(task.createdAt || now),
        updatedAt: now,
        startedAt: typeof task.startedAt === 'number' ? task.startedAt : null,
        completedAt: typeof task.completedAt === 'number' ? task.completedAt : null,
        cancelledAt: typeof task.cancelledAt === 'number' ? task.cancelledAt : null,
    };
}

function parseSummaryRecord(record = {}) {
    let keyPoints = [];
    if (record.keyPointsJson) {
        try {
            keyPoints = JSON.parse(record.keyPointsJson);
        } catch (_) {
            keyPoints = [];
        }
    }

    return {
        ...record,
        keyPoints: Array.isArray(keyPoints) ? keyPoints : [],
    };
}

function parseAttentionInsightRecord(record = {}) {
    let payload = {};
    if (record.payloadJson) {
        try {
            payload = JSON.parse(record.payloadJson);
        } catch (_) {
            payload = {};
        }
    }

    return {
        ...payload,
        id: record.id,
        type: record.type || payload.type,
        description: record.description || payload.description,
        location: payload.location || {
            page: record.page,
            paragraph: record.paragraphIndex,
        },
        paragraphId: record.paragraphId || payload.paragraphId,
        readStatus: record.readStatus || payload.readStatus || 'unread',
    };
}

export async function initializePersistentStorage() {
    if (!isPersistentStorageAvailable()) {
        return {
            initialized: false,
            reason: 'tauri-unavailable',
        };
    }

    return invokeStorage('storage_init');
}

export async function listPersistentConversations() {
    if (!isPersistentStorageAvailable()) {
        return browserListConversations().catch(() => []);
    }
    return invokeStorage('storage_list_conversations');
}

export async function loadPersistentConversation(sessionId) {
    if (!isPersistentStorageAvailable()) {
        const messages = await browserLoadConversation(sessionId).catch(() => null);
        if (!messages) return null;
        return {
            sessionId,
            messagesJson: JSON.stringify(messages),
            messageCount: messages.length,
            title: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }
    return invokeStorage('storage_load_conversation', { sessionId });
}

export async function savePersistentConversation(sessionId, messages, metadata = {}) {
    if (!isPersistentStorageAvailable()) {
        try {
            await browserSaveConversation(sessionId, messages);
        } catch (_) {
            return null;
        }
        return {
            sessionId,
            messagesJson: JSON.stringify(messages),
            messageCount: messages.length,
            title: metadata.title || extractTitleFromMessages(messages),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }
    return invokeStorage('storage_upsert_conversation', {
        input: normalizeConversationInput(sessionId, messages, metadata),
    });
}

export async function deletePersistentConversation(sessionId) {
    if (!isPersistentStorageAvailable()) {
        return browserDeleteConversation(sessionId).catch(() => false);
    }
    return invokeStorage('storage_delete_conversation', { sessionId });
}

export async function listPersistentDocuments() {
    if (!isPersistentStorageAvailable()) {
        return readWebDocuments();
    }
    return invokeStorage('storage_list_documents');
}

export async function savePersistentDocument(document) {
    if (!isPersistentStorageAvailable()) {
        const record = normalizeWebDocumentRecord(document);
        if (!record.id) return null;
        const documents = readWebDocuments().filter((item) => item?.id && item.id !== record.id);
        const next = [record, ...documents]
            .sort((a, b) => Number(b.openedAt || 0) - Number(a.openedAt || 0))
            .slice(0, 100);
        writeWebDocuments(next);
        return record;
    }
    return invokeStorage('storage_upsert_document', {
        input: normalizeDocumentInput(document),
    });
}

export async function savePersistentDocumentContent(documentId, contentText, metadata = {}) {
    if (!isPersistentStorageAvailable()) return null;
    return invokeStorage('storage_upsert_document_content', {
        input: normalizeDocumentContentInput(documentId, contentText, metadata),
    });
}

export async function loadPersistentDocumentContent(documentId) {
    if (!isPersistentStorageAvailable()) return null;
    return invokeStorage('storage_load_document_content', {
        documentId,
    });
}

const READING_POSITIONS_KEY = 'vibereader.readingPositions';

function readBrowserReadingPositions() {
    try {
        const parsed = JSON.parse(localStorage.getItem(READING_POSITIONS_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
}

function writeBrowserReadingPositions(map) {
    try {
        localStorage.setItem(READING_POSITIONS_KEY, JSON.stringify(map));
    } catch (_) {
        // 浏览器存储在隐私/受限上下文可能不可用
    }
}

/**
 * 阅读位置保存（PageFlow 式 Reading Position Memory）。
 * position 结构由前端定义：{ page, scrollRatio, zoom, updatedAt }。
 * Tauri：走 storage_set_reading_position，写入 SQLite documents.reading_position 列。
 * 浏览器回退：localStorage key vibereader.readingPositions（以 documentId 为键的 JSON map）。
 *
 * @param {string} documentId
 * @param {{ page?: number, scrollRatio?: number, zoom?: number|string, updatedAt?: number }} position
 */
export async function savePersistentReadingPosition(documentId, position = {}) {
    const normalized = position && typeof position === 'object' ? position : {};
    if (isPersistentStorageAvailable()) {
        return invokeStorage('storage_set_reading_position', {
            documentId: documentId || '',
            positionJson: JSON.stringify(normalized),
        });
    }
    if (!documentId) return null;
    const map = readBrowserReadingPositions();
    map[documentId] = normalized;
    writeBrowserReadingPositions(map);
    return { documentId, position: normalized };
}

/**
 * 阅读位置读取。未保存过位置时返回 null。
 *
 * @param {string} documentId
 * @returns {Promise<{ page?: number, scrollRatio?: number, zoom?: number|string, updatedAt?: number }|null>}
 */
export async function loadPersistentReadingPosition(documentId) {
    if (isPersistentStorageAvailable()) {
        const positionJson = await invokeStorage('storage_get_reading_position', { documentId });
        if (!positionJson) return null;
        try {
            return JSON.parse(positionJson);
        } catch (_) {
            return null;
        }
    }
    if (!documentId) return null;
    return readBrowserReadingPositions()[documentId] || null;
}

export async function savePersistentThinkingTree(documentId, tree, metadata = {}) {
    if (!isPersistentStorageAvailable()) return null;
    return invokeStorage('storage_upsert_thinking_tree', {
        input: normalizeThinkingTreeInput(documentId, tree, metadata),
    });
}

export async function loadPersistentThinkingTree(documentId) {
    if (!isPersistentStorageAvailable()) return null;
    return invokeStorage('storage_load_thinking_tree', {
        documentId,
    });
}

export async function savePersistentAttentionInsights(documentId, insights = [], metadata = {}) {
    if (!isPersistentStorageAvailable()) return [];
    const records = await invokeStorage('storage_replace_attention_insights', {
        documentId,
        insights: (Array.isArray(insights) ? insights : []).map((insight, index) =>
            normalizeAttentionInsightInput(documentId, insight, index, metadata)
        ),
    });
    return (records || []).map(parseAttentionInsightRecord);
}

export async function listPersistentAttentionInsights(documentId) {
    if (!isPersistentStorageAvailable()) return [];
    const records = await invokeStorage('storage_list_attention_insights', {
        documentId,
    });
    return (records || []).map(parseAttentionInsightRecord);
}

export async function savePersistentSummary(summary) {
    if (!isPersistentStorageAvailable()) return null;
    const record = await invokeStorage('storage_upsert_summary', {
        input: normalizeSummaryInput(summary),
    });
    return record ? parseSummaryRecord(record) : null;
}

export async function loadPersistentSummary(documentId, summaryKind, sectionId = null) {
    if (!isPersistentStorageAvailable()) return null;
    const record = await invokeStorage('storage_load_summary', {
        documentId,
        summaryKind,
        sectionId,
    });
    return record ? parseSummaryRecord(record) : null;
}

export async function exportPersistentReadingNote(documentId) {
    if (!isPersistentStorageAvailable()) return null;
    return invokeStorage('storage_export_reading_note', {
        documentId,
    });
}

export async function importPersistentReadingNoteJson(json) {
    if (!isPersistentStorageAvailable()) return null;
    return invokeStorage('storage_import_reading_note_json', {
        json,
    });
}

export async function savePersistentFlashcardDecks(documentId, decks = []) {
    if (!isPersistentStorageAvailable()) return [];
    return invokeStorage('storage_replace_flashcard_decks', {
        documentId,
        decks: (Array.isArray(decks) ? decks : []).map((deck) =>
            normalizeFlashcardDeckInput(documentId, deck)
        ),
    });
}

export async function listPersistentFlashcardDecks(documentId) {
    if (!isPersistentStorageAvailable()) return [];
    return invokeStorage('storage_list_flashcard_decks', {
        documentId,
    });
}

export async function createPersistentAnnotation(annotation) {
    if (!isPersistentStorageAvailable()) return null;
    return invokeStorage('storage_create_annotation', {
        input: normalizeAnnotationInput(annotation),
    });
}

export async function listPersistentAnnotations(documentId) {
    if (!isPersistentStorageAvailable()) return [];
    return invokeStorage('storage_list_annotations', {
        documentId,
    });
}

export async function createPersistentVibeCard(card) {
    if (!isPersistentStorageAvailable()) return null;
    return invokeStorage('storage_create_vibecard', {
        input: normalizeVibeCardInput(card),
    });
}

export async function deletePersistentVibeCard(id) {
    if (!isPersistentStorageAvailable()) return false;
    return invokeStorage('storage_delete_vibecard', {
        id,
    });
}

export async function listPersistentVibeCards(documentId) {
    if (!isPersistentStorageAvailable()) return [];
    return invokeStorage('storage_list_vibecards', {
        documentId,
    });
}

export async function replacePersistentSourceSpans(documentId, spans = [], metadata = {}) {
    if (!isPersistentStorageAvailable()) return [];
    return invokeStorage('storage_replace_source_spans', {
        documentId,
        spans: (Array.isArray(spans) ? spans : []).map((span, index) =>
            normalizeSourceSpanInput(documentId, span, index, metadata)
        ),
    });
}

export async function listPersistentSourceSpans(documentId) {
    if (!isPersistentStorageAvailable()) return [];
    return invokeStorage('storage_list_source_spans', {
        documentId,
    });
}

export async function searchPersistentSourceSpans(documentId, query, options = {}) {
    if (!isPersistentStorageAvailable()) return [];
    return invokeStorage('storage_search_source_spans', {
        documentId,
        query: query || '',
        limit: Number(options.limit || 4),
    });
}

export async function savePersistentSourceIndexStatus(documentId, status = {}) {
    if (!isPersistentStorageAvailable()) return null;
    return invokeStorage('storage_upsert_source_index_status', {
        input: normalizeSourceIndexStatusInput(documentId, status),
    });
}

export async function loadPersistentSourceIndexStatus(documentId) {
    if (!isPersistentStorageAvailable()) return null;
    return invokeStorage('storage_load_source_index_status', {
        documentId,
    });
}

export async function savePersistentTask(task = {}) {
    if (!isPersistentStorageAvailable()) return null;
    const input = normalizeTaskInput(task);
    const record = await invokeStorage('storage_upsert_task', {
        input,
    });
    emitTaskUpdated(record || input);
    return record;
}

export async function loadPersistentTask(id) {
    if (!isPersistentStorageAvailable()) return null;
    return invokeStorage('storage_load_task', {
        id,
    });
}

export async function listPersistentTasks(documentId = null) {
    if (!isPersistentStorageAvailable()) return [];
    return invokeStorage('storage_list_tasks', {
        documentId,
    });
}

function readBrowserKnowledgeLinks() {
    try {
        const parsed = JSON.parse(localStorage.getItem(DOCUMENT_KNOWLEDGE_LINKS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function writeBrowserKnowledgeLinks(links) {
    try {
        localStorage.setItem(DOCUMENT_KNOWLEDGE_LINKS_KEY, JSON.stringify(links));
    } catch (_) {
        // 浏览器存储在隐私/受限上下文可能不可用
    }
}

/**
 * 文档↔UniRAG 入库链接写入（D4）。
 * Tauri：走 storage_set_document_knowledge 命令，持久化到 SQLite documents 表的
 * unirag_source_id / knowledge_status 两列。
 * 浏览器回退：继续读写现有 localStorage key vibereader.documentKnowledgeLinks
 * （完整 link 记录数组，此处仅合并其中两个持久化字段，保持数据结构兼容）。
 *
 * @param {string} documentId
 * @param {{ uniragSourceId?: string|null, knowledgeStatus?: string|null }} knowledge
 */
export async function savePersistentDocumentKnowledge(documentId, knowledge = {}) {
    const uniragSourceId = knowledge.uniragSourceId ?? null;
    const knowledgeStatus = knowledge.knowledgeStatus ?? null;
    if (isPersistentStorageAvailable()) {
        return invokeStorage('storage_set_document_knowledge', {
            documentId: documentId || '',
            uniragSourceId,
            knowledgeStatus,
        });
    }
    if (!documentId) return null;
    const links = readBrowserKnowledgeLinks();
    const next = links.some((item) => item?.readerDocumentId === documentId)
        ? links.map((item) => (
            item?.readerDocumentId === documentId
                ? {
                    ...item,
                    uniRagSourceId: uniragSourceId,
                    status: knowledgeStatus ?? item.status ?? null,
                }
                : item
        ))
        : [
            {
                readerDocumentId: documentId,
                uniRagSourceId: uniragSourceId,
                status: knowledgeStatus || 'unknown',
                updatedAt: Date.now(),
            },
            ...links,
        ].slice(0, 500);
    writeBrowserKnowledgeLinks(next);
    return { documentId, uniragSourceId, knowledgeStatus };
}

/**
 * 文档↔UniRAG 入库链接读取（D4）。
 * Tauri：走 storage_get_document_knowledge 命令（SQLite）。
 * 浏览器回退：从 localStorage 现有完整记录中映射出两个字段；无记录返回 null。
 *
 * @param {string} documentId
 * @returns {Promise<{ uniragSourceId: string|null, knowledgeStatus: string|null }|null>}
 */
export async function loadPersistentDocumentKnowledge(documentId) {
    if (isPersistentStorageAvailable()) {
        return invokeStorage('storage_get_document_knowledge', { documentId });
    }
    if (!documentId) return null;
    const record = readBrowserKnowledgeLinks()
        .find((item) => item?.readerDocumentId === documentId);
    if (!record) return null;
    return {
        uniragSourceId: record.uniRagSourceId ?? null,
        knowledgeStatus: record.status ?? null,
    };
}
