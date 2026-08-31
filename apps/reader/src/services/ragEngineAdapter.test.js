import { describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_UNI_RAG_BASE_URL,
    RAG_ENGINE_LOCAL_KEYWORD,
    RAG_ENGINE_UNI_RAG,
    buildLocalKeywordRetrievalContext,
    createLocalKeywordRagAdapter,
    createRagEngineRouter,
    createUniRagHttpAdapter,
} from './ragEngineAdapter';

const document = {
    id: 'doc-rag-adapter',
    name: 'Adapter Paper.pdf',
    contentText: [
        '--- 第 1 页 ---',
        'The abstract introduces placebo evidence.',
        '',
        '--- 第 2 页 ---',
        'The identification strategy uses matched controls and treatment timing.',
    ].join('\n'),
};

describe('ragEngineAdapter', () => {
    it('wraps current local retrieval behind LocalKeywordRagAdapter', async () => {
        const adapter = createLocalKeywordRagAdapter();

        const context = await adapter.buildRetrievalContext({
            document,
            query: 'matched controls',
            maxChunks: 1,
        });

        expect(context.usedRetrieval).toBe(true);
        expect(context.prompt).toContain('[source:doc-rag-adapter:p2:page-2-para-0]');
        expect(context.prompt).toContain('matched controls');
        expect(context.ragEngine).toEqual(expect.objectContaining({
            engine: RAG_ENGINE_LOCAL_KEYWORD,
            adapter: RAG_ENGINE_LOCAL_KEYWORD,
            available: true,
            degraded: false,
        }));
    });

    it('exposes the default local keyword retrieval helper', async () => {
        const context = await buildLocalKeywordRetrievalContext({
            document,
            query: 'placebo',
            maxChunks: 1,
        });

        expect(context.prompt).toContain('placebo evidence');
        expect(context.ragEngine.engine).toBe(RAG_ENGINE_LOCAL_KEYWORD);
    });

    it('detects an available UniRAG health endpoint', async () => {
        const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
        const adapter = createUniRagHttpAdapter({
            baseUrl: 'http://127.0.0.1:5001/',
            fetchImpl,
            timeoutMs: 10,
        });

        const health = await adapter.health();

        expect(health).toEqual(expect.objectContaining({
            available: true,
            engine: RAG_ENGINE_UNI_RAG,
            baseUrl: 'http://127.0.0.1:5001',
        }));
        expect(fetchImpl).toHaveBeenCalledWith(
            'http://127.0.0.1:5001/api/health',
            expect.objectContaining({ method: 'GET' })
        );
    });

    it('uses the dedicated VibeReader UniRAG port by default', () => {
        const adapter = createUniRagHttpAdapter();

        expect(DEFAULT_UNI_RAG_BASE_URL).toBe('http://127.0.0.1:8766');
        expect(adapter.baseUrl).toBe('http://127.0.0.1:8766');
    });

    it('returns degraded health when UniRAG is unavailable', async () => {
        const adapter = createUniRagHttpAdapter({
            fetchImpl: vi.fn(async () => {
                throw new Error('connect ECONNREFUSED');
            }),
            timeoutMs: 10,
        });

        const health = await adapter.health();

        expect(health).toEqual(expect.objectContaining({
            available: false,
            engine: RAG_ENGINE_UNI_RAG,
            degraded: true,
            error: 'connect ECONNREFUSED',
        }));
    });

    it('queries UniRAG and normalizes citations into Reader sourceRefs', async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                answer: 'Agentic AI requires auditable task execution. [paper.pdf:4]',
                session_id: 'session-1',
                citations: [
                    {
                        chunk_id: 'paper.pdf:4',
                        source: 'paper.pdf',
                        section: '2.1',
                        page: 4,
                        text: 'True Agent requires task planning and auditable execution.',
                        span: [120, 180],
                    },
                ],
            }),
        }));
        const adapter = createUniRagHttpAdapter({
            baseUrl: 'http://127.0.0.1:8766/',
            fetchImpl,
            queryTimeoutMs: 10,
        });

        const result = await adapter.query({
            question: '什么是真 Agent？',
            sessionId: 'session-1',
            topK: 3,
            providerKey: 'minimax-api',
            apiKey: 'test-key',
        });

        expect(fetchImpl).toHaveBeenCalledWith(
            'http://127.0.0.1:8766/api/query',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    question: '什么是真 Agent？',
                    session_id: 'session-1',
                    top_k: 3,
                    style: 'academic',
                    provider: 'minimax',
                    mode: 'chat',
                    include_memory: false,
                    api_key: 'test-key',
                }),
            })
        );
        expect(result).toEqual(expect.objectContaining({
            answer: expect.stringContaining('Agentic AI'),
            sessionId: 'session-1',
            ragEngine: expect.objectContaining({
                engine: RAG_ENGINE_UNI_RAG,
                available: true,
            }),
        }));
        expect(result.sourceRefs).toEqual([
            expect.objectContaining({
                chunkId: 'paper.pdf:4',
                documentName: 'paper.pdf',
                page: 4,
                label: 'P4',
                text: expect.stringContaining('True Agent'),
            }),
        ]);
    });

    it('queries UniRAG with saved memory and normalizes memory citations into artifact sourceRefs', async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                answer: '之前保存的卡片指出，真 Agent 需要可审计闭环。',
                session_id: 'session-memory',
                citations: [
                    {
                        source_type: 'saved_memory',
                        artifact_id: 'artifact-answer-card',
                        artifact_type: 'explain_card',
                        memory_id: 'memory-1',
                        title: 'AI 回答：什么是真 Agent？',
                        text: 'Question: 什么是真 Agent？\nAnswer: 真 Agent 需要任务规划和可审计执行。',
                        source_refs: [
                            {
                                document_id: 'doc-1',
                                document_name: 'paper.pdf',
                                page: 4,
                                paragraph_id: 'page-4-para-0',
                                text: 'True Agent requires task planning and auditable execution.',
                            },
                        ],
                    },
                ],
            }),
        }));
        const adapter = createUniRagHttpAdapter({
            baseUrl: 'http://127.0.0.1:8766/',
            fetchImpl,
            queryTimeoutMs: 10,
        });

        const result = await adapter.query({
            question: '我之前怎么看真 Agent？',
            sessionId: 'session-memory',
            includeMemory: true,
            memoryTopK: 3,
            providerKey: 'minimax',
        });

        expect(fetchImpl).toHaveBeenCalledWith(
            'http://127.0.0.1:8766/api/query',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    question: '我之前怎么看真 Agent？',
                    session_id: 'session-memory',
                    top_k: 5,
                    style: 'academic',
                    provider: 'minimax',
                    mode: 'chat',
                    include_memory: true,
                    memory_top_k: 3,
                }),
            })
        );
        expect(result.sourceRefs).toEqual([
            expect.objectContaining({
                evidenceType: 'memory',
                sourceType: 'saved_memory',
                artifactId: 'artifact-answer-card',
                artifactType: 'explain_card',
                memoryId: 'memory-1',
                memoryTitle: 'AI 回答：什么是真 Agent？',
                label: '记忆 1',
                sourceRefs: [
                    expect.objectContaining({
                        evidenceType: 'source',
                        documentId: 'doc-1',
                        documentName: 'paper.pdf',
                        page: 4,
                        paragraphId: 'page-4-para-0',
                    }),
                ],
            }),
        ]);
    });

    it('surfaces UniRAG query HTTP errors with server detail', async () => {
        const adapter = createUniRagHttpAdapter({
            fetchImpl: vi.fn(async () => ({
                ok: false,
                status: 502,
                json: async () => ({ detail: '回答生成失败。请检查 API key / 网络连接，或稍后重试。' }),
            })),
            queryTimeoutMs: 10,
        });

        await expect(adapter.query({ question: 'hello' }))
            .rejects
            .toThrow('回答生成失败');
    });

    it('starts a UniRAG ingest job with document text fallback', async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                job_id: 'job-123',
                status_url: '/api/ingest/jobs/job-123',
            }),
        }));
        const adapter = createUniRagHttpAdapter({
            baseUrl: 'http://127.0.0.1:8766/',
            fetchImpl,
            ingestTimeoutMs: 10,
        });

        const result = await adapter.ingestDocument({ document });

        expect(fetchImpl).toHaveBeenCalledWith(
            'http://127.0.0.1:8766/api/ingest/jobs',
            expect.objectContaining({
                method: 'POST',
                body: expect.any(FormData),
            })
        );
        const body = fetchImpl.mock.calls[0][1].body;
        const uploaded = body.get('file');
        expect(uploaded).toBeTruthy();
        expect(uploaded.name).toBe('Adapter Paper.pdf');
        expect(result).toEqual(expect.objectContaining({
            jobId: 'job-123',
            statusUrl: '/api/ingest/jobs/job-123',
            ragEngine: expect.objectContaining({
                engine: RAG_ENGINE_UNI_RAG,
                available: true,
            }),
        }));
    });

    it('normalizes UniRAG ingest job status', async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                job_id: 'job-123',
                status: 'completed',
                step: 'done',
                percent: 100,
                message: '入库完成，可以开始提问。',
                filename: 'Adapter Paper.pdf',
                result: {
                    source_id: 'source-abc',
                    chunks: 12,
                    format: 'pdf',
                    filename: 'Adapter Paper.pdf',
                },
                error: null,
            }),
        }));
        const adapter = createUniRagHttpAdapter({ fetchImpl, timeoutMs: 10 });

        const result = await adapter.getIngestStatus('job-123');

        expect(fetchImpl).toHaveBeenCalledWith(
            'http://127.0.0.1:8766/api/ingest/jobs/job-123',
            expect.objectContaining({ method: 'GET' })
        );
        expect(result).toEqual(expect.objectContaining({
            jobId: 'job-123',
            status: 'completed',
            step: 'done',
            percent: 100,
            filename: 'Adapter Paper.pdf',
            result: expect.objectContaining({
                sourceId: 'source-abc',
                chunks: 12,
                format: 'pdf',
            }),
        }));
    });

    it('surfaces UniRAG ingest HTTP errors with server detail', async () => {
        const adapter = createUniRagHttpAdapter({
            fetchImpl: vi.fn(async () => ({
                ok: false,
                status: 400,
                json: async () => ({ detail: 'No filename' }),
            })),
            ingestTimeoutMs: 10,
        });

        await expect(adapter.ingestDocument({ document }))
            .rejects
            .toThrow('No filename');
    });

    it('routes unavailable UniRAG health to local fallback state', async () => {
        const router = createRagEngineRouter({
            remoteAdapter: {
                engine: RAG_ENGINE_UNI_RAG,
                health: vi.fn(async () => ({
                    available: false,
                    engine: RAG_ENGINE_UNI_RAG,
                    degraded: true,
                    error: 'offline',
                })),
            },
            localAdapter: createLocalKeywordRagAdapter(),
        });

        const health = await router.health();

        expect(health).toEqual(expect.objectContaining({
            available: true,
            engine: RAG_ENGINE_LOCAL_KEYWORD,
            degraded: true,
            reason: 'offline',
        }));
    });

    it('starts a UniRAG saved memory ingest job with JSON payload', async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                job_id: 'memory-job-123',
                status_url: '/api/memory/jobs/memory-job-123',
                status: 'queued',
            }),
        }));
        const adapter = createUniRagHttpAdapter({
            baseUrl: 'http://127.0.0.1:8766/',
            fetchImpl,
            ingestTimeoutMs: 10,
        });
        const memory = {
            artifactId: 'artifact-answer',
            artifactType: 'explain_card',
            title: 'AI 回答',
            text: 'A verified answer with source refs.',
        };

        const result = await adapter.ingestMemory({ memory });

        expect(fetchImpl).toHaveBeenCalledWith(
            'http://127.0.0.1:8766/api/memory/jobs',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ memory }),
            })
        );
        expect(result).toEqual(expect.objectContaining({
            jobId: 'memory-job-123',
            statusUrl: '/api/memory/jobs/memory-job-123',
            status: 'queued',
            ragEngine: expect.objectContaining({
                engine: RAG_ENGINE_UNI_RAG,
                available: true,
            }),
        }));
    });

    it('normalizes UniRAG saved memory ingest job status', async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                job_id: 'memory-job-123',
                status: 'completed',
                step: 'done',
                percent: 100,
                message: '记忆沉淀完成',
                result: {
                    memory_id: 'memory-abc',
                    chunks: 2,
                },
            }),
        }));
        const adapter = createUniRagHttpAdapter({ fetchImpl, timeoutMs: 10 });

        const result = await adapter.getMemoryIngestStatus('memory-job-123');

        expect(fetchImpl).toHaveBeenCalledWith(
            'http://127.0.0.1:8766/api/memory/jobs/memory-job-123',
            expect.objectContaining({ method: 'GET' })
        );
        expect(result).toEqual(expect.objectContaining({
            jobId: 'memory-job-123',
            status: 'completed',
            percent: 100,
            result: expect.objectContaining({
                memory_id: 'memory-abc',
                chunks: 2,
            }),
        }));
    });
});
