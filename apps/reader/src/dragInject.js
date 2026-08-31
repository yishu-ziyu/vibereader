export const DRAG_INJECT_MIME = 'application/x-vibereader-drag-inject';
export const DRAG_INJECT_TEXT_MIME = 'text/plain';
export const DRAG_INJECT_EFFECT = 'copy';
export const DEFAULT_DRAG_REFERENCE_PAGE = 1;
export const DRAG_INJECT_OVERLAY_TEXT = 'Drop here to inject';
export const MAX_QUOTE_LENGTH = 200;

const QUOTE_PREFIX = '>';
const QUOTE_SUFFIX = '\n\n';
const DRAFT_ID_PREFIX = 'drag-inject';
const RANDOM_ID_START = 2;
const RANDOM_ID_END = 9;

function normalizeText(text) {
    return typeof text === 'string' ? text.trim() : '';
}

function normalizePage(page) {
    const parsed = Number.parseInt(page, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DRAG_REFERENCE_PAGE;
}

function truncateQuoteText(text) {
    const cleanText = normalizeText(text);
    if (cleanText.length <= MAX_QUOTE_LENGTH) return cleanText;
    return `${cleanText.slice(0, MAX_QUOTE_LENGTH)}...`;
}

function hasMimeType(dataTransfer, mimeType) {
    const { types } = dataTransfer || {};
    if (!types) return false;
    if (typeof types.includes === 'function') return types.includes(mimeType);
    if (typeof types.contains === 'function') return types.contains(mimeType);
    return Array.from(types).includes(mimeType);
}

export function createDragInjectPayload({ text, page = DEFAULT_DRAG_REFERENCE_PAGE, source = 'reader' } = {}) {
    const cleanText = normalizeText(text);
    if (!cleanText) return null;
    return {
        text: cleanText,
        page: normalizePage(page),
        source,
    };
}

export function writeDragInjectData(dataTransfer, payload) {
    if (!dataTransfer || !payload?.text) return false;
    dataTransfer.effectAllowed = DRAG_INJECT_EFFECT;
    dataTransfer.setData(DRAG_INJECT_MIME, createDragPayload(payload.text, payload.page));
    dataTransfer.setData(DRAG_INJECT_TEXT_MIME, payload.text);
    return true;
}

export function hasDragInjectData(dataTransfer) {
    return hasMimeType(dataTransfer, DRAG_INJECT_MIME);
}

export function readDragInjectData(dataTransfer) {
    if (!dataTransfer || typeof dataTransfer.getData !== 'function') return null;

    const rawPayload = dataTransfer.getData(DRAG_INJECT_MIME);
    if (!rawPayload && !hasDragInjectData(dataTransfer)) return null;

    try {
        const payload = JSON.parse(rawPayload);
        return createDragInjectPayload(payload);
    } catch (_) {
        return null;
    }
}

export function createDragPayload(text, page = DEFAULT_DRAG_REFERENCE_PAGE) {
    const payload = createDragInjectPayload({ text, page });
    if (!payload) return '';
    return JSON.stringify({
        text: payload.text,
        page: payload.page,
    });
}

export function parseDragPayload(dataTransfer) {
    const payload = readDragInjectData(dataTransfer);
    if (!payload) return null;
    return {
        text: payload.text,
        page: payload.page,
    };
}

export function formatQuote(text, page = DEFAULT_DRAG_REFERENCE_PAGE) {
    const cleanText = truncateQuoteText(text);
    if (!cleanText) return '';
    return `${QUOTE_PREFIX} ${cleanText} [P${normalizePage(page)}]`;
}

export function formatDragInjectQuote(payload) {
    const normalized = createDragInjectPayload(payload);
    if (!normalized) return '';
    return `${formatQuote(normalized.text, normalized.page)}${QUOTE_SUFFIX}`;
}

export function createDragInjectDraftId() {
    return `${DRAFT_ID_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(RANDOM_ID_START, RANDOM_ID_END)}`;
}
