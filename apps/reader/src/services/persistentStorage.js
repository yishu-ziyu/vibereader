import { invoke } from '@tauri-apps/api/core';

// R2 存储单轨化：产品只做桌面客户端（Tauri），持久化唯一路径是
// Tauri command → SQLite。浏览器形态（Vite dev server 仅用于调试）不再
// 维护 localStorage/IndexedDB 回退；非 Tauri 运行时下所有持久化函数都是
// 安全 no-op（返回 null/空数组），保证 dev server 下 UI 可启动不报错。

export const TASK_UPDATED_EVENT = 'vibereader:task-updated';

export function isPersistentStorageAvailable() {
    return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

// 模块级 flag：非 Tauri 运行时只告警一次，避免 dev server 下刷屏
let hasWarnedUnavailable = false;

function warnUnavailableOnce() {
    if (hasWarnedUnavailable) return;
    hasWarnedUnavailable = true;
    console.warn(
        '[persistentStorage] Tauri runtime unavailable; persistence is disabled (dev-server mode).'
    );
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
        warnUnavailableOnce();
        return {
            initialized: false,
            reason: 'tauri-unavailable',
        };
    }

    return invokeStorage('storage_init');
}

export async function listPersistentConversations() {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return [];
    }
    return invokeStorage('storage_list_conversations');
}

export async function loadPersistentConversation(sessionId) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_load_conversation', { sessionId });
}

export async function savePersistentConversation(sessionId, messages, metadata = {}) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_upsert_conversation', {
        input: normalizeConversationInput(sessionId, messages, metadata),
    });
}

export async function deletePersistentConversation(sessionId) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return false;
    }
    return invokeStorage('storage_delete_conversation', { sessionId });
}

export async function listPersistentDocuments() {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return [];
    }
    return invokeStorage('storage_list_documents');
}

export async function savePersistentDocument(document) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_upsert_document', {
        input: normalizeDocumentInput(document),
    });
}

export async function savePersistentDocumentContent(documentId, contentText, metadata = {}) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_upsert_document_content', {
        input: normalizeDocumentContentInput(documentId, contentText, metadata),
    });
}

export async function loadPersistentDocumentContent(documentId) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_load_document_content', {
        documentId,
    });
}

/**
 * 阅读位置保存（PageFlow 式 Reading Position Memory）。
 * position 结构由前端定义：{ variant, page, scrollRatio, zoom, updatedAt }。
 * 单轨化后仅走 Tauri：storage_set_reading_position，写入 SQLite documents.reading_position 列；
 * 非 Tauri 运行时为安全 no-op（返回 null）。
 *
 * @param {string} documentId
 * @param {{ page?: number, scrollRatio?: number, zoom?: number|string, updatedAt?: number }} position
 */
export async function savePersistentReadingPosition(documentId, position = {}) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    const normalized = position && typeof position === 'object' ? position : {};
    return invokeStorage('storage_set_reading_position', {
        documentId: documentId || '',
        positionJson: JSON.stringify(normalized),
    });
}

/**
 * 阅读位置读取。未保存过位置时返回 null。
 *
 * @param {string} documentId
 * @returns {Promise<{ page?: number, scrollRatio?: number, zoom?: number|string, updatedAt?: number }|null>}
 */
export async function loadPersistentReadingPosition(documentId) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    const positionJson = await invokeStorage('storage_get_reading_position', { documentId });
    if (!positionJson) return null;
    try {
        return JSON.parse(positionJson);
    } catch (_) {
        return null;
    }
}

export async function savePersistentThinkingTree(documentId, tree, metadata = {}) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_upsert_thinking_tree', {
        input: normalizeThinkingTreeInput(documentId, tree, metadata),
    });
}

export async function loadPersistentThinkingTree(documentId) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_load_thinking_tree', {
        documentId,
    });
}

export async function savePersistentAttentionInsights(documentId, insights = [], metadata = {}) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return [];
    }
    const records = await invokeStorage('storage_replace_attention_insights', {
        documentId,
        insights: (Array.isArray(insights) ? insights : []).map((insight, index) =>
            normalizeAttentionInsightInput(documentId, insight, index, metadata)
        ),
    });
    return (records || []).map(parseAttentionInsightRecord);
}

export async function listPersistentAttentionInsights(documentId) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return [];
    }
    const records = await invokeStorage('storage_list_attention_insights', {
        documentId,
    });
    return (records || []).map(parseAttentionInsightRecord);
}

export async function savePersistentSummary(summary) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    const record = await invokeStorage('storage_upsert_summary', {
        input: normalizeSummaryInput(summary),
    });
    return record ? parseSummaryRecord(record) : null;
}

export async function loadPersistentSummary(documentId, summaryKind, sectionId = null) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    const record = await invokeStorage('storage_load_summary', {
        documentId,
        summaryKind,
        sectionId,
    });
    return record ? parseSummaryRecord(record) : null;
}

export async function exportPersistentReadingNote(documentId) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_export_reading_note', {
        documentId,
    });
}

export async function importPersistentReadingNoteJson(json) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_import_reading_note_json', {
        json,
    });
}

export async function savePersistentFlashcardDecks(documentId, decks = []) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return [];
    }
    return invokeStorage('storage_replace_flashcard_decks', {
        documentId,
        decks: (Array.isArray(decks) ? decks : []).map((deck) =>
            normalizeFlashcardDeckInput(documentId, deck)
        ),
    });
}

export async function listPersistentFlashcardDecks(documentId) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return [];
    }
    return invokeStorage('storage_list_flashcard_decks', {
        documentId,
    });
}

export async function createPersistentAnnotation(annotation) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_create_annotation', {
        input: normalizeAnnotationInput(annotation),
    });
}

export async function listPersistentAnnotations(documentId) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return [];
    }
    return invokeStorage('storage_list_annotations', {
        documentId,
    });
}

export async function createPersistentVibeCard(card) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_create_vibecard', {
        input: normalizeVibeCardInput(card),
    });
}

export async function deletePersistentVibeCard(id) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return false;
    }
    return invokeStorage('storage_delete_vibecard', {
        id,
    });
}

export async function listPersistentVibeCards(documentId) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return [];
    }
    return invokeStorage('storage_list_vibecards', {
        documentId,
    });
}

export async function replacePersistentSourceSpans(documentId, spans = [], metadata = {}) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return [];
    }
    return invokeStorage('storage_replace_source_spans', {
        documentId,
        spans: (Array.isArray(spans) ? spans : []).map((span, index) =>
            normalizeSourceSpanInput(documentId, span, index, metadata)
        ),
    });
}

export async function listPersistentSourceSpans(documentId) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return [];
    }
    return invokeStorage('storage_list_source_spans', {
        documentId,
    });
}

export async function searchPersistentSourceSpans(documentId, query, options = {}) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return [];
    }
    return invokeStorage('storage_search_source_spans', {
        documentId,
        query: query || '',
        limit: Number(options.limit || 4),
    });
}

export async function savePersistentSourceIndexStatus(documentId, status = {}) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_upsert_source_index_status', {
        input: normalizeSourceIndexStatusInput(documentId, status),
    });
}

export async function loadPersistentSourceIndexStatus(documentId) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_load_source_index_status', {
        documentId,
    });
}

export async function savePersistentTask(task = {}) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    const input = normalizeTaskInput(task);
    const record = await invokeStorage('storage_upsert_task', {
        input,
    });
    emitTaskUpdated(record || input);
    return record;
}

export async function loadPersistentTask(id) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_load_task', {
        id,
    });
}

export async function listPersistentTasks(documentId = null) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return [];
    }
    return invokeStorage('storage_list_tasks', {
        documentId,
    });
}

/**
 * 文档↔UniRAG 入库链接写入（D4）。
 * 单轨化后仅走 Tauri：storage_set_document_knowledge 命令，持久化到 SQLite
 * documents 表的 unirag_source_id / knowledge_status 两列；非 Tauri no-op。
 *
 * @param {string} documentId
 * @param {{ uniragSourceId?: string|null, knowledgeStatus?: string|null }} knowledge
 */
export async function savePersistentDocumentKnowledge(documentId, knowledge = {}) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    const uniragSourceId = knowledge.uniragSourceId ?? null;
    const knowledgeStatus = knowledge.knowledgeStatus ?? null;
    return invokeStorage('storage_set_document_knowledge', {
        documentId: documentId || '',
        uniragSourceId,
        knowledgeStatus,
    });
}

/**
 * 文档↔UniRAG 入库链接读取（D4）。
 * 单轨化后仅走 Tauri：storage_get_document_knowledge 命令（SQLite）；非 Tauri no-op。
 *
 * @param {string} documentId
 * @returns {Promise<{ uniragSourceId: string|null, knowledgeStatus: string|null }|null>}
 */
export async function loadPersistentDocumentKnowledge(documentId) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    return invokeStorage('storage_get_document_knowledge', { documentId });
}
