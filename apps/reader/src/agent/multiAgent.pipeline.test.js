/**
 * Offline integration: runDeepReadPipeline with local deterministic models.
 * No network, no mocked runAgent - real runtime loop + createReadingTools.
 */
import { describe, expect, it, vi } from 'vitest';
import { runDeepReadPipeline } from './multiAgent';
import { buildReadingAgentPermissions } from './readingAgentOptions';
import {
    createLocalAttentionRouteModel,
    createLocalCardGenerationModel,
    createLocalCriticModel,
    createLocalPaperOverviewModel,
} from './readingTaskModels';
import { runReadingAgent } from './runtime';
import { createReadingTools } from './tools';

function sampleDocument(id = 'doc-pipeline-offline') {
    return {
        id,
        name: 'pipeline-sample.md',
        kind: 'markdown',
        contentText: [
            'Problem: the paper defines a concrete research question and motivation.',
            'Method: the paper explains an identification strategy and model design.',
            'Evidence: the paper reports a result and robustness check.',
            'Limitation: the paper warns about external validity constraints.',
        ].join('\n\n'),
    };
}

function createModelForSkill(skillType) {
    if (skillType === 'paper_overview_agent') return createLocalPaperOverviewModel();
    if (skillType === 'attention_agent') return createLocalAttentionRouteModel();
    if (skillType === 'card_generation_agent') return createLocalCardGenerationModel();
    if (skillType === 'critic_agent') return createLocalCriticModel();
    throw new Error(`unexpected skill for offline pipeline: ${skillType}`);
}

function permissionsBySkill() {
    return {
        paper_overview_agent: buildReadingAgentPermissions('paper_overview_agent'),
        attention_agent: buildReadingAgentPermissions('attention_agent'),
        card_generation_agent: buildReadingAgentPermissions('card_generation_agent'),
        critic_agent: buildReadingAgentPermissions('critic_agent'),
    };
}

function recordingRunAgent(goals) {
    return async (options) => {
        goals.push(options.goal || '');
        return runReadingAgent(options);
    };
}

describe('runDeepReadPipeline offline (local models)', () => {
    it('runs overview → attention → cards (mock create_vibecard) and injects prior goals', async () => {
        const document = sampleDocument();
        const createdCards = [];
        const createVibeCard = vi.fn(async (card) => {
            const saved = {
                id: `card-${createdCards.length + 1}`,
                ...card,
            };
            createdCards.push(saved);
            return saved;
        });
        const tools = createReadingTools({ document }, { createVibeCard });
        const goals = [];

        const result = await runDeepReadPipeline({
            document,
            createModelForSkill,
            tools,
            permissionsBySkill: permissionsBySkill(),
            runAgent: recordingRunAgent(goals),
            timeoutMs: 5000,
            enableCritic: false,
        });

        expect(result.status).toBe('completed');
        expect(result.steps.map((step) => step.skill)).toEqual([
            'paper_overview_agent',
            'attention_agent',
            'card_generation_agent',
        ]);
        expect(result.steps.every((step) => step.status === 'completed')).toBe(true);

        expect(result.steps[0].content).toContain('# Paper overview');
        expect(result.steps[1].content).toContain('# Attention route');
        expect(result.steps[2].content).toContain('Created 3 source-grounded VibeCards.');

        expect(createVibeCard).toHaveBeenCalledTimes(3);
        expect(createdCards.every((card) => card.documentId === document.id)).toBe(true);
        expect(createdCards.every((card) => card.sourceText)).toBe(true);

        // Prior pipeline outputs are injected into later skill goals only.
        expect(goals).toHaveLength(3);
        expect(goals[0]).not.toContain('Prior pipeline outputs:');
        expect(goals[1]).toContain('Prior pipeline outputs:');
        expect(goals[1]).toContain('[paper_overview_agent]');
        expect(goals[1]).toContain('# Paper overview');
        expect(goals[2]).toContain('Prior pipeline outputs:');
        expect(goals[2]).toContain('[paper_overview_agent]');
        expect(goals[2]).toContain('[attention_agent]');
        expect(goals[2]).toContain('# Attention route');
    });

    it('optionally runs critic after completed card_generation', async () => {
        const document = sampleDocument('doc-pipeline-critic');
        const createVibeCard = vi.fn(async (card) => ({
            id: `card-${Math.random().toString(36).slice(2, 8)}`,
            ...card,
        }));
        const tools = createReadingTools({ document }, { createVibeCard });
        const goals = [];
        const onStep = vi.fn();

        const result = await runDeepReadPipeline({
            document,
            createModelForSkill,
            tools,
            permissionsBySkill: permissionsBySkill(),
            runAgent: recordingRunAgent(goals),
            onStep,
            timeoutMs: 5000,
            enableCritic: true,
        });

        expect(result.status).toBe('completed');
        expect(result.steps.map((step) => step.skill)).toEqual([
            'paper_overview_agent',
            'attention_agent',
            'card_generation_agent',
            'critic_agent',
        ]);
        expect(result.steps.every((step) => step.status === 'completed')).toBe(true);

        const criticStep = result.steps.find((step) => step.skill === 'critic_agent');
        expect(criticStep.content).toContain('# Claim critique');
        expect(criticStep.content).toMatch(/Verdict:/);

        expect(createVibeCard).toHaveBeenCalledTimes(3);
        // 3 pipeline skills + critic pass
        expect(goals).toHaveLength(4);
        expect(goals[3]).toContain('Re-check the claims');
        expect(goals[3]).toContain('# Paper overview');
        expect(onStep).toHaveBeenCalledTimes(4);
    });

    it('keeps critic optional: enableCritic false never schedules critic_agent', async () => {
        const document = sampleDocument('doc-pipeline-no-critic');
        const createVibeCard = vi.fn(async (card) => ({ id: 'card-x', ...card }));
        const tools = createReadingTools({ document }, { createVibeCard });
        const createModel = vi.fn(createModelForSkill);

        const result = await runDeepReadPipeline({
            document,
            createModelForSkill: createModel,
            tools,
            permissionsBySkill: permissionsBySkill(),
            runAgent: runReadingAgent,
            timeoutMs: 5000,
            enableCritic: false,
        });

        expect(result.steps.map((step) => step.skill)).not.toContain('critic_agent');
        expect(createModel).not.toHaveBeenCalledWith('critic_agent');
        expect(createModel.mock.calls.map((call) => call[0])).toEqual([
            'paper_overview_agent',
            'attention_agent',
            'card_generation_agent',
        ]);
    });
});
