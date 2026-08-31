import { describe, expect, it } from 'vitest';
import {
    compressPackedContext,
    compressTraceForModel,
    estimateTokens,
} from './contextCompression';

describe('estimateTokens', () => {
    it('uses chars/4 like contextPacker', () => {
        expect(estimateTokens('12345678')).toBe(2);
        expect(estimateTokens('')).toBe(0);
        expect(estimateTokens('abcd')).toBe(1);
    });
});

describe('compressTraceForModel', () => {
    const longResult = { text: 'y'.repeat(2000), meta: { a: 1, b: 2 } };

    it('keeps last two model steps and summarizes older tool results', () => {
        const trace = [
            {
                type: 'model',
                iteration: 1,
                response: { type: 'tool_call', toolName: 'search_document' },
            },
            {
                type: 'tool',
                iteration: 1,
                toolName: 'search_document',
                args: { q: 'claim' },
                result: longResult,
            },
            {
                type: 'model',
                iteration: 2,
                response: { type: 'tool_call', toolName: 'get_page_text' },
            },
            {
                type: 'tool',
                iteration: 2,
                toolName: 'get_page_text',
                args: { page: 1 },
                result: { text: 'short' },
            },
            {
                type: 'model',
                iteration: 3,
                response: { type: 'final', content: 'answer' },
            },
        ];

        const compressed = compressTraceForModel(trace, { maxTokens: 1500 });

        const models = compressed.filter((s) => s.type === 'model');
        expect(models.length).toBeGreaterThanOrEqual(2);
        expect(models[models.length - 1].response.type).toBe('final');
        expect(models[models.length - 2].response.toolName).toBe('get_page_text');

        const firstTool = compressed.find((s) => s.toolName === 'search_document');
        expect(firstTool.compressed).toBe(true);
        expect(firstTool.result).toMatchObject({
            toolName: 'search_document',
            status: 'ok',
            keys: expect.arrayContaining(['text', 'meta']),
        });
        expect(firstTool.result.snippet).toBeTypeOf('string');

        const latestTool = compressed.find((s) => s.toolName === 'get_page_text');
        expect(latestTool.compressed).toBeUndefined();
        expect(latestTool.result).toEqual({ text: 'short' });
    });

    it('summarizes large latest tool results too', () => {
        const trace = [
            {
                type: 'tool',
                iteration: 1,
                toolName: 'get_document_chunks',
                result: { chunks: Array.from({ length: 50 }, (_, i) => ({ id: i, text: 'z'.repeat(100) })) },
            },
        ];

        const compressed = compressTraceForModel(trace);
        expect(compressed[0].compressed).toBe(true);
        expect(compressed[0].result.keys).toContain('chunks');
    });

    it('stays near maxTokens when given a long trace', () => {
        const trace = [];
        for (let i = 1; i <= 12; i += 1) {
            trace.push({
                type: 'model',
                iteration: i,
                response: { type: 'tool_call', toolName: 'search_document', pad: 'p'.repeat(200) },
            });
            trace.push({
                type: 'tool',
                iteration: i,
                toolName: 'search_document',
                result: { text: 't'.repeat(400), n: i },
            });
        }

        const compressed = compressTraceForModel(trace, { maxTokens: 400 });
        const cost = estimateTokens(JSON.stringify(compressed));
        expect(cost).toBeLessThanOrEqual(500);
        expect(compressed.some((s) => s.type === 'model')).toBe(true);
    });

    it('returns empty array for empty trace', () => {
        expect(compressTraceForModel([])).toEqual([]);
    });
});

describe('compressPackedContext', () => {
    function chunk(type, id, text, tokenEstimate) {
        const label = `[${type}:${id}]`;
        return {
            type,
            id,
            label,
            text,
            tokenEstimate: tokenEstimate ?? estimateTokens(`${label}\n${text}`),
        };
    }

    it('drops lowest priority chunks first (body before goal/selection)', () => {
        const packed = {
            goal: 'Assess',
            chunks: [
                chunk('goal', 'user', 'Assess the paper', 20),
                chunk('metadata', 'doc', 'Document: paper', 20),
                chunk('selection', 's1', 'Selected claim', 20),
                chunk('outline', 'doc', '- Intro', 20),
                chunk('body', 'doc:0', 'Body text A', 40),
                chunk('body', 'doc:1', 'Body text B', 40),
            ],
            prompt: 'full',
            estimatedTokens: 160,
            maxTokens: 160,
            truncated: false,
        };

        const compressed = compressPackedContext(packed, { maxTokens: 80 });
        expect(compressed.estimatedTokens).toBeLessThanOrEqual(80);
        expect(compressed.truncated).toBe(true);
        const types = compressed.chunks.map((c) => c.type);
        expect(types).toContain('goal');
        expect(types).toContain('selection');
        expect(types).not.toContain('body');
    });

    it('returns packed unchanged when already under budget', () => {
        const packed = {
            chunks: [chunk('goal', 'user', 'short', 5)],
            estimatedTokens: 5,
            maxTokens: 100,
            truncated: false,
            prompt: '[goal:user]\nshort',
        };

        const compressed = compressPackedContext(packed, { maxTokens: 100 });
        expect(compressed.chunks).toHaveLength(1);
        expect(compressed.truncated).toBe(false);
    });

    it('passes through non-packed objects', () => {
        expect(compressPackedContext({ prompt: 'only' })).toEqual({ prompt: 'only' });
        expect(compressPackedContext(null)).toBe(null);
    });
});
