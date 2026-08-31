const DEFAULT_MAX_CHUNKS = 4;
const DEFAULT_MAX_CHARS_PER_CHUNK = 900;
const PAGE_MARKER_RE = /^\s*(?:\[page\s*:\s*(\d+)\]|---\s*第\s*(\d+)\s*页\s*---)\s*$/i;
const TOKEN_RE = /[\p{L}\p{N}]{3,}/gu;
const STOP_WORDS = new Set([
    'and', 'are', 'but', 'for', 'how', 'the', 'this', 'that', 'what', 'when', 'where', 'which', 'with',
    'about', 'explain', 'strategy', 'please',
]);

function bodyTextForDocument(document = {}) {
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

function normalizeText(text = '') {
    return String(text).replace(/\s+/g, ' ').trim();
}

function textPartsForLimit(text, maxChars) {
    const normalized = normalizeText(text);
    if (!normalized) return [];
    if (normalized.length <= maxChars) return [normalized];

    const parts = [];
    for (let start = 0; start < normalized.length; start += maxChars) {
        const part = normalized.slice(start, start + maxChars).trim();
        if (part) parts.push(part);
    }
    return parts;
}

function tokenize(text = '') {
    return [...String(text).toLowerCase().matchAll(TOKEN_RE)]
        .map((match) => match[0])
        .filter((token) => !STOP_WORDS.has(token));
}

export function sourceIdForChunk(chunk) {
    return `${chunk.documentId}:p${chunk.page || 1}:${chunk.chunkId || chunk.paragraphId}`;
}

function scoreChunk(queryTokens, chunk) {
    if (!queryTokens.length) return 0;
    const text = `${chunk.title || ''} ${chunk.text || ''}`.toLowerCase();
    return queryTokens.reduce((score, token) => {
        let cursor = 0;
        let count = 0;
        while (cursor < text.length) {
            const index = text.indexOf(token, cursor);
            if (index === -1) break;
            count += 1;
            cursor = index + token.length;
        }
        return score + count;
    }, 0);
}

export function buildDocumentChunks(document = {}, options = {}) {
    const maxCharsPerChunk = Math.max(80, options.maxCharsPerChunk || DEFAULT_MAX_CHARS_PER_CHUNK);
    const documentId = document.id || 'current-document';
    const bodyText = bodyTextForDocument(document);
    const lines = bodyText.split(/\r?\n/);
    const chunks = [];
    let currentPage = 1;
    let paragraphBuffer = [];
    const paragraphCountsByPage = new Map();

    const flushParagraph = () => {
        const paragraphText = normalizeText(paragraphBuffer.join('\n'));
        paragraphBuffer = [];
        if (!paragraphText) return;

        const nextIndex = paragraphCountsByPage.get(currentPage) || 0;
        paragraphCountsByPage.set(currentPage, nextIndex + 1);
        const baseParagraphId = `page-${currentPage}-para-${nextIndex}`;
        const parts = textPartsForLimit(paragraphText, maxCharsPerChunk);

        parts.forEach((part, partIndex) => {
            const chunkId = parts.length > 1
                ? `${baseParagraphId}:chunk-${partIndex + 1}`
                : baseParagraphId;
            const chunk = {
                id: sourceIdForChunk({ documentId, page: currentPage, paragraphId: baseParagraphId, chunkId }),
                chunkId,
                documentId,
                documentName: document.name || document.title || 'Untitled',
                page: currentPage,
                paragraphId: baseParagraphId,
                order: chunks.length,
                text: part,
            };
            chunks.push(Object.freeze(chunk));
        });
    };

    lines.forEach((line) => {
        const pageMatch = line.match(PAGE_MARKER_RE);
        if (pageMatch) {
            flushParagraph();
            currentPage = Number(pageMatch[1] || pageMatch[2]) || currentPage;
            return;
        }

        if (!line.trim()) {
            flushParagraph();
            return;
        }

        paragraphBuffer.push(line);
    });
    flushParagraph();

    return Object.freeze(chunks);
}

export function retrieveDocumentChunks(query = '', chunks = [], options = {}) {
    const maxChunks = Math.max(1, options.maxChunks || DEFAULT_MAX_CHUNKS);
    const queryTokens = tokenize(query);

    return chunks
        .map((chunk) => ({
            chunk,
            score: scoreChunk(queryTokens, chunk),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.chunk.order - b.chunk.order)
        .slice(0, maxChunks)
        .map((item) => item.chunk);
}

function selectChunksForMode(query, chunks, options = {}) {
    const mode = options.mode || 'relevant';
    const maxChunks = Math.max(1, options.maxChunks || DEFAULT_MAX_CHUNKS);

    if (mode === 'page') {
        const page = Number(options.page);
        if (!page) return [];
        return chunks
            .filter((chunk) => chunk.page === page)
            .slice(0, maxChunks);
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
        return chunks
            .filter((chunk) => chunk.paragraphId === paragraphId)
            .slice(0, maxChunks);
    }

    return retrieveDocumentChunks(query, chunks, { maxChunks });
}

function promptTitleForMode(mode) {
    if (mode === 'page') return 'Current page source excerpts for the current question.';
    if (mode === 'section') return 'Current section source excerpts for the current question.';
    if (mode === 'paragraph') return 'Selected paragraph source excerpts for the current question.';
    return 'Relevant source excerpts for the current question.';
}

export function buildRetrievalContextFromChunks(selectedChunks = [], options = {}) {
    const mode = options.mode || 'relevant';

    const sourceRefs = selectedChunks.map((chunk) => Object.freeze({
        id: chunk.id,
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        page: chunk.page,
        paragraphId: chunk.paragraphId,
        label: `P${chunk.page || 1}`,
        text: chunk.text,
    }));

    const excerpts = selectedChunks.map((chunk) => {
        const label = `[source:${sourceIdForChunk(chunk)}]`;
        return `${label}\n${chunk.text}`;
    }).join('\n\n');

    const prompt = excerpts
        ? [
            promptTitleForMode(mode),
            'Use these excerpts when they are relevant, and cite the source labels in your answer.',
            excerpts,
        ].join('\n\n')
        : '';

    return Object.freeze({
        usedRetrieval: selectedChunks.length > 0,
        chunks: Object.freeze(selectedChunks),
        sourceRefs: Object.freeze(sourceRefs),
        prompt,
    });
}

export function buildRetrievalContext(input = {}) {
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
    const chunks = buildDocumentChunks(document, { maxCharsPerChunk });
    const selectedChunks = selectChunksForMode(query, chunks, { mode, page, section, paragraphId, maxChunks });
    return buildRetrievalContextFromChunks(selectedChunks, { mode });
}
