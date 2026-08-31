const DEFAULT_TEST_CONFIG = {
  id: 'preset-minimax-default',
  baseUrl: 'https://api.minimaxi.com/anthropic',
  modelName: 'MiniMax-M3',
  apiFormat: 'anthropic',
  apiKey: '',
  requiresApiKey: true,
  providerKey: 'minimax',
  credentialMode: 'token-plan',
};

const ENV_PROVIDER_CONFIGS = [
  {
    envNames: ['STEPFUN_API_KEY', 'STEP_API_KEY'],
    baseUrlEnvNames: ['STEPFUN_BASE_URL', 'STEP_BASE_URL'],
    modelEnvNames: ['STEPFUN_MODEL', 'STEP_MODEL'],
    id: 'qa-env-stepfun',
    baseUrl: 'https://api.stepfun.com/v1',
    modelName: 'step-3.7-flash',
    apiFormat: 'openai',
    providerKey: 'stepfun',
  },
  {
    envNames: ['MIMO_API_KEY', 'MIMO_TOKEN_PLAN_KEY'],
    baseUrlEnvNames: ['MIMO_BASE_URL', 'MIMO_ANTHROPIC_BASE_URL'],
    modelEnvNames: ['MIMO_MODEL'],
    id: 'qa-env-mimo',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    modelName: 'mimo-v2.5-pro',
    apiFormat: 'anthropic',
    providerKey: 'mimo',
  },
  {
    envNames: ['MINIMAX_TOKEN_PLAN_KEY'],
    baseUrlEnvNames: ['MINIMAX_BASE_URL', 'MINIMAX_ANTHROPIC_BASE_URL'],
    modelEnvNames: ['MINIMAX_MODEL'],
    id: 'qa-env-minimax-token-plan',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    modelName: 'MiniMax-M3',
    apiFormat: 'anthropic',
    providerKey: 'minimax',
    credentialMode: 'token-plan',
  },
  {
    envNames: ['MINIMAX_API_KEY'],
    baseUrlEnvNames: ['MINIMAX_BASE_URL', 'MINIMAX_ANTHROPIC_BASE_URL'],
    modelEnvNames: ['MINIMAX_MODEL'],
    id: 'qa-env-minimax-api',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    modelName: 'MiniMax-M3',
    apiFormat: 'anthropic',
    providerKey: 'minimax-api',
    credentialMode: 'pay-as-you-go-api',
  },
  {
    envNames: ['KIMI_API_KEY'],
    baseUrlEnvNames: ['KIMI_BASE_URL'],
    modelEnvNames: ['KIMI_MODEL'],
    id: 'qa-env-kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    modelName: 'kimi-k2.6',
    apiFormat: 'openai',
    providerKey: 'kimi',
  },
  {
    envNames: ['MOONSHOT_API_KEY'],
    baseUrlEnvNames: ['MOONSHOT_BASE_URL'],
    modelEnvNames: ['MOONSHOT_MODEL'],
    id: 'qa-env-moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    modelName: 'kimi-k2.6',
    apiFormat: 'openai',
    providerKey: 'kimi',
  },
  {
    envNames: ['DEEPSEEK_API_KEY'],
    baseUrlEnvNames: ['DEEPSEEK_BASE_URL'],
    modelEnvNames: ['DEEPSEEK_MODEL'],
    id: 'qa-env-deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    modelName: 'deepseek-chat',
    apiFormat: 'openai',
    providerKey: 'deepseek',
  },
  {
    envNames: ['OPENAI_API_KEY'],
    baseUrlEnvNames: ['OPENAI_BASE_URL'],
    modelEnvNames: ['OPENAI_MODEL'],
    id: 'qa-env-openai',
    baseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-4o-mini',
    apiFormat: 'openai',
    providerKey: 'openai',
  },
  // Local cli-proxy-api / Grok via 8317 (no real secret committed; key from env only)
  {
    envNames: ['CLI_PROXY_API_KEY', 'XAI_API_KEY', 'GROK_API_KEY'],
    baseUrlEnvNames: ['CLI_PROXY_BASE_URL', 'XAI_BASE_URL'],
    modelEnvNames: ['CLI_PROXY_MODEL', 'XAI_MODEL', 'GROK_MODEL'],
    id: 'qa-env-local-openai-proxy-grok',
    baseUrl: 'http://127.0.0.1:8317/v1',
    modelName: 'grok-4.5',
    apiFormat: 'openai',
    providerKey: 'local-openai-proxy',
  },
];

/** Optional template: seed Grok via local 8317 proxy without requiring a real key in git */
const GROK_PROXY_SEED_TEMPLATE = {
  id: 'qa-local-openai-proxy-grok',
  baseUrl: 'http://127.0.0.1:8317/v1',
  modelName: 'grok-4.5',
  apiFormat: 'openai',
  apiKey: '',
  requiresApiKey: true,
  providerKey: 'local-openai-proxy',
};

function boolFromEnv(value, fallback) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'no'].includes(String(value).trim().toLowerCase());
}

function firstEnvValue(env, names = []) {
  const name = names.find((candidate) => env[candidate]);
  return name ? env[name] : '';
}

function isLocalSeedTarget(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (_) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  return hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1';
}

function assertSafeModelSeedTarget(targetUrl, env = process.env) {
  if (isLocalSeedTarget(targetUrl) || env.ALLOW_REMOTE_MODEL_SEED === '1') {
    return;
  }

  throw new Error(
    `Refusing to seed model config into non-local URL: ${targetUrl}. ` +
    'Set ALLOW_REMOTE_MODEL_SEED=1 only if you trust that origin.'
  );
}

function compactConfig(config) {
  return {
    id: config.id,
    baseUrl: config.baseUrl,
    modelName: config.modelName,
    apiFormat: config.apiFormat || 'openai',
    apiKey: config.apiKey || '',
    requiresApiKey: config.requiresApiKey !== false,
    ...(config.providerKey ? { providerKey: config.providerKey } : {}),
    ...(config.authType ? { authType: config.authType } : {}),
    ...(config.credentialMode ? { credentialMode: config.credentialMode } : {}),
  };
}

function buildSeedModelConfig(env = process.env) {
  const explicitBaseUrl = env.VIBEREADER_TEST_BASE_URL || env.QA_MODEL_BASE_URL;
  const explicitApiKey = env.VIBEREADER_TEST_API_KEY || env.QA_MODEL_API_KEY;
  const explicitModel = env.VIBEREADER_TEST_MODEL || env.QA_MODEL_NAME;

  if (explicitBaseUrl || explicitApiKey || explicitModel) {
    return compactConfig({
      id: env.VIBEREADER_TEST_MODEL_ID || env.QA_MODEL_ID || 'qa-env-model',
      baseUrl: explicitBaseUrl || 'https://api.openai.com/v1',
      apiKey: explicitApiKey || '',
      modelName: explicitModel || 'gpt-4o-mini',
      apiFormat: env.VIBEREADER_TEST_API_FORMAT || env.QA_MODEL_API_FORMAT || 'openai',
      authType: env.VIBEREADER_TEST_AUTH_TYPE || env.QA_MODEL_AUTH_TYPE || '',
      providerKey: env.VIBEREADER_TEST_PROVIDER_KEY || env.QA_MODEL_PROVIDER_KEY || '',
      requiresApiKey: boolFromEnv(env.VIBEREADER_TEST_REQUIRES_API_KEY || env.QA_MODEL_REQUIRES_API_KEY, true),
    });
  }

  // Example seed for Grok via 8317 (no secrets). Set VIBEREADER_SEED_GROK_PROXY=1
  if (env.VIBEREADER_SEED_GROK_PROXY === '1') {
    return compactConfig({
      ...GROK_PROXY_SEED_TEMPLATE,
      apiKey: firstEnvValue(env, ['CLI_PROXY_API_KEY', 'XAI_API_KEY', 'GROK_API_KEY']) || '',
    });
  }

  const provider = ENV_PROVIDER_CONFIGS.find((candidate) => firstEnvValue(env, candidate.envNames));
  if (provider) {
    return compactConfig({
      ...provider,
      baseUrl: firstEnvValue(env, provider.baseUrlEnvNames) || provider.baseUrl,
      modelName: firstEnvValue(env, provider.modelEnvNames) || provider.modelName,
      apiKey: firstEnvValue(env, provider.envNames),
      requiresApiKey: true,
    });
  }

  return { ...DEFAULT_TEST_CONFIG };
}

function formatCustomModelLabel(modelName) {
  return `Custom model (${modelName})`;
}

function buildModelStorageState(config) {
  const normalized = compactConfig(config);
  const selectedModel = {
    key: 'custom',
    label: formatCustomModelLabel(normalized.modelName),
    configId: normalized.id,
    config: normalized,
  };

  return {
    'ai-chat.modelConfigs': JSON.stringify([normalized]),
    'ai-chat.selectedConfigId': JSON.stringify(normalized.id),
    'ai-chat-model-store': JSON.stringify({
      state: {
        selectedModel,
        selectedConfigId: normalized.id,
      },
      version: 0,
    }),
  };
}

async function seedModelConfigInPage(page, config = buildSeedModelConfig()) {
  const entries = buildModelStorageState(config);
  await page.evaluate((storageEntries) => {
    Object.entries(storageEntries).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
  }, entries);
  return config;
}

module.exports = {
  DEFAULT_TEST_CONFIG,
  GROK_PROXY_SEED_TEMPLATE,
  buildSeedModelConfig,
  buildModelStorageState,
  seedModelConfigInPage,
  assertSafeModelSeedTarget,
  isLocalSeedTarget,
};
