import { describe, expect, it, vi } from 'vitest';
import {
    buildMemoryWritePermissions,
    buildReadingAgentPermissions,
    buildReadingAgentToolAdapters,
    createKnowledgeSearchAdapter,
    createReadingAgentOptions,
    createSearchMemoryAdapter,
    isLlmOnlyReadingAgentType,
    isRunnableReadingAgentType,
    LOCAL_MODEL_READING_AGENT_TYPES,
    LLM_ONLY_READING_AGENT_TYPES,
    memoriesFromUniRagQueryResult,
    matchesFromUniRagQueryResult,
    resolveGroundingMode,
    runnableReadingAgentSkills,
} from './readingAgentOptions';
import { isToolAllowed } from './permissions';
import { createExperienceStore } from './experienceStore';
import { runReadingAgentTask } from './taskRunner';

describe('reading agent runnable policy', () => {
    it('keeps local model skills always runnable (includes knowledge/critic/memory/export)', () => {
        expect([...LOCAL_MODEL_READING_AGENT_TYPES]).toEqual(expect.arrayContaining([
            'paper_overview_agent',
            'attention_agent',
            'card_generation_agent',
            'knowledge_qa_agent',
            'critic_agent',
            'memory_curator_agent',
            'note_export_agent',
        ]));

        for (const type of LOCAL_MODEL_READING_AGENT_TYPES) {
            expect(isRunnableReadingAgentType(type, { useLlm: false })).toBe(true);
            expect(isRunnableReadingAgentType(type, { useLlm: true })).toBe(true);
        }
    });

    it('only runs LLM-only skills when useLlm is true', () => {
        for (const type of LLM_ONLY_READING_AGENT_TYPES) {
            expect(isLlmOnlyReadingAgentType(type)).toBe(true);
            expect(isRunnableReadingAgentType(type, { useLlm: false })).toBe(false);
            expect(isRunnableReadingAgentType(type, { useLlm: true })).toBe(true);
        }
    });

    it('lists all 7 reading agent skills offline because local models exist', () => {
        const offline = runnableReadingAgentSkills({ useLlm: false }).map((s) => s.type);
        expect(offline).toEqual([
            'paper_overview_agent',
            'attention_agent',
            'card_generation_agent',
            'note_export_agent',
            'knowledge_qa_agent',
            'critic_agent',
            'memory_curator_agent',
        ]);
        expect(offline).toHaveLength(7);
    });
});

describe('buildReadingAgentPermissions', () => {
    it('expands write tools for card generation', () => {
        const permissions = buildReadingAgentPermissions('card_generation_agent');
        expect(permissions.canWriteVibeCards).toBe(true);
        expect(permissions.allowedTools).toContain('create_vibecard');
    });

    it('expands knowledge search for knowledge_qa', () => {
        const permissions = buildReadingAgentPermissions('knowledge_qa_agent');
        expect(permissions.canSearchKnowledge).toBe(true);
        expect(permissions.allowedTools).toEqual(expect.arrayContaining([
            'knowledge_search',
            'search_document',
        ]));
    });

    it('expands verify_citation for critic', () => {
        const permissions = buildReadingAgentPermissions('critic_agent');
        expect(permissions.canVerifyCitation).toBe(true);
        expect(permissions.allowedTools).toContain('verify_citation');
    });

    it('expands memory search for memory curator without write memory', () => {
        const permissions = buildReadingAgentPermissions('memory_curator_agent');
        expect(permissions.canSearchMemory).toBe(true);
        expect(permissions.allowedTools).toContain('memory_search');
        expect(permissions.canWriteMemory).toBe(false);
        expect(permissions.allowedTools).not.toContain('memory_save');
    });

    it('never enables canWriteMemory on any default skill profile', () => {
        for (const type of LOCAL_MODEL_READING_AGENT_TYPES) {
            const permissions = buildReadingAgentPermissions(type);
            expect(permissions.canWriteMemory).toBe(false);
            expect(isToolAllowed('memory_save', permissions)).toBe(false);
        }
    });

    it('buildMemoryWritePermissions is opt-in only for dedicated save flows', () => {
        const base = buildReadingAgentPermissions('memory_curator_agent');
        const write = buildMemoryWritePermissions(base);
        expect(base.canWriteMemory).toBe(false);
        expect(write.canWriteMemory).toBe(true);
        expect(write.allowedTools).toContain('memory_save');
        expect(isToolAllowed('memory_save', write)).toBe(true);
    });

    it('expands export_note only for note_export skill', () => {
        const exportPermissions = buildReadingAgentPermissions('note_export_agent');
        expect(exportPermissions.canExportNotes).toBe(true);
        expect(exportPermissions.allowedTools).toContain('export_note');

        const overview = buildReadingAgentPermissions('paper_overview_agent');
        expect(overview.canExportNotes).toBe(false);
        expect(overview.allowedTools).not.toContain('export_note');

        const cards = buildReadingAgentPermissions('card_generation_agent');
        expect(cards.canExportNotes).toBe(false);
        expect(cards.allowedTools).not.toContain('export_note');
    });
});

describe('UniRAG result mapping', () => {
    it('separates document matches and memory hits', () => {
        const result = {
            sourceRefs: [
                {
                    id: 'c1',
                    documentId: 'doc-1',
                    page: 2,
                    paragraphId: 'p2',
                    text: 'document evidence',
                    evidenceType: 'source',
                    sourceType: 'document',
                },
                {
                    id: 'm1',
                    memoryId: 'mem-1',
                    artifactId: 'art-1',
                    memoryTitle: 'Saved claim',
                    text: 'memory evidence',
                    evidenceType: 'memory',
                    sourceType: 'saved_memory',
                    documentId: 'doc-1',
                },
            ],
        };

        expect(matchesFromUniRagQueryResult(result)).toEqual([
            expect.objectContaining({
                documentId: 'doc-1',
                page: 2,
                text: 'document evidence',
            }),
        ]);
        expect(memoriesFromUniRagQueryResult(result)).toEqual([
            expect.objectContaining({
                id: 'mem-1',
                title: 'Saved claim',
                artifactId: 'art-1',
                text: 'memory evidence',
            }),
        ]);
    });
});

describe('tool adapters', () => {
    it('wires ragAdapter, knowledgeSearch, and searchMemory when UniRAG is available', () => {
        const query = vi.fn();
        const adapters = buildReadingAgentToolAdapters(
            { id: 'doc-1' },
            {
                uniRagAvailable: true,
                ragAdapter: { engine: 'uni-rag', query },
            },
        );

        expect(adapters.ragAdapter).toBeTruthy();
        expect(typeof adapters.knowledgeSearch).toBe('function');
        expect(typeof adapters.searchMemory).toBe('function');
        expect(typeof adapters.listAttentionInsightsForDocument).toBe('function');
        expect(typeof adapters.getArtifactById).toBe('function');
        expect(typeof adapters.getDocumentById).toBe('function');
        expect(typeof adapters.startSavedMemoryIngest).toBe('function');
    });

    it('default getDocumentById resolves only the current document', async () => {
        const doc = { id: 'doc-1', name: 'paper.pdf' };
        const adapters = buildReadingAgentToolAdapters(doc, { uniRagAvailable: false });
        await expect(adapters.getDocumentById('doc-1')).resolves.toBe(doc);
        await expect(adapters.getDocumentById('doc-other')).resolves.toBeNull();
    });

    it('skips UniRAG adapters when uniRagAvailable is false and no ragAdapter is passed', () => {
        const adapters = buildReadingAgentToolAdapters(
            { id: 'doc-1' },
            { uniRagAvailable: false },
        );

        expect(adapters.ragAdapter).toBeUndefined();
        expect(adapters.knowledgeSearch).toBeUndefined();
        expect(adapters.searchMemory).toBeUndefined();
        expect(typeof adapters.listAttentionInsightsForDocument).toBe('function');
    });

    it('knowledgeSearch adapter maps UniRAG document citations', async () => {
        const ragAdapter = {
            engine: 'uni-rag',
            query: vi.fn().mockResolvedValue({
                sourceRefs: [
                    {
                        id: 'c1',
                        documentId: 'doc-1',
                        page: 1,
                        text: 'hit',
                        evidenceType: 'source',
                    },
                ],
                ragEngine: { engine: 'uni-rag' },
            }),
        };

        const knowledgeSearch = createKnowledgeSearchAdapter(ragAdapter, {
            providerKey: 'xai',
            apiKey: 'k',
        });
        const result = await knowledgeSearch({ query: 'q', limit: 3, documentId: 'doc-1' });

        expect(ragAdapter.query).toHaveBeenCalledWith(expect.objectContaining({
            question: 'q',
            topK: 3,
            includeMemory: false,
            providerKey: 'xai',
            apiKey: 'k',
        }));
        expect(result.engine).toBe('uni-rag');
        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].text).toBe('hit');
    });

    it('knowledgeSearch adapter returns ok:false when UniRAG health fails', async () => {
        const query = vi.fn();
        const health = vi.fn().mockResolvedValue({
            available: false,
            engine: 'uni-rag',
            degraded: true,
            error: 'UniRAG health failed: HTTP 503',
        });
        const knowledgeSearch = createKnowledgeSearchAdapter({
            engine: 'uni-rag',
            health,
            query,
        });

        const result = await knowledgeSearch({ query: 'q', limit: 2 });

        expect(health).toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
        expect(result).toEqual({
            ok: false,
            query: 'q',
            matches: [],
            engine: 'unavailable',
            errorCode: 'unirag_unavailable',
            message: 'UniRAG health failed: HTTP 503',
            error: 'UniRAG health failed: HTTP 503',
            ragEngine: {
                available: false,
                engine: 'uni-rag',
                degraded: true,
                error: 'UniRAG health failed: HTTP 503',
            },
        });
    });

    it('knowledgeSearch adapter forwards abort signal into ragAdapter.query', async () => {
        const controller = new AbortController();
        const query = vi.fn().mockResolvedValue({ sourceRefs: [] });
        const knowledgeSearch = createKnowledgeSearchAdapter({
            engine: 'uni-rag',
            health: vi.fn().mockResolvedValue({ available: true, engine: 'uni-rag' }),
            query,
        });

        expect(knowledgeSearch.length).toBeGreaterThanOrEqual(2);
        await knowledgeSearch({ query: 'q', limit: 2 }, { signal: controller.signal });

        expect(query).toHaveBeenCalledWith(expect.objectContaining({
            question: 'q',
            signal: controller.signal,
            abortSignal: controller.signal,
        }));
    });

    it('knowledgeSearch adapter throws when signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const query = vi.fn();
        const knowledgeSearch = createKnowledgeSearchAdapter({
            engine: 'uni-rag',
            query,
        });

        await expect(knowledgeSearch({ query: 'q' }, { signal: controller.signal }))
            .rejects.toMatchObject({ name: 'AbortError' });
        expect(query).not.toHaveBeenCalled();
    });

    it('knowledgeSearch adapter catches query errors without throwing', async () => {
        const knowledgeSearch = createKnowledgeSearchAdapter({
            engine: 'uni-rag',
            health: vi.fn().mockResolvedValue({ available: true, engine: 'uni-rag' }),
            query: vi.fn().mockRejectedValue(new Error('UniRAG query timed out after 500ms')),
        });

        const result = await knowledgeSearch({ query: 'q' });

        expect(result).toEqual({
            ok: false,
            query: 'q',
            matches: [],
            engine: 'unavailable',
            errorCode: 'timeout',
            message: 'UniRAG query timed out after 500ms',
            error: 'UniRAG query timed out after 500ms',
        });
    });

    it('searchMemory adapter filters saved_memory refs and degrades on error', async () => {
        const ragAdapter = {
            query: vi.fn()
                .mockResolvedValueOnce({
                    sourceRefs: [
                        {
                            memoryId: 'mem-1',
                            memoryTitle: 'Prior',
                            text: 'remembered',
                            evidenceType: 'memory',
                            sourceType: 'saved_memory',
                        },
                    ],
                })
                .mockRejectedValueOnce(new Error('down')),
        };

        const searchMemory = createSearchMemoryAdapter(ragAdapter);
        const ok = await searchMemory({ query: 'prior', limit: 2 });
        expect(ok.status).toBe('ok');
        expect(ok.memories).toEqual([
            expect.objectContaining({ id: 'mem-1', title: 'Prior', text: 'remembered' }),
        ]);

        const failed = await searchMemory({ query: 'prior' });
        expect(failed).toEqual({
            query: 'prior',
            memories: [],
            status: 'unavailable',
            ok: false,
            error: 'down',
            message: 'down',
            errorCode: 'query_failed',
        });
    });

    it('searchMemory adapter soft-fails when ragAdapter.query is missing', async () => {
        const searchMemory = createSearchMemoryAdapter({});
        const result = await searchMemory({ query: 'prior claim' });
        expect(result).toEqual({
            query: 'prior claim',
            memories: [],
            status: 'unavailable',
            ok: false,
            error: 'UniRAG query adapter is not available.',
            message: 'UniRAG query adapter is not available.',
            errorCode: 'unirag_unavailable',
        });
    });
});


describe('resolveGroundingMode (product)', () => {
    function withGroundingEnv(value, fn) {
        const key = 'VIBEREADER_AGENT_GROUNDING';
        const prev = process.env[key];
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
        try {
            return fn();
        } finally {
            if (prev === undefined) delete process.env[key];
            else process.env[key] = prev;
        }
    }

    it('returns undefined for non-llm resolvedSource', () => {
        withGroundingEnv(undefined, () => {
            expect(resolveGroundingMode({}, 'local')).toBeUndefined();
            expect(resolveGroundingMode({}, 'fallback')).toBeUndefined();
            expect(resolveGroundingMode({}, undefined)).toBeUndefined();
        });
    });

    it('defaults llm path to warn', () => {
        withGroundingEnv(undefined, () => {
            expect(resolveGroundingMode({}, 'llm')).toBe('warn');
        });
        withGroundingEnv('', () => {
            expect(resolveGroundingMode({}, 'llm')).toBe('warn');
        });
        withGroundingEnv('warn', () => {
            // non-strict env values do not change default
            expect(resolveGroundingMode({}, 'llm')).toBe('warn');
        });
    });

    it('forces strict when VIBEREADER_AGENT_GROUNDING=strict (Node)', () => {
        withGroundingEnv('strict', () => {
            expect(resolveGroundingMode({}, 'llm')).toBe('strict');
            // strict only applies on llm path
            expect(resolveGroundingMode({}, 'local')).toBeUndefined();
        });
        withGroundingEnv('STRICT', () => {
            expect(resolveGroundingMode({}, 'llm')).toBe('strict');
        });
    });

    it('honors explicit groundingMode / groundingGate off for quiet offline mocks', () => {
        withGroundingEnv(undefined, () => {
            expect(resolveGroundingMode({ groundingMode: 'off' }, 'llm')).toBeUndefined();
            expect(resolveGroundingMode({ groundingGate: false }, 'llm')).toBeUndefined();
            expect(resolveGroundingMode({ groundingGate: 'off' }, 'llm')).toBeUndefined();
        });
        // Explicit off beats env strict
        withGroundingEnv('strict', () => {
            expect(resolveGroundingMode({ groundingMode: 'off' }, 'llm')).toBeUndefined();
            expect(resolveGroundingMode({ groundingGate: false }, 'llm')).toBeUndefined();
        });
    });

    it('honors explicit warn and strict overrides on adapters', () => {
        withGroundingEnv(undefined, () => {
            expect(resolveGroundingMode({ groundingMode: 'warn' }, 'llm')).toBe('warn');
            expect(resolveGroundingMode({ groundingMode: 'strict' }, 'llm')).toBe('strict');
            expect(resolveGroundingMode({ groundingGate: true }, 'llm')).toBe('warn');
            expect(resolveGroundingMode({ groundingGate: 'strict' }, 'llm')).toBe('strict');
            // Explicit mode on non-llm is still honored (opt-in test harness)
            expect(resolveGroundingMode({ groundingMode: 'warn' }, 'local')).toBe('warn');
            // Gate true alone does not enable local path
            expect(resolveGroundingMode({ groundingGate: true }, 'local')).toBeUndefined();
        });
    });
});

describe('createReadingAgentOptions', () => {
    it('builds options for local knowledge_qa offline without UniRAG', () => {
        const options = createReadingAgentOptions('knowledge_qa_agent', {
            id: 'doc-1',
            contentText: 'Hello paper about methods.',
        }, {
            useLlm: false,
            uniRagAvailable: false,
        });

        expect(options).toEqual(expect.objectContaining({
            goal: expect.stringContaining('knowledge_search'),
            model: expect.any(Function),
            permissions: expect.objectContaining({
                canSearchKnowledge: true,
            }),
        }));
        expect(options.tools.knowledge_search).toBeTruthy();
        // Write tools filtered out for knowledge_qa profile.
        expect(options.tools.create_vibecard).toBeUndefined();
        // Local models: grounding soft gate + observability stay off (not set).
        expect(options.groundingMode).toBeUndefined();
        expect(options.includeObservability).toBeUndefined();
    });

    it('builds options for local model skills offline', () => {
        const options = createReadingAgentOptions('paper_overview_agent', {
            id: 'doc-1',
            contentText: 'Hello paper.',
        }, {
            useLlm: false,
            uniRagAvailable: false,
        });

        expect(options).toEqual(expect.objectContaining({
            goal: expect.stringContaining('paper overview'),
            model: expect.any(Function),
            tools: expect.any(Object),
            permissions: expect.any(Object),
        }));
        expect(options.tools.knowledge_search).toBeTruthy();
        expect(options.groundingMode).toBeUndefined();
        expect(options.includeObservability).toBeUndefined();
    });

    it('builds LLM options for knowledge_qa with UniRAG adapters', () => {
        const options = createReadingAgentOptions('knowledge_qa_agent', {
            id: 'doc-1',
            contentText: 'Hello paper.',
        }, {
            useLlm: true,
            modelConfig: {
                baseUrl: 'http://127.0.0.1:8317/v1',
                apiKey: 'test-key',
                model: 'grok-4.5',
            },
            uniRagAvailable: true,
            ragAdapter: {
                engine: 'uni-rag',
                query: vi.fn(),
            },
        });

        expect(options).toEqual(expect.objectContaining({
            goal: expect.stringContaining('knowledge_search'),
            model: expect.any(Function),
            permissions: expect.objectContaining({
                canSearchKnowledge: true,
            }),
            groundingMode: 'warn',
            includeObservability: true,
            requireSourceRefsForClaims: true,
        }));
        expect(options.tools.knowledge_search).toBeTruthy();
        expect(options.tools.memory_search).toBeTruthy();
    });

    it('injects progressive skillDocument into LLM system prompt (browser-safe, no fs)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: { role: 'assistant', content: 'ok' },
                }],
            }),
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchMock;

        try {
            const options = createReadingAgentOptions('paper_overview_agent', {
                id: 'doc-1',
                contentText: 'Hello paper.',
            }, {
                useLlm: true,
                modelConfig: {
                    baseUrl: 'http://127.0.0.1:8317/v1',
                    apiKey: 'test-key',
                    model: 'grok-4.5',
                },
                skillDocument: [
                    '## Procedure',
                    'PROGRESSIVE_SKILL_MD_MARKER: section signals.',
                ].join('\n'),
                uniRagAvailable: false,
            });

            expect(options).not.toBeNull();
            await options.model({ goal: 'Overview', trace: [] });

            const body = JSON.parse(fetchMock.mock.calls[0][1].body);
            const system = body.messages.find((m) => m.role === 'system');
            expect(system.content).toContain('Paper Overview Agent');
            expect(system.content).toContain(
                'Skill document (docs/reading-agent-skills/paper-overview.md)',
            );
            expect(system.content).toContain('PROGRESSIVE_SKILL_MD_MARKER');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('falls back to embed-only LLM prompt when skill document is unavailable', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: { role: 'assistant', content: 'ok' },
                }],
            }),
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchMock;

        try {
            // No skillPath → resolveSkillDocument returns ''; model stays embed-only.
            const options = createReadingAgentOptions('paper_overview_agent', {
                id: 'doc-1',
                contentText: 'Hello.',
            }, {
                useLlm: true,
                modelConfig: {
                    baseUrl: 'http://127.0.0.1:8317/v1',
                    apiKey: 'test-key',
                    model: 'grok-4.5',
                },
                uniRagAvailable: false,
                getReadingAgentSkill: () => ({
                    type: 'paper_overview_agent',
                    title: 'Paper overview',
                    goal: 'overview',
                    requiredTools: ['get_current_document'],
                    outputArtifactType: 'reading_note',
                    maxIterations: 4,
                    systemPrompt: 'You are Paper Overview Agent for VibeReader.',
                }),
            });

            expect(options).not.toBeNull();
            await options.model({ goal: 'Overview', trace: [] });
            const body = JSON.parse(fetchMock.mock.calls[0][1].body);
            const system = body.messages.find((m) => m.role === 'system');
            expect(system.content).toContain('Paper Overview Agent');
            expect(system.content).not.toContain('Skill document (');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('passes resolved skillDocument into resolveReadingAgentModel when bundled/injected', () => {
        const resolveModel = vi.fn(() => ({
            model: async () => ({ content: 'ok' }),
            source: 'local',
            timeoutMs: 30000,
            maxIterations: 4,
        }));

        createReadingAgentOptions('paper_overview_agent', {
            id: 'doc-1',
            contentText: 'Hello.',
        }, {
            useLlm: false,
            uniRagAvailable: false,
            skillDocuments: {
                'docs/reading-agent-skills/paper-overview.md': 'MAP_INJECT_SKILL_MD',
            },
            resolveReadingAgentModel: resolveModel,
        });

        expect(resolveModel).toHaveBeenCalled();
        const modelOptions = resolveModel.mock.calls[0][2];
        expect(modelOptions.skillDocument).toBe('MAP_INJECT_SKILL_MD');
    });

    it('sets groundingMode warn and includeObservability only when resolved.source is llm', () => {
        const prev = process.env.VIBEREADER_AGENT_GROUNDING;
        delete process.env.VIBEREADER_AGENT_GROUNDING;
        try {
            const llmOptions = createReadingAgentOptions('paper_overview_agent', {
                id: 'doc-1',
                contentText: 'Hello paper.',
            }, {
                useLlm: true,
                modelConfig: {
                    baseUrl: 'http://127.0.0.1:8317/v1',
                    apiKey: 'test-key',
                    model: 'grok-4.5',
                },
                uniRagAvailable: false,
            });
            expect(llmOptions.groundingMode).toBe('warn');
            expect(llmOptions.includeObservability).toBe(true);
            expect(llmOptions.requireSourceRefsForClaims).toBe(true);

            const localOptions = createReadingAgentOptions('paper_overview_agent', {
                id: 'doc-1',
                contentText: 'Hello paper.',
            }, {
                useLlm: false,
                uniRagAvailable: false,
            });
            expect(localOptions.groundingMode).toBeUndefined();
            expect(localOptions.includeObservability).toBeUndefined();
            expect(localOptions.requireSourceRefsForClaims).toBeUndefined();

            // Residual: useLlm true but resolve falls back to local -> both stay off.
            const preferLlmLocalFallback = createReadingAgentOptions('paper_overview_agent', {
                id: 'doc-1',
                contentText: 'Hello paper.',
            }, {
                useLlm: true,
                modelConfig: null,
                uniRagAvailable: false,
            });
            expect(preferLlmLocalFallback).toBeTruthy();
            expect(preferLlmLocalFallback.groundingMode).toBeUndefined();
            expect(preferLlmLocalFallback.includeObservability).toBeUndefined();
            expect(preferLlmLocalFallback.requireSourceRefsForClaims).toBeUndefined();
        } finally {
            if (prev === undefined) delete process.env.VIBEREADER_AGENT_GROUNDING;
            else process.env.VIBEREADER_AGENT_GROUNDING = prev;
        }
    });

    it('forces groundingMode strict on llm path when VIBEREADER_AGENT_GROUNDING=strict', () => {
        const prev = process.env.VIBEREADER_AGENT_GROUNDING;
        process.env.VIBEREADER_AGENT_GROUNDING = 'strict';
        try {
            const llmOptions = createReadingAgentOptions('paper_overview_agent', {
                id: 'doc-1',
                contentText: 'Hello paper.',
            }, {
                useLlm: true,
                modelConfig: {
                    baseUrl: 'http://127.0.0.1:8317/v1',
                    apiKey: 'test-key',
                    model: 'grok-4.5',
                },
                uniRagAvailable: false,
            });
            expect(llmOptions.groundingMode).toBe('strict');
            expect(llmOptions.includeObservability).toBe(true);
            expect(llmOptions.requireSourceRefsForClaims).toBe(true);

            const localOptions = createReadingAgentOptions('paper_overview_agent', {
                id: 'doc-1',
                contentText: 'Hello paper.',
            }, {
                useLlm: false,
                uniRagAvailable: false,
            });
            expect(localOptions.groundingMode).toBeUndefined();
            expect(localOptions.requireSourceRefsForClaims).toBeUndefined();
        } finally {
            if (prev === undefined) delete process.env.VIBEREADER_AGENT_GROUNDING;
            else process.env.VIBEREADER_AGENT_GROUNDING = prev;
        }
    });

    it('omits grounding when adapters set groundingGate/mode off (offline mock quiet)', () => {
        const prev = process.env.VIBEREADER_AGENT_GROUNDING;
        delete process.env.VIBEREADER_AGENT_GROUNDING;
        try {
            const llmBase = {
                useLlm: true,
                modelConfig: {
                    baseUrl: 'http://127.0.0.1:8317/v1',
                    apiKey: 'test-key',
                    model: 'grok-4.5',
                },
                uniRagAvailable: false,
            };
            for (const override of [
                { groundingMode: 'off' },
                { groundingGate: false },
                { groundingGate: 'off' },
            ]) {
                const options = createReadingAgentOptions('paper_overview_agent', {
                    id: 'doc-1',
                    contentText: 'Hello paper.',
                }, { ...llmBase, ...override });
                expect(options.groundingMode).toBeUndefined();
                expect(options.includeObservability).toBeUndefined();
                expect(options.requireSourceRefsForClaims).toBeUndefined();
            }

            const strictExplicit = createReadingAgentOptions('paper_overview_agent', {
                id: 'doc-1',
                contentText: 'Hello paper.',
            }, { ...llmBase, groundingMode: 'strict' });
            expect(strictExplicit.groundingMode).toBe('strict');
            expect(strictExplicit.requireSourceRefsForClaims).toBe(true);
        } finally {
            if (prev === undefined) delete process.env.VIBEREADER_AGENT_GROUNDING;
            else process.env.VIBEREADER_AGENT_GROUNDING = prev;
        }
    });

    it('keeps memory_save out of default options; opt-in permissions expose it', () => {
        const defaultOptions = createReadingAgentOptions('memory_curator_agent', {
            id: 'doc-1',
            contentText: 'Paper.',
        }, {
            useLlm: false,
            uniRagAvailable: false,
        });
        expect(defaultOptions.tools.memory_save).toBeUndefined();
        expect(defaultOptions.permissions.canWriteMemory).toBe(false);

        const writeOptions = createReadingAgentOptions('memory_curator_agent', {
            id: 'doc-1',
            contentText: 'Paper.',
        }, {
            useLlm: false,
            uniRagAvailable: false,
            permissions: buildMemoryWritePermissions(
                buildReadingAgentPermissions('memory_curator_agent'),
            ),
        });
        expect(writeOptions.tools.memory_save).toBeTruthy();
        expect(writeOptions.permissions.canWriteMemory).toBe(true);
    });

    it('keeps create_vibecard only for card_generation permissions', () => {
        const cardOptions = createReadingAgentOptions('card_generation_agent', {
            id: 'doc-1',
            contentText: 'Chunk text for cards.',
        }, {
            useLlm: false,
            uniRagAvailable: false,
            createVibeCard: vi.fn(),
        });

        expect(cardOptions.tools.create_vibecard).toBeTruthy();
        expect(cardOptions.permissions.canWriteVibeCards).toBe(true);
    });

    it('keeps export_note only for note_export permissions', () => {
        const exportOptions = createReadingAgentOptions('note_export_agent', {
            id: 'doc-1',
            contentText: 'Readable paper text.',
        }, {
            useLlm: false,
            uniRagAvailable: false,
            exportNote: vi.fn(),
        });

        expect(exportOptions).toEqual(expect.objectContaining({
            goal: expect.stringContaining('export'),
            model: expect.any(Function),
            permissions: expect.objectContaining({
                canExportNotes: true,
            }),
        }));
        expect(exportOptions.tools.export_note).toBeTruthy();
        expect(exportOptions.tools.create_vibecard).toBeUndefined();

        const overviewOptions = createReadingAgentOptions('paper_overview_agent', {
            id: 'doc-1',
            contentText: 'Readable paper text.',
        }, {
            useLlm: false,
            uniRagAvailable: false,
        });
        expect(overviewOptions.tools.export_note).toBeUndefined();
        expect(overviewOptions.permissions.canExportNotes).toBe(false);
    });

    it('passes lessonsPrompt from experienceStore into resolveReadingAgentModel', () => {
        const resolveReadingAgentModel = vi.fn(() => ({
            model: vi.fn(),
            source: 'local',
            timeoutMs: 30000,
            maxIterations: 4,
        }));
        const experienceStore = {
            buildLessonsPrompt: () => 'Lessons from past failed runs:\n- Stay within iteration budget.',
        };

        const options = createReadingAgentOptions('paper_overview_agent', {
            id: 'doc-1',
            contentText: 'Hello paper.',
        }, {
            useLlm: false,
            uniRagAvailable: false,
            experienceStore,
            resolveReadingAgentModel,
        });

        expect(resolveReadingAgentModel).toHaveBeenCalledWith(
            'paper_overview_agent',
            undefined,
            expect.objectContaining({
                lessonsPrompt: expect.stringContaining('iteration budget'),
            }),
        );
        expect(options.lessonsPrompt).toContain('iteration budget');
    });

    it('prefers explicit lessonsPrompt over experienceStore', () => {
        const resolveReadingAgentModel = vi.fn(() => ({
            model: vi.fn(),
            source: 'local',
            timeoutMs: 30000,
            maxIterations: 4,
        }));

        createReadingAgentOptions('paper_overview_agent', {
            id: 'doc-1',
            contentText: 'Hello paper.',
        }, {
            useLlm: false,
            uniRagAvailable: false,
            lessonsPrompt: 'Lessons from past failed runs:\n- Prefer explicit.',
            experienceStore: {
                buildLessonsPrompt: () => 'Lessons from past failed runs:\n- From store.',
            },
            resolveReadingAgentModel,
        });

        expect(resolveReadingAgentModel).toHaveBeenCalledWith(
            'paper_overview_agent',
            undefined,
            expect.objectContaining({
                lessonsPrompt: 'Lessons from past failed runs:\n- Prefer explicit.',
            }),
        );
    });

    it('omits lessonsPrompt when store has no lessons', () => {
        const resolveReadingAgentModel = vi.fn(() => ({
            model: vi.fn(),
            source: 'local',
            timeoutMs: 30000,
            maxIterations: 4,
        }));

        const options = createReadingAgentOptions('paper_overview_agent', {
            id: 'doc-1',
            contentText: 'Hello paper.',
        }, {
            useLlm: false,
            uniRagAvailable: false,
            experienceStore: { buildLessonsPrompt: () => '' },
            resolveReadingAgentModel,
        });

        const callOptions = resolveReadingAgentModel.mock.calls[0][2];
        expect(callOptions.lessonsPrompt).toBeUndefined();
        expect(options.lessonsPrompt).toBeUndefined();
    });

    it('after failed recordRun, next createReadingAgentOptions injects lessons into LLM system path', async () => {
        const store = createExperienceStore({ now: () => 1_700_000_000_000 });
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockResolvedValue({
            status: 'max_iterations',
            error: 'hit iteration cap without final answer',
            content: '',
            sourceRefs: [],
            trace: [
                {
                    type: 'model',
                    iteration: 1,
                    response: { type: 'tool_call', toolName: 'get_document_chunks' },
                },
                {
                    type: 'tool',
                    iteration: 1,
                    toolName: 'get_document_chunks',
                    result: { chunks: [{ page: 1, text: 'x' }] },
                },
            ],
        });

        await runReadingAgentTask({
            task: {
                id: 'task-exp-fail-lessons',
                documentId: 'doc-1',
                type: 'paper_overview_agent',
                title: 'Overview',
            },
            agentOptions: { goal: 'Summarize the paper' },
            experienceStore: store,
            runAgent,
            saveTask,
            now: () => 1_700_000_000_000,
        });

        expect(store.listFailures()).toHaveLength(1);
        expect(store.buildLessonsPrompt()).toMatch(/iteration budget/i);

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: { role: 'assistant', content: 'grounded overview' },
                }],
            }),
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchMock;

        try {
            // Real resolveReadingAgentModel (no mock): lessons must land in LLM system message.
            const options = createReadingAgentOptions('paper_overview_agent', {
                id: 'doc-1',
                contentText: 'Hello paper about transformers.',
            }, {
                useLlm: true,
                modelConfig: {
                    baseUrl: 'http://127.0.0.1:8317/v1',
                    apiKey: 'test-key',
                    model: 'grok-4.5',
                },
                experienceStore: store,
                uniRagAvailable: false,
            });

            expect(options).not.toBeNull();
            expect(options.lessonsPrompt).toContain('Lessons from past failed runs:');
            expect(options.lessonsPrompt).toMatch(/iteration budget/i);
            expect(typeof options.model).toBe('function');

            await options.model({ goal: 'Overview', trace: [] });

            expect(fetchMock).toHaveBeenCalled();
            const body = JSON.parse(fetchMock.mock.calls[0][1].body);
            const system = body.messages.find((m) => m.role === 'system');
            expect(system).toBeTruthy();
            expect(system.content).toContain('Lessons from past failed runs:');
            expect(system.content).toMatch(/iteration budget/i);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
