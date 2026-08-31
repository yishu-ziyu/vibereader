import { DEFAULT_READING_PERMISSIONS } from './permissions';
import { runReadingAgent } from './runtime';
import { getReadingAgentSkill } from './skills';

export const DEEP_READ_SKILL_ORDER = Object.freeze([
    'paper_overview_agent',
    'attention_agent',
    'card_generation_agent',
]);

function cloneSourceRefs(sourceRefs = []) {
    if (!Array.isArray(sourceRefs)) return [];
    return sourceRefs.map((sourceRef) => Object.freeze({ ...sourceRef }));
}

function collectArtifacts(agentResult = {}) {
    const artifacts = [];
    if (agentResult.artifact) {
        artifacts.push(agentResult.artifact);
    }
    if (Array.isArray(agentResult.artifacts)) {
        artifacts.push(...agentResult.artifacts);
    }
    return artifacts;
}

function resolveSkillTypes(options = {}) {
    if (Array.isArray(options.skills) && options.skills.length > 0) {
        return [...options.skills];
    }

    const skillTypes = [...DEEP_READ_SKILL_ORDER];
    if (options.includeNoteExport) {
        skillTypes.push('note_export_agent');
    }
    return skillTypes;
}

function pipelineStatus(steps = []) {
    const completedCount = steps.filter((step) => step.status === 'completed').length;
    if (completedCount === steps.length && steps.length > 0) return 'completed';
    if (completedCount > 0) return 'partial';
    return 'failed';
}

function stepRecord(skillType, agentResult = {}) {
    return Object.freeze({
        skill: skillType,
        status: agentResult.status || 'failed',
        content: agentResult.content || '',
        sourceRefs: Object.freeze(cloneSourceRefs(agentResult.sourceRefs)),
        agentResult,
    });
}

/** Pull overview body from live steps or HITL-seeded priorStepSummaries. */
function resolveOverviewContent(steps = [], priorStepSummaries = []) {
    const fromStep = steps.find((step) => step.skill === 'paper_overview_agent')?.content;
    if (fromStep) return fromStep;

    const seed = priorStepSummaries.find((entry) =>
        String(entry).startsWith('[paper_overview_agent]'),
    );
    if (!seed) return '';
    return String(seed).replace(/^\[paper_overview_agent\]\n?/, '');
}


/**
 * Append a read-only critic sidecar step to the pipeline collections.
 * Used after card_generation or after the last skill when cards are omitted.
 */
async function appendCriticSidecar({
    steps,
    artifacts,
    sourceRefs,
    priorStepSummaries,
    createModelForSkill,
    tools,
    permissionsBySkill,
    maxIterationsBySkill,
    runAgent,
    runCritic,
    document,
    timeoutMs,
    onStep,
    groundingAgentOptions = {},
}) {
    const criticSkill = getReadingAgentSkill('critic_agent');
    const criticModel = createModelForSkill('critic_agent');
    const criticPermissions = permissionsBySkill.critic_agent || DEFAULT_READING_PERMISSIONS;
    const criticMaxIterations = maxIterationsBySkill.critic_agent
        || criticSkill?.maxIterations
        || 8;
    const overviewContent = resolveOverviewContent(steps, priorStepSummaries);

    let criticPassResult;
    try {
        criticPassResult = await runCritic({
            priorSteps: steps,
            overviewContent,
            model: criticModel,
            tools,
            permissions: criticPermissions,
            runAgent,
            document,
            maxIterations: criticMaxIterations,
            timeoutMs,
            ...groundingAgentOptions,
        });
    } catch (error) {
        criticPassResult = {
            status: 'error',
            content: '',
            sourceRefs: [],
            agentResult: {
                status: 'error',
                content: '',
                sourceRefs: [],
                artifacts: [],
                artifact: null,
                error: error?.message || String(error),
                iterations: 0,
                trace: [],
            },
            error: error?.message || String(error),
        };
    }

    const criticAgentResult = criticPassResult.agentResult || {
        status: criticPassResult.status || 'failed',
        content: criticPassResult.content || '',
        sourceRefs: criticPassResult.sourceRefs || [],
        artifacts: [],
        artifact: null,
        error: criticPassResult.error,
        iterations: 0,
        trace: [],
    };
    const criticStep = stepRecord('critic_agent', criticAgentResult);
    steps.push(criticStep);
    artifacts.push(...collectArtifacts(criticAgentResult));
    sourceRefs.push(...cloneSourceRefs(
        criticAgentResult.sourceRefs || criticPassResult.sourceRefs || [],
    ));

    if (criticStep.status === 'completed' && criticStep.content) {
        priorStepSummaries.push(`[critic_agent]\n${criticStep.content}`);
    }

    if (typeof onStep === 'function') {
        await onStep(criticStep, {
            steps: [...steps],
            skillType: 'critic_agent',
        });
    }

    return criticStep;
}

/**
 * Optional grounding fields for pipeline → runAgent.
 * Product paths usually set these via createReadingAgentOptions (llm → warn).
 * Unset keeps runtime gate off so offline local evals stay quiet.
 *
 * @param {{
 *   groundingMode?: string,
 *   groundingGate?: boolean|string,
 *   requireSourceRefsForClaims?: boolean,
 *   includeObservability?: boolean,
 * }} options
 * @returns {object}
 */
function pickGroundingAgentOptions(options = {}) {
    const out = {};
    if (options.groundingMode != null && String(options.groundingMode).trim() !== '') {
        out.groundingMode = options.groundingMode;
    }
    if (options.groundingGate != null) {
        out.groundingGate = options.groundingGate;
    }
    if (options.requireSourceRefsForClaims != null) {
        out.requireSourceRefsForClaims = options.requireSourceRefsForClaims;
    }
    if (options.includeObservability != null) {
        out.includeObservability = options.includeObservability;
    }
    return out;
}

/**
 * Sequential deep-read pipeline:
 * paper_overview_agent → attention_agent → card_generation_agent (+ optional note_export).
 * When enableCritic is true:
 * - after completed card_generation (default full pipeline), or
 * - after the last skill when card_generation is omitted (no-card path, e.g. live eval),
 * runs a read-only critic sidecar (no user confirm) via runCriticPass with prior content.
 * Optional groundingMode/groundingGate forward to each runAgent (product llm → warn).
 */
export async function runDeepReadPipeline(options = {}) {
    const {
        document = {},
        createModelForSkill,
        tools = {},
        permissionsBySkill = {},
        runAgent = runReadingAgent,
        onStep,
        timeoutMs,
        maxIterationsBySkill = {},
        // Seed summaries (e.g. after a HITL pause) so the next skill still sees prior outputs.
        priorStepSummaries: priorStepSummariesSeed = [],
        // Optional read-only claim critic after cards, or after last skill if cards skipped.
        enableCritic = false,
        runCritic: runCriticOption,
        // Optional product grounding (warn/strict). Unset → runtime off (offline quiet).
        groundingMode,
        groundingGate,
        requireSourceRefsForClaims,
        includeObservability,
    } = options;

    const runCritic = typeof runCriticOption === 'function' ? runCriticOption : runCriticPass;
    const groundingAgentOptions = pickGroundingAgentOptions({
        groundingMode,
        groundingGate,
        requireSourceRefsForClaims,
        includeObservability,
    });

    if (typeof createModelForSkill !== 'function') {
        return Object.freeze({
            status: 'failed',
            steps: Object.freeze([]),
            artifacts: Object.freeze([]),
            sourceRefs: Object.freeze([]),
            error: 'createModelForSkill is required',
        });
    }

    const skillTypes = resolveSkillTypes(options);
    const steps = [];
    const artifacts = [];
    const sourceRefs = [];
    const priorStepSummaries = Array.isArray(priorStepSummariesSeed)
        ? [...priorStepSummariesSeed]
        : [];

    for (const skillType of skillTypes) {
        const skill = getReadingAgentSkill(skillType);
        const model = createModelForSkill(skillType);
        const permissions = permissionsBySkill[skillType] || DEFAULT_READING_PERMISSIONS;
        const maxIterations = maxIterationsBySkill[skillType]
            || skill?.maxIterations
            || undefined;
        const goal = skill?.goal || `Run reading skill: ${skillType}`;
        const priorContext = priorStepSummaries.length > 0
            ? `\n\nPrior pipeline outputs:\n${priorStepSummaries.join('\n\n')}`
            : '';

        let agentResult;
        try {
            agentResult = await runAgent({
                goal: `${goal}${priorContext}`,
                model,
                tools,
                permissions,
                context: { document },
                maxIterations,
                timeoutMs,
                document,
                ...groundingAgentOptions,
            });
        } catch (error) {
            agentResult = {
                status: 'error',
                content: '',
                sourceRefs: [],
                artifacts: [],
                artifact: null,
                error: error?.message || String(error),
                iterations: 0,
                trace: [],
            };
        }

        const step = stepRecord(skillType, agentResult);
        steps.push(step);
        artifacts.push(...collectArtifacts(agentResult));
        sourceRefs.push(...cloneSourceRefs(agentResult.sourceRefs));

        if (step.status === 'completed' && step.content) {
            priorStepSummaries.push(`[${skillType}]\n${step.content}`);
        }

        if (typeof onStep === 'function') {
            await onStep(step, {
                steps: [...steps],
                skillType,
            });
        }

        // Read-only critic sidecar (no HITL):
        // - after successful card_generation when cards are in the pipeline, or
        // - after the last skill when card_generation is omitted (live no-card path).
        const cardsInPipeline = skillTypes.includes('card_generation_agent');
        const isLastSkill = skillType === skillTypes[skillTypes.length - 1];
        const shouldRunCritic = enableCritic
            && step.status === 'completed'
            && (
                skillType === 'card_generation_agent'
                || (!cardsInPipeline && isLastSkill)
            );

        if (shouldRunCritic) {
            await appendCriticSidecar({
                steps,
                artifacts,
                sourceRefs,
                priorStepSummaries,
                createModelForSkill,
                tools,
                permissionsBySkill,
                maxIterationsBySkill,
                runAgent,
                runCritic,
                document,
                timeoutMs,
                onStep,
                groundingAgentOptions,
            });
        }
    }

    return Object.freeze({
        status: pipelineStatus(steps),
        steps: Object.freeze(steps),
        artifacts: Object.freeze(artifacts),
        sourceRefs: Object.freeze(sourceRefs),
    });
}

/**
 * Optional second-pass critic: re-check overview claims against document sources.
 * Multi-agent shared-context pattern - prior overview content is injected into the goal.
 * Pass `model: createLocalCriticModel()` (or resolveReadingAgentModel('critic_agent')) for offline runs.
 */
export async function runCriticPass(options = {}) {
    const criticSkill = getReadingAgentSkill('critic_agent');
    const {
        overviewContent = '',
        priorSteps = [],
        model,
        tools = {},
        permissions = DEFAULT_READING_PERMISSIONS,
        runAgent = runReadingAgent,
        document = {},
        maxIterations = criticSkill?.maxIterations || 8,
        timeoutMs,
        goal: goalOverride,
        groundingMode,
        groundingGate,
        requireSourceRefsForClaims,
        includeObservability,
    } = options;

    if (typeof model !== 'function') {
        return Object.freeze({
            status: 'invalid_model',
            content: '',
            sourceRefs: Object.freeze([]),
            agentResult: null,
            error: 'A model function is required for the critic pass',
        });
    }

    const priorOverview = overviewContent
        || priorSteps.find((step) => step.skill === 'paper_overview_agent')?.content
        || priorSteps.map((step) => step.content).filter(Boolean).join('\n\n')
        || '';

    const goal = goalOverride || [
        'Re-check the claims in the prior overview against document sources.',
        'Use search_document or get_document_chunks to verify each material claim.',
        'Report which claims are supported, weak, or unsupported, with source refs.',
        '',
        'Prior overview:',
        priorOverview || '(empty overview)',
    ].join('\n');

    const agentResult = await runAgent({
        goal,
        model,
        tools,
        permissions,
        context: { document },
        maxIterations,
        timeoutMs,
        document,
        ...pickGroundingAgentOptions({
            groundingMode,
            groundingGate,
            requireSourceRefsForClaims,
            includeObservability,
        }),
    });

    return Object.freeze({
        status: agentResult.status || 'failed',
        content: agentResult.content || '',
        sourceRefs: Object.freeze(cloneSourceRefs(agentResult.sourceRefs)),
        agentResult,
    });
}
