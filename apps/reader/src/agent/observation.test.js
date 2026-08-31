import { describe, expect, it } from 'vitest';
import {
    buildStatusBar,
    formatToolObservation,
} from './observation';

describe('formatToolObservation', () => {
    it('formats string results with tool name header', () => {
        const text = formatToolObservation('get_page_text', 'Page body here');
        expect(text).toBe('Tool result: get_page_text\nPage body here');
    });

    it('JSON-stringifies object results', () => {
        const text = formatToolObservation('search_document', { hits: 2, q: 'claim' });
        expect(text).toContain('Tool result: search_document');
        expect(text).toContain('"hits": 2');
        expect(text).toContain('"q": "claim"');
    });

    it('truncates to maxChars', () => {
        const text = formatToolObservation('extractText', 'x'.repeat(500), { maxChars: 80 });
        expect(text.length).toBeLessThanOrEqual(80);
        expect(text.startsWith('Tool result: extractText\n')).toBe(true);
        expect(text.endsWith('…')).toBe(true);
    });

    it('handles empty result', () => {
        const text = formatToolObservation('listAnnotations', null);
        expect(text).toContain('(empty)');
    });
});

describe('buildStatusBar', () => {
    it('builds a short status line with iteration, tool, and goal', () => {
        const line = buildStatusBar({
            iteration: 2,
            maxIterations: 4,
            goal: 'Summarize the abstract',
            lastTool: 'get_page_text',
        });

        expect(line).toBe('iter 2/4 · last: get_page_text · goal: Summarize the abstract');
    });

    it('truncates long goals', () => {
        const line = buildStatusBar({
            iteration: 1,
            maxIterations: 6,
            goal: 'A'.repeat(80),
        });

        expect(line).toContain('iter 1/6');
        expect(line).toContain('goal:');
        expect(line.length).toBeLessThan(120);
        expect(line).toContain('…');
    });

    it('works without optional fields', () => {
        expect(buildStatusBar({ iteration: 0, maxIterations: 0 })).toBe('iter 0');
    });
});
