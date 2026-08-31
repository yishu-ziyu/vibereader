import { buildRetrievalContext } from '../retrievalContext';

export const RAG_ENGINE_LOCAL_KEYWORD = 'local-keyword';
export const RAG_ENGINE_UNI_RAG = 'uni-rag';

export const DEFAULT_UNI_RAG_BASE_URL = 'http://127.0.0.1:8766';
const DEFAULT_HEALTH_TIMEOUT_MS = 1500;
const DEFAULT_QUERY_TIMEOUT_MS = 45000;
const DEFAULT_INGEST_TIMEOUT_MS = 30000;

function withRagEngineMetadata(context = {}, metadata = {}) {
    return Object.freeze({
        ...context,
        ragEngine: Object.freeze({
            engine: metadata.engine || RAG_ENGINE_LOCAL_KEYWORD,
            adapter: metadata.adapter || metadata.engine || RAG_ENGINE_LOCAL_KEYWORD,
            available: metadata.available !== false,
            degraded: Boolean(metadata.degraded),
            reason: metadata.reason || null,
            baseUrl: metadata.baseUrl || null,
        }),
    });
}

export function createLocalKeywordRagAdapter(options = {}) {
    const buildContext = options.buildContext || buildRetrievalContext;

    return Object.freeze({
        engine: RAG_ENGINE_LOCAL_KEYWORD,

        async health() {
            return Object.freeze({
                available: true,
                engine: RAG_ENGINE_LOCAL_KEYWORD,
                adapter: RAG_ENGINE_LOCAL_KEYWORD,
                degraded: false,
            });
        },

        async buildRetrievalContext(input = {}) {
            return withRagEngineMetadata(buildContext(input), {
                engine: RAG_ENGINE_LOCAL_KEYWORD,
                adapter: RAG_ENGINE_LOCAL_KEYWORD,
                available: true,
                degraded: Boolean(input.degraded),
                reason: input.degradedReason || null,
            });
        },
    });
}

function normalizeBaseUrl(baseUrl = DEFAULT_UNI_RAG_BASE_URL) {
    return String(baseUrl || DEFAULT_UNI_RAG_BASE_URL).replace(/\/+$/, '');
}

function healthUrlForBase(baseUrl) {
    return `${normalizeBaseUrl(baseUrl)}/api/health`;
}

function queryUrlForBase(baseUrl) {
    return `${normalizeBaseUrl(baseUrl)}/api/query`;
}

function ingestJobsUrlForBase(baseUrl) {
    return `${normalizeBaseUrl(baseUrl)}/api/ingest/jobs`;
}

function ingestJobStatusUrlForBase(baseUrl, jobId) {
    return `${normalizeBaseUrl(baseUrl)}/api/ingest/jobs/${encodeURIComponent(jobId)}`;
}

function memoryJobsUrlForBase(baseUrl) {
    return `${normalizeBaseUrl(baseUrl)}/api/memory/jobs`;
}

function memoryJobStatusUrlForBase(baseUrl, jobId) {
    return `${normalizeBaseUrl(baseUrl)}/api/memory/jobs/${encodeURIComponent(jobId)}`;
}

function normalizeProvider(provider = '') {
    const normalized = String(provider || '').trim().toLowerCase();
    if (normalized === 'minimax-api') return 'minimax';
    if (normalized === 'step' || normalized === 'stepfun') return 'stepfun';
    if (normalized === 'local') return 'local';
    return normalized || 'minimax';
}

async function fetchWithTimeout(fetchImpl, url, options = {}) {
    if (typeof fetchImpl !== 'function') {
        throw new Error('fetch is not available');
    }

    const timeoutMs = Math.max(1, options.timeoutMs || DEFAULT_HEALTH_TIMEOUT_MS);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const externalSignal = options.signal || options.abortSignal || null;

    const onExternalAbort = () => {
        try {
            controller.abort();
        } catch {
            // ignore
        }
    };

    if (externalSignal) {
        if (externalSignal.aborted) {
            clearTimeout(timeoutId);
            const error = new Error('The operation was aborted.');
            error.name = 'AbortError';
            throw error;
        }
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
        return await fetchImpl(url, {
            method: options.method || 'GET',
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                ...(options.headers || {}),
            },
            ...(options.body !== undefined ? { body: options.body } : {}),
        });
    } finally {
        clearTimeout(timeoutId);
        if (externalSignal) {
            externalSignal.removeEventListener('abort', onExternalAbort);
        }
    }
}

async function parseJsonResponse(response) {
    if (typeof response?.json === 'function') {
        return response.json();
    }
    if (typeof response?.text === 'function') {
        const text = await response.text();
        return text ? JSON.parse(text) : {};
    }
    return {};
}

function errorMessageFromResponse(status, payload = {}) {
    const detail = payload?.detail || payload?.message || payload?.error;
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
    return `HTTP ${status || 'unknown'}`;
}

const MEMORY_CITATION_TYPES = new Set([
    'memory',
    'saved_memory',
    'saved_artifact',
    'artifact',
    'vibereader_memory',
]);

function stringValue(value = '') {
    return String(value || '').trim();
}

function normalizedEvidenceType(value = '') {
    return stringValue(value).toLowerCase().replace(/[\s-]+/g, '_');
}

function isMemoryCitation(citation = {}) {
    const citationTypes = [
        citation.source_type,
        citation.sourceType,
        citation.evidence_type,
        citation.evidenceType,
        citation.kind,
        citation.type,
    ].map(normalizedEvidenceType);

    if (citationTypes.some((type) => MEMORY_CITATION_TYPES.has(type))) return true;
    return Boolean(
        citation.artifact_id ||
        citation.artifactId ||
        citation.saved_artifact_id ||
        citation.savedArtifactId ||
        citation.memory_id ||
        citation.memoryId
    );
}

function normalizeNestedSourceRef(sourceRef = {}, index = 0) {
    const chunkId = sourceRef.chunk_id || sourceRef.chunkId || sourceRef.id || `memory-source-${index + 1}`;
    const page = Number(sourceRef.page || 0);
    const documentId = sourceRef.document_id || sourceRef.documentId || sourceRef.source || '';
    const documentName = sourceRef.document_name || sourceRef.documentName || sourceRef.source || documentId;
    return Object.freeze({
        id: sourceRef.id || chunkId,
        chunkId,
        documentId,
        documentName,
        source: sourceRef.source || documentName || documentId || 'UniRAG',
        section: sourceRef.section || '',
        page,
        paragraphId: sourceRef.paragraph_id || sourceRef.paragraphId || chunkId,
        label: sourceRef.label || (page > 0 ? `P${page}` : `来源 ${index + 1}`),
        text: sourceRef.text || sourceRef.sourceText || sourceRef.selectedText || '',
        span: sourceRef.span || null,
        grounding: sourceRef.grounding || null,
        evidenceType: 'source',
        sourceType: sourceRef.sourceType || sourceRef.source_type || 'document',
    });
}

function documentSourceRefFromUniRagCitation(citation = {}, index = 0) {
    const chunkId = citation.chunk_id || citation.chunkId || `uni-rag-citation-${index + 1}`;
    const page = Number(citation.page || 0);
    const source = citation.source || 'UniRAG';
    return Object.freeze({
        id: chunkId,
        chunkId,
        documentId: citation.document_id || citation.documentId || source,
        documentName: citation.document_name || citation.documentName || source,
        source,
        section: citation.section || '',
        page,
        paragraphId: citation.paragraph_id || citation.paragraphId || chunkId,
        label: page > 0 ? `P${page}` : `来源 ${index + 1}`,
        text: citation.text || citation.sourceText || citation.selectedText || '',
        span: citation.span || null,
        evidenceType: 'source',
        sourceType: 'document',
    });
}

function memorySourceRefFromUniRagCitation(citation = {}, index = 0) {
    const chunkId = citation.chunk_id || citation.chunkId || citation.id || `uni-rag-memory-${index + 1}`;
    const artifactId = citation.artifact_id || citation.artifactId || citation.saved_artifact_id || citation.savedArtifactId || null;
    const memoryId = citation.memory_id || citation.memoryId || citation.id || chunkId;
    const title = citation.title || citation.memory_title || citation.memoryTitle || citation.artifact_title || citation.artifactTitle || '';
    const rawSourceRefs = citation.source_refs || citation.sourceRefs || [];
    const sourceRefs = Array.isArray(rawSourceRefs)
        ? rawSourceRefs.map(normalizeNestedSourceRef)
        : [];

    return Object.freeze({
        id: artifactId || memoryId || chunkId,
        chunkId,
        artifactId,
        artifactType: citation.artifact_type || citation.artifactType || citation.type || '',
        memoryId,
        memoryTitle: title,
        documentId: citation.document_id || citation.documentId || citation.document?.id || '',
        documentName: citation.document_name || citation.documentName || citation.document?.name || citation.source || '我的记忆',
        source: citation.source || '我的记忆',
        section: citation.section || '',
        page: Number(citation.page || sourceRefs[0]?.page || 0),
        paragraphId: citation.paragraph_id || citation.paragraphId || '',
        label: citation.label || `记忆 ${index + 1}`,
        text: citation.text || citation.summary || citation.answer || citation.content || '',
        span: citation.span || null,
        evidenceType: 'memory',
        sourceType: 'saved_memory',
        sourceRefs: Object.freeze(sourceRefs),
        // contractVersion (phase-1-contract-stabilization): UniRAG returns
        // contract_version (snake_case); older UniRAG omits the field and we
        // default to v1 so legacy responses still normalize cleanly.
        contractVersion: citation.contract_version || citation.contractVersion || 'reader-unirag-memory-v1',
    });
}

function sourceRefFromUniRagCitation(citation = {}, index = 0) {
    return isMemoryCitation(citation)
        ? memorySourceRefFromUniRagCitation(citation, index)
        : documentSourceRefFromUniRagCitation(citation, index);
}

function normalizeUniRagQueryResponse(payload = {}, metadata = {}) {
    const citations = Array.isArray(payload.citations) ? payload.citations : [];
    return Object.freeze({
        answer: payload.answer || '',
        sessionId: payload.session_id || payload.sessionId || null,
        citations: Object.freeze(citations.map((citation) => Object.freeze({ ...citation }))),
        sourceRefs: Object.freeze(citations.map(sourceRefFromUniRagCitation)),
        ragEngine: Object.freeze({
            engine: RAG_ENGINE_UNI_RAG,
            adapter: RAG_ENGINE_UNI_RAG,
            available: true,
            degraded: false,
            baseUrl: metadata.baseUrl || null,
        }),
    });
}

function filenameForDocument(document = {}, fallback = 'vibereader-document.txt') {
    const raw = document.name || document.title || document.filename || fallback;
    const safe = String(raw || fallback)
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
    return safe || fallback;
}

function textForDocument(document = {}) {
    if (document.contentText) return String(document.contentText);
    if (document.pdfText) return String(document.pdfText);
    if (document.text) return String(document.text);
    if (Array.isArray(document.pages)) {
        return document.pages
            .map((page, index) => {
                const pageNumber = page?.page || index + 1;
                const text = typeof page === 'string' ? page : page?.text;
                return text ? `--- 第 ${pageNumber} 页 ---\n${text}` : '';
            })
            .filter(Boolean)
            .join('\n\n');
    }
    return '';
}

function appendFileToFormData(formData, input = {}) {
    const document = input.document || {};
    const filename = input.filename || filenameForDocument(document);
    const file = input.file || document.file;
    const blob = input.blob || document.blob;

    if (file) {
        formData.append('file', file, file.name || filename);
        return;
    }

    if (blob) {
        formData.append('file', blob, filename);
        return;
    }

    const text = input.content || input.text || textForDocument(document);
    if (!text) {
        throw new Error('UniRAG ingest requires a file, blob, or document text.');
    }
    if (typeof Blob !== 'function') {
        throw new Error('Blob is not available; cannot create UniRAG ingest payload.');
    }

    const textFilename = /\.[a-z0-9]+$/i.test(filename) ? filename : `${filename}.txt`;
    formData.append('file', new Blob([String(text)], { type: 'text/plain;charset=utf-8' }), textFilename);
}

function createIngestFormData(input = {}) {
    if (typeof FormData !== 'function') {
        throw new Error('FormData is not available; cannot upload document to UniRAG.');
    }
    const formData = new FormData();
    appendFileToFormData(formData, input);
    return formData;
}

function normalizeIngestStartResponse(payload = {}, metadata = {}) {
    return Object.freeze({
        jobId: payload.job_id || payload.jobId || null,
        statusUrl: payload.status_url || payload.statusUrl || null,
        ragEngine: Object.freeze({
            engine: RAG_ENGINE_UNI_RAG,
            adapter: RAG_ENGINE_UNI_RAG,
            available: true,
            degraded: false,
            baseUrl: metadata.baseUrl || null,
        }),
    });
}

function normalizeIngestResult(result = null) {
    if (!result) return null;
    return Object.freeze({
        sourceId: result.source_id || result.sourceId || null,
        chunks: Number(result.chunks || 0),
        format: result.format || 'unknown',
        filename: result.filename || '',
    });
}

function normalizeIngestStatusResponse(payload = {}, metadata = {}) {
    return Object.freeze({
        jobId: payload.job_id || payload.jobId || null,
        status: payload.status || 'unknown',
        step: payload.step || '',
        percent: Number(payload.percent || 0),
        message: payload.message || '',
        filename: payload.filename || '',
        result: normalizeIngestResult(payload.result),
        error: payload.error || null,
        ragEngine: Object.freeze({
            engine: RAG_ENGINE_UNI_RAG,
            adapter: RAG_ENGINE_UNI_RAG,
            available: true,
            degraded: false,
            baseUrl: metadata.baseUrl || null,
        }),
    });
}

function normalizeMemoryIngestStartResponse(payload = {}, metadata = {}) {
    return Object.freeze({
        jobId: payload.job_id || payload.jobId || null,
        statusUrl: payload.status_url || payload.statusUrl || null,
        status: payload.status || 'queued',
        ragEngine: Object.freeze({
            engine: RAG_ENGINE_UNI_RAG,
            adapter: RAG_ENGINE_UNI_RAG,
            available: true,
            degraded: false,
            baseUrl: metadata.baseUrl || null,
        }),
    });
}

function normalizeMemoryIngestStatusResponse(payload = {}, metadata = {}) {
    return Object.freeze({
        jobId: payload.job_id || payload.jobId || null,
        status: payload.status || 'unknown',
        step: payload.step || '',
        percent: Number(payload.percent || 0),
        message: payload.message || '',
        result: payload.result || null,
        error: payload.error || null,
        ragEngine: Object.freeze({
            engine: RAG_ENGINE_UNI_RAG,
            adapter: RAG_ENGINE_UNI_RAG,
            available: true,
            degraded: false,
            baseUrl: metadata.baseUrl || null,
        }),
    });
}

export function createUniRagHttpAdapter(options = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const timeoutMs = options.timeoutMs || DEFAULT_HEALTH_TIMEOUT_MS;
    const queryTimeoutMs = options.queryTimeoutMs || DEFAULT_QUERY_TIMEOUT_MS;
    const ingestTimeoutMs = options.ingestTimeoutMs || DEFAULT_INGEST_TIMEOUT_MS;

    return Object.freeze({
        engine: RAG_ENGINE_UNI_RAG,
        baseUrl,

        async health() {
            try {
                const response = await fetchWithTimeout(fetchImpl, healthUrlForBase(baseUrl), { timeoutMs });
                if (!response?.ok) {
                    return Object.freeze({
                        available: false,
                        engine: RAG_ENGINE_UNI_RAG,
                        adapter: RAG_ENGINE_UNI_RAG,
                        degraded: true,
                        baseUrl,
                        error: `UniRAG health failed: HTTP ${response?.status || 'unknown'}`,
                    });
                }

                return Object.freeze({
                    available: true,
                    engine: RAG_ENGINE_UNI_RAG,
                    adapter: RAG_ENGINE_UNI_RAG,
                    degraded: false,
                    baseUrl,
                });
            } catch (error) {
                return Object.freeze({
                    available: false,
                    engine: RAG_ENGINE_UNI_RAG,
                    adapter: RAG_ENGINE_UNI_RAG,
                    degraded: true,
                    baseUrl,
                    error: error?.name === 'AbortError'
                        ? `UniRAG health timed out after ${timeoutMs}ms`
                        : error?.message || String(error),
                });
            }
        },

        async query(input = {}) {
            const question = String(input.question || input.query || '').trim();
            if (!question) {
                throw new Error('UniRAG query requires a question.');
            }

            const body = {
                question,
                session_id: input.sessionId || input.session_id || null,
                top_k: Math.max(1, Number(input.topK || input.top_k || 5)),
                style: input.style || 'academic',
                provider: normalizeProvider(input.provider || input.providerKey),
                mode: input.mode || 'chat',
                include_memory: Boolean(input.includeMemory ?? input.include_memory ?? false),
                ...(input.apiKey ? { api_key: input.apiKey } : {}),
            };
            if (body.include_memory) {
                body.memory_top_k = Math.max(0, Number(input.memoryTopK || input.memory_top_k || 3));
            }

            let response;
            try {
                response = await fetchWithTimeout(fetchImpl, queryUrlForBase(baseUrl), {
                    timeoutMs: input.timeoutMs || queryTimeoutMs,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: input.signal || input.abortSignal || null,
                });
            } catch (error) {
                throw new Error(error?.name === 'AbortError'
                    ? `UniRAG query timed out after ${input.timeoutMs || queryTimeoutMs}ms`
                    : error?.message || String(error));
            }

            const payload = await parseJsonResponse(response);
            if (!response?.ok) {
                throw new Error(`UniRAG query failed: ${errorMessageFromResponse(response?.status, payload)}`);
            }

            return normalizeUniRagQueryResponse(payload, { baseUrl });
        },

        async ingestDocument(input = {}) {
            const body = createIngestFormData(input);

            let response;
            try {
                response = await fetchWithTimeout(fetchImpl, ingestJobsUrlForBase(baseUrl), {
                    timeoutMs: input.timeoutMs || ingestTimeoutMs,
                    method: 'POST',
                    body,
                });
            } catch (error) {
                throw new Error(error?.name === 'AbortError'
                    ? `UniRAG ingest timed out after ${input.timeoutMs || ingestTimeoutMs}ms`
                    : error?.message || String(error));
            }

            const payload = await parseJsonResponse(response);
            if (!response?.ok) {
                throw new Error(`UniRAG ingest failed: ${errorMessageFromResponse(response?.status, payload)}`);
            }

            return normalizeIngestStartResponse(payload, { baseUrl });
        },

        async getIngestStatus(jobId, input = {}) {
            const normalizedJobId = String(jobId || input.jobId || '').trim();
            if (!normalizedJobId) {
                throw new Error('UniRAG ingest status requires a jobId.');
            }

            let response;
            try {
                response = await fetchWithTimeout(fetchImpl, ingestJobStatusUrlForBase(baseUrl, normalizedJobId), {
                    timeoutMs: input.timeoutMs || timeoutMs,
                    method: 'GET',
                });
            } catch (error) {
                throw new Error(error?.name === 'AbortError'
                    ? `UniRAG ingest status timed out after ${input.timeoutMs || timeoutMs}ms`
                    : error?.message || String(error));
            }

            const payload = await parseJsonResponse(response);
            if (!response?.ok) {
                throw new Error(`UniRAG ingest status failed: ${errorMessageFromResponse(response?.status, payload)}`);
            }

            return normalizeIngestStatusResponse(payload, { baseUrl });
        },

        async ingestMemory(input = {}) {
            const memory = input.memory || input.payload || null;
            if (!memory || typeof memory !== 'object') {
                throw new Error('UniRAG memory ingest requires a memory payload.');
            }

            let response;
            try {
                response = await fetchWithTimeout(fetchImpl, memoryJobsUrlForBase(baseUrl), {
                    timeoutMs: input.timeoutMs || ingestTimeoutMs,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ memory }),
                });
            } catch (error) {
                throw new Error(error?.name === 'AbortError'
                    ? `UniRAG memory ingest timed out after ${input.timeoutMs || ingestTimeoutMs}ms`
                    : error?.message || String(error));
            }

            const payload = await parseJsonResponse(response);
            if (!response?.ok) {
                throw new Error(`UniRAG memory ingest failed: ${errorMessageFromResponse(response?.status, payload)}`);
            }

            return normalizeMemoryIngestStartResponse(payload, { baseUrl });
        },

        async getMemoryIngestStatus(jobId, input = {}) {
            const normalizedJobId = String(jobId || input.jobId || '').trim();
            if (!normalizedJobId) {
                throw new Error('UniRAG memory ingest status requires a jobId.');
            }

            let response;
            try {
                response = await fetchWithTimeout(fetchImpl, memoryJobStatusUrlForBase(baseUrl, normalizedJobId), {
                    timeoutMs: input.timeoutMs || timeoutMs,
                    method: 'GET',
                });
            } catch (error) {
                throw new Error(error?.name === 'AbortError'
                    ? `UniRAG memory ingest status timed out after ${input.timeoutMs || timeoutMs}ms`
                    : error?.message || String(error));
            }

            const payload = await parseJsonResponse(response);
            if (!response?.ok) {
                throw new Error(`UniRAG memory ingest status failed: ${errorMessageFromResponse(response?.status, payload)}`);
            }

            return normalizeMemoryIngestStatusResponse(payload, { baseUrl });
        },
    });
}

export function createRagEngineRouter(options = {}) {
    const localAdapter = options.localAdapter || createLocalKeywordRagAdapter();
    const remoteAdapter = options.remoteAdapter || createUniRagHttpAdapter(options.uniRag || {});

    return Object.freeze({
        localAdapter,
        remoteAdapter,

        async health() {
            const remoteHealth = await remoteAdapter.health();
            if (remoteHealth.available) return remoteHealth;

            const localHealth = await localAdapter.health();
            return Object.freeze({
                ...localHealth,
                degraded: true,
                reason: remoteHealth.error || 'UniRAG unavailable; using local keyword retrieval.',
                remote: remoteHealth,
            });
        },

        async buildRetrievalContext(input = {}) {
            const context = await localAdapter.buildRetrievalContext({
                ...input,
                degraded: Boolean(input.degraded),
                degradedReason: input.degradedReason,
            });
            return context;
        },
    });
}

const defaultLocalKeywordRagAdapter = createLocalKeywordRagAdapter();

export async function buildLocalKeywordRetrievalContext(input = {}) {
    return defaultLocalKeywordRagAdapter.buildRetrievalContext(input);
}
