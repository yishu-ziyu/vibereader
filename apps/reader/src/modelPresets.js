/**
 * 模型预设配置（ProviderPreset 抽象层）
 * 来源：AI 组件工作流库 / MODEL_CAPABILITY_INDEX.md + 项目实际接入能力
 * 校验日期：2026-06-27
 */

// ==================== ProviderPreset 定义 ====================

export const PROVIDER_PRESETS = [
  // ---- 非国产 ----
  {
    id: 'anthropic',
    name: 'Anthropic / Claude',
    apiType: 'anthropic-compatible',
    region: 'global',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', vision: true },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', vision: true },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', vision: true },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', vision: true },
    ],
    doc: 'https://docs.anthropic.com',
    apiKeyPlaceholder: 'sk-ant-...',
    requiresApiKey: true,
    codingPlan: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    apiType: 'openai-compatible',
    region: 'global',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    models: [
      { id: 'gpt-5.5', name: 'GPT-5.5', vision: true },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', vision: true },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', vision: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', vision: true },
    ],
    doc: 'https://platform.openai.com/docs',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
    codingPlan: true,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    apiType: 'openai-compatible',
    region: 'global',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', vision: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', vision: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', vision: true },
      { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite', vision: true },
    ],
    doc: 'https://ai.google.dev/docs',
    apiKeyPlaceholder: 'AIza...',
    requiresApiKey: true,
    notes: '视觉/多模态优先',
  },
  {
    id: 'xai',
    name: 'xAI / Grok',
    apiType: 'openai-compatible',
    region: 'global',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.5',
    models: [
      { id: 'grok-4.5', name: 'Grok 4.5', vision: true },
      { id: 'grok-4.3', name: 'Grok 4.3', vision: true },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', vision: false },
    ],
    doc: 'https://docs.x.ai',
    apiKeyPlaceholder: 'xai-...',
    requiresApiKey: true,
    notes: 'OpenAI-compatible; browser CORS often blocked - prefer local-openai-proxy (8317) for agent eval',
  },

  // ---- 国产主链路 ----
  {
    id: 'stepfun',
    name: '阶跃星辰 (StepFun)',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://api.stepfun.com/v1',
    defaultModel: 'step-3.7-flash',
    models: [
      { id: 'step-3.7-flash', name: 'Step-3.7-flash', vision: false },
    ],
    doc: 'https://platform.stepfun.com',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
    codingPlan: true,
    notes: 'P0 主链路：reasoning + JSON output + 多 Agent',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek-V4 Pro', vision: false },
      { id: 'deepseek-v4-flash', name: 'DeepSeek-V4 Flash', vision: false },
      { id: 'deepseek-chat', name: 'DeepSeek-V3 (兼容)', vision: false },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1', vision: false },
    ],
    doc: 'https://platform.deepseek.com/api-docs',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
    codingPlan: true,
    tokenPlan: true,
  },
  {
    id: 'minimax',
    name: 'MiniMax Token Plan',
    apiType: 'anthropic-compatible',
    region: 'china',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    defaultModel: 'MiniMax-M3',
    models: [
      { id: 'MiniMax-M3', name: 'MiniMax-M3', vision: false },
    ],
    doc: 'https://platform.minimaxi.com/docs/token-plan/quickstart',
    apiKeyPlaceholder: 'Token Plan 订阅 Key（sk-cp-...）',
    requiresApiKey: true,
    codingPlan: true,
    tokenPlan: true,
    credentialMode: 'token-plan',
    notes: '本机默认模型服务；订阅 Key 与按量付费 API Key 不互通',
  },
  {
    id: 'minimax-api',
    name: 'MiniMax API',
    apiType: 'anthropic-compatible',
    region: 'china',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    defaultModel: 'MiniMax-M3',
    models: [
      { id: 'MiniMax-M3', name: 'MiniMax-M3', vision: false },
    ],
    doc: 'https://platform.minimaxi.com/docs/api-reference/text-anthropic-api',
    apiKeyPlaceholder: '按量付费 API Key（sk-...）',
    requiresApiKey: true,
    codingPlan: true,
    tokenPlan: false,
    credentialMode: 'pay-as-you-go-api',
    notes: '按量付费 API Key，与 Token Plan 订阅 Key 不互通',
  },
  {
    id: 'mimo',
    name: 'MiMo Token Plan',
    apiType: 'anthropic-compatible',
    region: 'china',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    defaultModel: 'mimo-v2.5-pro',
    models: [
      { id: 'mimo-v2.5-pro', name: 'MiMo v2.5 Pro', vision: false },
    ],
    doc: 'https://docs.mimo.com/',
    apiKeyPlaceholder: 'tp-...',
    requiresApiKey: true,
    codingPlan: true,
    tokenPlan: true,
    notes: 'Token Plan 使用 Anthropic 兼容端点 (/anthropic)',
  },

  // ---- 国产备用 / 免费 ----
  {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.6',
    models: [
      { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', vision: false },
      { id: 'kimi-k2.6', name: 'Kimi K2.6', vision: false },
      { id: 'kimi-k2.5', name: 'Kimi K2.5', vision: true },
    ],
    doc: 'https://platform.moonshot.cn/docs/intro',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
    codingPlan: true,
    tokenPlan: true,
    notes: '长文档、中文写作',
  },
  {
    id: 'kimi-free-trial',
    name: 'Kimi 旧体验配置（需 Key）',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.6',
    models: [
      { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', vision: false },
      { id: 'kimi-k2.6', name: 'Kimi K2.6', vision: false },
    ],
    doc: 'https://platform.moonshot.cn/docs/intro',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
    codingPlan: true,
    tokenPlan: true,
    hiddenFromPicker: true,
    notes: '历史兼容项：旧免 Key 配置会迁移到 Kimi provider 并要求 API Key',
  },
  {
    id: 'agnes',
    name: 'Agnes AI (免费)',
    apiType: 'openai-compatible',
    region: 'global',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    defaultModel: 'agnes-2.0-flash',
    models: [
      { id: 'agnes-2.0-flash', name: 'Agnes 2.0 Flash', vision: false },
    ],
    doc: 'https://apihub.agnes-ai.com',
    apiKeyPlaceholder: 'Agnes API Key',
    requiresApiKey: true,
    notes: '公测期免费（$0），DeepSeek 余额用尽时的兜底',
  },
  {
    id: 'zhipu',
    name: '智谱 AI (GLM)',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5',
    models: [
      { id: 'glm-5', name: 'GLM-5', vision: true },
      { id: 'glm-4', name: 'GLM-4', vision: true },
      { id: 'glm-4-flash', name: 'GLM-4-Flash', vision: true },
      { id: 'glm-4-air', name: 'GLM-4-Air', vision: true },
    ],
    doc: 'https://open.bigmodel.cn/dev/api',
    apiKeyPlaceholder: '...',
    requiresApiKey: true,
    codingPlan: true,
  },
  {
    id: 'volcengine',
    name: '火山引擎 (豆包)',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-128k',
    models: [
      { id: 'doubao-pro-128k', name: 'Doubao-pro-128k', vision: true },
      { id: 'doubao-lite-128k', name: 'Doubao-lite-128k', vision: true },
      { id: 'deepseek-r1-250120', name: 'DeepSeek-R1 (火山)', vision: false },
      { id: 'deepseek-v3-250120', name: 'DeepSeek-V3 (火山)', vision: false },
    ],
    doc: 'https://www.volcengine.com/docs/82379/1263482',
    apiKeyPlaceholder: '...',
    requiresApiKey: true,
    codingPlan: true,
    tokenPlan: true,
  },
  {
    id: 'aliyun-bailian',
    name: '阿里云百炼',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-max',
    models: [
      { id: 'qwen-max', name: '通义千问-Max', vision: true },
      { id: 'qwen-plus', name: '通义千问-Plus', vision: true },
      { id: 'qwen-turbo', name: '通义千问-Turbo', vision: true },
      { id: 'qwen-coder-plus', name: '通义千问-Coder Plus', vision: false },
    ],
    doc: 'https://help.aliyun.com/zh/model-studio/developer-reference',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
    codingPlan: true,
    tokenPlan: true,
  },
  {
    id: 'qwen',
    name: '通义千问 (DashScope)',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-max',
    models: [
      { id: 'qwen-max', name: '通义千问-Max', vision: true },
      { id: 'qwen-plus', name: '通义千问-Plus', vision: true },
      { id: 'qwen-turbo', name: '通义千问-Turbo', vision: true },
    ],
    doc: 'https://help.aliyun.com/zh/model-studio/developer-reference',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3 (SF)', vision: false },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek-R1 (SF)', vision: false },
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen2.5-72B', vision: false },
    ],
    doc: 'https://docs.siliconflow.cn',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
  },
  {
    id: '360',
    name: '360 智脑',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://api.360.cn/v1',
    defaultModel: '360gpt-pro',
    models: [
      { id: '360gpt-pro', name: '360gpt-pro', vision: false },
      { id: 'aiso-max', name: 'AISO-Max', vision: false },
      { id: 'aiso-pro', name: 'AISO-Pro', vision: false },
    ],
    doc: 'https://ai.360.com',
    apiKeyPlaceholder: '360 API Key',
    requiresApiKey: true,
    notes: '搜索增强主链路：360 AI Search + ChatCompletions',
  },
  {
    id: 'antigravity',
    name: 'Antigravity (本地代理)',
    apiType: 'openai-compatible',
    region: 'local',
    baseUrl: 'http://127.0.0.1:8317/v1',
    defaultModel: 'gemini-3-flash',
    models: [
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash', vision: true },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', vision: true },
      { id: 'kimi-k2', name: 'Kimi K2', vision: false },
      { id: 'gpt-5.5', name: 'GPT-5.5', vision: true },
    ],
    doc: 'http://127.0.0.1:8317/management.html',
    apiKeyPlaceholder: 'Antigravity API Key',
    requiresApiKey: true,
    notes: '本地代理 8317，需 launchd 运行。额度绑 Google 账号。',
  },
  {
    id: 'local-openai-proxy',
    name: 'Local OpenAI Proxy (8317)',
    apiType: 'openai-compatible',
    region: 'local',
    baseUrl: 'http://127.0.0.1:8317/v1',
    defaultModel: 'grok-4.5',
    models: [
      { id: 'grok-4.5', name: 'Grok 4.5', vision: true },
      { id: 'grok-4.3', name: 'Grok 4.3', vision: true },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', vision: false },
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash', vision: true },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', vision: true },
    ],
    doc: 'http://127.0.0.1:8317/management.html',
    apiKeyPlaceholder: 'cli-proxy / client key',
    requiresApiKey: true,
    notes: 'requires ~/.cli-proxy-api client key; dev-only. Vite maps 8317 → /api/llm-proxy on :3217',
  },
  {
    id: 'doubao',
    name: 'Doubao (火山引擎)',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-128k',
    models: [
      { id: 'doubao-pro-128k', name: 'Doubao-pro-128k', vision: true },
      { id: 'doubao-lite-128k', name: 'Doubao-lite-128k', vision: true },
    ],
    doc: 'https://www.volcengine.com/docs/82379/1263482',
    apiKeyPlaceholder: '...',
    requiresApiKey: true,
  },
];

// ==================== 工具函数 ==================

/**
 * 规范化 Base URL
 * - 去除末尾斜杠
 * - 如果缺失 /v1，自动补上
 * - 如果已经是完整 endpoint（如 .../v1/chat/completions 或 .../v1/messages），保留原样
 * @param {string} url
 * @returns {string}
 */
export function normalizeBaseUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let normalized = url.trim().replace(/\/+$/, '');
  if (!normalized) return '';

  // 如果已经是完整 endpoint，不再修改
  if (/(\/v\d+\/chat\/completions|\/v\d+\/messages)$/.test(normalized)) {
    return normalized;
  }

  // 如果末尾是 /vN，已经是版本号结尾，视为已规范化
  if (/\/v\d+$/.test(normalized)) {
    return normalized;
  }

  // 如果包含 /vN/ 但后面还有路径，保留原样（用户可能指向特定路径）
  if (/\/v\d+\//.test(normalized)) {
    return normalized;
  }

  // 否则补上 /v1
  return `${normalized}/v1`;
}

/**
 * 根据 preset id 查找预设
 * @param {string} id
 * @returns {Object|null}
 */
export function findPresetById(id) {
  return PROVIDER_PRESETS.find((p) => p.id === id) || null;
}

/**
 * 获取所有 preset 选项（用于下拉选择）
 * @returns {Array<{id, name, region}>}
 */
export function getPresetOptions() {
  return PROVIDER_PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    region: p.region,
  }));
}

/**
 * 获取指定 preset 的模型列表
 * @param {string} presetId
 * @returns {Array<{id, name, vision}>}
 */
export function getModelsForPreset(presetId) {
  const preset = findPresetById(presetId);
  if (!preset) return [];
  return preset.models.map((m) => ({
    id: m.id,
    name: m.name,
    vision: !!m.vision,
  }));
}

/**
 * 判断指定 preset + model 是否支持 vision
 * @param {string} presetId
 * @param {string} modelId
 * @returns {boolean}
 */
export function isVisionCapable(presetId, modelId) {
  if (!presetId || !modelId) return true; // 默认保守：假设支持
  const preset = findPresetById(presetId);
  if (!preset) return true;
  const model = preset.models.find(
    (m) => m.id === modelId || m.name === modelId
  );
  if (!model) return true;
  return !!model.vision;
}

/**
 * 解析 apiType
 * @param {Object} presetOrConfig - preset 对象或配置对象
 * @returns {string} 'openai-compatible' | 'anthropic-compatible'
 */
export function resolveApiType(presetOrConfig) {
  if (!presetOrConfig) return 'openai-compatible';
  if (presetOrConfig.apiType) return presetOrConfig.apiType;
  // 兼容旧格式 apiFormats
  if (Array.isArray(presetOrConfig.apiFormats)) {
    if (presetOrConfig.apiFormats.includes('anthropic')) return 'anthropic-compatible';
    if (presetOrConfig.apiFormats.includes('openai')) return 'openai-compatible';
  }
  return 'openai-compatible';
}

// ==================== 向后兼容：旧格式导出 ====================

/**
 * 将新 ProviderPreset 格式转换为旧 MODEL_PRESETS 格式
 */
function transformToOldFormat(preset) {
  return {
    id: preset.id,
    provider: preset.name,
    providerKey: preset.id,
    apiType: preset.apiType,
    apiFormats: preset.apiType === 'anthropic-compatible' ? ['anthropic'] : ['openai'],
    baseUrl: preset.baseUrl,
    authType: preset.authType || 'bearer',
    models: preset.models.map((m) => ({
      id: m.id,
      name: m.name,
      vision: !!m.vision,
      codingPlan: !!preset.codingPlan,
      tokenPlan: !!preset.tokenPlan,
    })),
    docs: preset.doc ? { api: preset.doc } : {},
    notes: preset.notes || '',
    requiresApiKey: preset.requiresApiKey !== false,
    codingPlan: !!preset.codingPlan,
    tokenPlan: !!preset.tokenPlan,
    credentialMode: preset.credentialMode || '',
    hiddenFromPicker: !!preset.hiddenFromPicker,
  };
}

/** 旧格式 MODEL_PRESETS（保持向后兼容） */
export const MODEL_PRESETS = PROVIDER_PRESETS.map(transformToOldFormat);

// ==================== 向后兼容：旧工具函数 ====================

/**
 * 根据 providerKey 查找预设（旧接口）
 * @param {string} providerKey
 * @returns {Object|null}
 */
export function findPreset(providerKey) {
  const preset = findPresetById(providerKey);
  return preset ? transformToOldFormat(preset) : null;
}

/**
 * 获取所有提供商列表（旧接口）
 * @returns {Array<{key, label}>}
 */
export function getProviderOptions() {
  return MODEL_PRESETS.filter((p) => !p.hiddenFromPicker).map((p) => ({
    key: p.providerKey,
    label: p.provider,
  }));
}

/**
 * 获取指定提供商的模型列表（旧接口）
 * @param {string} providerKey
 * @returns {Array<{id, name, vision}>}
 */
export function getModelOptions(providerKey) {
  const preset = findPreset(providerKey);
  if (!preset) return [];
  return preset.models.map((m) => ({
    id: m.id,
    name: m.name,
    vision: m.vision,
  }));
}

/**
 * 判断指定模型是否支持 vision（旧接口，按模型名称全局搜索）
 * @param {string} modelName
 * @returns {boolean}
 */
export function isVisionCapableByModelName(modelName) {
  if (!modelName) return true;
  const name = String(modelName).toLowerCase();
  for (const preset of PROVIDER_PRESETS) {
    for (const model of preset.models) {
      if (model.id.toLowerCase() === name || model.name.toLowerCase() === name) {
        return !!model.vision;
      }
    }
  }
  return true;
}
