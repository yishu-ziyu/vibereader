import { describe, expect, it, vi } from 'vitest';
import {
    hasRunnableLlmConfig,
    LLM_TIMEOUT_MS,
    LOCAL_TIMEOUT_MS,
    resolveReadingAgentModel,
} from './modelFactory';
import { appendLessonsToSystemPrompt, DEFAULT_SYSTEM_PROMPT } from './llmModel';

describe('hasRunnableLlmConfig', () => {
    it('requires baseUrl, apiKey, and model', () => {
        expect(hasRunnableLlmConfig(null)).toBe(false);
        expect(hasRunnableLlmConfig({
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'k',
            modelName: 'grok-4.5',
        })).toBe(true);
        expect(hasRunnableLlmConfig({
            baseUrl: 'http://127.0.0.1:8317/v1',
            modelName: 'grok-4.5',
        })).toBe(false);
    });
});

describe('resolveReadingAgentModel', () => {
    it('defaults to local deterministic models when preferLlm is false', () => {
        const resolved = resolveReadingAgentModel('paper_overview_agent', {
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'k',
            model: 'grok-4.5',
        }, { preferLlm: false });

        expect(resolved.source).toBe('local');
        expect(resolved.timeoutMs).toBe(LOCAL_TIMEOUT_MS);
        expect(typeof resolved.model).toBe('function');
        expect(resolved.maxIterations).toBe(4);
    });

    it('prefers LLM when preferLlm and config are complete', () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        role: 'assistant',
                        content: 'overview done',
                    },
                }],
            }),
        });

        const resolved = resolveReadingAgentModel('paper_overview_agent', {
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'test-key',
            model: 'grok-4.5',
        }, {
            preferLlm: true,
            tools: {
                get_current_document: {
                    name: 'get_current_document',
                    description: 'meta',
                    run: async () => ({}),
                },
            },
        });

        // Inject fetch for this assertion path by creating model via public API
        expect(resolved.source).toBe('llm');
        expect(resolved.timeoutMs).toBe(LLM_TIMEOUT_MS);
        expect(resolved.maxIterations).toBeGreaterThanOrEqual(8);
        expect(typeof resolved.model).toBe('function');

        // Local card gen gets a higher LLM iteration budget
        const cards = resolveReadingAgentModel('card_generation_agent', {
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'test-key',
            model: 'grok-4.5',
        }, { preferLlm: true });
        expect(cards.source).toBe('llm');
        expect(cards.maxIterations).toBeGreaterThanOrEqual(10);

        void fetchMock;
    });

    it('falls back to local when preferLlm but config incomplete', () => {
        const resolved = resolveReadingAgentModel('attention_agent', {
            baseUrl: 'http://127.0.0.1:8317/v1',
            model: 'grok-4.5',
        }, { preferLlm: true });

        expect(resolved.source).toBe('local');
        expect(resolved.timeoutMs).toBe(LOCAL_TIMEOUT_MS);
    });

    it('resolves local models for knowledge_qa, critic, memory_curator, and note_export', () => {
        for (const taskType of [
            'knowledge_qa_agent',
            'critic_agent',
            'memory_curator_agent',
            'note_export_agent',
        ]) {
            const resolved = resolveReadingAgentModel(taskType, null, { preferLlm: false });
            expect(resolved.source).toBe('local');
            expect(typeof resolved.model).toBe('function');
            expect(resolved.timeoutMs).toBe(LOCAL_TIMEOUT_MS);
            expect(resolved.maxIterations).toBeGreaterThanOrEqual(4);
        }
    });

    it('appends options.lessonsPrompt to the LLM system prompt', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        role: 'assistant',
                        content: 'done',
                    },
                }],
            }),
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchMock;

        try {
            const lessons = 'Lessons from past failed runs:\n- Only call registered tools.';
            const resolved = resolveReadingAgentModel('paper_overview_agent', {
                baseUrl: 'http://127.0.0.1:8317/v1',
                apiKey: 'test-key',
                model: 'grok-4.5',
            }, {
                preferLlm: true,
                lessonsPrompt: lessons,
            });

            expect(resolved.source).toBe('llm');
            await resolved.model({ goal: 'Overview', trace: [] });

            expect(fetchMock).toHaveBeenCalled();
            const body = JSON.parse(fetchMock.mock.calls[0][1].body);
            const system = body.messages.find((m) => m.role === 'system');
            expect(system.content).toContain('Only call registered tools.');
            expect(system.content).toContain('Lessons from past failed runs');
            expect(system.content).toMatch(/Paper Overview|reading agent|VibeReader/i);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('uses the single-source skill md prompt via buildSystemPromptForSkill', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        role: 'assistant',
                        content: 'ok',
                    },
                }],
            }),
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchMock;

        try {
            const resolved = resolveReadingAgentModel('knowledge_qa_agent', {
                baseUrl: 'http://127.0.0.1:8317/v1',
                apiKey: 'test-key',
                model: 'grok-4.5',
            }, { preferLlm: true });

            expect(resolved.source).toBe('llm');
            await resolved.model({ goal: 'Answer', trace: [] });

            const body = JSON.parse(fetchMock.mock.calls[0][1].body);
            const system = body.messages.find((m) => m.role === 'system');
            // 单一来源：skills 注册表内联的技能 md（?raw），不再有硬编码兜底表
            expect(system.content).toContain('Knowledge QA Agent');
            expect(system.content).toContain('knowledge_search');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('appends optional skillDocument into the LLM system prompt (progressive disclosure)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        role: 'assistant',
                        content: 'ok',
                    },
                }],
            }),
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchMock;

        try {
            const skillDocument = [
                '## Procedure',
                '1. Read metadata.',
                '2. Retrieve bounded chunks around abstract/method/results.',
                'UNIQUE_SKILL_MD_MARKER: section signals required.',
            ].join('\n');

            const resolved = resolveReadingAgentModel('paper_overview_agent', {
                baseUrl: 'http://127.0.0.1:8317/v1',
                apiKey: 'test-key',
                model: 'grok-4.5',
            }, {
                preferLlm: true,
                skillDocument,
            });

            expect(resolved.source).toBe('llm');
            await resolved.model({ goal: 'Overview', trace: [] });

            const body = JSON.parse(fetchMock.mock.calls[0][1].body);
            const system = body.messages.find((m) => m.role === 'system');
            expect(system.content).toContain('Paper Overview Agent');
            expect(system.content).toContain('Skill document (docs/reading-agent-skills/paper-overview.md)');
            expect(system.content).toContain('UNIQUE_SKILL_MD_MARKER');
            // 无 skillDocument 注入时：仅注册表 md（无注入文档块）
            const embedOnly = resolveReadingAgentModel('paper_overview_agent', {
                baseUrl: 'http://127.0.0.1:8317/v1',
                apiKey: 'test-key',
                model: 'grok-4.5',
            }, { preferLlm: true });
            await embedOnly.model({ goal: 'Overview', trace: [] });
            const embedBody = JSON.parse(fetchMock.mock.calls[1][1].body);
            const embedSystem = embedBody.messages.find((m) => m.role === 'system');
            expect(embedSystem.content).toContain('Paper Overview Agent');
            expect(embedSystem.content).not.toContain('UNIQUE_SKILL_MD_MARKER');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

describe('appendLessonsToSystemPrompt', () => {
    it('leaves base prompt unchanged without lessons', () => {
        expect(appendLessonsToSystemPrompt(DEFAULT_SYSTEM_PROMPT, '')).toBe(DEFAULT_SYSTEM_PROMPT);
    });

    it('joins base and lessons with a blank line', () => {
        expect(appendLessonsToSystemPrompt('Base.', 'Lessons:\n- a')).toBe('Base.\n\nLessons:\n- a');
    });
});
