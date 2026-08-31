import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_GROK_MODEL,
    DEFAULT_LOCAL_PROXY_BASE_URL,
    DEFAULT_TRACE_COMPRESS_THRESHOLD_TOKENS,
    appendStatusBarMessage,
    buildMessagesFromTrace,
    buildOpenAIToolDefinitions,
    createOpenAICompatibleAgentModel,
    estimateTraceTokens,
    extractFinalContentAndSourceRefs,
    extractMarkdownPageSourceRefs,
    lastToolNameFromTrace,
    normalizeParsedSourceRef,
    pageNumberFromCitationToken,
    prepareTraceForMessages,
    resolveAgentLlmConfig,
    resolveStatusBarForModelTurn,
    shouldCompressTraceForModel,
} from './llmModel';
import { buildStatusBar } from './observation';
import { createExperienceStore } from './experienceStore';
import { TOOL_PARAMETER_SCHEMAS, toolToOpenAIFunction } from './toolSchemas';

/** Build a long multi-iteration tool trace for compression tests. */
function makeLongSyntheticTrace({ steps = 10, resultPad = 800 } = {}) {
    const trace = [];
    for (let i = 1; i <= steps; i += 1) {
        trace.push({
            type: 'model',
            iteration: i,
            response: {
                type: 'tool_call',
                toolName: 'search_document',
                args: { query: `q-${i}`, pad: 'p'.repeat(80) },
            },
        });
        trace.push({
            type: 'tool',
            iteration: i,
            toolName: 'search_document',
            args: { query: `q-${i}` },
            result: {
                hits: Array.from({ length: 8 }, (_, h) => ({
                    page: h + 1,
                    text: `hit-${i}-${h}-${'t'.repeat(resultPad)}`,
                })),
                n: i,
            },
        });
    }
    return trace;
}

describe('extractFinalContentAndSourceRefs', () => {
    it('strips fenced JSON sourceRefs and returns structured refs', () => {
        const raw = [
            '核心结论：方法部分支持该主张 [p.3]。',
            '',
            '```json',
            '{"sourceRefs":[{"documentId":"doc-1","page":3,"paragraphId":"p-3","text":"evidence"}]}',
            '```',
        ].join('\n');

        const { content, sourceRefs } = extractFinalContentAndSourceRefs(raw);
        expect(content).toContain('核心结论');
        expect(content).toContain('[p.3]');
        expect(content).not.toContain('sourceRefs');
        expect(content).not.toContain('```');
        expect(sourceRefs).toEqual([
            {
                documentId: 'doc-1',
                page: 3,
                paragraphId: 'p-3',
                text: 'evidence',
            },
        ]);
    });

    it('accepts snake_case source_refs and normalizes page/paragraph fields', () => {
        const raw = [
            'Answer with grounds.',
            '```',
            '{"source_refs":[{"document_id":"d2","page_number":2,"paragraph_id":"para-2","snippet":"hit"}]}',
            '```',
        ].join('\n');

        const { content, sourceRefs } = extractFinalContentAndSourceRefs(raw);
        expect(content).toBe('Answer with grounds.');
        expect(sourceRefs).toEqual([
            {
                documentId: 'd2',
                page: 2,
                paragraphId: 'para-2',
                text: 'hit',
            },
        ]);
    });

    it('parses trailing bare JSON sourceRefs without fences', () => {
        const raw = [
            'Self-attention is defined in section 3.2.',
            '',
            '{"sourceRefs":[{"page":1,"text":"scaled dot-product attention"}]}',
        ].join('\n');

        const { content, sourceRefs } = extractFinalContentAndSourceRefs(raw);
        expect(content).toBe('Self-attention is defined in section 3.2.');
        expect(sourceRefs).toEqual([
            { page: 1, text: 'scaled dot-product attention' },
        ]);
    });

    it('falls back to markdown [p.N] citations when JSON is missing', () => {
        const raw = [
            '# Overview',
            '',
            'The paper introduces multi-head attention [p.1] and reports BLEU gains [p. 2].',
            'Later analysis revisits encoder depth [page 4] and residual paths [P5].',
            'Duplicate cite on purpose [p.1].',
        ].join('\n');

        const { content, sourceRefs } = extractFinalContentAndSourceRefs(raw);
        expect(content).toContain('multi-head attention [p.1]');
        expect(content).toContain('[page 4]');
        // First-seen unique pages; markdown body kept as-is.
        expect(sourceRefs).toEqual([
            { page: 1 },
            { page: 2 },
            { page: 4 },
            { page: 5 },
        ]);
    });

    it('prefers JSON refs over markdown citations when both exist', () => {
        const raw = [
            'Claim grounded at [p.9] but JSON wins.',
            '```json',
            '{"sourceRefs":[{"page":3,"text":"from-json"}]}',
            '```',
        ].join('\n');

        const { sourceRefs } = extractFinalContentAndSourceRefs(raw);
        expect(sourceRefs).toEqual([{ page: 3, text: 'from-json' }]);
    });

    it('uses markdown fallback when fenced JSON has empty sourceRefs', () => {
        const raw = [
            'Still cited [p.7].',
            '```json',
            '{"sourceRefs":[]}',
            '```',
        ].join('\n');

        const { content, sourceRefs } = extractFinalContentAndSourceRefs(raw);
        expect(content).toBe('Still cited [p.7].');
        expect(sourceRefs).toEqual([{ page: 7 }]);
    });

    it('returns empty refs for plain prose without citations', () => {
        expect(extractFinalContentAndSourceRefs('Just a summary.')).toEqual({
            content: 'Just a summary.',
            sourceRefs: [],
        });
        expect(extractFinalContentAndSourceRefs('')).toEqual({
            content: '',
            sourceRefs: [],
        });
    });
});

describe('extractMarkdownPageSourceRefs / pageNumberFromCitationToken', () => {
    it('extracts unique bracket page citations from sample markdown', () => {
        const md = 'See [p.1] then [p. 2], [page:3], and again [p.1].';
        expect(extractMarkdownPageSourceRefs(md)).toEqual([
            { page: 1 },
            { page: 2 },
            { page: 3 },
        ]);
    });

    it('parses common citation tokens', () => {
        expect(pageNumberFromCitationToken('p.12')).toBe(12);
        expect(pageNumberFromCitationToken('[p.4]')).toBe(4);
        expect(pageNumberFromCitationToken('page 8')).toBe(8);
        expect(pageNumberFromCitationToken('no-page')).toBeNull();
    });

    it('normalizes loose sourceRef shapes', () => {
        expect(normalizeParsedSourceRef({ page: '3', text: 'x' })).toEqual({ page: 3, text: 'x' });
        expect(normalizeParsedSourceRef(2)).toEqual({ page: 2 });
        expect(normalizeParsedSourceRef('p.5')).toEqual({ page: 5 });
        expect(normalizeParsedSourceRef(null)).toBeNull();
        expect(normalizeParsedSourceRef({})).toBeNull();
    });
});

describe('resolveAgentLlmConfig', () => {
    const ENV_KEYS = [
        'VIBEREADER_AGENT_BASE_URL',
        'VIBEREADER_AGENT_API_KEY',
        'VIBEREADER_AGENT_MODEL',
        'OPENAI_API_KEY',
        'XAI_API_KEY',
    ];
    const originalEnv = Object.fromEntries(
        ENV_KEYS.map((key) => [key, process.env[key]])
    );

    function clearAgentEnv() {
        for (const key of ENV_KEYS) {
            delete process.env[key];
        }
    }

    function restoreAgentEnv() {
        clearAgentEnv();
        for (const key of ENV_KEYS) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
    }

    afterEach(() => {
        restoreAgentEnv();
    });

    it('prefers explicit options over env', () => {
        clearAgentEnv();
        process.env.VIBEREADER_AGENT_BASE_URL = 'http://env-vibe/v1';
        process.env.VIBEREADER_AGENT_API_KEY = 'vibe-key';
        process.env.VIBEREADER_AGENT_MODEL = 'vibe-model';
        process.env.OPENAI_API_KEY = 'openai-key';
        process.env.XAI_API_KEY = 'xai-key';

        const config = resolveAgentLlmConfig({
            baseUrl: 'http://explicit/v1',
            apiKey: 'explicit-key',
            model: 'explicit-model',
        });

        expect(config).toEqual(expect.objectContaining({
            baseUrl: 'http://explicit/v1',
            apiKey: 'explicit-key',
            model: 'explicit-model',
            source: 'options',
        }));
    });

    it('uses VIBEREADER_AGENT_* before OPENAI / XAI', () => {
        clearAgentEnv();
        const config = resolveAgentLlmConfig({
            VIBEREADER_AGENT_BASE_URL: 'http://vibe-proxy/v1',
            VIBEREADER_AGENT_API_KEY: 'vibe-secret',
            VIBEREADER_AGENT_MODEL: 'grok-special',
            OPENAI_API_KEY: 'openai-secret',
            XAI_API_KEY: 'xai-secret',
        });

        expect(config).toEqual(expect.objectContaining({
            baseUrl: 'http://vibe-proxy/v1',
            apiKey: 'vibe-secret',
            model: 'grok-special',
            source: 'vibereader_env',
        }));
    });

    it('falls back to OPENAI_API_KEY + local proxy + grok-4.5', () => {
        clearAgentEnv();
        const config = resolveAgentLlmConfig({
            OPENAI_API_KEY: 'openai-only',
        });

        expect(config).toEqual({
            baseUrl: DEFAULT_LOCAL_PROXY_BASE_URL,
            apiKey: 'openai-only',
            model: DEFAULT_GROK_MODEL,
            source: 'openai_env',
        });
    });

    it('falls back to XAI_API_KEY + api.x.ai + grok-4.5', () => {
        clearAgentEnv();
        const config = resolveAgentLlmConfig({
            XAI_API_KEY: 'xai-only',
        });

        expect(config).toEqual({
            baseUrl: 'https://api.x.ai/v1',
            apiKey: 'xai-only',
            model: DEFAULT_GROK_MODEL,
            source: 'xai_env',
        });
    });

    it('reads process.env when object omits keys', () => {
        clearAgentEnv();
        process.env.OPENAI_API_KEY = 'from-process';
        const config = resolveAgentLlmConfig({});
        expect(config).toEqual(expect.objectContaining({
            baseUrl: DEFAULT_LOCAL_PROXY_BASE_URL,
            apiKey: 'from-process',
            model: DEFAULT_GROK_MODEL,
            source: 'openai_env',
        }));
    });
});

describe('buildOpenAIToolDefinitions / toolSchemas', () => {
    it('converts a createReadingTools-style registry', () => {
        const tools = {
            get_page_text: {
                name: 'get_page_text',
                description: 'Extract page text',
                readOnly: true,
                run: async () => ({}),
            },
            search_document: {
                name: 'search_document',
                description: 'Search doc',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string' },
                    },
                    required: ['query'],
                },
                run: async () => ({}),
            },
        };

        const defs = buildOpenAIToolDefinitions(tools);
        expect(defs).toHaveLength(2);
        // Registry tools without inline parameters fall back to TOOL_PARAMETER_SCHEMAS.
        expect(defs[0]).toEqual({
            type: 'function',
            function: {
                name: 'get_page_text',
                description: 'Extract page text',
                parameters: TOOL_PARAMETER_SCHEMAS.get_page_text,
            },
        });
        expect(defs[0].function.parameters.required).toEqual(['page']);
        expect(defs[1].function.parameters.required).toEqual(['query']);
    });

    it('toolToOpenAIFunction uses TOOL_PARAMETER_SCHEMAS when parameters missing', () => {
        const def = toolToOpenAIFunction({
            name: 'search_document',
            description: 'Search',
        });
        expect(def.function.parameters).toEqual(TOOL_PARAMETER_SCHEMAS.search_document);
        expect(TOOL_PARAMETER_SCHEMAS.get_current_document).toBeTruthy();
        expect(TOOL_PARAMETER_SCHEMAS.list_tools).toBeTruthy();
        expect(TOOL_PARAMETER_SCHEMAS.knowledge_search).toBeTruthy();
        expect(TOOL_PARAMETER_SCHEMAS.memory_search).toBeTruthy();
        expect(TOOL_PARAMETER_SCHEMAS.memory_save).toBeTruthy();
        expect(TOOL_PARAMETER_SCHEMAS.memory_save.required).toEqual(['artifactId', 'userConfirmed']);
        expect(TOOL_PARAMETER_SCHEMAS.verify_citation).toBeTruthy();
    });
});

describe('createOpenAICompatibleAgentModel', () => {
    it('parses a tool_call response', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        role: 'assistant',
                        content: null,
                        tool_calls: [{
                            id: 'call_1',
                            type: 'function',
                            function: {
                                name: 'get_page_text',
                                arguments: '{"page":2,"maxChars":400}',
                            },
                        }],
                    },
                }],
            }),
        });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'test-key',
            model: 'grok-4.5',
            fetch: fetchMock,
            tools: {
                get_page_text: {
                    name: 'get_page_text',
                    description: 'page',
                    run: async () => ({}),
                },
            },
        });

        const result = await model({
            goal: 'Read page 2',
            context: null,
            iteration: 1,
            trace: [],
        });

        expect(result).toEqual({
            type: 'tool_call',
            toolName: 'get_page_text',
            args: { page: 2, maxChars: 400 },
        });
        // Single call keeps legacy shape (no toolCalls array).
        expect(result.toolCalls).toBeUndefined();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://127.0.0.1:8317/v1/chat/completions');
        const body = JSON.parse(init.body);
        expect(body.model).toBe('grok-4.5');
        expect(body.tool_choice).toBe('auto');
        expect(body.tools[0].function.name).toBe('get_page_text');
        expect(init.headers.Authorization).toBe('Bearer test-key');
        // Never leak keys into body
        expect(init.body).not.toContain('test-key');
    });

    it('maps multiple OpenAI tool_calls to toolCalls array for runtime', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        role: 'assistant',
                        content: null,
                        tool_calls: [
                            {
                                id: 'call_a',
                                type: 'function',
                                function: {
                                    name: 'get_page_text',
                                    arguments: '{"page":1}',
                                },
                            },
                            {
                                id: 'call_b',
                                type: 'function',
                                function: {
                                    name: 'search_document',
                                    arguments: '{"query":"claim"}',
                                },
                            },
                        ],
                    },
                }],
            }),
        });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'test-key',
            model: 'grok-4.5',
            fetch: fetchMock,
            tools: {
                get_page_text: { name: 'get_page_text', description: 'page', run: async () => ({}) },
                search_document: { name: 'search_document', description: 'search', run: async () => ({}) },
            },
        });

        const result = await model({
            goal: 'Gather evidence',
            context: null,
            iteration: 1,
            trace: [],
        });

        expect(result).toEqual({
            type: 'tool_call',
            toolCalls: [
                { toolName: 'get_page_text', args: { page: 1 } },
                { toolName: 'search_document', args: { query: 'claim' } },
            ],
        });
        // Multi shape does not set top-level toolName/args.
        expect(result.toolName).toBeUndefined();
        expect(result.args).toBeUndefined();
    });

    it('parses a final content response and optional sourceRefs JSON', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        role: 'assistant',
                        content: [
                            '核心结论：方法部分支持该主张。',
                            '',
                            '```json',
                            '{"sourceRefs":[{"documentId":"doc-1","page":3,"paragraphId":"p-3","text":"evidence"}]}',
                            '```',
                        ].join('\n'),
                    },
                }],
            }),
        });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://proxy/v1',
            apiKey: 'k',
            fetch: fetchMock,
        });

        const result = await model({
            goal: '总结',
            iteration: 1,
            trace: [],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('核心结论');
        expect(result.content).not.toContain('sourceRefs');
        expect(result.sourceRefs).toEqual([
            {
                documentId: 'doc-1',
                page: 3,
                paragraphId: 'p-3',
                text: 'evidence',
            },
        ]);
    });

    it('does not re-inject stripped JSON when final is only a sourceRefs fence', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        role: 'assistant',
                        content: '```json\n{"sourceRefs":[{"page":2,"text":"only-meta"}]}\n```',
                    },
                }],
            }),
        });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://proxy/v1',
            apiKey: 'k',
            fetch: fetchMock,
        });

        const result = await model({ goal: 'meta only', iteration: 1, trace: [] });
        expect(result.type).toBe('final');
        expect(result.content).toBe('');
        expect(result.content).not.toContain('sourceRefs');
        expect(result.sourceRefs).toEqual([{ page: 2, text: 'only-meta' }]);
    });

    it('extracts sourceRefs from markdown [p.N] citations when JSON is absent', async () => {
        const sampleMarkdown = [
            '## Answer',
            '',
            'Attention maps tokens jointly [p.1].',
            'Multi-head improves representation capacity [p.2].',
        ].join('\n');

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        role: 'assistant',
                        content: sampleMarkdown,
                    },
                }],
            }),
        });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://proxy/v1',
            apiKey: 'k',
            fetch: fetchMock,
        });

        const result = await model({
            goal: 'Explain attention',
            iteration: 1,
            trace: [],
        });

        expect(result.type).toBe('final');
        expect(result.content).toBe(sampleMarkdown);
        expect(result.sourceRefs).toEqual([{ page: 1 }, { page: 2 }]);
    });

    it('reconstructs prior tool results from trace on later iterations', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        role: 'assistant',
                        content: 'Based on page text, the claim holds.',
                    },
                }],
            }),
        });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://proxy/v1',
            apiKey: 'k',
            fetch: fetchMock,
            tools: {
                extractText: {
                    name: 'extractText',
                    description: 'extract',
                    run: async () => ({}),
                },
            },
        });

        const trace = Object.freeze([
            Object.freeze({
                type: 'model',
                iteration: 1,
                response: Object.freeze({
                    type: 'tool_call',
                    toolName: 'extractText',
                    args: Object.freeze({ page: 1 }),
                }),
            }),
            Object.freeze({
                type: 'tool',
                iteration: 1,
                toolName: 'extractText',
                args: Object.freeze({ page: 1 }),
                result: Object.freeze({ text: 'Claim evidence.', page: 1 }),
            }),
        ]);

        const result = await model({
            goal: 'Check the claim.',
            context: { prompt: 'Doc: paper.pdf' },
            iteration: 2,
            trace,
        });

        expect(result).toEqual({
            type: 'final',
            content: 'Based on page text, the claim holds.',
        });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        const roles = body.messages.map((m) => m.role);
        // Trailing user message is the book ch2 status bar trailer.
        expect(roles).toEqual(['system', 'user', 'assistant', 'tool', 'user']);
        expect(body.messages[2].tool_calls[0].function.name).toBe('extractText');
        expect(JSON.parse(body.messages[2].tool_calls[0].function.arguments)).toEqual({ page: 1 });
        expect(body.messages[3].role).toBe('tool');
        expect(JSON.parse(body.messages[3].content)).toEqual({ text: 'Claim evidence.', page: 1 });
        expect(body.messages[1].content).toContain('Check the claim.');
        expect(body.messages[1].content).toContain('Doc: paper.pdf');
        expect(body.messages[4].content).toMatch(/^Status:/);
    });

    it('throws on HTTP error so runtime can mark error status', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ error: { message: 'invalid api key' } }),
        });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://proxy/v1',
            apiKey: 'bad',
            fetch: fetchMock,
        });

        await expect(model({ goal: 'x', trace: [] })).rejects.toThrow(/401/);
        await expect(model({ goal: 'x', trace: [] })).rejects.toThrow(/invalid api key/);
    });

    it('passes AbortSignal from model input to fetch', async () => {
        const controller = new AbortController();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: { role: 'assistant', content: 'ok' },
                }],
            }),
        });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://proxy/v1',
            apiKey: 'k',
            fetch: fetchMock,
        });

        await model({
            goal: 'abortable',
            trace: [],
            abortSignal: controller.signal,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    });

    it('uses closed-over config.abortSignal when model input omits signal', async () => {
        const controller = new AbortController();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: { role: 'assistant', content: 'ok' },
                }],
            }),
        });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://proxy/v1',
            apiKey: 'k',
            fetch: fetchMock,
            abortSignal: controller.signal,
        });

        await model({ goal: 'closed-over', trace: [] });

        expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    });
});

describe('resolveStatusBarForModelTurn / lastToolNameFromTrace', () => {
    it('prefers explicit runtime status when present', () => {
        const line = resolveStatusBarForModelTurn({
            status: 'after tool=get_page_text iteration=2/4',
            iteration: 2,
            maxIterations: 4,
            goal: 'Summarize',
            trace: [{ type: 'tool', toolName: 'get_page_text' }],
        });
        expect(line).toBe('after tool=get_page_text iteration=2/4');
    });

    it('falls back to buildStatusBar from iteration/max/goal/lastTool', () => {
        const trace = [
            { type: 'model', iteration: 1, response: { type: 'tool_call', toolName: 'search_document', args: {} } },
            { type: 'tool', iteration: 1, toolName: 'search_document', result: { hits: [] } },
        ];
        expect(lastToolNameFromTrace(trace)).toBe('search_document');
        const line = resolveStatusBarForModelTurn({
            iteration: 2,
            maxIterations: 4,
            goal: 'Find claims',
            trace,
        });
        expect(line).toBe(buildStatusBar({
            iteration: 2,
            maxIterations: 4,
            goal: 'Find claims',
            lastTool: 'search_document',
        }));
        expect(line).toContain('iter 2/4');
        expect(line).toContain('last: search_document');
        expect(line).toContain('goal: Find claims');
    });

    it('appendStatusBarMessage adds a trailing user Status line', () => {
        const out = appendStatusBarMessage(
            [{ role: 'system', content: 'sys' }],
            'iter 1/3 · goal: Read',
        );
        expect(out).toHaveLength(2);
        expect(out[1]).toEqual({ role: 'user', content: 'Status: iter 1/3 · goal: Read' });
        expect(appendStatusBarMessage([{ role: 'user', content: 'x' }], '  ')).toEqual([
            { role: 'user', content: 'x' },
        ]);
    });
});

describe('buildMessagesFromTrace', () => {
    it('includes system + user goal and context.prompt', () => {
        const messages = buildMessagesFromTrace({
            goal: 'Overview',
            context: { prompt: 'meta chunk' },
            trace: [],
            systemPrompt: 'sys',
            includeStatusBar: false,
        });
        expect(messages[0]).toEqual({ role: 'system', content: 'sys' });
        expect(messages[1].role).toBe('user');
        expect(messages[1].content).toContain('Overview');
        expect(messages[1].content).toContain('meta chunk');
    });

    it('appends status bar from runtime status string', () => {
        const messages = buildMessagesFromTrace({
            goal: 'Overview',
            context: null,
            trace: [],
            systemPrompt: 'sys',
            status: 'start iteration=1/6',
            iteration: 1,
            maxIterations: 6,
        });
        const last = messages[messages.length - 1];
        expect(last).toEqual({
            role: 'user',
            content: 'Status: start iteration=1/6',
        });
    });

    it('appends buildStatusBar when status is absent', () => {
        const messages = buildMessagesFromTrace({
            goal: 'Summarize abstract',
            context: null,
            systemPrompt: 'sys',
            iteration: 2,
            maxIterations: 4,
            trace: [
                {
                    type: 'model',
                    iteration: 1,
                    response: { type: 'tool_call', toolName: 'get_page_text', args: { page: 1 } },
                },
                {
                    type: 'tool',
                    iteration: 1,
                    toolName: 'get_page_text',
                    result: { text: 'Abstract…' },
                },
            ],
        });
        const last = messages[messages.length - 1];
        expect(last.role).toBe('user');
        expect(last.content).toBe(
            `Status: ${buildStatusBar({
                iteration: 2,
                maxIterations: 4,
                goal: 'Summarize abstract',
                lastTool: 'get_page_text',
            })}`,
        );
    });

    it('reconstructs multi toolCalls assistant message and matching tool results', () => {
        const messages = buildMessagesFromTrace({
            goal: 'Gather',
            context: null,
            systemPrompt: 'sys',
            trace: [
                {
                    type: 'model',
                    iteration: 1,
                    response: {
                        type: 'tool_call',
                        toolCalls: [
                            { toolName: 'get_page_text', args: { page: 1 } },
                            { toolName: 'search_document', args: { query: 'claim' } },
                        ],
                    },
                },
                {
                    type: 'tool',
                    iteration: 1,
                    toolName: 'get_page_text',
                    args: { page: 1 },
                    result: { text: 'Page one.' },
                },
                {
                    type: 'tool',
                    iteration: 1,
                    toolName: 'search_document',
                    args: { query: 'claim' },
                    result: { hits: [{ page: 3 }] },
                },
            ],
        });

        expect(messages[0].role).toBe('system');
        expect(messages[1].role).toBe('user');
        expect(messages[2].role).toBe('assistant');
        expect(messages[2].tool_calls).toHaveLength(2);
        expect(messages[2].tool_calls[0].function.name).toBe('get_page_text');
        expect(messages[2].tool_calls[1].function.name).toBe('search_document');
        expect(messages[3].role).toBe('tool');
        expect(messages[3].tool_call_id).toBe(messages[2].tool_calls[0].id);
        expect(JSON.parse(messages[3].content)).toEqual({ text: 'Page one.' });
        expect(messages[4].role).toBe('tool');
        expect(messages[4].tool_call_id).toBe(messages[2].tool_calls[1].id);
        expect(JSON.parse(messages[4].content)).toEqual({ hits: [{ page: 3 }] });
    });

    it('leaves short traces uncompressed by default', () => {
        const shortTrace = [
            {
                type: 'model',
                iteration: 1,
                response: { type: 'tool_call', toolName: 'get_page_text', args: { page: 1 } },
            },
            {
                type: 'tool',
                iteration: 1,
                toolName: 'get_page_text',
                result: { text: 'short page' },
            },
        ];
        expect(estimateTraceTokens(shortTrace)).toBeLessThan(DEFAULT_TRACE_COMPRESS_THRESHOLD_TOKENS);
        expect(shouldCompressTraceForModel(shortTrace)).toBe(false);

        const messages = buildMessagesFromTrace({
            goal: 'Read',
            systemPrompt: 'sys',
            trace: shortTrace,
        });
        const toolMsg = messages.find((m) => m.role === 'tool');
        expect(JSON.parse(toolMsg.content)).toEqual({ text: 'short page' });
    });

    it('compresses long synthetic traces before formatting tool messages', () => {
        const longTrace = makeLongSyntheticTrace({ steps: 12, resultPad: 600 });
        expect(estimateTraceTokens(longTrace)).toBeGreaterThan(DEFAULT_TRACE_COMPRESS_THRESHOLD_TOKENS);
        expect(shouldCompressTraceForModel(longTrace)).toBe(true);

        const rawMessages = buildMessagesFromTrace({
            goal: 'Long run',
            systemPrompt: 'sys',
            trace: longTrace,
            compressTrace: false,
        });
        const compressedMessages = buildMessagesFromTrace({
            goal: 'Long run',
            systemPrompt: 'sys',
            trace: longTrace,
            compressTrace: true,
        });

        const rawToolChars = rawMessages
            .filter((m) => m.role === 'tool')
            .reduce((sum, m) => sum + String(m.content || '').length, 0);
        const compressedToolChars = compressedMessages
            .filter((m) => m.role === 'tool')
            .reduce((sum, m) => sum + String(m.content || '').length, 0);

        expect(compressedToolChars).toBeLessThan(rawToolChars);
        expect(compressedToolChars).toBeLessThan(rawToolChars * 0.5);

        // Summarized tool payloads use the compact shape (status/keys/snippet).
        const toolBodies = compressedMessages
            .filter((m) => m.role === 'tool')
            .map((m) => JSON.parse(m.content));
        expect(toolBodies.some((body) => body?.snippet != null || body?.keys != null)).toBe(true);
        // Full pad from synthetic hits should not flood every tool message.
        const bloated = toolBodies.filter((body) => JSON.stringify(body).includes('t'.repeat(400)));
        expect(bloated.length).toBeLessThan(toolBodies.length);
    });

    it('skips compression when compressTrace is false even if long', () => {
        const longTrace = makeLongSyntheticTrace({ steps: 8, resultPad: 500 });
        const prepared = prepareTraceForMessages(longTrace, { compressTrace: false });
        expect(prepared).toBe(longTrace);

        const messages = buildMessagesFromTrace({
            goal: 'No compress',
            systemPrompt: 'sys',
            trace: longTrace,
            compressTrace: false,
        });
        const firstTool = messages.find((m) => m.role === 'tool');
        const body = JSON.parse(firstTool.content);
        expect(body.hits).toBeTruthy();
        expect(body.hits[0].text.length).toBeGreaterThan(400);
    });
});

describe('prepareTraceForMessages / shouldCompressTraceForModel', () => {
    it('returns original short array reference when under threshold', () => {
        const short = [{ type: 'tool', toolName: 'x', result: { ok: true } }];
        expect(prepareTraceForMessages(short)).toBe(short);
    });

    it('returns a compressed array when over threshold', () => {
        const longTrace = makeLongSyntheticTrace({ steps: 10, resultPad: 700 });
        const prepared = prepareTraceForMessages(longTrace, {
            compressTrace: true,
            compressMaxTokens: 400,
        });
        expect(prepared).not.toBe(longTrace);
        expect(estimateTraceTokens(prepared)).toBeLessThan(estimateTraceTokens(longTrace));
        expect(prepared.some((s) => s.compressed === true)).toBe(true);
    });
});

describe('createOpenAICompatibleAgentModel lessonsPrompt', () => {
    it('appends lessonsPrompt to system message', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: { role: 'assistant', content: 'ok' },
                }],
            }),
        });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'k',
            model: 'grok-4.5',
            systemPrompt: 'You are a reading agent.',
            lessonsPrompt: 'Lessons from past failed runs:\n- Stay within iteration budget.',
            fetch: fetchMock,
        });

        await model({ goal: 'g', trace: [] });
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.messages[0].content).toContain('You are a reading agent.');
        expect(body.messages[0].content).toContain('Stay within iteration budget.');
    });
});

describe('createOpenAICompatibleAgentModel status bar (Ch2)', () => {
    it('includes runtime status string as trailing user Status message', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: { role: 'assistant', content: 'done' },
                }],
            }),
        });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'k',
            model: 'grok-4.5',
            systemPrompt: 'sys',
            fetch: fetchMock,
        });

        await model({
            goal: 'Read abstract',
            context: null,
            iteration: 2,
            maxIterations: 5,
            status: 'after tool=get_page_text iteration=2/5',
            trace: [
                {
                    type: 'tool',
                    iteration: 1,
                    toolName: 'get_page_text',
                    result: { text: 'x' },
                },
            ],
        });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        const last = body.messages[body.messages.length - 1];
        expect(last.role).toBe('user');
        expect(last.content).toBe('Status: after tool=get_page_text iteration=2/5');
    });

    it('builds status bar from iteration/maxIterations/goal/trace when status omitted', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: { role: 'assistant', content: 'done' },
                }],
            }),
        });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'k',
            model: 'grok-4.5',
            systemPrompt: 'sys',
            fetch: fetchMock,
        });

        await model({
            goal: 'Overview',
            iteration: 1,
            maxIterations: 8,
            trace: [],
        });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        const last = body.messages[body.messages.length - 1];
        expect(last.role).toBe('user');
        expect(last.content).toBe(
            `Status: ${buildStatusBar({
                iteration: 1,
                maxIterations: 8,
                goal: 'Overview',
                lastTool: '',
            })}`,
        );
    });
});


describe('Ch8 experience loop (store → lessonsPrompt → system message)', () => {
    it('records max_iterations + tool_not_found failures, injects lessons into model system message', async () => {
        const store = createExperienceStore({ now: () => 1_700_000_000_000 });
        store.recordRun({
            goal: 'Summarize with tools',
            skillType: 'paper_overview_agent',
            status: 'max_iterations',
            contentSummary: 'hit iteration cap without final answer',
            trace: [
                { type: 'model', iteration: 1, response: { type: 'tool_call', toolName: 'get_document_chunks' } },
                { type: 'tool', iteration: 1, toolName: 'get_document_chunks', result: { chunks: [{ page: 1 }] } },
            ],
        });
        store.recordRun({
            goal: 'Browse the web for context',
            skillType: 'knowledge_qa_agent',
            status: 'tool_not_found',
            contentSummary: 'Tool "search_web" is not registered',
            error: 'tool_not_found',
        });

        const lessonsPrompt = store.buildLessonsPrompt({ limit: 5 });
        expect(lessonsPrompt).toContain('Lessons from past failed runs:');
        // Rule lessons for the two failure statuses
        expect(lessonsPrompt).toMatch(/iteration budget/i);
        expect(lessonsPrompt).toMatch(/tool list|never invent tool/i);

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: { role: 'assistant', content: 'grounded answer' },
                }],
            }),
        });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'test-key',
            model: 'grok-4.5',
            systemPrompt: 'You are a reading agent inside VibeReader.',
            lessonsPrompt,
            fetch: fetchMock,
        });

        const result = await model({
            goal: 'Explain self-attention from the document',
            context: null,
            iteration: 1,
            trace: [],
        });

        expect(result.type).toBe('final');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.messages[0].role).toBe('system');
        const system = body.messages[0].content;
        expect(system).toContain('You are a reading agent inside VibeReader.');
        expect(system).toContain('Lessons from past failed runs:');
        expect(system).toMatch(/iteration budget/i);
        expect(system).toMatch(/tool list|never invent tool/i);
        // Lessons block is appended after base system prompt
        const baseIdx = system.indexOf('You are a reading agent inside VibeReader.');
        const lessonsIdx = system.indexOf('Lessons from past failed runs:');
        expect(baseIdx).toBeGreaterThanOrEqual(0);
        expect(lessonsIdx).toBeGreaterThan(baseIdx);
    });
});

describe('createOpenAICompatibleAgentModel compressTrace', () => {
    it('defaults to compressing long prior traces in the request body', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: { role: 'assistant', content: 'done' },
                }],
            }),
        });

        const longTrace = makeLongSyntheticTrace({ steps: 12, resultPad: 600 });
        expect(estimateTraceTokens(longTrace)).toBeGreaterThan(DEFAULT_TRACE_COMPRESS_THRESHOLD_TOKENS);

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'k',
            model: 'grok-4.5',
            fetch: fetchMock,
            // compressTrace defaults true
        });

        await model({
            goal: 'Summarize after many tools',
            context: { prompt: 'doc meta' },
            iteration: 13,
            trace: longTrace,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        const toolContents = body.messages
            .filter((m) => m.role === 'tool')
            .map((m) => m.content);

        const totalToolChars = toolContents.reduce((sum, c) => sum + c.length, 0);
        // Uncompressed 12 large tool results would be tens of KB; compressed stays much smaller.
        expect(totalToolChars).toBeLessThan(20_000);

        const parsed = toolContents.map((c) => JSON.parse(c));
        expect(parsed.some((p) => p?.snippet != null || p?.status != null || p?.keys != null)).toBe(true);
    });

    it('sends full tool payloads when compressTrace is false', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: { role: 'assistant', content: 'done' },
                }],
            }),
        });

        const longTrace = makeLongSyntheticTrace({ steps: 6, resultPad: 400 });

        const model = createOpenAICompatibleAgentModel({
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'k',
            model: 'grok-4.5',
            fetch: fetchMock,
            compressTrace: false,
        });

        await model({
            goal: 'No compress path',
            iteration: 7,
            trace: longTrace,
        });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        const firstTool = body.messages.find((m) => m.role === 'tool');
        const parsed = JSON.parse(firstTool.content);
        expect(parsed.hits).toBeTruthy();
        expect(parsed.hits[0].text.length).toBeGreaterThan(300);
    });
});
