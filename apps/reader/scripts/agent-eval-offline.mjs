#!/usr/bin/env node
/**
 * Offline acceptance for the reading agent using local deterministic models.
 * No network. Suitable for CI.
 *
 * Exit codes:
 *   0 - all eval cases passed
 *   1 - one or more cases failed
 *
 * Env:
 *   AGENT_EVAL_OFFLINE_STRATEGY  eval | paper_overview | knowledge_qa | critic
 *   AGENT_EVAL_STRICT_GROUNDING  1 → hard-veto claim-heavy without retrieval
 *                                evidence content and unsupported citations
 *                                (default soft for those checks)
 *
 * Run via vite-node so extensionless ESM imports resolve (same as vitest):
 *   pnpm agent:eval:offline
 *   npx vite-node scripts/agent-eval-offline.mjs
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    READING_EVAL_CASES,
    runReadingEvalSuite,
    scoreAgentResult,
} from '../src/agent/eval/readingEval.js';
import { DEFAULT_READING_PERMISSIONS } from '../src/agent/permissions.js';
import {
    createLocalCriticModel,
    createLocalKnowledgeQaModel,
    createLocalPaperOverviewModel,
} from '../src/agent/readingTaskModels.js';
import { runReadingAgent } from '../src/agent/runtime.js';
import { createReadingTools } from '../src/agent/tools.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');

/**
 * Deterministic offline model that satisfies READING_EVAL_CASES tool expectations
 * and grounds the final answer in tool results from the case document.
 *
 * Plan:
 *  1. Prefer required tools from expectations, else any-of tools, else get_document_chunks
 *  2. After tools, emit a final answer built from last tool payloads
 */
export function createLocalOfflineEvalModel(caseDef = {}) {
    const expectations = caseDef.expectations || caseDef.expected || {};
    const required = Array.isArray(expectations.mustCallTools)
        ? [...expectations.mustCallTools]
        : [];
    const anyOf = Array.isArray(expectations.mustCallAnyTools)
        ? [...expectations.mustCallAnyTools]
        : [];

    const plan = [];
    for (const toolName of required) {
        if (!plan.includes(toolName)) plan.push(toolName);
    }
    if (plan.length === 0 && anyOf.length > 0) {
        // Prefer search / knowledge / chunks when offered (matches live eval protocol).
        const preferred = [
            'knowledge_search',
            'search_document',
            'get_document_chunks',
            'get_current_document',
            'get_page_text',
            'verify_citation',
        ];
        const pick = preferred.find((name) => anyOf.includes(name)) || anyOf[0];
        plan.push(pick);
    }
    if (plan.length === 0) {
        plan.push('get_document_chunks');
    }
    // Critic: retrieval before verify_citation so evidenceText can be grounded.
    if (plan.includes('verify_citation')) {
        const retrieval = ['get_document_chunks', 'search_document', 'knowledge_search'];
        const hasRetrieval = plan.some((name) => retrieval.includes(name));
        if (!hasRetrieval) {
            plan.unshift('get_document_chunks');
        } else {
            // Ensure verify_citation runs after at least one retrieval tool.
            const verifyIndex = plan.indexOf('verify_citation');
            const firstRetrieval = plan.findIndex((name) => retrieval.includes(name));
            if (firstRetrieval > verifyIndex) {
                plan.splice(verifyIndex, 1);
                plan.push('verify_citation');
            }
        }
    }
    // Always load content if we only searched metadata / a page, so answers are grounded.
    const contentTools = ['get_document_chunks', 'search_document', 'knowledge_search'];
    if (!plan.some((name) => contentTools.includes(name))) {
        plan.push('get_document_chunks');
    }

    return async ({ iteration, goal = '', trace = [] }) => {
        const stepIndex = iteration - 1;
        if (stepIndex < plan.length) {
            const toolName = plan[stepIndex];
            return {
                type: 'tool_call',
                toolName,
                args: toolArgsFor(toolName, goal, caseDef, trace),
            };
        }

        const content = groundedContentFromTrace(trace, goal, caseDef);
        return {
            type: 'final',
            content,
            sourceRefs: sourceRefsFromTrace(trace),
        };
    };
}

/**
 * Parse a positive page number from goal/case text (e.g. "page 2", "p.3", "第 4 页").
 * Defaults to 1 when no page hint is present.
 */
function pageFromGoalOrCase(goal = '', caseDef = {}) {
    const text = `${goal || ''} ${caseDef.goal || ''}`;
    const match = text.match(/\bpage\s*(\d+)\b/i)
        || text.match(/\bp\.?\s*(\d+)\b/i)
        || text.match(/第\s*(\d+)\s*页/);
    if (!match) return 1;
    const page = Number(match[1]);
    return Number.isInteger(page) && page >= 1 ? page : 1;
}

function toolArgsFor(toolName, goal, caseDef, trace = []) {
    const query = String(goal || caseDef.goal || 'key claims method result definition').trim();
    if (toolName === 'get_page_text') {
        return { page: pageFromGoalOrCase(goal, caseDef), maxChars: 800 };
    }
    if (toolName === 'search_document' || toolName === 'get_document_chunks' || toolName === 'knowledge_search') {
        return {
            query: query.slice(0, 200) || 'document summary',
            limit: 5,
            maxChars: 600,
        };
    }
    if (toolName === 'verify_citation') {
        const claim = claimFromGoal(goal || caseDef.goal || '');
        const evidence = evidenceFromTraceOrDocument(trace, caseDef);
        const args = {
            claim,
            evidenceText: evidence.text,
        };
        if (evidence.sourceRef) {
            args.sourceRef = evidence.sourceRef;
        }
        return args;
    }
    return {};
}

function claimFromGoal(goal = '') {
    const text = String(goal || '').trim();
    const claimMatch = text.match(/Claim\s*:\s*(.+)$/i);
    if (claimMatch) return claimMatch[1].trim();
    return text || 'document claim';
}

function evidenceFromTraceOrDocument(trace = [], caseDef = {}) {
    for (const entry of [...trace].reverse()) {
        if (entry?.type !== 'tool') continue;
        const result = entry.result || {};
        const items = result.chunks || result.matches || [];
        if (Array.isArray(items) && items.length > 0) {
            const item = items[0] || {};
            const text = String(item.text || item.sourceText || '').trim();
            if (text) {
                return {
                    text,
                    sourceRef: {
                        documentId: item.documentId || caseDef.document?.id || null,
                        page: item.page || null,
                        paragraphId: item.paragraphId || item.id || null,
                        text: text.slice(0, 400),
                    },
                };
            }
        }
        if (result.text) {
            const text = String(result.text).trim();
            if (text) return { text, sourceRef: null };
        }
    }

    const document = caseDef.document || {};
    if (Array.isArray(document.pages) && document.pages[0]?.text) {
        return { text: String(document.pages[0].text), sourceRef: null };
    }
    if (document.contentText) {
        return { text: String(document.contentText).slice(0, 600), sourceRef: null };
    }
    return { text: '', sourceRef: null };
}

function lastToolResult(trace, toolName) {
    return [...trace].reverse().find((entry) => (
        entry?.type === 'tool' && entry.toolName === toolName
    ))?.result || null;
}

function collectSnippets(trace = []) {
    const snippets = [];
    for (const entry of [...trace].reverse()) {
        if (entry?.type !== 'tool') continue;
        const result = entry.result || {};
        const chunks = result.chunks || result.matches || [];
        if (Array.isArray(chunks)) {
            for (const chunk of chunks) {
                const text = String(chunk?.text || chunk?.sourceText || '').trim();
                if (text) snippets.push(text);
            }
        }
        if (result.text) {
            const text = String(result.text).trim();
            if (text) snippets.push(text);
        }
    }
    return snippets;
}

function groundedContentFromTrace(trace, goal, caseDef) {
    const snippets = collectSnippets(trace);
    const meta = lastToolResult(trace, 'get_current_document') || {};
    const docName = meta.name || caseDef.document?.name || 'document';
    const verify = lastToolResult(trace, 'verify_citation');
    const knowledge = lastToolResult(trace, 'knowledge_search');
    const body = snippets.length > 0
        ? snippets.slice(0, 4).map((text, index) => `${index + 1}. ${text}`).join('\n')
        : 'No grounded snippets were returned by tools.';

    if (verify) {
        const score = Number.isFinite(Number(verify.score)) ? Number(verify.score) : 0;
        const grounded = Boolean(verify.grounded);
        const verdict = grounded
            ? 'supported'
            : score > 0
                ? 'partially_supported'
                : snippets.length > 0
                    ? 'unsupported'
                    : 'not_found';
        return [
            '# Claim critique',
            '',
            `Document: ${docName}`,
            `Claim: ${verify.claim || claimFromGoal(goal)}`,
            `Verdict: ${verdict}`,
            `Grounded: ${grounded ? 'yes' : 'no'}`,
            `Score: ${score.toFixed(3)}`,
            `Method: ${verify.method || 'token-overlap'}`,
            '',
            'Evidence:',
            body,
        ].join('\n');
    }

    return [
        '# Offline eval answer',
        '',
        `Document: ${docName}`,
        goal ? `Goal: ${goal}` : '',
        knowledge?.engine ? `Engine: ${knowledge.engine}` : '',
        '',
        'Grounded evidence:',
        body,
    ].filter(Boolean).join('\n');
}

function sourceRefsFromTrace(trace = []) {
    const refs = [];
    for (const entry of trace) {
        if (entry?.type !== 'tool') continue;
        const result = entry.result || {};
        const items = result.chunks || result.matches || [];
        if (Array.isArray(items)) {
            for (const item of items) {
                refs.push({
                    documentId: item.documentId || null,
                    page: item.page || null,
                    paragraphId: item.paragraphId || item.id || null,
                    text: String(item.text || '').slice(0, 240),
                });
            }
        }
        // Page-aware get_page_text / extractText returns { page, text } without chunks.
        if (
            result.text
            && (result.page != null || result.source === 'page')
            && entry.toolName === 'get_page_text'
        ) {
            const page = result.page ?? null;
            refs.push({
                documentId: result.documentId || null,
                page,
                paragraphId: page != null ? `page-${page}` : null,
                text: String(result.text).slice(0, 240),
            });
        }
    }
    return refs;
}

/**
 * Resolve local model for a case.
 * Prefer dedicated offline eval model so tool expectations are met;
 * paper/knowledge/critic locals apply per case strategy or suite env.
 * Precedence: caseDef.modelStrategy | caseDef.strategy | skill type | suite strategy.
 * paper_overview_agent -> createLocalPaperOverviewModel (run via runReadingAgent).
 */
function resolveOfflineModel(caseDef = {}, strategy = 'eval') {
    const type = String(caseDef.type || caseDef.skillType || '').trim();
    const typeStrategy =
        type === 'paper_overview_agent' ? 'paper_overview'
            : type === 'knowledge_qa_agent' ? 'knowledge_qa'
                : type === 'critic_agent' ? 'critic'
                    : null;
    const resolved = String(
        caseDef.modelStrategy
        || caseDef.strategy
        || typeStrategy
        || strategy
        || 'eval',
    ).trim() || 'eval';

    if (resolved === 'paper_overview') return createLocalPaperOverviewModel();
    if (resolved === 'knowledge_qa') return createLocalKnowledgeQaModel();
    if (resolved === 'critic') return createLocalCriticModel();
    return createLocalOfflineEvalModel(caseDef);
}

async function runCase(caseDef, strategy) {
    const document = caseDef.document || {};
    const tools = createReadingTools({ document });
    const model = resolveOfflineModel(caseDef, strategy);

    return runReadingAgent({
        goal: caseDef.goal || '',
        model,
        tools,
        permissions: DEFAULT_READING_PERMISSIONS,
        context: { document },
        maxIterations: 8,
        timeoutMs: 30000,
    });
}

function printSummary(summary) {
    console.log('');
    console.log(`total: ${summary.total}  passed: ${summary.passed}  failed: ${summary.failed}`);
    for (const entry of summary.results) {
        const mark = entry.pass ? 'PASS' : 'FAIL';
        console.log(`\n[${mark}] ${entry.id}`);
        if (entry.error) {
            console.log(`  error: ${entry.error}`);
        }
        const agent = entry.agentResult || {};
        const tools = (agent.trace || [])
            .filter((t) => t.type === 'tool')
            .map((t) => t.toolName);
        console.log(`  status: ${agent.status || '(none)'}`);
        console.log(`  tools: ${tools.join(', ') || '(none)'}`);
        if (agent.content) {
            const preview = String(agent.content).replace(/\s+/g, ' ').slice(0, 180);
            console.log(`  content: ${preview}`);
        }
        for (const check of entry.checks || []) {
            console.log(`  check ${check.pass ? 'PASS' : 'FAIL'}: ${check.name} - ${check.detail}`);
        }
    }
    console.log('');
    console.log(summary.failed === 0 ? 'RESULT: PASS' : 'RESULT: FAIL');
}

async function main() {
    const strategy = String(process.env.AGENT_EVAL_OFFLINE_STRATEGY || 'eval').trim() || 'eval';
    const strictEnv = String(process.env.AGENT_EVAL_STRICT_GROUNDING || '').trim();
    console.log('agent-eval-offline: starting (no network)');
    console.log(`root: ${ROOT}`);
    console.log(`cases: ${READING_EVAL_CASES.length}`);
    console.log(`strategy: ${strategy}`);
    console.log(`strictGrounding env: ${strictEnv || '(off)'}`);
    console.log(`scoreAgentResult: ${typeof scoreAgentResult}`);

    const summary = await runReadingEvalSuite({
        cases: READING_EVAL_CASES,
        runCase: (caseDef) => runCase(caseDef, strategy),
    });

    printSummary(summary);
    process.exit(summary.failed === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error('FAIL: unhandled error:', error?.message || error);
    if (error?.stack) console.error(error.stack);
    process.exit(1);
});
