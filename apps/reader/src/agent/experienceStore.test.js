import { describe, expect, it, vi } from 'vitest';
import {
    createExperienceStore,
    deriveLessonsFromRuns,
    formatLessonsPrompt,
    formatSkillProposalsMarkdown,
    proposeSkillImprovements,
} from './experienceStore';

function memoryStorage(seed = {}) {
    const map = new Map(Object.entries(seed));
    return {
        getItem: vi.fn((key) => (map.has(key) ? map.get(key) : null)),
        setItem: vi.fn((key, value) => {
            map.set(key, String(value));
        }),
        _map: map,
    };
}

describe('createExperienceStore', () => {
    it('records runs in memory and lists them', () => {
        const store = createExperienceStore({ now: () => 1000 });
        const entry = store.recordRun({
            goal: 'Summarize paper',
            skillType: 'paper_overview_agent',
            status: 'completed',
            contentSummary: 'Done.',
            sourceRefs: [{ page: 1, text: 'a' }],
            trace: [{ type: 'model', iteration: 1, response: { type: 'final' } }],
        });

        expect(entry.id).toMatch(/^exp-/);
        expect(entry.ts).toBe(1000);
        expect(entry.goal).toBe('Summarize paper');
        expect(entry.skillType).toBe('paper_overview_agent');
        expect(entry.status).toBe('completed');
        expect(entry.sourceRefs).toEqual([{ page: 1, text: 'a' }]);
        expect(store.listRuns()).toHaveLength(1);
        expect(Object.isFrozen(entry)).toBe(true);
    });

    it('listFailures returns only non-success runs, newest-bounded by limit', () => {
        const store = createExperienceStore({ now: () => 1 });
        store.recordRun({ goal: 'ok', status: 'completed', contentSummary: 'ok' });
        store.recordRun({ goal: 'perm', status: 'permission_denied', contentSummary: 'denied' });
        store.recordRun({ goal: 'tool', status: 'tool_not_found', contentSummary: 'missing' });
        store.recordRun({ goal: 'ok2', status: 'succeeded', contentSummary: 'ok' });

        const failures = store.listFailures();
        expect(failures).toHaveLength(2);
        expect(failures.map((r) => r.status)).toEqual([
            'permission_denied',
            'tool_not_found',
        ]);

        expect(store.listFailures({ limit: 1 })).toHaveLength(1);
        expect(store.listFailures({ limit: 1 })[0].status).toBe('tool_not_found');
    });

    it('caps stored runs at maxRuns', () => {
        const store = createExperienceStore({ maxRuns: 2, now: () => 1 });
        store.recordRun({ goal: 'a', status: 'completed' });
        store.recordRun({ goal: 'b', status: 'completed' });
        store.recordRun({ goal: 'c', status: 'completed' });
        expect(store.listRuns().map((r) => r.goal)).toEqual(['b', 'c']);
    });

    it('persists via optional storage adapter and reloads', () => {
        const storage = memoryStorage();
        const storeA = createExperienceStore({
            storage,
            storageKey: 'test-exp',
            now: () => 42,
        });
        storeA.recordRun({
            goal: 'persist me',
            skillType: 'attention_agent',
            status: 'max_iterations',
            contentSummary: 'looped',
        });

        expect(storage.setItem).toHaveBeenCalled();
        const raw = storage._map.get('test-exp');
        expect(raw).toContain('persist me');

        const storeB = createExperienceStore({
            storage,
            storageKey: 'test-exp',
        });
        expect(storeB.listRuns()).toHaveLength(1);
        expect(storeB.listRuns()[0]).toEqual(expect.objectContaining({
            goal: 'persist me',
            status: 'max_iterations',
        }));
    });

    it('buildLessonsPrompt emits short bullets for known failure patterns', () => {
        const store = createExperienceStore({ now: () => 1 });
        store.recordRun({
            goal: 'Write cards',
            skillType: 'card_generation_agent',
            status: 'permission_denied',
            contentSummary: 'Tool create_vibecard is not allowed',
        });
        store.recordRun({
            goal: 'Overview',
            skillType: 'paper_overview_agent',
            status: 'tool_not_found',
            contentSummary: 'Tool "search_web" is not registered',
        });
        store.recordRun({
            goal: 'Route',
            skillType: 'attention_agent',
            status: 'max_iterations',
            contentSummary: 'hit cap',
        });
        store.recordRun({
            goal: 'QA',
            skillType: 'knowledge_qa_agent',
            status: 'completed',
            contentSummary: 'weak answer',
            trace: [{
                type: 'tool',
                toolName: 'get_document_chunks',
                result: { chunks: [] },
            }],
        });

        // empty_chunks can also fire from failed-status runs; force a failed empty case
        store.recordRun({
            goal: 'QA empty fail',
            skillType: 'knowledge_qa_agent',
            status: 'failed',
            contentSummary: 'no evidence',
            trace: [{
                type: 'tool',
                toolName: 'get_document_chunks',
                result: { chunks: [] },
            }],
        });

        const prompt = store.buildLessonsPrompt({ limit: 4 });
        expect(prompt).toContain('Lessons from past failed runs:');
        expect(prompt).toContain('tool list');
        expect(prompt).toContain('write tools');
        expect(prompt).toContain('iteration budget');
        expect(prompt).toContain('chunks come back empty');
        expect(prompt.split('\n').filter((line) => line.startsWith('- ')).length).toBeLessThanOrEqual(4);
    });

    it('buildLessonsPrompt returns empty string without failures', () => {
        const store = createExperienceStore();
        store.recordRun({ goal: 'ok', status: 'completed', contentSummary: 'fine' });
        expect(store.buildLessonsPrompt()).toBe('');
    });

    it('clear empties memory and storage', () => {
        const storage = memoryStorage();
        const store = createExperienceStore({ storage, storageKey: 'k' });
        store.recordRun({ goal: 'x', status: 'failed' });
        store.clear();
        expect(store.listRuns()).toEqual([]);
        expect(JSON.parse(storage._map.get('k') || '[]')).toEqual([]);
    });
});

describe('deriveLessonsFromRuns / formatLessonsPrompt', () => {
    it('dedupes lessons by rule id and prefers newest failures', () => {
        const lessons = deriveLessonsFromRuns([
            { status: 'permission_denied', ts: 1, contentSummary: 'old' },
            { status: 'permission_denied', ts: 2, contentSummary: 'new' },
            { status: 'tool_not_found', ts: 3, contentSummary: 'missing' },
        ], { limit: 5 });

        expect(lessons).toHaveLength(2);
        expect(lessons[0]).toMatch(/tool/i);
        expect(lessons[1]).toMatch(/permission|write tools/i);
    });

    it('detects empty chunks from tool result', () => {
        const lessons = deriveLessonsFromRuns([{
            status: 'failed',
            ts: 1,
            trace: [{
                type: 'tool',
                toolName: 'get_document_chunks',
                result: { chunks: [] },
            }],
        }]);
        expect(lessons.some((l) => /empty/i.test(l))).toBe(true);
    });

    it('formatLessonsPrompt wraps bullets', () => {
        expect(formatLessonsPrompt([])).toBe('');
        expect(formatLessonsPrompt(['Stay grounded.'])).toBe(
            'Lessons from past failed runs:\n- Stay grounded.'
        );
    });
});

describe('proposeSkillImprovements / formatSkillProposalsMarkdown', () => {
    it('returns structured proposals from failed runs with evidence ids', () => {
        const store = createExperienceStore({ now: () => 1000 });
        const a = store.recordRun({
            goal: 'Cards',
            skillType: 'card_generation_agent',
            status: 'permission_denied',
            contentSummary: 'Tool create_vibecard is not allowed',
        });
        const b = store.recordRun({
            goal: 'Cards again',
            skillType: 'card_generation_agent',
            status: 'permission_denied',
            contentSummary: 'permission_denied',
        });
        store.recordRun({
            goal: 'Overview',
            skillType: 'paper_overview_agent',
            status: 'tool_not_found',
            contentSummary: 'Tool "search_web" is not registered',
        });

        const proposals = proposeSkillImprovements(store, { limit: 5 });
        expect(proposals.length).toBeGreaterThanOrEqual(2);

        const cardPerm = proposals.find(
            (p) => p.skillType === 'card_generation_agent' && p.issueId === 'permission_denied'
        );
        expect(cardPerm).toEqual(expect.objectContaining({
            skillType: 'card_generation_agent',
            issueId: 'permission_denied',
            issue: expect.stringMatching(/permission|write/i),
            suggestedPromptTweak: expect.stringMatching(/create_vibecard|write/i),
            count: 2,
        }));
        expect(cardPerm.evidenceRunIds).toEqual(expect.arrayContaining([a.id, b.id]));
        expect(Object.isFrozen(cardPerm)).toBe(true);

        const overviewTool = proposals.find(
            (p) => p.skillType === 'paper_overview_agent' && p.issueId === 'tool_not_found'
        );
        expect(overviewTool).toBeTruthy();
        expect(overviewTool.suggestedPromptTweak).toMatch(/tool list|never invent/i);
    });

    it('filters by skillType and ignores pure successes', () => {
        const store = createExperienceStore({ now: () => 1 });
        store.recordRun({
            goal: 'ok',
            skillType: 'attention_agent',
            status: 'completed',
            contentSummary: 'solid route with refs',
            sourceRefs: [{ page: 1 }],
        });
        store.recordRun({
            goal: 'loop',
            skillType: 'attention_agent',
            status: 'max_iterations',
            contentSummary: 'hit cap',
        });
        store.recordRun({
            goal: 'cards fail',
            skillType: 'card_generation_agent',
            status: 'permission_denied',
            contentSummary: 'denied',
        });

        const onlyAttention = proposeSkillImprovements(store, {
            skillType: 'attention_agent',
            limit: 5,
        });
        expect(onlyAttention).toHaveLength(1);
        expect(onlyAttention[0].skillType).toBe('attention_agent');
        expect(onlyAttention[0].issueId).toBe('max_iterations');
    });

    it('includes low-quality completed runs (empty chunks / missing source refs)', () => {
        const store = createExperienceStore({ now: () => 50 });
        const empty = store.recordRun({
            goal: 'QA',
            skillType: 'knowledge_qa_agent',
            status: 'completed',
            contentSummary: 'Here is an answer based on the paper methods section.',
            sourceRefs: [],
            trace: [{
                type: 'tool',
                toolName: 'get_document_chunks',
                result: { chunks: [] },
            }],
        });
        const noRefs = store.recordRun({
            goal: 'Overview',
            skillType: 'paper_overview_agent',
            status: 'succeeded',
            contentSummary: 'Full overview of the abstract and claims without locations.',
            sourceRefs: [],
            trace: [{ type: 'tool', toolName: 'get_current_document', result: { id: 'd1' } }],
        });

        const proposals = proposeSkillImprovements(store, { limit: 10 });
        const emptyProp = proposals.find(
            (p) => p.issueId === 'empty_chunks' && p.skillType === 'knowledge_qa_agent'
        );
        const missingOnQa = proposals.find(
            (p) => p.issueId === 'missing_source_refs' && p.skillType === 'knowledge_qa_agent'
        );
        const missingOnOverview = proposals.find(
            (p) => p.issueId === 'missing_source_refs' && p.skillType === 'paper_overview_agent'
        );

        expect(emptyProp).toBeTruthy();
        expect(emptyProp.evidenceRunIds).toContain(empty.id);
        expect(emptyProp.suggestedPromptTweak).toMatch(/empty|metadata|invent/i);

        expect(missingOnQa).toBeTruthy();
        expect(missingOnQa.evidenceRunIds).toContain(empty.id);
        expect(missingOnOverview).toBeTruthy();
        expect(missingOnOverview.evidenceRunIds).toContain(noRefs.id);
    });

    it('store.proposeSkillImprovements mirrors free function', () => {
        const store = createExperienceStore({ now: () => 1 });
        store.recordRun({
            skillType: 'critic_agent',
            status: 'invalid_response',
            contentSummary: 'invalid_response from model',
        });
        const viaMethod = store.proposeSkillImprovements({ limit: 3 });
        const viaFree = proposeSkillImprovements(store, { limit: 3 });
        expect(viaMethod).toEqual(viaFree);
        expect(viaMethod[0].issueId).toBe('invalid_response');
    });

    it('returns empty when no candidate runs or limit is 0', () => {
        const store = createExperienceStore();
        store.recordRun({
            skillType: 'paper_overview_agent',
            status: 'completed',
            contentSummary: 'ok',
            sourceRefs: [{ page: 2 }],
        });
        expect(proposeSkillImprovements(store)).toEqual([]);
        expect(proposeSkillImprovements(store, { limit: 0 })).toEqual([]);
        expect(proposeSkillImprovements(null)).toEqual([]);
    });

    it('formatSkillProposalsMarkdown is human-review only and lists evidence', () => {
        expect(formatSkillProposalsMarkdown([])).toMatch(/No proposals/);

        const md = formatSkillProposalsMarkdown([{
            skillType: 'card_generation_agent',
            issueId: 'permission_denied',
            issue: 'Agent hits write-tool permission gates',
            suggestedPromptTweak: 'Require read evidence before create_vibecard.',
            evidenceRunIds: ['exp-1', 'exp-2'],
            count: 2,
        }]);

        expect(md).toContain('# Skill improvement proposals');
        expect(md).toContain('card_generation_agent');
        expect(md).toContain('exp-1, exp-2');
        expect(md).toContain('Require read evidence before create_vibecard.');
        expect(md).toMatch(/Human review only/);
        expect(md).toMatch(/do not auto-write skill md/i);
    });
});
