const DEFAULT_MAX_TOKENS = 1200;
const DEFAULT_CHUNK_TOKEN_BUDGET = 280;
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text = '') {
    if (!text) return 0;
    return Math.ceil(String(text).length / CHARS_PER_TOKEN);
}

function textForTokenBudget(text, tokenBudget) {
    if (tokenBudget <= 0) return '';
    return String(text || '').slice(0, tokenBudget * CHARS_PER_TOKEN).trim();
}

function pageLabel(page) {
    return page ? ` p.${page}` : '';
}

function createChunk(type, id, text, anchor = '') {
    const label = `[${type}:${id}${anchor}]`;
    const normalizedText = String(text || '').trim();

    return Object.freeze({
        type,
        id,
        label,
        text: normalizedText,
        tokenEstimate: estimateTokens(`${label}\n${normalizedText}`),
    });
}

function chunkWithText(chunk, text) {
    const normalizedText = String(text || '').trim();

    return Object.freeze({
        ...chunk,
        text: normalizedText,
        tokenEstimate: estimateTokens(`${chunk.label}\n${normalizedText}`),
    });
}

function createGoalChunk(goal) {
    if (!goal) return null;
    return createChunk('goal', 'user', goal);
}

function createMetadataChunk(document = {}) {
    const documentId = document.id || 'current-document';
    const lines = [
        `Document: ${document.name || document.title || 'Untitled'}`,
        `Type: ${document.kind || document.type || 'unknown'}`,
        `Document ID: ${documentId}`,
    ];

    return createChunk('metadata', documentId, lines.join('\n'));
}

function createSelectionChunk(selection = {}) {
    if (!selection.text) return null;
    return createChunk(
        'selection',
        selection.spanId || 'current',
        selection.text,
        pageLabel(selection.page)
    );
}

function createOutlineChunk(document = {}) {
    if (!Array.isArray(document.outline) || document.outline.length === 0) return null;

    const text = document.outline
        .map((entry) => {
            const depth = Number.isFinite(entry.level) ? entry.level : 0;
            const prefix = '  '.repeat(depth);
            const page = entry.page ? ` (p.${entry.page})` : '';
            return `${prefix}- ${entry.title || 'Untitled'}${page}`;
        })
        .join('\n');

    return createChunk('outline', document.id || 'current-document', text);
}

function createAnnotationChunks(annotations = []) {
    if (!Array.isArray(annotations)) return [];

    return annotations
        .filter((annotation) => annotation?.selectedText || annotation?.note)
        .map((annotation, index) => {
            const id = annotation.id || `annotation-${index + 1}`;
            const text = [
                annotation.selectedText ? `Text: ${annotation.selectedText}` : '',
                annotation.note ? `Note: ${annotation.note}` : '',
            ].filter(Boolean).join('\n');

            return createChunk('annotation', id, text, pageLabel(annotation.page));
        });
}

function documentBodyText(document = {}) {
    if (document.contentText) return String(document.contentText);
    if (document.text) return String(document.text);
    if (!Array.isArray(document.pages)) return '';

    return document.pages
        .map((page, index) => {
            const pageNumber = page.page || index + 1;
            const text = typeof page === 'string' ? page : page.text;
            return text ? `[page:${pageNumber}]\n${text}` : '';
        })
        .filter(Boolean)
        .join('\n\n');
}

function createBodyChunks(document = {}, chunkTokenBudget = DEFAULT_CHUNK_TOKEN_BUDGET) {
    const text = documentBodyText(document).trim();
    if (!text) return [];

    const chunkSize = Math.max(1, chunkTokenBudget) * CHARS_PER_TOKEN;
    const documentId = document.id || 'current-document';
    const chunks = [];

    for (let start = 0; start < text.length; start += chunkSize) {
        const bodyText = text.slice(start, start + chunkSize).trim();
        if (bodyText) {
            chunks.push(createChunk('body', `${documentId}:${chunks.length}`, bodyText));
        }
    }

    return chunks;
}

function addWithinBudget(chunks, candidate, remainingTokens) {
    if (!candidate || remainingTokens <= 0) {
        return { chunks, remainingTokens, included: false, truncated: Boolean(candidate) };
    }

    if (candidate.tokenEstimate <= remainingTokens) {
        return {
            chunks: [...chunks, candidate],
            remainingTokens: remainingTokens - candidate.tokenEstimate,
            included: true,
            truncated: false,
        };
    }

    const labelTokens = estimateTokens(candidate.label);
    const textBudget = remainingTokens - labelTokens;
    const text = textForTokenBudget(candidate.text, textBudget);

    if (!text) {
        return { chunks, remainingTokens, included: false, truncated: true };
    }

    let trimmed = chunkWithText(candidate, text);
    while (trimmed.tokenEstimate > remainingTokens && trimmed.text.length > 0) {
        trimmed = chunkWithText(trimmed, trimmed.text.slice(0, -CHARS_PER_TOKEN));
    }

    if (!trimmed.text) {
        return { chunks, remainingTokens, included: false, truncated: true };
    }

    return {
        chunks: [...chunks, trimmed],
        remainingTokens: Math.max(0, remainingTokens - trimmed.tokenEstimate),
        included: true,
        truncated: true,
    };
}

export function formatContextChunk(chunk) {
    return `${chunk.label}\n${chunk.text}`.trim();
}

export function packDocumentContext(input = {}, options = {}) {
    const maxTokens = Math.max(1, options.maxTokens || DEFAULT_MAX_TOKENS);
    const chunkTokenBudget = options.chunkTokenBudget || DEFAULT_CHUNK_TOKEN_BUDGET;
    const document = input.document || {};
    const candidates = [
        createGoalChunk(input.goal),
        createMetadataChunk(document),
        createSelectionChunk(input.selection),
        createOutlineChunk(document),
        ...createAnnotationChunks(input.annotations),
        ...createBodyChunks(document, chunkTokenBudget),
    ].filter(Boolean);

    const packed = candidates.reduce((state, candidate, index) => {
        if (state.remainingTokens <= 0) {
            return {
                ...state,
                truncated: true,
            };
        }

        const next = addWithinBudget(state.chunks, candidate, state.remainingTokens);
        return {
            chunks: next.chunks,
            remainingTokens: next.remainingTokens,
            truncated: state.truncated || next.truncated || (!next.included && index < candidates.length),
        };
    }, {
        chunks: [],
        remainingTokens: maxTokens,
        truncated: false,
    });

    const chunks = Object.freeze(packed.chunks);
    const prompt = chunks.map(formatContextChunk).join('\n\n');
    const estimatedTokens = chunks.reduce((total, chunk) => total + chunk.tokenEstimate, 0);

    return Object.freeze({
        goal: input.goal || '',
        chunks,
        prompt,
        estimatedTokens,
        maxTokens,
        truncated: packed.truncated || chunks.length < candidates.length,
    });
}
