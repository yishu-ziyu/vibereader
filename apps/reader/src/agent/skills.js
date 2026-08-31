// 单一来源：技能 system prompt 文本全部来自 docs/reading-agent-skills/*.md（Vite ?raw 注入）。
// skills.js 只保留技能元数据（goal / tools / artifact / maxIterations），不再内嵌提示词文本。
import attentionRouteDoc from '../../docs/reading-agent-skills/attention-route.md?raw';
import cardGenerationDoc from '../../docs/reading-agent-skills/card-generation.md?raw';
import criticDoc from '../../docs/reading-agent-skills/critic.md?raw';
import knowledgeQaDoc from '../../docs/reading-agent-skills/knowledge-qa.md?raw';
import memoryCuratorDoc from '../../docs/reading-agent-skills/memory-curator.md?raw';
import noteExportDoc from '../../docs/reading-agent-skills/note-export.md?raw';
import paperOverviewDoc from '../../docs/reading-agent-skills/paper-overview.md?raw';

const READING_AGENT_SKILLS = Object.freeze([
    Object.freeze({
        type: 'paper_overview_agent',
        title: 'Paper overview',
        skillPath: 'docs/reading-agent-skills/paper-overview.md',
        goal: 'Create a concise paper overview for the current document using safe metadata and bounded source chunks.',
        requiredTools: Object.freeze([
            'get_current_document',
            'get_document_chunks',
        ]),
        outputArtifactType: 'reading_note',
        maxIterations: 4,
    }),
    Object.freeze({
        type: 'attention_agent',
        title: 'Attention route',
        skillPath: 'docs/reading-agent-skills/attention-route.md',
        goal: 'Identify the most important source-grounded reading positions and rank them as a short reading route.',
        requiredTools: Object.freeze([
            'get_current_document',
            'get_document_chunks',
            'list_attention_insights',
        ]),
        outputArtifactType: 'attention_insights',
        maxIterations: 4,
    }),
    Object.freeze({
        type: 'card_generation_agent',
        title: 'Create VibeCard',
        skillPath: 'docs/reading-agent-skills/card-generation.md',
        goal: 'Generate source-grounded VibeCards from the current document without inventing unsupported claims.',
        requiredTools: Object.freeze([
            'get_current_document',
            'get_document_chunks',
            'create_vibecard',
        ]),
        outputArtifactType: 'vibecard',
        maxIterations: 6,
    }),
    Object.freeze({
        type: 'note_export_agent',
        title: 'Note export',
        skillPath: 'docs/reading-agent-skills/note-export.md',
        goal: 'Assemble a source-grounded reading note export from saved summaries, insights, cards, and document metadata.',
        requiredTools: Object.freeze([
            'get_current_document',
            'list_attention_insights',
            'export_note',
        ]),
        outputArtifactType: 'reading_note_export',
        // get_current_document → list_attention_insights → export_note → final
        maxIterations: 4,
    }),
    Object.freeze({
        type: 'knowledge_qa_agent',
        title: 'Knowledge QA',
        skillPath: 'docs/reading-agent-skills/knowledge-qa.md',
        goal: 'Answer reading questions with UniRAG knowledge_search and local document tools, always attaching source refs.',
        requiredTools: Object.freeze([
            'get_current_document',
            'knowledge_search',
            'get_document_chunks',
            'search_document',
        ]),
        outputArtifactType: 'knowledge_answer',
        maxIterations: 6,
    }),
    Object.freeze({
        type: 'critic_agent',
        title: 'Claim critic',
        skillPath: 'docs/reading-agent-skills/critic.md',
        goal: 'Verify claims against document tools and verify_citation; separate supported, partial, unsupported, and not found.',
        requiredTools: Object.freeze([
            'get_current_document',
            'get_document_chunks',
            'search_document',
            'verify_citation',
        ]),
        outputArtifactType: 'claim_critique',
        maxIterations: 8,
    }),
    Object.freeze({
        type: 'memory_curator_agent',
        title: 'Memory curator',
        skillPath: 'docs/reading-agent-skills/memory-curator.md',
        goal: 'Search saved memory for relevant context and propose save candidates; never auto-write long-term memory without user confirm.',
        requiredTools: Object.freeze([
            'memory_search',
            'get_current_document',
            'list_attention_insights',
        ]),
        outputArtifactType: 'memory_curation',
        maxIterations: 4,
    }),
]);

/**
 * 技能 type → 对应 md 原文（?raw）。这是 system prompt 的唯一文本来源：
 * 兜底顺序 = skills 注册表（此处）→ 对应 md。
 */
const SKILL_PROMPT_SOURCES = Object.freeze({
    paper_overview_agent: paperOverviewDoc,
    attention_agent: attentionRouteDoc,
    card_generation_agent: cardGenerationDoc,
    note_export_agent: noteExportDoc,
    knowledge_qa_agent: knowledgeQaDoc,
    critic_agent: criticDoc,
    memory_curator_agent: memoryCuratorDoc,
});

/**
 * 返回技能对应的 md 原文（trim 后）。未知技能返回空字符串。
 * @param {string} type
 * @returns {string}
 */
export function getSkillPromptSource(type) {
    const raw = SKILL_PROMPT_SOURCES[type];
    return typeof raw === 'string' ? raw.trim() : '';
}

function cloneSkill(skill) {
    return {
        ...skill,
        requiredTools: [...skill.requiredTools],
    };
}

export function listReadingAgentSkills() {
    return READING_AGENT_SKILLS.map(cloneSkill);
}

export function getReadingAgentSkill(type) {
    const skill = READING_AGENT_SKILLS.find((candidate) => candidate.type === type);
    return skill ? cloneSkill(skill) : null;
}

/**
 * Browser-safe system prompt for a skill.
 * Single source: the skill's md document (bundled via ?raw in this module).
 * Progressive disclosure: callers may pass options.skillDocument (md string);
 * it is appended only when it differs from the registry md (tests / Node eval
 * inject custom docs; the product path re-injects the same md and is deduped).
 *
 * @param {string} type
 * @param {{ systemPrompt?: string, skillDocument?: string }} [options]
 */
export function buildSystemPromptForSkill(type, options = {}) {
    const skill = getReadingAgentSkill(type);
    if (!skill) {
        return null;
    }

    const fromRegistry = getSkillPromptSource(type);
    const override = typeof options.systemPrompt === 'string' ? options.systemPrompt.trim() : '';
    const fromDoc = typeof options.skillDocument === 'string' ? options.skillDocument.trim() : '';

    // 注入文档与注册表 md 相同时不重复追加（产品路径 resolveSkillDocument 会再次注入同一 md）
    const docBlock = fromDoc && fromDoc !== fromRegistry
        ? `Skill document (${skill.skillPath}):\n${fromDoc}`
        : null;

    const parts = [
        override || fromRegistry || null,
        docBlock,
        `Goal: ${skill.goal}`,
        `Required tools: ${skill.requiredTools.join(', ')}`,
        `Output artifact type: ${skill.outputArtifactType}`,
        `Max iterations: ${skill.maxIterations}`,
    ].filter(Boolean);

    return parts.join('\n\n');
}

export function buildReadingAgentTask(type, document = {}, overrides = {}) {
    const skill = getReadingAgentSkill(type);
    if (!skill) {
        throw new Error(`Unknown reading agent skill: ${type}`);
    }

    const documentId = overrides.documentId || document.id || null;
    const goal = overrides.goal || skill.goal;
    const maxIterations = overrides.maxIterations || skill.maxIterations;
    const systemPrompt = overrides.systemPrompt || buildSystemPromptForSkill(type);

    return {
        documentId,
        type: skill.type,
        title: overrides.title || skill.title,
        payload: {
            ...(overrides.payload || {}),
            agentOptions: {
                taskType: skill.type,
                skillPath: skill.skillPath,
                documentId,
                goal,
                maxIterations,
                requiredTools: [...skill.requiredTools],
                outputArtifactType: skill.outputArtifactType,
                systemPrompt,
            },
        },
    };
}
