import { describe, expect, it } from 'vitest';
import {
    createTrajectoryRecorder,
    formatTrajectoryForPrompt,
    summarizeTrace,
} from './trajectory';

describe('createTrajectoryRecorder', () => {
    it('appends events with id, ts, type, and summary', () => {
        const recorder = createTrajectoryRecorder();
        const entry = recorder.append({
            type: 'tool',
            toolName: 'search_document',
            iteration: 1,
            summary: 'Searched for claim',
            detail: { hits: 3 },
        });

        expect(entry.id).toMatch(/^traj-/);
        expect(entry.ts).toBeTypeOf('number');
        expect(entry.type).toBe('tool');
        expect(entry.toolName).toBe('search_document');
        expect(entry.iteration).toBe(1);
        expect(entry.summary).toBe('Searched for claim');
        expect(entry.detail).toEqual({ hits: 3 });
        expect(recorder.list()).toHaveLength(1);
        expect(Object.isFrozen(entry)).toBe(true);
    });

    it('caps entries at maxEntries (keeps newest)', () => {
        const recorder = createTrajectoryRecorder({ maxEntries: 3 });
        recorder.append({ summary: 'a' });
        recorder.append({ summary: 'b' });
        recorder.append({ summary: 'c' });
        recorder.append({ summary: 'd' });

        const list = recorder.list();
        expect(list).toHaveLength(3);
        expect(list.map((e) => e.summary)).toEqual(['b', 'c', 'd']);
    });

    it('toJSON returns plain serializable objects and clear empties', () => {
        const recorder = createTrajectoryRecorder();
        recorder.append({ type: 'model', summary: 'step' });
        const json = recorder.toJSON();
        expect(json).toEqual([
            expect.objectContaining({ type: 'model', summary: 'step' }),
        ]);
        expect(Object.isFrozen(json[0])).toBe(false);

        recorder.clear();
        expect(recorder.list()).toEqual([]);
    });

    it('rejects empty summary', () => {
        const recorder = createTrajectoryRecorder();
        expect(() => recorder.append({ type: 'note' })).toThrow(/summary/i);
    });
});

describe('summarizeTrace', () => {
    it('summarizes runtime model and tool steps', () => {
        const trace = [
            {
                type: 'model',
                iteration: 1,
                response: { type: 'tool_call', toolName: 'get_page_text', args: { page: 1 } },
            },
            {
                type: 'tool',
                iteration: 1,
                toolName: 'get_page_text',
                args: { page: 1 },
                result: { text: 'Hello' },
            },
            {
                type: 'model',
                iteration: 2,
                response: { type: 'final', content: 'Done with analysis of the claim.' },
            },
        ];

        const summary = summarizeTrace(trace);
        expect(summary).toHaveLength(3);
        expect(summary[0].kind).toBe('model');
        expect(summary[0].summary).toContain('tool_call get_page_text');
        expect(summary[1].kind).toBe('tool');
        expect(summary[1].toolName).toBe('get_page_text');
        expect(summary[1].status).toBe('ok');
        expect(summary[2].summary).toContain('final');
        expect(summary[2].summary).toContain('Done with analysis');
    });

    it('passes through trajectory events with summary', () => {
        const summary = summarizeTrace([
            { type: 'note', summary: 'user started run' },
        ]);
        expect(summary[0].summary).toBe('user started run');
        expect(summary[0].kind).toBe('note');
    });
});

describe('formatTrajectoryForPrompt', () => {
    it('formats events into numbered lines', () => {
        const text = formatTrajectoryForPrompt([
            { type: 'model', iteration: 1, summary: 'called search' },
            { type: 'tool', iteration: 1, toolName: 'search_document', summary: '3 hits' },
        ]);

        expect(text).toContain('1. [i1|model] called search');
        expect(text).toContain('2. [i1|tool|search_document] 3 hits');
    });

    it('prefers latest events when over maxChars', () => {
        const events = Array.from({ length: 20 }, (_, i) => ({
            summary: `event-${i} ${'x'.repeat(40)}`,
            type: 'note',
        }));

        const text = formatTrajectoryForPrompt(events, { maxChars: 200 });
        expect(text.length).toBeLessThanOrEqual(200);
        expect(text).toContain('event-19');
        expect(text).not.toContain('event-0');
    });

    it('returns empty string for empty input', () => {
        expect(formatTrajectoryForPrompt([])).toBe('');
        expect(formatTrajectoryForPrompt(null)).toBe('');
    });
});
