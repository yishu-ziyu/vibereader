import { describe, expect, it, vi } from 'vitest';
import { DOCUMENT_QA_SKILL_TYPE, runDocumentQaAgent } from './documentQa';

const SAMPLE_DOC = Object.freeze({
    id: 'doc-qa-1',
    name: 'Methods paper',
    contentText: [
        '[page:1]',
        'Abstract. We study self-attention for document retrieval.',
        '',
        '[page:2]',
        'Method. The attention route ranks reading positions by evidence density.',
        'Results. Knowledge search improves grounded answers.',
    ].join('\n'),
});

describe('runDocumentQaAgent', () => {
    it('rejects missing document id', async () => {
        const result = await runDocumentQaAgent(null, 'What is the method?');
        expect(result).toEqual(expect.objectContaining({
            status: 'invalid',
            error: expect.stringContaining('document'),
            skillType: DOCUMENT_QA_SKILL_TYPE,
            agentResult: null,
        }));
        expect(result.sourceRefs).toEqual([]);
    });

    it('rejects empty question', async () => {
        const result = await runDocumentQaAgent(SAMPLE_DOC, '   ');
        expect(result).toEqual(expect.objectContaining({
            status: 'invalid',
            error: expect.stringContaining('question'),
            skillType: DOCUMENT_QA_SKILL_TYPE,
        }));
    });

    it('sets goal to the user question and runs knowledge_qa options', async () => {
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'Grounded answer about attention.',
            sourceRefs: [{ page: 2, text: 'attention route' }],
        });
        const createOptions = vi.fn().mockReturnValue({
            goal: 'static skill goal',
            model: vi.fn(),
            tools: { knowledge_search: vi.fn() },
            permissions: { canSearchKnowledge: true },
            maxIterations: 6,
            timeoutMs: 30000,
        });

        const result = await runDocumentQaAgent(
            SAMPLE_DOC,
            'How does the attention route work?',
            null,
            {
                runAgent,
                createOptions,
                useLlm: false,
                uniRagAvailable: false,
            },
        );

        expect(createOptions).toHaveBeenCalledWith(
            'knowledge_qa_agent',
            SAMPLE_DOC,
            expect.objectContaining({
                useLlm: false,
                modelConfig: null,
            }),
        );
        expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({
            goal: 'How does the attention route work?',
            model: expect.any(Function),
            tools: expect.objectContaining({ knowledge_search: expect.any(Function) }),
            permissions: expect.objectContaining({ canSearchKnowledge: true }),
        }));
        expect(result).toEqual(expect.objectContaining({
            status: 'completed',
            content: 'Grounded answer about attention.',
            skillType: 'knowledge_qa_agent',
            goal: 'How does the attention route work?',
            sourceRefs: [{ page: 2, text: 'attention route' }],
        }));
    });

    it('prefers LLM when modelConfig is runnable unless useLlm is false', async () => {
        const createOptions = vi.fn().mockReturnValue({
            goal: 'skill',
            model: vi.fn(),
            tools: {},
            permissions: {},
        });
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'ok',
            sourceRefs: [],
        });
        const modelConfig = {
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'test-key',
            model: 'grok-4.5',
        };

        await runDocumentQaAgent(SAMPLE_DOC, 'What are the results?', modelConfig, {
            createOptions,
            runAgent,
            uniRagAvailable: true,
        });

        expect(createOptions).toHaveBeenCalledWith(
            'knowledge_qa_agent',
            SAMPLE_DOC,
            expect.objectContaining({
                useLlm: true,
                modelConfig,
            }),
        );

        createOptions.mockClear();
        await runDocumentQaAgent(SAMPLE_DOC, 'What are the results?', modelConfig, {
            createOptions,
            runAgent,
            useLlm: false,
        });

        expect(createOptions).toHaveBeenCalledWith(
            'knowledge_qa_agent',
            SAMPLE_DOC,
            expect.objectContaining({ useLlm: false }),
        );
    });

    it('returns error when options cannot be built', async () => {
        const result = await runDocumentQaAgent(SAMPLE_DOC, 'Anything?', null, {
            createOptions: () => null,
            runAgent: vi.fn(),
        });
        expect(result.status).toBe('error');
        expect(result.error).toMatch(/options/i);
        expect(result.agentResult).toBeNull();
    });

    it('forwards groundingGate/mode into createOptions (product warn default path)', async () => {
        const createOptions = vi.fn().mockReturnValue({
            goal: 'skill',
            model: vi.fn(),
            tools: {},
            permissions: {},
            groundingMode: 'warn',
            requireSourceRefsForClaims: true,
        });
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'ok',
            sourceRefs: [],
        });
        const modelConfig = {
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'test-key',
            model: 'grok-4.5',
        };

        await runDocumentQaAgent(SAMPLE_DOC, 'Grounded question?', modelConfig, {
            createOptions,
            runAgent,
            groundingMode: 'warn',
        });
        expect(createOptions).toHaveBeenCalledWith(
            'knowledge_qa_agent',
            SAMPLE_DOC,
            expect.objectContaining({
                useLlm: true,
                groundingMode: 'warn',
            }),
        );
        expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({
            groundingMode: 'warn',
            requireSourceRefsForClaims: true,
        }));

        createOptions.mockClear();
        createOptions.mockReturnValue({
            goal: 'skill',
            model: vi.fn(),
            tools: {},
            permissions: {},
        });
        await runDocumentQaAgent(SAMPLE_DOC, 'Quiet offline?', modelConfig, {
            createOptions,
            runAgent,
            groundingGate: false,
        });
        expect(createOptions).toHaveBeenCalledWith(
            'knowledge_qa_agent',
            SAMPLE_DOC,
            expect.objectContaining({ groundingGate: false }),
        );
    });

    it('product createReadingAgentOptions defaults llm documentQa path to warn', async () => {
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'Answer with evidence.',
            sourceRefs: [{ page: 1, text: 'evidence' }],
        });
        const modelConfig = {
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'test-key',
            model: 'grok-4.5',
        };

        await runDocumentQaAgent(SAMPLE_DOC, 'What is the method?', modelConfig, {
            runAgent,
            uniRagAvailable: false,
        });

        expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({
            goal: 'What is the method?',
            groundingMode: 'warn',
            includeObservability: true,
            requireSourceRefsForClaims: true,
        }));
    });

    it('explicit groundingGate false keeps documentQa options ungated', async () => {
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'Answer.',
            sourceRefs: [],
        });
        const modelConfig = {
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'test-key',
            model: 'grok-4.5',
        };

        await runDocumentQaAgent(SAMPLE_DOC, 'Quiet mock?', modelConfig, {
            runAgent,
            uniRagAvailable: false,
            groundingGate: false,
        });

        const call = runAgent.mock.calls[0][0];
        expect(call.groundingMode).toBeUndefined();
        expect(call.requireSourceRefsForClaims).toBeUndefined();
    });

    it('runs offline local knowledge_qa against document tools', async () => {
        const result = await runDocumentQaAgent(
            SAMPLE_DOC,
            'What is the attention route method?',
            null,
            {
                useLlm: false,
                uniRagAvailable: false,
            },
        );

        expect(result.status).toBe('completed');
        expect(result.skillType).toBe('knowledge_qa_agent');
        expect(result.goal).toBe('What is the attention route method?');
        expect(result.content).toMatch(/Knowledge answer|attention|Grounded|Insufficient/i);
        expect(Array.isArray(result.sourceRefs)).toBe(true);
        expect(result.agentResult?.status).toBe('completed');
        // Local path should have used document tools (search or knowledge_search).
        const toolNames = (result.agentResult?.trace || [])
            .filter((step) => step.type === 'tool' || step.toolName)
            .map((step) => step.toolName)
            .filter(Boolean);
        const usedTools = new Set(toolNames);
        expect(
            usedTools.has('get_current_document')
            || usedTools.has('knowledge_search')
            || usedTools.has('search_document'),
        ).toBe(true);
    });
});
