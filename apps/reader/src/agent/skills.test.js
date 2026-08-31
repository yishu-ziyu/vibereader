import { describe, expect, it } from 'vitest';
import {
    buildReadingAgentTask,
    buildSystemPromptForSkill,
    getReadingAgentSkill,
    getSkillPromptSource,
    listReadingAgentSkills,
} from './skills';

describe('reading agent skills', () => {
    it('lists the first reading-task skills as stable task definitions', () => {
        const skills = listReadingAgentSkills();

        expect(skills.map((skill) => skill.type)).toEqual([
            'paper_overview_agent',
            'attention_agent',
            'card_generation_agent',
            'note_export_agent',
            'knowledge_qa_agent',
            'critic_agent',
            'memory_curator_agent',
        ]);
        expect(skills[0]).toEqual(expect.objectContaining({
            type: 'paper_overview_agent',
            title: 'Paper overview',
            skillPath: 'docs/reading-agent-skills/paper-overview.md',
            requiredTools: [
                'get_current_document',
                'get_document_chunks',
            ],
            outputArtifactType: 'reading_note',
        }));
        expect(skills[2]).toEqual(expect.objectContaining({
            type: 'card_generation_agent',
            title: 'Create VibeCard',
            skillPath: 'docs/reading-agent-skills/card-generation.md',
            requiredTools: [
                'get_current_document',
                'get_document_chunks',
                'create_vibecard',
            ],
            outputArtifactType: 'vibecard',
            maxIterations: 6,
        }));
        expect(skills[4]).toEqual(expect.objectContaining({
            type: 'knowledge_qa_agent',
            title: 'Knowledge QA',
            skillPath: 'docs/reading-agent-skills/knowledge-qa.md',
            requiredTools: [
                'get_current_document',
                'knowledge_search',
                'get_document_chunks',
                'search_document',
            ],
            outputArtifactType: 'knowledge_answer',
        }));
        expect(skills[5]).toEqual(expect.objectContaining({
            type: 'critic_agent',
            requiredTools: expect.arrayContaining([
                'verify_citation',
                'search_document',
            ]),
            outputArtifactType: 'claim_critique',
        }));
        expect(skills[6]).toEqual(expect.objectContaining({
            type: 'memory_curator_agent',
            requiredTools: expect.arrayContaining([
                'memory_search',
            ]),
            outputArtifactType: 'memory_curation',
        }));
    });

    it('no longer embeds systemPrompt text; prompts come from bundled md (single source)', () => {
        for (const skill of listReadingAgentSkills()) {
            expect(skill.systemPrompt).toBeUndefined();
            const source = getSkillPromptSource(skill.type);
            expect(source.length).toBeGreaterThan(80);
            expect(source).toContain('You are');
        }
        // 各技能 md 的关键约束仍在（原内嵌 systemPrompt 的核心断言迁移到 md 来源）
        expect(getSkillPromptSource('paper_overview_agent')).toContain('Paper Overview Agent');
        expect(getSkillPromptSource('card_generation_agent')).toContain('create_vibecard');
        expect(getSkillPromptSource('knowledge_qa_agent')).toContain('knowledge_search');
        expect(getSkillPromptSource('critic_agent')).toContain('verify_citation');
        expect(getSkillPromptSource('memory_curator_agent')).toMatch(/userConfirmed/i);
        expect(getSkillPromptSource('unknown_agent')).toBe('');
    });

    it('builds a serializable task payload from a skill and current document', () => {
        const task = buildReadingAgentTask('paper_overview_agent', {
            id: 'doc-1',
            name: 'paper.pdf',
        });

        expect(task).toEqual({
            documentId: 'doc-1',
            type: 'paper_overview_agent',
            title: 'Paper overview',
            payload: {
                agentOptions: {
                    taskType: 'paper_overview_agent',
                    skillPath: 'docs/reading-agent-skills/paper-overview.md',
                    documentId: 'doc-1',
                    goal: expect.stringContaining('paper overview'),
                    maxIterations: 4,
                    requiredTools: [
                        'get_current_document',
                        'get_document_chunks',
                    ],
                    outputArtifactType: 'reading_note',
                    systemPrompt: expect.stringContaining('Paper Overview Agent'),
                },
            },
        });
        expect(JSON.parse(JSON.stringify(task))).toEqual(task);
    });

    it('builds serializable tasks for new business skills', () => {
        const knowledgeTask = buildReadingAgentTask('knowledge_qa_agent', { id: 'doc-2' });
        expect(knowledgeTask.payload.agentOptions.requiredTools).toContain('knowledge_search');
        expect(knowledgeTask.payload.agentOptions.systemPrompt).toContain('Evidence-first');
        expect(JSON.parse(JSON.stringify(knowledgeTask))).toEqual(knowledgeTask);

        const criticTask = buildReadingAgentTask('critic_agent', { id: 'doc-2' });
        expect(criticTask.payload.agentOptions.outputArtifactType).toBe('claim_critique');
        expect(criticTask.payload.agentOptions.requiredTools).toContain('verify_citation');

        const memoryTask = buildReadingAgentTask('memory_curator_agent', { id: 'doc-2' });
        expect(memoryTask.payload.agentOptions.requiredTools).toContain('memory_search');
        expect(memoryTask.payload.agentOptions.systemPrompt).toMatch(/auto memory_save|userConfirmed/i);
    });

    it('builds a browser-safe system prompt without requiring filesystem', () => {
        const prompt = buildSystemPromptForSkill('knowledge_qa_agent');
        expect(prompt).toContain('Knowledge QA Agent');
        expect(prompt).toContain('knowledge_search');
        expect(prompt).toContain('Required tools:');
        expect(prompt).toContain('knowledge_answer');
        // 单一来源：默认即包含注册表 md 正文，但不会出现 "Skill document (" 注入块
        expect(prompt).not.toContain('Skill document (');

        const withDoc = buildSystemPromptForSkill('critic_agent', {
            skillDocument: '## Extra\nUse verify_citation on every claim.',
        });
        expect(withDoc).toContain('Skill document (docs/reading-agent-skills/critic.md)');
        expect(withDoc).toContain('Use verify_citation on every claim');

        // 注入与注册表相同的 md 时不重复拼接（产品路径 resolveSkillDocument 复用同一文件）
        const sameDoc = buildSystemPromptForSkill('critic_agent', {
            skillDocument: getSkillPromptSource('critic_agent'),
        });
        expect(sameDoc).not.toContain('Skill document (');
        expect(sameDoc.split(getSkillPromptSource('critic_agent'))).toHaveLength(2);

        // paper_overview: progressive skillDocument injection (Node eval / tests inject string)
        const overviewWithDoc = buildSystemPromptForSkill('paper_overview_agent', {
            skillDocument: [
                '## Procedure',
                'Prefer abstract, method, results, conclusion signals.',
                'UNIQUE_PAPER_OVERVIEW_MD: grounded section signals.',
            ].join('\n'),
        });
        expect(overviewWithDoc).toContain('Paper Overview Agent');
        expect(overviewWithDoc).toContain(
            'Skill document (docs/reading-agent-skills/paper-overview.md)',
        );
        expect(overviewWithDoc).toContain('UNIQUE_PAPER_OVERVIEW_MD');
        expect(overviewWithDoc).toContain('Required tools: get_current_document, get_document_chunks');

        expect(buildSystemPromptForSkill('unknown_agent')).toBeNull();
    });

    it('fails clearly for unknown reading task types', () => {
        expect(getReadingAgentSkill('unknown_agent')).toBeNull();
        expect(() => buildReadingAgentTask('unknown_agent', { id: 'doc-1' })).toThrow(
            'Unknown reading agent skill: unknown_agent'
        );
    });

    it('clones requiredTools so callers cannot mutate the registry', () => {
        const skill = getReadingAgentSkill('paper_overview_agent');
        skill.requiredTools.push('mutate_me');
        expect(getReadingAgentSkill('paper_overview_agent').requiredTools).toEqual([
            'get_current_document',
            'get_document_chunks',
        ]);
    });
});
