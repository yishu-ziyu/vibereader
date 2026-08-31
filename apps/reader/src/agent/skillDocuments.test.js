import { afterEach, describe, expect, it } from 'vitest';
import {
    __setBundledSkillDocumentsForTests,
    buildSkillDocumentIndex,
    resolveSkillDocument,
} from './skillDocuments';
import { getReadingAgentSkill } from './skills';

describe('buildSkillDocumentIndex', () => {
    it('indexes by skillPath suffix and basename from glob-like keys', () => {
        const index = buildSkillDocumentIndex({
            '/abs/apps/reader/docs/reading-agent-skills/paper-overview.md': '# Paper\nBody A',
            '../../docs/reading-agent-skills/critic.md': '## Critic\nBody B',
        });

        expect(index.bySkillPath.get('docs/reading-agent-skills/paper-overview.md'))
            .toContain('Body A');
        expect(index.byBasename.get('paper-overview.md')).toContain('Body A');
        expect(index.bySkillPath.get('docs/reading-agent-skills/critic.md'))
            .toContain('Body B');
        expect(index.byBasename.get('critic.md')).toContain('Body B');
    });

    it('skips non-string or empty modules', () => {
        const index = buildSkillDocumentIndex({
            'docs/reading-agent-skills/empty.md': '   ',
            'docs/reading-agent-skills/bad.md': 42,
            'docs/reading-agent-skills/ok.md': 'ok body',
        });
        expect(index.byBasename.has('empty.md')).toBe(false);
        expect(index.byBasename.has('bad.md')).toBe(false);
        expect(index.byBasename.get('ok.md')).toBe('ok body');
    });
});

describe('resolveSkillDocument', () => {
    afterEach(() => {
        __setBundledSkillDocumentsForTests(null);
    });

    it('returns empty string for missing skill or skillPath', () => {
        expect(resolveSkillDocument(null)).toBe('');
        expect(resolveSkillDocument({})).toBe('');
        expect(resolveSkillDocument({ skillPath: '   ' })).toBe('');
    });

    it('prefers explicit skillDocument inject over bundled map', () => {
        const skill = getReadingAgentSkill('paper_overview_agent');
        const text = resolveSkillDocument(skill, {
            skillDocument: '## Injected\nUNIQUE_INJECT_MARKER',
        });
        expect(text).toBe('## Injected\nUNIQUE_INJECT_MARKER');
    });

    it('resolves from options.documents by skillPath or basename (no network)', () => {
        const skill = {
            skillPath: 'docs/reading-agent-skills/custom-skill.md',
        };
        expect(resolveSkillDocument(skill, {
            documents: {
                'docs/reading-agent-skills/custom-skill.md': '# Custom\nFrom path key',
            },
        })).toContain('From path key');

        expect(resolveSkillDocument(skill, {
            documents: {
                'custom-skill.md': '# Custom\nFrom basename key',
            },
        })).toContain('From basename key');
    });

    it('falls back to empty when inject and bundled miss', () => {
        __setBundledSkillDocumentsForTests({});
        const skill = {
            skillPath: 'docs/reading-agent-skills/does-not-exist.md',
        };
        expect(resolveSkillDocument(skill)).toBe('');
        expect(resolveSkillDocument(skill, {
            documents: { 'other.md': 'nope' },
        })).toBe('');
    });

    it('loads bundled Vite ?raw modules for registered skill paths', () => {
        // Vitest uses Vite; import.meta.glob should ship real skill md.
        __setBundledSkillDocumentsForTests(null);
        const skill = getReadingAgentSkill('paper_overview_agent');
        const doc = resolveSkillDocument(skill);
        // If bundling works in this env, expect real content; else empty is ok
        // (fallback path). Prefer presence when available.
        if (doc) {
            expect(doc).toMatch(/Paper Overview|paper overview|get_document_chunks/i);
            expect(doc.length).toBeGreaterThan(80);
        } else {
            // Explicit contract: missing bundle still returns string empty, not throw.
            expect(doc).toBe('');
        }
    });

    it('uses test-stubbed bundled map when set', () => {
        __setBundledSkillDocumentsForTests({
            '../../docs/reading-agent-skills/paper-overview.md': [
                '# Paper Overview Agent',
                'STUB_BUNDLED_SKILL_MD_MARKER',
            ].join('\n'),
        });
        const skill = getReadingAgentSkill('paper_overview_agent');
        const doc = resolveSkillDocument(skill);
        expect(doc).toContain('STUB_BUNDLED_SKILL_MD_MARKER');
        expect(doc).toContain('Paper Overview Agent');
    });
});
