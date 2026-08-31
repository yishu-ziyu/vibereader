/**
 * Resolve the model function for a reading-agent task.
 * Local deterministic models are the default/fallback (offline-safe).
 * When preferLlm is true and config has baseUrl + apiKey + model, try the
 * OpenAI-compatible adapter in ./llmModel.
 */

import {
    createLocalAttentionRouteModel,
    createLocalCardGenerationModel,
    createLocalCriticModel,
    createLocalKnowledgeQaModel,
    createLocalMemoryCuratorModel,
    createLocalNoteExportModel,
    createLocalPaperOverviewModel,
} from './readingTaskModels';
import { buildSystemPromptForSkill, getReadingAgentSkill } from './skills';
import {
    appendLessonsToSystemPrompt,
    createOpenAICompatibleAgentModel,
    DEFAULT_SYSTEM_PROMPT,
} from './llmModel';

const LLM_TIMEOUT_MS = 120000;
const LOCAL_TIMEOUT_MS = 30000;

function createLocalModel(taskType) {
    if (taskType === 'attention_agent') return createLocalAttentionRouteModel();
    if (taskType === 'card_generation_agent') return createLocalCardGenerationModel();
    if (taskType === 'paper_overview_agent') return createLocalPaperOverviewModel();
    if (taskType === 'knowledge_qa_agent') return createLocalKnowledgeQaModel();
    if (taskType === 'critic_agent') return createLocalCriticModel();
    if (taskType === 'memory_curator_agent') return createLocalMemoryCuratorModel();
    if (taskType === 'note_export_agent') return createLocalNoteExportModel();
    return null;
}

function hasRunnableLlmConfig(modelConfig) {
    if (!modelConfig || typeof modelConfig !== 'object') return false;
    const baseUrl = String(modelConfig.baseUrl || modelConfig.baseURL || '').trim();
    const apiKey = String(modelConfig.apiKey || '').trim();
    const model = String(modelConfig.model || modelConfig.modelName || modelConfig.name || '').trim();
    return Boolean(baseUrl && apiKey && model);
}

function llmIterationBudget(taskType, skill) {
    if (taskType === 'card_generation_agent') {
        return Math.max(Number(skill?.maxIterations) || 6, 10);
    }
    return Math.max(Number(skill?.maxIterations) || 4, 8);
}

/**
 * @param {string} taskType
 * @param {object|null} modelConfig validated product model config
 * @param {{
 *   preferLlm?: boolean,
 *   skill?: object,
 *   tools?: object,
 *   lessonsPrompt?: string,
 *   skillDocument?: string,
 * }} [options]
 * skillDocument: optional progressive skill md. Browser: createReadingAgentOptions
 * resolves via skillDocuments.js (Vite ?raw). Node eval may inject from fs.
 * Prompt single source: skills 注册表内联对应 md（?raw）；注入相同 md 会被去重。
 * @returns {{
 *   model: function|null,
 *   source: 'llm'|'local'|null,
 *   timeoutMs: number,
 *   maxIterations: number|null,
 * }}
 */
export function resolveReadingAgentModel(taskType, modelConfig, options = {}) {
    const preferLlm = options.preferLlm === true;
    const skill = options.skill || getReadingAgentSkill(taskType);
    const localModel = createLocalModel(taskType);
    const localMaxIterations = skill?.maxIterations || 4;

    if (!localModel && !preferLlm) {
        return {
            model: null,
            source: null,
            timeoutMs: LOCAL_TIMEOUT_MS,
            maxIterations: null,
        };
    }

    if (preferLlm && hasRunnableLlmConfig(modelConfig)) {
        try {
            // 兜底两级：skills 注册表（buildSystemPromptForSkill 内部解析对应 md）→ 极简 goal/tools。
            // skillDocument 注入与注册表 md 相同时会被 skills.js 去重，不会重复拼接。
            const promptOptions = typeof options.skillDocument === 'string'
                && options.skillDocument.trim()
                ? { skillDocument: options.skillDocument }
                : {};
            const fromSkill = buildSystemPromptForSkill(taskType, promptOptions) || '';
            const skillBlock = fromSkill
                || [
                    skill?.goal ? `Goal: ${skill.goal}` : '',
                    skill?.requiredTools?.length
                        ? `Tools: ${skill.requiredTools.join(', ')}.`
                        : '',
                ].filter(Boolean).join('\n');
            const baseSystemPrompt = skillBlock.startsWith(DEFAULT_SYSTEM_PROMPT)
                ? skillBlock
                : [DEFAULT_SYSTEM_PROMPT, '', skillBlock].filter(Boolean).join('\n');
            // Ch8 lessons: append once here; createOpenAICompatibleAgentModel also
            // accepts lessonsPrompt so direct callers stay consistent.
            const systemPrompt = appendLessonsToSystemPrompt(
                baseSystemPrompt,
                options.lessonsPrompt,
            );

            const llmModel = createOpenAICompatibleAgentModel({
                baseUrl: modelConfig.baseUrl || modelConfig.baseURL,
                apiKey: modelConfig.apiKey,
                model: modelConfig.model || modelConfig.modelName || modelConfig.name,
                authType: modelConfig.authType || 'bearer',
                systemPrompt,
                temperature: 0.2,
                tools: options.tools || undefined,
            });

            return {
                model: llmModel,
                source: 'llm',
                timeoutMs: LLM_TIMEOUT_MS,
                maxIterations: llmIterationBudget(taskType, skill),
            };
        } catch (error) {
            console.warn('[modelFactory] LLM model unavailable, falling back to local:', error?.message || error);
        }
    }

    if (!localModel) {
        return {
            model: null,
            source: null,
            timeoutMs: LOCAL_TIMEOUT_MS,
            maxIterations: null,
        };
    }

    return {
        model: localModel,
        source: 'local',
        timeoutMs: LOCAL_TIMEOUT_MS,
        maxIterations: localMaxIterations,
    };
}

export {
    hasRunnableLlmConfig,
    LLM_TIMEOUT_MS,
    LOCAL_TIMEOUT_MS,
};
