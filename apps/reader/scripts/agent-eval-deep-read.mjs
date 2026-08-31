#!/usr/bin/env node
/**
 * Offline (default) deep-read pipeline acceptance via multiAgent.runDeepReadPipeline.
 * Real local deterministic models + mock create_vibecard. No network.
 *
 * Optional live mode: Grok for paper_overview + attention only (no card write).
 * With AGENT_EVAL_DEEP_READ_CRITIC=1, live also runs critic sidecar after attention.
 *
 * Exit codes:
 *   0 - all checks passed
 *   1 - checks failed or unhandled error
 *   2 - live mode only: proxy/key unavailable (safe CI skip)
 *
 * Run via vite-node (same as other agent evals):
 *   pnpm agent:eval:deep-read
 *   npx vite-node scripts/agent-eval-deep-read.mjs
 *
 * Env:
 *   AGENT_EVAL_DEEP_READ_MODE   offline | live  (default: offline)
 *   AGENT_EVAL_DEEP_READ_CRITIC 1 | 0
 *     offline default 1; live default 0 (set 1 for overview→attention→critic)
 *   AGENT_EVAL_DEEP_READ_LIVE   1               (alias for mode=live)
 *   GROK_EVAL_MODEL / GROK_PROXY_BASE / VIBEREADER_AGENT_* - live overrides
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runDeepReadPipeline } from '../src/agent/multiAgent';
import { buildReadingAgentPermissions } from '../src/agent/readingAgentOptions';
import {
    createLocalAttentionRouteModel,
    createLocalCardGenerationModel,
    createLocalCriticModel,
    createLocalPaperOverviewModel,
} from '../src/agent/readingTaskModels';
import { runReadingAgent } from '../src/agent/runtime';
import { createReadingTools } from '../src/agent/tools';
import {
    DEFAULT_READING_PERMISSIONS,
    filterAllowedTools,
} from '../src/agent/permissions';
import {
    createOpenAICompatibleAgentModel,
    DEFAULT_SYSTEM_PROMPT,
} from '../src/agent/llmModel';
import {
    buildSystemPromptForSkill,
    getReadingAgentSkill,
} from '../src/agent/skills';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');

const DEFAULT_PROXY = 'http://127.0.0.1:8317/v1';
const DEFAULT_MODEL = 'grok-4.5';

const ENV_CANDIDATES = [
    process.env.CLI_PROXY_ENV,
    resolve(homedir(), '.cli-proxy-api/client.env'),
    resolve(homedir(), '.cli-proxy-api/.env'),
].filter(Boolean);

// ---------- sample document ----------

function sampleDocument(id = 'eval-deep-read-offline') {
    return {
        id,
        name: 'deep-read-pipeline-sample.md',
        kind: 'markdown',
        contentText: [
            'Problem: the paper defines a concrete research question and motivation for staggered adoption.',
            'Method: the paper explains a two-way fixed effects identification strategy and event-study design.',
            'Evidence: the paper reports a positive average treatment effect and robustness checks.',
            'Limitation: the paper warns about external validity when parallel trends fail.',
        ].join('\n\n'),
    };
}

// ---------- helpers ----------

function firstNonEmpty(...values) {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return '';
}

function resolveMode() {
    if (String(process.env.AGENT_EVAL_DEEP_READ_LIVE || '').trim() === '1') {
        return 'live';
    }
    const mode = firstNonEmpty(process.env.AGENT_EVAL_DEEP_READ_MODE, 'offline').toLowerCase();
    return mode === 'live' ? 'live' : 'offline';
}

function resolveEnableCritic(mode = 'offline') {
    const rawEnv = process.env.AGENT_EVAL_DEEP_READ_CRITIC;
    // Live defaults off (cost); offline defaults on.
    if (rawEnv == null || String(rawEnv).trim() === '') {
        return mode !== 'live';
    }
    const raw = String(rawEnv).trim();
    return raw !== '0' && raw.toLowerCase() !== 'false';
}

function createMockCreateVibeCardAdapter() {
    const cards = [];
    return {
        createVibeCard: async (cardInput = {}) => {
            const saved = {
                id: `eval-card-${cards.length + 1}`,
                ...cardInput,
            };
            cards.push(saved);
            return saved;
        },
        getCards: () => cards.slice(),
    };
}

function createLocalModelForSkill(skillType) {
    if (skillType === 'paper_overview_agent') return createLocalPaperOverviewModel();
    if (skillType === 'attention_agent') return createLocalAttentionRouteModel();
    if (skillType === 'card_generation_agent') return createLocalCardGenerationModel();
    if (skillType === 'critic_agent') return createLocalCriticModel();
    throw new Error(`unexpected skill for offline deep-read: ${skillType}`);
}

function offlinePermissionsBySkill() {
    return {
        paper_overview_agent: buildReadingAgentPermissions('paper_overview_agent'),
        attention_agent: buildReadingAgentPermissions('attention_agent'),
        card_generation_agent: buildReadingAgentPermissions('card_generation_agent'),
        critic_agent: buildReadingAgentPermissions('critic_agent'),
    };
}

function toolNamesFromStep(step) {
    return (step?.agentResult?.trace || [])
        .filter((entry) => entry.type === 'tool')
        .map((entry) => entry.toolName);
}

function contentPreview(text = '', max = 160) {
    return String(text || '').replace(/\s+/g, ' ').slice(0, max);
}

function check(name, pass, detail) {
    return { name, pass: Boolean(pass), detail: String(detail || '') };
}

// ---------- offline pipeline ----------

async function runOfflinePipeline() {
    const enableCritic = resolveEnableCritic('offline');
    const document = sampleDocument();
    const mock = createMockCreateVibeCardAdapter();
    const tools = createReadingTools({ document }, {
        createVibeCard: mock.createVibeCard,
    });
    const goals = [];
    const runAgent = async (options) => {
        goals.push(options.goal || '');
        return runReadingAgent(options);
    };

    console.log('agent-eval-deep-read: offline pipeline (local models, no network)');
    console.log(`root: ${ROOT}`);
    console.log(`document: ${document.name} (${document.id})`);
    console.log(`enableCritic: ${enableCritic}`);
    console.log('skills: paper_overview → attention → card_generation'
        + (enableCritic ? ' → critic' : ''));

    const started = Date.now();
    const result = await runDeepReadPipeline({
        document,
        createModelForSkill: createLocalModelForSkill,
        tools,
        permissionsBySkill: offlinePermissionsBySkill(),
        runAgent,
        timeoutMs: 15000,
        enableCritic,
    });
    const elapsedMs = Date.now() - started;
    const cards = mock.getCards();

    const expectedSkills = [
        'paper_overview_agent',
        'attention_agent',
        'card_generation_agent',
        ...(enableCritic ? ['critic_agent'] : []),
    ];
    const skillOrder = result.steps.map((step) => step.skill);
    const overview = result.steps.find((s) => s.skill === 'paper_overview_agent');
    const attention = result.steps.find((s) => s.skill === 'attention_agent');
    const cardsStep = result.steps.find((s) => s.skill === 'card_generation_agent');
    const critic = result.steps.find((s) => s.skill === 'critic_agent');

    const checks = [
        check('pipeline_status', result.status === 'completed', `status=${result.status}`),
        check(
            'skill_order',
            skillOrder.join(',') === expectedSkills.join(','),
            `got [${skillOrder.join(', ')}]`,
        ),
        check(
            'all_steps_completed',
            result.steps.length > 0 && result.steps.every((s) => s.status === 'completed'),
            result.steps.map((s) => `${s.skill}:${s.status}`).join(', ') || '(none)',
        ),
        check(
            'overview_content',
            Boolean(overview?.content?.includes('# Paper overview')),
            contentPreview(overview?.content),
        ),
        check(
            'attention_content',
            Boolean(attention?.content?.includes('# Attention route')),
            contentPreview(attention?.content),
        ),
        check(
            'card_content',
            Boolean(cardsStep?.content?.includes('Created') && cardsStep?.content?.includes('VibeCard')),
            contentPreview(cardsStep?.content),
        ),
        check(
            'create_vibecard_count',
            cards.length >= 3,
            `recorded=${cards.length} (need >= 3)`,
        ),
        check(
            'cards_have_source',
            cards.length > 0 && cards.every((c) => c.sourceText || c.source_text),
            cards.map((c) => c.title || c.id).join(', ') || '(none)',
        ),
        check(
            'prior_context_attention',
            goals.length >= 2
                && goals[1].includes('Prior pipeline outputs:')
                && goals[1].includes('[paper_overview_agent]'),
            contentPreview(goals[1] || '', 120),
        ),
        check(
            'prior_context_cards',
            goals.length >= 3
                && goals[2].includes('Prior pipeline outputs:')
                && goals[2].includes('[attention_agent]'),
            contentPreview(goals[2] || '', 120),
        ),
    ];

    if (enableCritic) {
        checks.push(
            check(
                'critic_content',
                Boolean(critic?.content?.includes('# Claim critique') || critic?.content?.match(/Verdict:/i)),
                contentPreview(critic?.content),
            ),
            check(
                'critic_goal',
                goals.some((g) => g.includes('Re-check the claims')),
                `goals=${goals.length}`,
            ),
        );
    } else {
        checks.push(
            check(
                'no_critic',
                !skillOrder.includes('critic_agent'),
                skillOrder.includes('critic_agent') ? 'critic present' : 'critic absent',
            ),
        );
    }

    return {
        mode: 'offline',
        elapsedMs,
        result,
        cards,
        goals,
        checks,
        meta: { enableCritic, documentId: document.id },
    };
}

// ---------- live (overview + attention only) ----------

function parseEnvFile(filePath) {
    if (!existsSync(filePath)) return {};
    const text = readFileSync(filePath, 'utf8');
    const out = {};
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const cleaned = line.startsWith('export ') ? line.slice(7).trim() : line;
        const eq = cleaned.indexOf('=');
        if (eq < 1) continue;
        const key = cleaned.slice(0, eq).trim();
        let value = cleaned.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

function loadClientEnv() {
    for (const candidate of ENV_CANDIDATES) {
        const parsed = parseEnvFile(candidate);
        if (Object.keys(parsed).length > 0) {
            return { path: candidate, env: parsed };
        }
    }
    return { path: null, env: {} };
}

function applyEnvToProcess(fileEnv = {}) {
    for (const [key, value] of Object.entries(fileEnv)) {
        if (!process.env[key] && value) process.env[key] = value;
    }
}

function resolveLiveConfig() {
    const baseUrl = firstNonEmpty(
        process.env.GROK_PROXY_BASE,
        process.env.VIBEREADER_AGENT_BASE_URL,
        process.env.OPENAI_BASE_URL,
        DEFAULT_PROXY,
    );
    const apiKey = firstNonEmpty(
        process.env.VIBEREADER_AGENT_API_KEY,
        process.env.OPENAI_API_KEY,
        process.env.GROK_API_KEY,
        process.env.XAI_API_KEY,
        process.env.API_KEY,
        process.env.CLI_PROXY_API_KEY,
    );
    const model = firstNonEmpty(
        process.env.GROK_EVAL_MODEL,
        process.env.VIBEREADER_AGENT_MODEL,
        process.env.OPENAI_MODEL,
        DEFAULT_MODEL,
    );
    return { baseUrl, apiKey, model };
}

function maskKey(value = '') {
    if (!value) return '(empty)';
    if (value.length <= 8) return '****';
    return `${value.slice(0, 3)}…${value.slice(-3)} (len=${value.length})`;
}

async function probeProxy(baseUrl) {
    const modelsUrl = `${String(baseUrl).replace(/\/$/, '')}/models`;
    try {
        const response = await fetch(modelsUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(4000),
        });
        return {
            ok: response.ok || response.status === 401 || response.status === 403,
            status: response.status,
            modelsUrl,
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            modelsUrl,
            error: error?.message || String(error),
        };
    }
}

function tryLoadSkillDocument(skill) {
    const skillPath = typeof skill?.skillPath === 'string' ? skill.skillPath.trim() : '';
    if (!skillPath) return '';
    const candidates = [
        resolve(ROOT, skillPath),
        resolve(process.cwd(), skillPath),
    ];
    for (const absolute of candidates) {
        if (!existsSync(absolute)) continue;
        try {
            const text = readFileSync(absolute, 'utf8');
            return typeof text === 'string' ? text.trim() : '';
        } catch {
            // next
        }
    }
    return '';
}

function buildLiveSystemPrompt(skillType) {
    const skill = getReadingAgentSkill(skillType);
    const skillDocument = tryLoadSkillDocument(skill);
    const promptOptions = skillDocument ? { skillDocument } : {};
    const fromSkill = buildSystemPromptForSkill(skillType, promptOptions)
        || (typeof skill?.systemPrompt === 'string' ? skill.systemPrompt.trim() : '')
        || '';
    const base = fromSkill.startsWith(DEFAULT_SYSTEM_PROMPT)
        ? fromSkill
        : [DEFAULT_SYSTEM_PROMPT, '', fromSkill].filter(Boolean).join('\n');
    const hint = [
        'Live deep-read eval (overview + attention; no card write; optional critic sidecar).',
        'Call document tools before final. Ground content in tool results.',
        'Keep answers concise.',
    ].join(' ');
    return [base, '', hint].join('\n');
}

/**
 * Live deep-read: paper_overview → attention only (skip card for cost).
 * Uses real Grok via local OpenAI-compatible proxy.
 */
async function runLivePipeline() {
    const loaded = loadClientEnv();
    applyEnvToProcess(loaded.env);
    const config = resolveLiveConfig();
    const enableCritic = resolveEnableCritic('live');

    console.log('agent-eval-deep-read: live pipeline (Grok, overview + attention'
        + (enableCritic ? ' + critic' : '') + '; no card write)');
    console.log(`root: ${ROOT}`);
    console.log(`proxy: ${config.baseUrl}`);
    console.log(`model: ${config.model}`);
    console.log(`key: ${maskKey(config.apiKey)} (from ${loaded.path || 'process env'})`);
    console.log(`enableCritic: ${enableCritic}`);
    console.log('skills: paper_overview → attention'
        + (enableCritic ? ' → critic' : '')
        + ' (card write skipped)');

    if (!config.apiKey) {
        console.error('SKIP: no API key for live deep-read (set VIBEREADER_AGENT_API_KEY or client.env)');
        return { mode: 'live', skip: true, reason: 'missing_api_key', exitCode: 2 };
    }

    const probe = await probeProxy(config.baseUrl);
    if (!probe.ok) {
        console.error(`SKIP: proxy unreachable (${probe.modelsUrl}): ${probe.error || `HTTP ${probe.status}`}`);
        return { mode: 'live', skip: true, reason: 'proxy_unreachable', exitCode: 2, probe };
    }
    console.log(`proxy probe: ok (HTTP ${probe.status})`);

    const document = sampleDocument('eval-deep-read-live');
    // No createVibeCard - card skill not in skills list.
    const tools = createReadingTools({ document }, {});
    const goals = [];

    const createModelForSkill = (skillType) => {
        const skill = getReadingAgentSkill(skillType);
        const permissions = buildReadingAgentPermissions(skillType)
            || DEFAULT_READING_PERMISSIONS;
        const fullTools = createReadingTools({ document }, {});
        const filtered = filterAllowedTools(fullTools, permissions);
        return createOpenAICompatibleAgentModel({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            model: config.model,
            temperature: 0,
            tools: filtered,
            systemPrompt: buildLiveSystemPrompt(skillType),
        });
    };

    const permissionsBySkill = {
        paper_overview_agent: buildReadingAgentPermissions('paper_overview_agent'),
        attention_agent: buildReadingAgentPermissions('attention_agent'),
        ...(enableCritic
            ? { critic_agent: buildReadingAgentPermissions('critic_agent') }
            : {}),
    };

    const runAgent = async (options) => {
        goals.push(options.goal || '');
        return runReadingAgent(options);
    };

    const expectedSkills = [
        'paper_overview_agent',
        'attention_agent',
        ...(enableCritic ? ['critic_agent'] : []),
    ];

    const started = Date.now();
    const result = await runDeepReadPipeline({
        document,
        skills: ['paper_overview_agent', 'attention_agent'],
        createModelForSkill,
        tools,
        permissionsBySkill,
        runAgent,
        timeoutMs: 120000,
        // Critic after attention when cards omitted (multiAgent no-card path).
        enableCritic,
        maxIterationsBySkill: {
            paper_overview_agent: 8,
            attention_agent: 8,
            ...(enableCritic ? { critic_agent: 8 } : {}),
        },
    });
    const elapsedMs = Date.now() - started;

    const skillOrder = result.steps.map((step) => step.skill);
    const overview = result.steps.find((s) => s.skill === 'paper_overview_agent');
    const attention = result.steps.find((s) => s.skill === 'attention_agent');
    const critic = result.steps.find((s) => s.skill === 'critic_agent');
    const overviewTools = toolNamesFromStep(overview);
    const attentionTools = toolNamesFromStep(attention);
    const criticTools = toolNamesFromStep(critic);

    const checks = [
        check(
            'pipeline_status',
            result.status === 'completed' || result.status === 'partial',
            `status=${result.status}`,
        ),
        check(
            'skill_order',
            skillOrder.join(',') === expectedSkills.join(','),
            `got [${skillOrder.join(', ')}]`,
        ),
        check(
            'overview_completed',
            overview?.status === 'completed',
            `status=${overview?.status || '(missing)'}`,
        ),
        check(
            'overview_content_nonempty',
            Boolean(overview?.content && String(overview.content).trim().length > 20),
            contentPreview(overview?.content),
        ),
        check(
            'overview_tools',
            overviewTools.some((t) => (
                t === 'get_current_document'
                || t === 'get_document_chunks'
                || t === 'search_document'
            )),
            overviewTools.join(', ') || '(none)',
        ),
        check(
            'attention_completed',
            attention?.status === 'completed',
            `status=${attention?.status || '(missing)'}`,
        ),
        check(
            'attention_content_nonempty',
            Boolean(attention?.content && String(attention.content).trim().length > 20),
            contentPreview(attention?.content),
        ),
        check(
            'prior_context_attention',
            goals.length >= 2
                && goals[1].includes('Prior pipeline outputs:')
                && goals[1].includes('[paper_overview_agent]'),
            contentPreview(goals[1] || '', 120),
        ),
        check(
            'no_card_skill',
            !skillOrder.includes('card_generation_agent'),
            skillOrder.includes('card_generation_agent') ? 'card present' : 'card absent',
        ),
    ];

    if (enableCritic) {
        checks.push(
            check(
                'critic_completed',
                critic?.status === 'completed',
                `status=${critic?.status || '(missing)'}`,
            ),
            check(
                'critic_content_nonempty',
                Boolean(critic?.content && String(critic.content).trim().length > 20),
                contentPreview(critic?.content),
            ),
            check(
                'critic_goal',
                goals.some((g) => g.includes('Re-check the claims')),
                `goals=${goals.length}`,
            ),
            check(
                'critic_tools',
                criticTools.some((t) => (
                    t === 'verify_citation'
                    || t === 'search_document'
                    || t === 'get_document_chunks'
                    || t === 'get_current_document'
                )),
                criticTools.join(', ') || '(none)',
            ),
        );
    } else {
        checks.push(
            check(
                'no_critic',
                !skillOrder.includes('critic_agent'),
                skillOrder.includes('critic_agent') ? 'critic present' : 'critic absent',
            ),
        );
    }

    return {
        mode: 'live',
        elapsedMs,
        result,
        cards: [],
        goals,
        checks,
        meta: {
            model: config.model,
            baseUrl: config.baseUrl,
            documentId: document.id,
            enableCritic,
            overviewTools,
            attentionTools,
            criticTools,
        },
    };
}

// ---------- report ----------

function printReport(suite) {
    if (suite.skip) {
        console.log('');
        console.log(`RESULT: SKIP (${suite.reason})`);
        return suite.exitCode ?? 2;
    }

    const { checks, result, cards, elapsedMs, mode, meta } = suite;
    const failed = checks.filter((c) => !c.pass);
    const passed = checks.filter((c) => c.pass);

    console.log('');
    console.log('--- steps ---');
    for (const step of result?.steps || []) {
        const tools = toolNamesFromStep(step);
        console.log(
            `  ${step.skill}: status=${step.status}`
            + ` tools=[${tools.join(', ') || 'none'}]`
            + ` content="${contentPreview(step.content, 100)}"`,
        );
    }
    if (mode === 'offline') {
        console.log(`  cards recorded: ${cards.length}`);
        for (const card of cards.slice(0, 5)) {
            console.log(`    - ${card.id}: ${contentPreview(card.title || card.sourceText, 80)}`);
        }
    }
    if (meta?.overviewTools) {
        console.log(`  live overview tools: ${meta.overviewTools.join(', ') || '(none)'}`);
        console.log(`  live attention tools: ${meta.attentionTools.join(', ') || '(none)'}`);
        if (meta.enableCritic) {
            console.log(`  live critic tools: ${(meta.criticTools || []).join(', ') || '(none)'}`);
        }
    }

    console.log('');
    console.log('--- checks ---');
    for (const c of checks) {
        console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}: ${c.detail}`);
    }

    console.log('');
    console.log(
        `total checks: ${checks.length}  passed: ${passed.length}  failed: ${failed.length}`
        + `  elapsed: ${elapsedMs}ms  mode: ${mode}`,
    );
    console.log(failed.length === 0 ? 'RESULT: PASS' : 'RESULT: FAIL');
    return failed.length === 0 ? 0 : 1;
}

// ---------- main ----------

async function main() {
    const mode = resolveMode();
    let suite;
    if (mode === 'live') {
        suite = await runLivePipeline();
    } else {
        suite = await runOfflinePipeline();
    }
    const code = printReport(suite);
    process.exit(code);
}

main().catch((error) => {
    console.error('FAIL: unhandled error:', error?.message || error);
    if (error?.stack) console.error(error.stack);
    process.exit(1);
});
