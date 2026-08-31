import { describe, expect, it, vi } from 'vitest';
import {
    INSIGHT_TYPES,
    analyzeKeyInsights,
    findParagraphIdByLocation,
    groupInsightsByPage,
} from './attentionNavigator';

const paragraphs = [
    {
        id: 'p1-0',
        page: 1,
        text: 'We introduce a novel reading agent that routes attention to important passages.',
    },
    {
        id: 'p1-1',
        page: 1,
        text: 'Our method combines paragraph extraction with a ranking heuristic for academic papers.',
    },
    {
        id: 'p2-0',
        page: 2,
        text: 'Compared with the baseline, the proposed interface reduces search time.',
    },
    {
        id: 'p2-1',
        page: 2,
        text: 'An unexpected anomaly appears in the ablation result for longer papers.',
    },
    {
        id: 'p3-0',
        page: 3,
        text: 'The limitation is that small samples still need careful manual verification.',
    },
];

describe('INSIGHT_TYPES', () => {
    it('defines the four supported attention navigator types with stable display metadata', () => {
        expect(INSIGHT_TYPES).toEqual({
            INNOVATION: { key: 'innovation', label: '创新点', color: '#52c41a' },
            METHOD: { key: 'method', label: '方法亮点', color: '#1890ff' },
            ANOMALY: { key: 'anomaly', label: '实验反常', color: '#fa8c16' },
            COMPARISON: { key: 'comparison', label: '关键对比', color: '#722ed1' },
        });
    });
});

describe('findParagraphIdByLocation', () => {
    it('finds a paragraph id by one-based page and zero-based paragraph index within that page', () => {
        expect(findParagraphIdByLocation(1, 1, paragraphs)).toBe('p1-1');
        expect(findParagraphIdByLocation(2, 0, paragraphs)).toBe('p2-0');
    });

    it('returns null for invalid pages, indexes, or paragraph collections', () => {
        expect(findParagraphIdByLocation(2, 9, paragraphs)).toBeNull();
        expect(findParagraphIdByLocation(9, 0, paragraphs)).toBeNull();
        expect(findParagraphIdByLocation(1, 0, null)).toBeNull();
    });
});

describe('groupInsightsByPage', () => {
    it('groups valid insights by numeric page while preserving their order', () => {
        const grouped = groupInsightsByPage([
            { id: 'a', location: { page: 2, paragraph: 0 } },
            { id: 'b', location: { page: 1, paragraph: 0 } },
            { id: 'c', location: { page: 2, paragraph: 1 } },
            { id: 'bad', location: { page: '2', paragraph: 0 } },
        ]);

        expect(grouped).toBeInstanceOf(Map);
        expect([...grouped.keys()]).toEqual([2, 1]);
        expect(grouped.get(2).map((insight) => insight.id)).toEqual(['a', 'c']);
        expect(grouped.get(1).map((insight) => insight.id)).toEqual(['b']);
    });
});

describe('analyzeKeyInsights', () => {
    it('returns three to five normalized local insights without requiring model credentials', async () => {
        const onProgress = vi.fn();
        const insights = await analyzeKeyInsights(
            paragraphs.map((paragraph) => paragraph.text).join('\n\n'),
            paragraphs,
            onProgress
        );

        expect(insights.length).toBeGreaterThanOrEqual(3);
        expect(insights.length).toBeLessThanOrEqual(5);
        expect(new Set(insights.map((insight) => insight.type))).toEqual(
            new Set(['innovation', 'method', 'comparison', 'anomaly'])
        );
        expect(insights).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'innovation',
                    paragraphId: 'p1-0',
                    location: { page: 1, paragraph: 0 },
                    description: expect.any(String),
                }),
            ])
        );
        expect(onProgress).toHaveBeenCalledWith(expect.stringMatching(/分析|本地|完成/));
    });

    it('normalizes valid model JSON and drops insights that do not map to paragraphs', async () => {
        const modelClient = vi.fn().mockResolvedValue(JSON.stringify([
            {
                type: 'method',
                location: { page: 1, paragraph: 1 },
                description: 'This paragraph explains how the method works.',
            },
            {
                type: 'unsupported',
                location: { page: 1, paragraph: 0 },
                description: 'Unsupported type should be ignored.',
            },
            {
                type: 'innovation',
                location: { page: 99, paragraph: 0 },
                description: 'Missing paragraph should be ignored.',
            },
        ]));

        const insights = await analyzeKeyInsights('full paper text', paragraphs, null, {
            modelClient,
        });

        expect(modelClient).toHaveBeenCalledTimes(1);
        expect(insights).toEqual([
            expect.objectContaining({
                type: 'method',
                typeLabel: '方法亮点',
                typeColor: '#1890ff',
                paragraphId: 'p1-1',
                location: { page: 1, paragraph: 1 },
                description: 'This paragraph explains how the method works.',
            }),
        ]);
    });

    it('falls back to local analysis when model JSON is invalid', async () => {
        const modelClient = vi.fn().mockResolvedValue('not json');

        const insights = await analyzeKeyInsights('full paper text', paragraphs, null, {
            modelClient,
        });

        expect(modelClient).toHaveBeenCalledTimes(1);
        expect(insights.length).toBeGreaterThanOrEqual(3);
        expect(insights.every((insight) => insight.paragraphId)).toBe(true);
    });

    it('returns an empty list for invalid input instead of throwing', async () => {
        await expect(analyzeKeyInsights('', paragraphs)).resolves.toEqual([]);
        await expect(analyzeKeyInsights('paper text', [])).resolves.toEqual([]);
        await expect(analyzeKeyInsights('paper text', null)).resolves.toEqual([]);
    });
});
