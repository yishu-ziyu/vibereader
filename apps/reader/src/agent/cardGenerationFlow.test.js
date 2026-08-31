import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_READING_PERMISSIONS } from './permissions';
import { createLocalCardGenerationModel } from './readingTaskModels';
import { runReadingAgent } from './runtime';
import { createReadingTools } from './tools';

function cardWritePermissions() {
    return {
        ...DEFAULT_READING_PERMISSIONS,
        allowedTools: [
            ...new Set([
                ...DEFAULT_READING_PERMISSIONS.allowedTools,
                'create_vibecard',
            ]),
        ],
        canWriteVibeCards: true,
    };
}

describe('Create VibeCard reading-agent flow', () => {
    it('runs the real local agent loop and persists three source-grounded VibeCards', async () => {
        const createdCards = [];
        const createVibeCard = vi.fn(async (card) => {
            const saved = {
                id: `card-${createdCards.length + 1}`,
                ...card,
            };
            createdCards.push(saved);
            return saved;
        });
        const document = {
            id: 'doc-flow',
            name: 'flow.md',
            kind: 'markdown',
            contentText: [
                'Problem: the paper defines a concrete research question and motivation.',
                'Method: the paper explains an identification strategy and model design.',
                'Evidence: the paper reports a result and robustness check.',
                'Limitation: the paper warns about external validity constraints.',
            ].join('\n\n'),
        };

        const result = await runReadingAgent({
            goal: 'Generate source-grounded VibeCards.',
            model: createLocalCardGenerationModel(),
            tools: createReadingTools({ document }, { createVibeCard }),
            permissions: cardWritePermissions(),
            maxIterations: 6,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('completed');
        expect(result.content).toContain('Created 3 source-grounded VibeCards.');
        expect(createVibeCard).toHaveBeenCalledTimes(3);
        expect(new Set(createdCards.map((card) => card.paragraphId))).toEqual(new Set([
            'chunk-1',
            'chunk-2',
            'chunk-3',
        ]));
        expect(createdCards.every((card) => card.documentId === 'doc-flow')).toBe(true);
        expect(createdCards.every((card) => card.sourceText && (card.page || card.paragraphId))).toBe(true);
        expect(result.sourceRefs).toHaveLength(3);
    });
});
