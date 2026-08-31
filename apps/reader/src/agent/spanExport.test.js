import { describe, expect, it } from 'vitest';
import {
    exportAgentSpans,
    exportAgentSpansJson,
    isRetrievalTool,
    serializeAgentSpans,
    toolStatusFromResult,
} from './spanExport';

describe('isRetrievalTool / toolStatusFromResult', () => {
    it('flags knowledge/memory/document search tools', () => {
        expect(isRetrievalTool('knowledge_search')).toBe(true);
        expect(isRetrievalTool('memory_search')).toBe(true);
        expect(isRetrievalTool('search_document')).toBe(true);
        expect(isRetrievalTool('get_page_text')).toBe(false);
    });

    it('maps tool result status', () => {
        expect(toolStatusFromResult({ text: 'ok' })).toBe('ok');
        expect(toolStatusFromResult({ error: 'boom' })).toBe('error');
        expect(toolStatusFromResult({ ok: false })).toBe('error');
        expect(toolStatusFromResult({ status: 'error' })).toBe('error');
        expect(toolStatusFromResult({ status: 'unavailable' })).toBe('error');
    });
});

describe('exportAgentSpans', () => {
    it('returns null for missing input', () => {
        expect(exportAgentSpans(null)).toBeNull();
        expect(exportAgentSpans(undefined)).toBeNull();
    });

    it('builds empty root for failed run with no trace', () => {
        const spans = exportAgentSpans({
            status: 'timeout',
            error: 'Reading agent timed out after 1000ms',
            iterations: 0,
            trace: [],
        });

        expect(spans.name).toBe('agent.run');
        expect(spans.status).toBe('error');
        expect(spans.attributes['agent.status']).toBe('timeout');
        expect(spans.attributes['agent.error']).toContain('timed out');
        expect(spans.children).toEqual([]);
        expect(Object.isFrozen(spans)).toBe(true);
    });

    it('builds empty root for completed run with empty trace', () => {
        const spans = exportAgentSpans({
            status: 'completed',
            iterations: 0,
            content: '',
            trace: [],
        });
        expect(spans.name).toBe('agent.run');
        expect(spans.status).toBe('ok');
        expect(spans.children).toHaveLength(0);
    });

    it('builds llm.iteration + tool.call + retrieval tree', () => {
        const result = {
            status: 'completed',
            iterations: 2,
            content: 'Answer grounded in sources.',
            goal: 'What is the claim?',
            metrics: {
                wallMs: 42,
                llmCallCount: 2,
                toolCallCount: 2,
            },
            trace: [
                {
                    type: 'model',
                    iteration: 1,
                    response: {
                        type: 'tool_call',
                        toolName: 'knowledge_search',
                        args: { query: 'claim' },
                    },
                },
                {
                    type: 'tool',
                    iteration: 1,
                    toolName: 'knowledge_search',
                    args: { query: 'claim' },
                    result: { matches: [{ id: 'm1' }, { id: 'm2' }] },
                    durationMs: 12,
                },
                {
                    type: 'tool',
                    iteration: 1,
                    toolName: 'get_page_text',
                    args: { page: 1 },
                    result: { text: 'Hello' },
                    durationMs: 3,
                },
                {
                    type: 'model',
                    iteration: 2,
                    response: { type: 'final', content: 'Answer grounded in sources.' },
                },
            ],
        };

        const spans = exportAgentSpans(result, { goal: 'What is the claim?' });

        expect(spans.name).toBe('agent.run');
        expect(spans.status).toBe('ok');
        expect(spans.durationMs).toBe(42);
        expect(spans.attributes['agent.iterations']).toBe(2);
        expect(spans.attributes['agent.goal']).toContain('claim');
        expect(spans.children).toHaveLength(2);

        const llm1 = spans.children[0];
        expect(llm1.name).toBe('llm.iteration');
        expect(llm1.attributes['llm.iteration']).toBe(1);
        expect(llm1.attributes['llm.response_type']).toBe('tool_call');
        expect(llm1.children).toHaveLength(2);

        const retrieval = llm1.children[0];
        expect(retrieval.name).toBe('retrieval');
        expect(retrieval.attributes['retrieval.tool']).toBe('knowledge_search');
        expect(retrieval.attributes['retrieval.match_count']).toBe(2);
        expect(retrieval.durationMs).toBe(12);
        expect(retrieval.status).toBe('ok');

        const toolCall = llm1.children[1];
        expect(toolCall.name).toBe('tool.call');
        expect(toolCall.attributes['tool.name']).toBe('get_page_text');
        expect(toolCall.durationMs).toBe(3);

        const llm2 = spans.children[1];
        expect(llm2.name).toBe('llm.iteration');
        expect(llm2.attributes['llm.response_type']).toBe('final');
        expect(llm2.children).toHaveLength(0);
    });

    it('marks failed tool spans as error', () => {
        const spans = exportAgentSpans({
            status: 'completed',
            iterations: 1,
            trace: [
                {
                    type: 'model',
                    iteration: 1,
                    response: { type: 'tool_call', toolName: 'memory_search', args: {} },
                },
                {
                    type: 'tool',
                    iteration: 1,
                    toolName: 'memory_search',
                    result: { status: 'unavailable', error: 'backend down' },
                },
            ],
        });

        const retrieval = spans.children[0].children[0];
        expect(retrieval.name).toBe('retrieval');
        expect(retrieval.status).toBe('error');
        expect(retrieval.attributes['tool.status']).toBe('error');
    });

    it('accepts taskRunner-style wrapper with agentResult', () => {
        const spans = exportAgentSpans({
            status: 'failed',
            errorMessage: 'outer',
            agentResult: {
                status: 'permission_denied',
                error: 'Tool not allowed',
                iterations: 1,
                trace: [
                    {
                        type: 'model',
                        iteration: 1,
                        response: { type: 'tool_call', toolName: 'export_note', args: {} },
                    },
                ],
            },
        });

        expect(spans.status).toBe('error');
        expect(spans.attributes['agent.status']).toBe('permission_denied');
        expect(spans.attributes['agent.error']).toContain('not allowed');
        expect(spans.children).toHaveLength(1);
        expect(spans.children[0].name).toBe('llm.iteration');
    });

    it('serializes to JSON', () => {
        const spans = exportAgentSpans({
            status: 'completed',
            iterations: 1,
            trace: [
                {
                    type: 'model',
                    iteration: 1,
                    response: { type: 'final', content: 'ok' },
                },
            ],
        });
        const json = serializeAgentSpans(spans);
        const parsed = JSON.parse(json);
        expect(parsed.name).toBe('agent.run');
        expect(parsed.children[0].name).toBe('llm.iteration');

        expect(exportAgentSpansJson(null)).toBe('null');
        expect(JSON.parse(exportAgentSpansJson({ status: 'completed', trace: [] })).name)
            .toBe('agent.run');
    });
});
