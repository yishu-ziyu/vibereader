function positivePage(page) {
    const pageNumber = Number(page);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
        throw new Error('A positive page number is required');
    }
    return pageNumber;
}

function pageTextFromDocument(document = {}, page) {
    if (!Array.isArray(document.pages)) return '';

    const pageNumber = positivePage(page);
    const match = document.pages.find((entry, index) => {
        if (typeof entry === 'string') return index + 1 === pageNumber;
        return (entry.page || index + 1) === pageNumber;
    });

    if (typeof match === 'string') return match;
    return match?.text || '';
}

function fullDocumentText(document = {}) {
    if (document.contentText) return String(document.contentText);
    if (document.text) return String(document.text);
    if (!Array.isArray(document.pages)) return '';

    return document.pages
        .map((entry) => (typeof entry === 'string' ? entry : entry.text || ''))
        .filter(Boolean)
        .join('\n\n');
}

function boundedText(text, maxChars) {
    const normalized = String(text || '');
    const limit = Number(maxChars);

    if (!Number.isFinite(limit) || limit < 1 || normalized.length <= limit) {
        return {
            text: normalized,
            truncated: false,
        };
    }

    return {
        text: normalized.slice(0, limit),
        truncated: true,
    };
}

function currentDocumentMetadata(document = {}, args = {}) {
    const pages = Array.isArray(document.pages) ? document.pages.length : null;
    const pageCount = Number.isInteger(document.pageCount)
        ? document.pageCount
        : Number.isInteger(document.pdfPages)
            ? document.pdfPages
            : pages;

    return Object.freeze({
        documentId: args.documentId || document.id || 'current-document',
        name: document.name || document.title || 'Untitled',
        kind: document.kind || document.type || 'unknown',
        pageCount,
        source: document.source || null,
        openedAt: document.openedAt || null,
        parseStatus: document.parseStatus || null,
    });
}

function queryTokens(query) {
    return String(query || '')
        .toLowerCase()
        .split(/[\s,.;:!?()[\]{}"'`]+/)
        .map((token) => token.trim())
        .filter(Boolean);
}

function scoreText(text, tokens) {
    const normalized = String(text || '').toLowerCase();
    return tokens.reduce((score, token) => (
        normalized.includes(token) ? score + 1 : score
    ), 0);
}

function freezeMatch(match) {
    return Object.freeze({
        id: match.id,
        documentId: match.documentId,
        page: match.page,
        paragraphId: match.paragraphId,
        text: match.text,
        score: match.score,
        truncated: match.truncated,
    });
}


function resolveAbortSignal(options = {}) {
    return options?.signal || options?.abortSignal || null;
}

function throwIfAborted(signal) {
    if (!signal || !signal.aborted) return;
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    throw error;
}

function localSearchMatches(document = {}, query, options = {}) {
    const tokens = queryTokens(query);
    if (tokens.length === 0) return [];

    const documentId = options.documentId || document.id || 'current-document';
    const maxChars = options.maxChars;
    const pageEntries = Array.isArray(document.pages)
        ? document.pages.map((entry, index) => ({
            page: typeof entry === 'string' ? index + 1 : entry.page || index + 1,
            paragraphId: typeof entry === 'string'
                ? `page-${index + 1}`
                : entry.paragraphId || `page-${entry.page || index + 1}`,
            text: typeof entry === 'string' ? entry : entry.text || '',
        }))
        : fullDocumentText(document)
            .split(/\n{2,}/)
            .map((text, index) => ({
                page: null,
                paragraphId: `chunk-${index + 1}`,
                text,
            }));

    const signal = resolveAbortSignal(options);
    throwIfAborted(signal);

    return pageEntries
        .map((entry, index) => {
            throwIfAborted(signal);
            const score = scoreText(entry.text, tokens);
            if (score < 1) return null;

            const result = boundedText(entry.text, maxChars);
            return {
                id: `${documentId}-${entry.paragraphId}-match-${index + 1}`,
                documentId,
                page: entry.page,
                paragraphId: entry.paragraphId,
                text: result.text,
                score,
                truncated: result.truncated,
                order: index,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map((match, index) => ({
            ...match,
            id: `${documentId}-${match.paragraphId}-match-${index + 1}`,
        }));
}

function localDocumentChunks(document = {}, query, options = {}) {
    const tokens = queryTokens(query);
    const documentId = options.documentId || document.id || 'current-document';
    const paragraphs = fullDocumentText(document)
        .split(/\n{2,}/)
        .map((text) => text.trim())
        .filter(Boolean);

    const signal = resolveAbortSignal(options);
    throwIfAborted(signal);

    return paragraphs
        .map((text, index) => {
            throwIfAborted(signal);
            const score = tokens.length ? scoreText(text, tokens) : 1;
            if (score < 1) return null;

            const result = boundedText(text, options.maxChars);
            return {
                id: `${documentId}-chunk-${index + 1}`,
                documentId,
                page: null,
                paragraphId: `chunk-${index + 1}`,
                text: result.text,
                score,
                truncated: result.truncated,
                order: index,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.order - b.order);
}

export async function extractText(args = {}, adapters = {}) {
    const document = args.document || adapters.document || {};
    const documentId = document.id || args.documentId || adapters.documentId || 'current-document';
    const hasPage = args.page !== undefined && args.page !== null;
    const page = hasPage ? positivePage(args.page) : null;

    const rawText = hasPage && adapters.getPageText
        ? await adapters.getPageText(page)
        : hasPage
            ? pageTextFromDocument(document, page)
            : fullDocumentText(document);
    const result = boundedText(rawText, args.maxChars);

    return Object.freeze({
        documentId,
        page,
        text: result.text,
        truncated: result.truncated,
        source: hasPage ? 'page' : 'document',
    });
}

export async function getCurrentDocument(args = {}, adapters = {}) {
    if (adapters.getCurrentDocument) {
        const metadata = await adapters.getCurrentDocument(args.documentId);
        return currentDocumentMetadata(metadata || {}, {
            documentId: metadata?.documentId || metadata?.id || args.documentId,
        });
    }

    const document = args.document || adapters.document || {};
    return currentDocumentMetadata(document, args);
}

export async function getPageText(args = {}, adapters = {}) {
    return extractText(args, adapters);
}

export async function searchDocument(args = {}, adapters = {}, options = {}) {
    const signal = resolveAbortSignal(options);
    throwIfAborted(signal);

    const document = args.document || adapters.document || {};
    const documentId = args.documentId || document.id || adapters.documentId || 'current-document';
    const query = String(args.query || '').trim();

    if (!query) {
        return Object.freeze({
            documentId,
            query,
            matches: Object.freeze([]),
        });
    }

    const matches = adapters.searchDocument
        ? await adapters.searchDocument({
            documentId,
            query,
            limit: args.limit,
            maxChars: args.maxChars,
            signal,
        })
        : localSearchMatches(document, query, {
            documentId,
            maxChars: args.maxChars,
            signal,
        });
    throwIfAborted(signal);

    const limit = Number(args.limit);
    const boundedMatches = Number.isFinite(limit) && limit > 0
        ? matches.slice(0, limit)
        : matches;

    return Object.freeze({
        documentId,
        query,
        matches: Object.freeze(boundedMatches.map(freezeMatch)),
    });
}

export async function getDocumentChunks(args = {}, adapters = {}, options = {}) {
    const signal = resolveAbortSignal(options);
    throwIfAborted(signal);

    const document = args.document || adapters.document || {};
    const documentId = args.documentId || document.id || adapters.documentId || 'current-document';
    const query = String(args.query || '').trim();

    const chunks = adapters.getDocumentChunks
        ? await adapters.getDocumentChunks({
            documentId,
            query,
            limit: args.limit,
            maxChars: args.maxChars,
            signal,
        })
        : localDocumentChunks(document, query, {
            documentId,
            maxChars: args.maxChars,
            signal,
        });
    throwIfAborted(signal);

    const limit = Number(args.limit);
    const boundedChunks = Number.isFinite(limit) && limit > 0
        ? chunks.slice(0, limit)
        : chunks;

    return Object.freeze({
        documentId,
        query,
        chunks: Object.freeze(boundedChunks.map(freezeMatch)),
    });
}

export async function listAttentionInsights(args = {}, adapters = {}) {
    const document = args.document || adapters.document || {};
    const documentId = args.documentId || document.id || adapters.documentId;

    if (!documentId) {
        return Object.freeze({
            documentId: null,
            insights: Object.freeze([]),
        });
    }

    const insights = adapters.listAttentionInsightsForDocument
        ? await adapters.listAttentionInsightsForDocument(documentId)
        : [];

    return Object.freeze({
        documentId,
        insights: Object.freeze([...(insights || [])]),
    });
}

function documentIdFromArgs(args = {}, adapters = {}) {
    const document = args.document || adapters.document || {};
    return args.documentId || document.id || adapters.documentId;
}

export async function createVibeCard(args = {}, adapters = {}) {
    if (!adapters.createVibeCard) {
        throw new Error('create_vibecard requires a createVibeCard adapter');
    }

    const documentId = documentIdFromArgs(args, adapters);
    const cardInput = {
        documentId,
        ...(args.card || {}),
    };
    const card = await adapters.createVibeCard(cardInput);

    return Object.freeze({
        documentId,
        cardId: card?.id || null,
        status: 'created',
        card: Object.freeze({ ...(card || {}) }),
    });
}

export async function createAnnotation(args = {}, adapters = {}) {
    if (!adapters.createAnnotation) {
        throw new Error('create_annotation requires a createAnnotation adapter');
    }

    const documentId = documentIdFromArgs(args, adapters);
    const annotationInput = {
        documentId,
        ...(args.annotation || {}),
    };
    const annotation = await adapters.createAnnotation(annotationInput);

    return Object.freeze({
        documentId,
        annotationId: annotation?.id || null,
        status: 'created',
        annotation: Object.freeze({ ...(annotation || {}) }),
    });
}

export async function exportNote(args = {}, adapters = {}) {
    if (!adapters.exportNote) {
        throw new Error('export_note requires an exportNote adapter');
    }

    const documentId = documentIdFromArgs(args, adapters);
    const exportResult = await adapters.exportNote({
        documentId,
        template: args.template || 'default',
        format: args.format || 'markdown',
    });

    return Object.freeze({
        documentId,
        status: 'exported',
        export: Object.freeze({ ...(exportResult || {}) }),
    });
}

export async function navigatePage(args = {}, adapters = {}) {
    const page = positivePage(args.page);

    if (!adapters.navigateToPage) {
        return Object.freeze({
            page,
            currentPage: page,
            status: 'navigation-unavailable',
        });
    }

    const result = await adapters.navigateToPage(page);
    return Object.freeze({
        page,
        currentPage: result?.currentPage || page,
        status: 'navigated',
    });
}

export async function listAnnotations(args = {}, adapters = {}) {
    const document = args.document || adapters.document || {};
    const documentId = args.documentId || document.id || adapters.documentId;

    if (!documentId) {
        return Object.freeze({
            documentId: null,
            annotations: Object.freeze([]),
        });
    }

    const annotations = adapters.listAnnotationsForDocument
        ? await adapters.listAnnotationsForDocument(documentId)
        : [];

    return Object.freeze({
        documentId,
        annotations: Object.freeze([...(annotations || [])]),
    });
}

function freezeKnowledgeMatch(match = {}, index = 0) {
    const documentId = match.documentId || match.document_id || 'unknown';
    const paragraphId = match.paragraphId || match.paragraph_id || match.chunkId || match.chunk_id || `match-${index + 1}`;
    return Object.freeze({
        id: match.id || `${documentId}-${paragraphId}-match-${index + 1}`,
        documentId,
        page: match.page ?? null,
        paragraphId,
        text: match.text || match.sourceText || match.selectedText || '',
        score: Number.isFinite(Number(match.score)) ? Number(match.score) : null,
        truncated: Boolean(match.truncated),
    });
}

function matchesFromRetrievalContext(context = {}, limit) {
    const chunks = Array.isArray(context.chunks) && context.chunks.length > 0
        ? context.chunks
        : Array.isArray(context.sourceRefs)
            ? context.sourceRefs
            : [];
    const mapped = chunks.map((chunk, index) => freezeKnowledgeMatch({
        id: chunk.id,
        documentId: chunk.documentId,
        page: chunk.page,
        paragraphId: chunk.paragraphId || chunk.chunkId,
        text: chunk.text,
        score: chunk.score,
        truncated: chunk.truncated,
    }, index));
    const boundedLimit = Number(limit);
    return Number.isFinite(boundedLimit) && boundedLimit > 0
        ? mapped.slice(0, boundedLimit)
        : mapped;
}

function engineFromRagAdapter(ragAdapter = {}, context = {}) {
    return context?.ragEngine?.engine
        || ragAdapter.engine
        || 'rag-adapter';
}

function knowledgeSearchErrorCodeFromMessage(message = '') {
    const text = String(message || '').toLowerCase();
    if (text.includes('timeout') || text.includes('timed out') || text.includes('aborted')) {
        return 'timeout';
    }
    if (text.includes('health') || text.includes('unavailable') || text.includes('econnrefused')) {
        return 'unirag_unavailable';
    }
    return 'query_failed';
}

function isUnavailableKnowledgeSearchResult(result) {
    if (!result || typeof result !== 'object') return false;
    if (result.ok === false) return true;
    if (result.engine === 'unavailable') return true;
    if (result.status === 'unavailable') return true;
    return false;
}

function localKeywordKnowledgeSearchResult(args = {}, options = {}) {
    const query = String(args.query || '').trim();
    const document = options.document || {};
    const documentId = options.documentId || document.id || 'current-document';
    const limit = options.limit;
    const matches = localSearchMatches(document, query, {
        documentId,
        maxChars: args.maxChars,
    });
    const boundedLimit = Number(limit);
    const boundedMatches = Number.isFinite(boundedLimit) && boundedLimit > 0
        ? matches.slice(0, boundedLimit)
        : matches;

    const message = options.message
        || options.error
        || 'UniRAG unavailable; using local keyword retrieval.';
    const payload = {
        ok: false,
        tool: 'knowledge_search',
        query,
        matches: Object.freeze(boundedMatches.map(freezeMatch)),
        engine: 'local-keyword',
        degraded: true,
        errorCode: options.errorCode || 'unirag_unavailable',
        message,
        error: message,
        fallbackHint: options.fallbackHint || 'use search_document for local keyword match',
    };
    if (options.ragEngine) {
        payload.ragEngine = options.ragEngine;
    }

    return Object.freeze(payload);
}

async function healthGateForKnowledgeSearch(ragAdapter) {
    if (!ragAdapter || typeof ragAdapter.health !== 'function') {
        return { available: true };
    }

    try {
        const health = await ragAdapter.health();
        if (health && health.available === false) {
            return {
                available: false,
                errorCode: 'unirag_unavailable',
                message: health.error
                    || health.reason
                    || 'UniRAG health failed; using local keyword retrieval.',
                ragEngine: health,
            };
        }
        return { available: true, ragEngine: health || null };
    } catch (error) {
        return {
            available: false,
            errorCode: 'unirag_unavailable',
            message: error?.message || String(error),
        };
    }
}

export async function knowledgeSearch(args = {}, adapters = {}, options = {}) {
    const signal = resolveAbortSignal(options);
    throwIfAborted(signal);

    const query = String(args.query || '').trim();
    const document = args.document || adapters.document || {};
    const documentId = args.documentId || document.id || adapters.documentId || 'current-document';
    const limit = args.limit;

    const degradeToLocal = (extra = {}) => localKeywordKnowledgeSearchResult(args, {
        document,
        documentId,
        limit,
        ...extra,
    });

    if (adapters.knowledgeSearch) {
        try {
            const payload = {
                query,
                limit,
                documentId,
                document,
            };
            const knowledgeSearchFn = adapters.knowledgeSearch;
            const result = knowledgeSearchFn.length >= 2
                ? await knowledgeSearchFn(payload, { signal, abortSignal: signal })
                : await knowledgeSearchFn(payload);
            throwIfAborted(signal);

            if (isUnavailableKnowledgeSearchResult(result)) {
                return degradeToLocal({
                    errorCode: result?.errorCode
                        || knowledgeSearchErrorCodeFromMessage(result?.message || result?.error),
                    message: result?.message
                        || result?.error
                        || 'Knowledge search adapter unavailable; using local keyword retrieval.',
                    ragEngine: result?.ragEngine,
                });
            }

            const matches = Array.isArray(result?.matches)
                ? result.matches
                : Array.isArray(result)
                    ? result
                    : [];
            return Object.freeze({
                query,
                matches: Object.freeze(matches.map(freezeKnowledgeMatch)),
                engine: result?.engine || 'knowledge-search-adapter',
            });
        } catch (error) {
            if (error?.name === 'AbortError' || signal?.aborted) {
                throw error;
            }
            return degradeToLocal({
                errorCode: knowledgeSearchErrorCodeFromMessage(error?.message),
                message: error?.message || String(error),
            });
        }
    }

    const health = await healthGateForKnowledgeSearch(adapters.ragAdapter);
    if (health.available === false) {
        return degradeToLocal({
            errorCode: health.errorCode || 'unirag_unavailable',
            message: health.message,
            ragEngine: health.ragEngine,
        });
    }

    if (adapters.ragAdapter?.buildRetrievalContext) {
        try {
            const context = await adapters.ragAdapter.buildRetrievalContext({
                document,
                query,
                documentId,
                maxChunks: Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : undefined,
            });
            return Object.freeze({
                query,
                matches: Object.freeze(matchesFromRetrievalContext(context, limit)),
                engine: engineFromRagAdapter(adapters.ragAdapter, context),
            });
        } catch (error) {
            if (error?.name === 'AbortError' || signal?.aborted) {
                throw error;
            }
            return degradeToLocal({
                errorCode: knowledgeSearchErrorCodeFromMessage(error?.message),
                message: error?.message || String(error),
            });
        }
    }

    if (adapters.ragAdapter?.query) {
        try {
            const result = await adapters.ragAdapter.query({
                question: query,
                query,
                topK: limit,
                top_k: limit,
            });
            const matches = Array.isArray(result?.sourceRefs)
                ? result.sourceRefs
                : Array.isArray(result?.citations)
                    ? result.citations
                    : [];
            return Object.freeze({
                query,
                matches: Object.freeze(matches.map(freezeKnowledgeMatch)),
                engine: result?.ragEngine?.engine || adapters.ragAdapter.engine || 'rag-query',
            });
        } catch (error) {
            if (error?.name === 'AbortError' || signal?.aborted) {
                throw error;
            }
            return degradeToLocal({
                errorCode: knowledgeSearchErrorCodeFromMessage(error?.message),
                message: error?.message || String(error),
            });
        }
    }

    const matches = localSearchMatches(document, query, {
        documentId,
        maxChars: args.maxChars,
        signal,
    });
    throwIfAborted(signal);
    const boundedLimit = Number(limit);
    const boundedMatches = Number.isFinite(boundedLimit) && boundedLimit > 0
        ? matches.slice(0, boundedLimit)
        : matches;

    return Object.freeze({
        query,
        matches: Object.freeze(boundedMatches.map(freezeMatch)),
        engine: 'local-keyword',
    });
}

function freezeMemory(memory = {}, index = 0) {
    return Object.freeze({
        id: memory.id || memory.memoryId || memory.artifactId || `memory-${index + 1}`,
        title: memory.title || memory.memoryTitle || memory.goal || '',
        text: memory.text || memory.summary || memory.content || memory.answer || '',
        score: Number.isFinite(Number(memory.score)) ? Number(memory.score) : null,
        documentId: memory.documentId || memory.document_id || null,
        artifactId: memory.artifactId || memory.artifact_id || null,
        type: memory.type || memory.artifactType || memory.sourceType || null,
    });
}

function memorySearchUnavailable(query, extra = {}) {
    const message = extra.message || extra.error || undefined;
    const payload = {
        query,
        memories: Object.freeze([]),
        status: 'unavailable',
        ok: false,
        ...extra,
    };
    if (message) {
        payload.message = message;
        payload.error = message;
    }
    return Object.freeze(payload);
}

export async function memorySearch(args = {}, adapters = {}, options = {}) {
    const signal = resolveAbortSignal(options);
    throwIfAborted(signal);

    const query = String(args.query || '').trim();

    if (!adapters.searchMemory) {
        return memorySearchUnavailable(query);
    }

    try {
        const payload = {
            query,
            limit: args.limit,
        };
        const searchMemoryFn = adapters.searchMemory;
        const result = searchMemoryFn.length >= 2
            ? await searchMemoryFn(payload, { signal, abortSignal: signal })
            : await searchMemoryFn(payload);
        throwIfAborted(signal);

        if (
            result?.ok === false
            || result?.status === 'unavailable'
            || result?.engine === 'unavailable'
        ) {
            return memorySearchUnavailable(query, {
                errorCode: result?.errorCode
                    || knowledgeSearchErrorCodeFromMessage(result?.message || result?.error),
                message: result?.message
                    || result?.error
                    || 'Memory search unavailable.',
            });
        }

        const memories = Array.isArray(result?.memories)
            ? result.memories
            : Array.isArray(result)
                ? result
                : [];
        const limit = Number(args.limit);
        const bounded = Number.isFinite(limit) && limit > 0
            ? memories.slice(0, limit)
            : memories;

        return Object.freeze({
            query,
            memories: Object.freeze(bounded.map(freezeMemory)),
            status: result?.status || 'ok',
        });
    } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) {
            throw error;
        }
        const message = error?.message || String(error);
        return memorySearchUnavailable(query, {
            errorCode: knowledgeSearchErrorCodeFromMessage(message),
            message,
        });
    }
}

function memorySaveFailure(errorCode, message, extra = {}) {
    return Object.freeze({
        ok: false,
        tool: 'memory_save',
        errorCode,
        message,
        degraded: true,
        ...extra,
    });
}

async function resolveMemorySaveArtifact(args = {}, adapters = {}) {
    const artifactId = String(args.artifactId || '').trim();
    if (!artifactId) {
        return { artifactId: null, artifact: null };
    }

    if (args.artifact && typeof args.artifact === 'object' && args.artifact.id) {
        return { artifactId, artifact: args.artifact };
    }

    if (typeof adapters.getArtifactById === 'function') {
        const artifact = await adapters.getArtifactById(artifactId);
        return { artifactId, artifact: artifact || null };
    }

    return { artifactId, artifact: null };
}

async function resolveMemorySaveDocument(args = {}, adapters = {}, artifact = null) {
    if (args.document && typeof args.document === 'object') {
        return args.document;
    }

    const documentId = args.documentId
        || artifact?.documentId
        || adapters.documentId
        || adapters.document?.id
        || null;

    if (typeof adapters.getDocumentById === 'function' && documentId) {
        const document = await adapters.getDocumentById(documentId);
        if (document) return document;
    }

    if (adapters.document && typeof adapters.document === 'object') {
        return adapters.document;
    }

    return documentId ? { id: documentId } : {};
}

function isIngestibleSavedMemoryArtifact(artifact, adapters = {}) {
    if (typeof adapters.canIngestSavedMemoryArtifact === 'function') {
        return Boolean(adapters.canIngestSavedMemoryArtifact(artifact));
    }
    if (!artifact?.id || !artifact?.documentId) return false;
    const type = artifact.type || '';
    const ingestible = new Set([
        'explain_card',
        'lens_card',
        'evidence_card',
        'concept_card',
        'concept',
        'reading_note',
    ]);
    return ingestible.has(type);
}

function memoryIdFromIngestResult(result = {}) {
    return result.memoryId
        || result.memory_id
        || result.result?.memoryId
        || result.result?.memory_id
        || null;
}

/**
 * Persist a user-confirmed local artifact into UniRAG long-term memory.
 * Hard gate: userConfirmed must be true (product UI only; model cannot self-confirm).
 */
export async function memorySave(args = {}, adapters = {}) {
    const artifactIdArg = String(args.artifactId || '').trim();

    if (args.userConfirmed !== true) {
        return memorySaveFailure(
            'confirmation_required',
            'memory_save requires userConfirmed: true from the product UI gate.',
            { artifactId: artifactIdArg || null },
        );
    }

    if (!artifactIdArg) {
        return memorySaveFailure(
            'artifact_not_found',
            'memory_save requires a non-empty artifactId.',
            { artifactId: null },
        );
    }

    const { artifactId, artifact } = await resolveMemorySaveArtifact(args, adapters);
    if (!artifact) {
        return memorySaveFailure(
            'artifact_not_found',
            `Artifact "${artifactId}" was not found.`,
            { artifactId },
        );
    }

    if (!isIngestibleSavedMemoryArtifact(artifact, adapters)) {
        return memorySaveFailure(
            'unsupported_artifact',
            'Artifact type is not ingestible for saved memory, or text content is empty.',
            {
                artifactId,
                documentId: artifact.documentId || args.documentId || null,
            },
        );
    }

    const document = await resolveMemorySaveDocument(args, adapters, artifact);
    const documentId = document.id || artifact.documentId || args.documentId || null;
    const waitForCompletion = args.waitForCompletion !== false;

    try {
        // Prefer full product path (task panel + poll) when waiting for completion.
        if (waitForCompletion && typeof adapters.startSavedMemoryIngest === 'function') {
            const result = await adapters.startSavedMemoryIngest({
                artifact,
                document,
                adapter: adapters.ragAdapter,
            });

            return Object.freeze({
                ok: true,
                tool: 'memory_save',
                artifactId,
                documentId,
                status: result?.status || 'completed',
                jobId: result?.jobId || null,
                statusUrl: result?.statusUrl || null,
                memoryId: memoryIdFromIngestResult(result),
                contractVersion: 'reader-unirag-memory-v1',
                ragEngine: Object.freeze({
                    engine: result?.ragEngine?.engine
                        || adapters.ragAdapter?.engine
                        || 'uni-rag',
                    available: true,
                }),
            });
        }

        // Queue-only path (or fallback without startSavedMemoryIngest): ingestMemory once.
        if (typeof adapters.buildSavedMemoryPayload === 'function' && adapters.ragAdapter?.ingestMemory) {
            const memory = adapters.buildSavedMemoryPayload(artifact, document);
            const start = await adapters.ragAdapter.ingestMemory({ memory });

            if (waitForCompletion && start?.jobId && adapters.ragAdapter.getMemoryIngestStatus) {
                const latest = await adapters.ragAdapter.getMemoryIngestStatus(start.jobId);
                if (latest?.status === 'failed') {
                    return memorySaveFailure(
                        'ingest_failed',
                        latest.error || latest.message || 'Saved memory ingest failed.',
                        { artifactId, documentId, jobId: start.jobId || null },
                    );
                }
                return Object.freeze({
                    ok: true,
                    tool: 'memory_save',
                    artifactId,
                    documentId,
                    status: latest?.status || 'completed',
                    jobId: start.jobId || null,
                    statusUrl: start.statusUrl || null,
                    memoryId: memoryIdFromIngestResult(latest) || memoryIdFromIngestResult(start),
                    contractVersion: memory.contractVersion || 'reader-unirag-memory-v1',
                    ragEngine: Object.freeze({
                        engine: adapters.ragAdapter.engine || 'uni-rag',
                        available: true,
                    }),
                });
            }

            return Object.freeze({
                ok: true,
                tool: 'memory_save',
                artifactId,
                documentId,
                status: start?.status || 'queued',
                jobId: start?.jobId || null,
                statusUrl: start?.statusUrl || null,
                memoryId: memoryIdFromIngestResult(start),
                contractVersion: memory.contractVersion || 'reader-unirag-memory-v1',
                ragEngine: Object.freeze({
                    engine: adapters.ragAdapter?.engine || 'uni-rag',
                    available: true,
                }),
            });
        }

        // Last resort: startSavedMemoryIngest always polls; use only when no queue-only adapters.
        if (typeof adapters.startSavedMemoryIngest === 'function') {
            const result = await adapters.startSavedMemoryIngest({
                artifact,
                document,
                adapter: adapters.ragAdapter,
            });

            return Object.freeze({
                ok: true,
                tool: 'memory_save',
                artifactId,
                documentId,
                status: result?.status || 'completed',
                jobId: result?.jobId || null,
                statusUrl: result?.statusUrl || null,
                memoryId: memoryIdFromIngestResult(result),
                contractVersion: 'reader-unirag-memory-v1',
                ragEngine: Object.freeze({
                    engine: result?.ragEngine?.engine
                        || adapters.ragAdapter?.engine
                        || 'uni-rag',
                    available: true,
                }),
            });
        }

        return memorySaveFailure(
            'unirag_unavailable',
            'memory_save requires a startSavedMemoryIngest adapter or ragAdapter.ingestMemory.',
            { artifactId, documentId },
        );
    } catch (error) {
        const message = error?.message || String(error);
        const lower = message.toLowerCase();
        let errorCode = 'ingest_failed';
        if (lower.includes('timeout') || lower.includes('timed out')) {
            errorCode = 'timeout';
        } else if (lower.includes('unavailable') || lower.includes('network') || lower.includes('fetch')) {
            errorCode = 'unirag_unavailable';
        }

        return memorySaveFailure(errorCode, message, { artifactId, documentId });
    }
}

function evidenceTextFromArgs(args = {}) {
    if (args.evidenceText !== undefined && args.evidenceText !== null) {
        return String(args.evidenceText);
    }
    if (args.sourceRef && typeof args.sourceRef === 'object') {
        return String(
            args.sourceRef.text
            || args.sourceRef.sourceText
            || args.sourceRef.selectedText
            || ''
        );
    }
    return '';
}

function tokenSet(text = '') {
    return new Set(queryTokens(text));
}

function tokenJaccardScore(claimText, evidenceText) {
    const claimTokens = tokenSet(claimText);
    const evidenceTokens = tokenSet(evidenceText);
    if (claimTokens.size === 0 || evidenceTokens.size === 0) return 0;

    let intersection = 0;
    claimTokens.forEach((token) => {
        if (evidenceTokens.has(token)) intersection += 1;
    });
    const union = claimTokens.size + evidenceTokens.size - intersection;
    if (union <= 0) return 0;
    return intersection / union;
}

export async function verifyCitation(args = {}) {
    const claim = String(args.claim || '');
    const evidenceText = evidenceTextFromArgs(args);
    const score = tokenJaccardScore(claim, evidenceText);

    return Object.freeze({
        claim,
        score,
        grounded: score >= 0.2,
        method: 'token-overlap',
    });
}

export function listToolsFromRegistry(registry = {}) {
    const tools = Object.values(registry || {})
        .filter((tool) => tool && typeof tool === 'object' && tool.name)
        .map((tool) => Object.freeze({
            name: tool.name,
            description: tool.description || '',
            readOnly: Boolean(tool.readOnly),
        }));

    return Object.freeze({
        tools: Object.freeze(tools),
    });
}

function withBaseContext(baseContext, args) {
    return Object.freeze({
        ...baseContext,
        ...args,
        document: args.document || baseContext.document,
    });
}

export function createReadingTools(baseContext = {}, adapters = {}) {
    let registry;

    registry = Object.freeze({
        get_current_document: Object.freeze({
            name: 'get_current_document',
            description: 'Return safe metadata for the current document without full content.',
            readOnly: true,
            run: (args = {}) => getCurrentDocument(withBaseContext(baseContext, args), adapters),
        }),
        get_document_chunks: Object.freeze({
            name: 'get_document_chunks',
            description: 'Return bounded, source-locatable chunks from the current document.',
            readOnly: true,
            acceptsAbortSignal: true,
            run: (args = {}, options = {}) => getDocumentChunks(
                withBaseContext(baseContext, args),
                adapters,
                options,
            ),
        }),
        get_page_text: Object.freeze({
            name: 'get_page_text',
            description: 'Extract bounded text from one page of the current document.',
            readOnly: true,
            run: (args = {}) => getPageText(withBaseContext(baseContext, args), adapters),
        }),
        search_document: Object.freeze({
            name: 'search_document',
            description: 'Search the current document and return bounded source matches.',
            readOnly: true,
            acceptsAbortSignal: true,
            run: (args = {}, options = {}) => searchDocument(
                withBaseContext(baseContext, args),
                adapters,
                options,
            ),
        }),
        list_attention_insights: Object.freeze({
            name: 'list_attention_insights',
            description: 'List saved attention insights for the current document.',
            readOnly: true,
            run: (args = {}) => listAttentionInsights(withBaseContext(baseContext, args), adapters),
        }),
        knowledge_search: Object.freeze({
            name: 'knowledge_search',
            description: 'Search knowledge via UniRAG, rag adapter, or local keyword fallback.',
            readOnly: true,
            acceptsAbortSignal: true,
            run: (args = {}, options = {}) => knowledgeSearch(
                withBaseContext(baseContext, args),
                adapters,
                options,
            ),
        }),
        memory_search: Object.freeze({
            name: 'memory_search',
            description: 'Search saved reading memory when a searchMemory adapter is available.',
            readOnly: true,
            acceptsAbortSignal: true,
            run: (args = {}, options = {}) => memorySearch(
                withBaseContext(baseContext, args),
                adapters,
                options,
            ),
        }),
        memory_save: Object.freeze({
            name: 'memory_save',
            description: 'Persist a user-confirmed local artifact into long-term knowledge memory via UniRAG.',
            readOnly: false,
            run: (args = {}) => memorySave(withBaseContext(baseContext, args), adapters),
        }),
        verify_citation: Object.freeze({
            name: 'verify_citation',
            description: 'Score claim-evidence lexical overlap without calling an LLM.',
            readOnly: true,
            run: (args = {}) => verifyCitation(withBaseContext(baseContext, args)),
        }),
        list_tools: Object.freeze({
            name: 'list_tools',
            description: 'List registered reading agent tools with names and read-only flags.',
            readOnly: true,
            run: () => listToolsFromRegistry(registry),
        }),
        create_vibecard: Object.freeze({
            name: 'create_vibecard',
            description: 'Create a source-bound VibeCard through the local persistence adapter.',
            readOnly: false,
            run: (args = {}) => createVibeCard(withBaseContext(baseContext, args), adapters),
        }),
        create_annotation: Object.freeze({
            name: 'create_annotation',
            description: 'Create a source-bound annotation through the local persistence adapter.',
            readOnly: false,
            run: (args = {}) => createAnnotation(withBaseContext(baseContext, args), adapters),
        }),
        export_note: Object.freeze({
            name: 'export_note',
            description: 'Export the current document reading note through the local export adapter.',
            readOnly: false,
            run: (args = {}) => exportNote(withBaseContext(baseContext, args), adapters),
        }),
        extractText: Object.freeze({
            name: 'extractText',
            description: 'Extract bounded text from the current document or a specific page.',
            readOnly: true,
            run: (args = {}) => extractText(withBaseContext(baseContext, args), adapters),
        }),
        navigatePage: Object.freeze({
            name: 'navigatePage',
            description: 'Move the reader UI to a specific page without modifying the document.',
            readOnly: true,
            run: (args = {}) => navigatePage(withBaseContext(baseContext, args), adapters),
        }),
        listAnnotations: Object.freeze({
            name: 'listAnnotations',
            description: 'List local annotations for the current document.',
            readOnly: true,
            run: (args = {}) => listAnnotations(withBaseContext(baseContext, args), adapters),
        }),
    });

    return registry;
}
