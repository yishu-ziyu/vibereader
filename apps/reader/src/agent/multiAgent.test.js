import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_READING_PERMISSIONS } from './permissions';
import {
    DEEP_READ_SKILL_ORDER,
    runCriticPass,
    runDeepReadPipeline,
} from './multiAgent';

function completedResult(content, sourceRefs = []) {
    return {
        status: 'completed',
        content,
        sourceRefs,
        artifacts: [],
        artifact: null,
        trace: [],
        iterations: 1,
    };
}

function failedResult(status = 'error', error = 'boom') {
    return {
        status,
        error,
        trace: [],
        iterations: 0,
    };
}

describe('runDeepReadPipeline', () => {
    it('exposes the default deep-read skill order', () => {
        expect(DEEP_READ_SKILL_ORDER).toEqual([
            'paper_overview_agent',
            'attention_agent',
            'card_generation_agent',
        ]);
    });

    it('runs skills sequentially and returns completed when all steps succeed', async () => {
        const calls = [];
        const runAgent = vi.fn(async ({ goal, model }) => {
            calls.push(goal);
            const response = await model({ iteration: 1, trace: [] });
            return completedResult(response.content, response.sourceRefs || []);
        });
        const createModelForSkill = vi.fn((skillType) => async () => ({
            type: 'final',
            content: `ok:${skillType}`,
            sourceRefs: [{ documentId: 'doc-1', page: 1, text: skillType }],
        }));
        const onStep = vi.fn();

        const result = await runDeepReadPipeline({
            document: { id: 'doc-1', name: 'paper.md' },
            createModelForSkill,
            tools: {},
            permissionsBySkill: {
                paper_overview_agent: DEFAULT_READING_PERMISSIONS,
            },
            runAgent,
            onStep,
        });

        expect(result.status).toBe('completed');
        expect(result.steps).toHaveLength(3);
        expect(result.steps.map((step) => step.skill)).toEqual([
            'paper_overview_agent',
            'attention_agent',
            'card_generation_agent',
        ]);
        expect(result.steps.every((step) => step.status === 'completed')).toBe(true);
        expect(result.sourceRefs).toHaveLength(3);
        expect(createModelForSkill).toHaveBeenCalledTimes(3);
        expect(runAgent).toHaveBeenCalledTimes(3);
        expect(onStep).toHaveBeenCalledTimes(3);
        expect(calls[1]).toContain('ok:paper_overview_agent');
    });

    it('returns partial when some steps fail but at least one completed', async () => {
        const runAgent = vi.fn(async ({ model }) => {
            const response = await model({ iteration: 1, trace: [] });
            if (response?.type === 'fail') return failedResult('error', 'model failed');
            return completedResult(response.content || 'ok');
        });
        const createModelForSkill = vi.fn((skillType) => async () => {
            if (skillType === 'attention_agent') {
                return { type: 'fail' };
            }
            return { type: 'final', content: `ok:${skillType}` };
        });

        const result = await runDeepReadPipeline({
            document: { id: 'doc-partial' },
            createModelForSkill,
            tools: {},
            runAgent,
        });

        expect(result.status).toBe('partial');
        expect(result.steps.filter((step) => step.status === 'completed')).toHaveLength(2);
        expect(result.steps.find((step) => step.skill === 'attention_agent').status).toBe('error');
    });

    it('returns failed when every step fails', async () => {
        const runAgent = vi.fn(async () => failedResult('timeout', 'slow'));
        const createModelForSkill = vi.fn(() => async () => ({ type: 'final', content: 'unused' }));

        const result = await runDeepReadPipeline({
            document: {},
            createModelForSkill,
            tools: {},
            runAgent,
        });

        expect(result.status).toBe('failed');
        expect(result.steps).toHaveLength(3);
        expect(result.steps.every((step) => step.status === 'timeout')).toBe(true);
    });

    it('appends note_export_agent when includeNoteExport is true', async () => {
        const runAgent = vi.fn(async ({ model }) => {
            const response = await model({ iteration: 1, trace: [] });
            return completedResult(response.content || 'ok');
        });
        const createModelForSkill = vi.fn((skillType) => async () => ({
            type: 'final',
            content: skillType,
        }));

        const result = await runDeepReadPipeline({
            document: {},
            createModelForSkill,
            tools: {},
            runAgent,
            includeNoteExport: true,
        });

        expect(result.steps.map((step) => step.skill)).toEqual([
            'paper_overview_agent',
            'attention_agent',
            'card_generation_agent',
            'note_export_agent',
        ]);
        expect(createModelForSkill).toHaveBeenCalledWith('note_export_agent');
    });

    it('fails fast when createModelForSkill is missing', async () => {
        const result = await runDeepReadPipeline({
            document: {},
            tools: {},
        });

        expect(result.status).toBe('failed');
        expect(result.steps).toEqual([]);
        expect(result.error).toMatch(/createModelForSkill/);
    });

    it('treats a thrown step as failed and can still return partial', async () => {
        const runAgent = vi.fn(async ({ model }) => {
            const response = await model({ iteration: 1, trace: [] });
            if (response?.throw) throw new Error('step exploded');
            return completedResult(response.content || 'ok');
        });
        const createModelForSkill = vi.fn((skillType) => async () => {
            if (skillType === 'attention_agent') return { throw: true };
            return { type: 'final', content: `ok:${skillType}` };
        });

        const result = await runDeepReadPipeline({
            document: {},
            createModelForSkill,
            tools: {},
            runAgent,
        });

        expect(result.status).toBe('partial');
        expect(result.steps.find((step) => step.skill === 'attention_agent').status).toBe('error');
        expect(result.steps.filter((step) => step.status === 'completed')).toHaveLength(2);
    });

    it('seeds priorStepSummaries into the first skill goal (HITL resume)', async () => {
        const runAgent = vi.fn(async ({ goal, model }) => {
            const response = await model({ iteration: 1, trace: [] });
            return completedResult(response.content || 'ok');
        });
        const createModelForSkill = vi.fn(() => async () => ({
            type: 'final',
            content: 'cards ok',
        }));

        await runDeepReadPipeline({
            document: { id: 'doc-1' },
            skills: ['card_generation_agent'],
            createModelForSkill,
            tools: {},
            runAgent,
            priorStepSummaries: [
                '[paper_overview_agent]\nOverview body',
                '[attention_agent]\nRoute body',
            ],
        });

        expect(runAgent).toHaveBeenCalledTimes(1);
        const goal = runAgent.mock.calls[0][0].goal;
        expect(goal).toContain('Prior pipeline outputs:');
        expect(goal).toContain('[paper_overview_agent]\nOverview body');
        expect(goal).toContain('[attention_agent]\nRoute body');
    });

    it('does not run critic by default after card_generation', async () => {
        const runAgent = vi.fn(async ({ model }) => {
            const response = await model({ iteration: 1, trace: [] });
            return completedResult(response.content || 'ok');
        });
        const createModelForSkill = vi.fn((skillType) => async () => ({
            type: 'final',
            content: `ok:${skillType}`,
        }));
        const runCritic = vi.fn();

        const result = await runDeepReadPipeline({
            document: {},
            createModelForSkill,
            tools: {},
            runAgent,
            runCritic,
        });

        expect(runCritic).not.toHaveBeenCalled();
        expect(result.steps.map((step) => step.skill)).toEqual([
            'paper_overview_agent',
            'attention_agent',
            'card_generation_agent',
        ]);
    });

    it('runs critic sidecar after completed card_generation when enableCritic is true', async () => {
        const runAgent = vi.fn(async ({ goal, model }) => {
            if (typeof model === 'function') {
                const response = await model({ iteration: 1, trace: [], goal });
                return completedResult(response.content || 'ok', response.sourceRefs || []);
            }
            return completedResult('ok');
        });
        const createModelForSkill = vi.fn((skillType) => async () => ({
            type: 'final',
            content: skillType === 'critic_agent'
                ? 'Claim A supported by page 1.'
                : `ok:${skillType}`,
            sourceRefs: skillType === 'critic_agent'
                ? [{ documentId: 'doc-1', page: 1, text: 'evidence' }]
                : [],
        }));
        const onStep = vi.fn();

        const result = await runDeepReadPipeline({
            document: { id: 'doc-1' },
            createModelForSkill,
            tools: {},
            runAgent,
            onStep,
            enableCritic: true,
        });

        expect(result.steps.map((step) => step.skill)).toEqual([
            'paper_overview_agent',
            'attention_agent',
            'card_generation_agent',
            'critic_agent',
        ]);
        expect(result.steps.find((step) => step.skill === 'critic_agent').status).toBe('completed');
        expect(result.steps.find((step) => step.skill === 'critic_agent').content)
            .toContain('Claim A supported');
        expect(createModelForSkill).toHaveBeenCalledWith('critic_agent');
        // 3 pipeline skills + critic pass uses runAgent once more
        expect(runAgent).toHaveBeenCalledTimes(4);
        expect(onStep).toHaveBeenCalledTimes(4);
        const criticGoal = runAgent.mock.calls[3][0].goal;
        expect(criticGoal).toContain('Re-check the claims');
        expect(criticGoal).toContain('ok:paper_overview_agent');
    });

    it('skips critic when card_generation did not complete', async () => {
        const runAgent = vi.fn(async ({ model }) => {
            const response = await model({ iteration: 1, trace: [] });
            if (response?.type === 'fail') return failedResult('error', 'cards failed');
            return completedResult(response.content || 'ok');
        });
        const createModelForSkill = vi.fn((skillType) => async () => {
            if (skillType === 'card_generation_agent') return { type: 'fail' };
            return { type: 'final', content: `ok:${skillType}` };
        });
        const runCritic = vi.fn();

        const result = await runDeepReadPipeline({
            document: {},
            createModelForSkill,
            tools: {},
            runAgent,
            enableCritic: true,
            runCritic,
        });

        expect(runCritic).not.toHaveBeenCalled();
        expect(result.steps.map((step) => step.skill)).toEqual([
            'paper_overview_agent',
            'attention_agent',
            'card_generation_agent',
        ]);
        expect(result.status).toBe('partial');
    });

    it('runs critic after last skill when card_generation is omitted (no-card path)', async () => {
        const runAgent = vi.fn(async ({ goal, model }) => {
            if (typeof model === 'function') {
                const response = await model({ iteration: 1, trace: [], goal });
                return completedResult(response.content || 'ok');
            }
            return completedResult('ok');
        });
        const createModelForSkill = vi.fn((skillType) => async () => ({
            type: 'final',
            content: skillType === 'critic_agent'
                ? 'Claim critique: supported'
                : `ok:${skillType}`,
        }));

        const result = await runDeepReadPipeline({
            document: { id: 'doc-no-card' },
            skills: ['paper_overview_agent', 'attention_agent'],
            createModelForSkill,
            tools: {},
            runAgent,
            enableCritic: true,
        });

        expect(result.steps.map((step) => step.skill)).toEqual([
            'paper_overview_agent',
            'attention_agent',
            'critic_agent',
        ]);
        expect(result.steps.find((step) => step.skill === 'critic_agent').status).toBe('completed');
        expect(createModelForSkill).toHaveBeenCalledWith('critic_agent');
        // overview + attention + critic
        expect(runAgent).toHaveBeenCalledTimes(3);
        const criticGoal = runAgent.mock.calls[2][0].goal;
        expect(criticGoal).toContain('Re-check the claims');
        expect(criticGoal).toContain('ok:paper_overview_agent');
    });

    it('does not run critic on no-card path when enableCritic is false', async () => {
        const runAgent = vi.fn(async ({ model }) => {
            const response = await model({ iteration: 1, trace: [] });
            return completedResult(response.content || 'ok');
        });
        const createModelForSkill = vi.fn((skillType) => async () => ({
            type: 'final',
            content: `ok:${skillType}`,
        }));
        const runCritic = vi.fn();

        const result = await runDeepReadPipeline({
            document: {},
            skills: ['paper_overview_agent', 'attention_agent'],
            createModelForSkill,
            tools: {},
            runAgent,
            enableCritic: false,
            runCritic,
        });

        expect(runCritic).not.toHaveBeenCalled();
        expect(result.steps.map((step) => step.skill)).toEqual([
            'paper_overview_agent',
            'attention_agent',
        ]);
    });

    it('records invalid_model critic step when critic model is missing', async () => {
        const runAgent = vi.fn(async ({ model }) => {
            const response = await model({ iteration: 1, trace: [] });
            return completedResult(response.content || 'ok');
        });
        const createModelForSkill = vi.fn((skillType) => {
            if (skillType === 'critic_agent') return null;
            return async () => ({ type: 'final', content: `ok:${skillType}` });
        });

        const result = await runDeepReadPipeline({
            document: {},
            skills: ['card_generation_agent'],
            createModelForSkill,
            tools: {},
            runAgent,
            enableCritic: true,
        });

        expect(result.steps).toHaveLength(2);
        expect(result.steps[1].skill).toBe('critic_agent');
        expect(result.steps[1].status).toBe('invalid_model');
        expect(runAgent).toHaveBeenCalledTimes(1);
    });

    it('feeds overview from priorStepSummaries into critic after card-only phase', async () => {
        const runAgent = vi.fn(async ({ goal, model }) => {
            if (typeof model === 'function') {
                const response = await model({ iteration: 1, trace: [], goal });
                return completedResult(response.content || 'ok');
            }
            return completedResult('ok');
        });
        const createModelForSkill = vi.fn((skillType) => async () => ({
            type: 'final',
            content: skillType === 'critic_agent' ? 'critique ok' : 'cards ok',
        }));

        await runDeepReadPipeline({
            document: { id: 'doc-1' },
            skills: ['card_generation_agent'],
            createModelForSkill,
            tools: {},
            runAgent,
            enableCritic: true,
            priorStepSummaries: [
                '[paper_overview_agent]\nSeeded overview claim',
                '[attention_agent]\nSeeded route',
            ],
        });

        expect(runAgent).toHaveBeenCalledTimes(2);
        const criticGoal = runAgent.mock.calls[1][0].goal;
        expect(criticGoal).toContain('Re-check the claims');
        expect(criticGoal).toContain('Seeded overview claim');
    });

    it('forwards product groundingMode warn to each runAgent when set', async () => {
        const runAgent = vi.fn(async ({ model }) => {
            const response = await model({ iteration: 1, trace: [] });
            return completedResult(response.content || 'ok');
        });
        const createModelForSkill = vi.fn(() => async () => ({
            type: 'final',
            content: 'ok',
        }));

        await runDeepReadPipeline({
            document: { id: 'doc-ground' },
            skills: ['paper_overview_agent', 'attention_agent'],
            createModelForSkill,
            tools: {},
            runAgent,
            groundingMode: 'warn',
            requireSourceRefsForClaims: true,
            includeObservability: true,
        });

        expect(runAgent).toHaveBeenCalledTimes(2);
        for (const [call] of runAgent.mock.calls) {
            expect(call).toEqual(expect.objectContaining({
                groundingMode: 'warn',
                requireSourceRefsForClaims: true,
                includeObservability: true,
            }));
        }
    });

    it('leaves grounding unset by default so offline mocks stay quiet', async () => {
        const runAgent = vi.fn(async ({ model }) => {
            const response = await model({ iteration: 1, trace: [] });
            return completedResult(response.content || 'ok');
        });
        const createModelForSkill = vi.fn(() => async () => ({
            type: 'final',
            content: 'ok',
        }));

        await runDeepReadPipeline({
            document: {},
            skills: ['paper_overview_agent'],
            createModelForSkill,
            tools: {},
            runAgent,
        });

        const call = runAgent.mock.calls[0][0];
        expect(call.groundingMode).toBeUndefined();
        expect(call.groundingGate).toBeUndefined();
        expect(call.requireSourceRefsForClaims).toBeUndefined();
    });

    it('forwards explicit groundingGate off to runAgent', async () => {
        const runAgent = vi.fn(async ({ model }) => {
            const response = await model({ iteration: 1, trace: [] });
            return completedResult(response.content || 'ok');
        });
        const createModelForSkill = vi.fn(() => async () => ({
            type: 'final',
            content: 'ok',
        }));

        await runDeepReadPipeline({
            document: {},
            skills: ['paper_overview_agent'],
            createModelForSkill,
            tools: {},
            runAgent,
            groundingGate: false,
        });

        expect(runAgent.mock.calls[0][0].groundingGate).toBe(false);
    });
});

describe('runCriticPass', () => {
    it('injects overview content into the critic goal and returns agent result', async () => {
        const runAgent = vi.fn(async ({ goal, model }) => {
            expect(goal).toContain('Re-check the claims');
            expect(goal).toContain('Claim A is true');
            const response = await model({ goal, iteration: 1, trace: [] });
            return completedResult(response.content, response.sourceRefs);
        });
        const model = vi.fn(async () => ({
            type: 'final',
            content: 'Claim A supported by page 1.',
            sourceRefs: [{ documentId: 'doc-1', page: 1, text: 'evidence' }],
        }));

        const result = await runCriticPass({
            overviewContent: 'Claim A is true',
            model,
            tools: {},
            document: { id: 'doc-1' },
            runAgent,
        });

        expect(result.status).toBe('completed');
        expect(result.content).toContain('Claim A supported');
        expect(result.sourceRefs).toHaveLength(1);
        expect(runAgent).toHaveBeenCalledTimes(1);
    });

    it('falls back to prior paper_overview_agent step content', async () => {
        const runAgent = vi.fn(async ({ goal }) => {
            expect(goal).toContain('Overview body from pipeline');
            return completedResult('critic ok');
        });

        const result = await runCriticPass({
            priorSteps: [
                { skill: 'paper_overview_agent', content: 'Overview body from pipeline' },
                { skill: 'attention_agent', content: 'route' },
            ],
            model: async () => ({ type: 'final', content: 'critic ok' }),
            runAgent,
        });

        expect(result.status).toBe('completed');
        expect(result.content).toBe('critic ok');
    });

    it('returns invalid_model when no model function is provided', async () => {
        const result = await runCriticPass({
            overviewContent: 'x',
            tools: {},
        });

        expect(result.status).toBe('invalid_model');
        expect(result.error).toMatch(/model function/i);
    });
});
