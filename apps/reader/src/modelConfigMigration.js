import { findPresetById, normalizeBaseUrl } from './modelPresets';

const LEGACY_KIMI_IDS = new Set(['preset-kimi-free-trial', 'preset-kimi-default']);

function isLocalEndpoint(baseUrl) {
  try {
    const parsed = new URL(baseUrl);
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  } catch (_) {
    return false;
  }
}

function stripTrailingSlashes(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function normalizeConfigBaseUrl(rawBaseUrl, preset, apiFormat) {
  const trimmed = stripTrailingSlashes(rawBaseUrl);
  if (!trimmed) return '';

  const isAnthropicCompatible =
    apiFormat === 'anthropic' ||
    preset?.apiType === 'anthropic-compatible';
  if (isAnthropicCompatible) {
    const presetBaseUrl = stripTrailingSlashes(preset?.baseUrl);
    if (presetBaseUrl && trimmed === `${presetBaseUrl}/v1`) return presetBaseUrl;
    return trimmed;
  }

  return normalizeBaseUrl(trimmed);
}

function isBlankApiKey(config = {}) {
  return !String(config.apiKey || '').trim();
}

function isLegacyKimiConfig(config = {}) {
  const id = String(config.id || '').toLowerCase();
  const providerKey = String(config.providerKey || config.presetKey || '').toLowerCase();
  return LEGACY_KIMI_IDS.has(id) || providerKey === 'kimi-free-trial';
}

export function shouldDropModelConfigRecord(config = {}) {
  const providerKey = inferProviderKey(config);
  return providerKey === 'kimi' && isBlankApiKey(config) && isLegacyKimiConfig(config);
}

export function inferProviderKey(config = {}) {
  const explicitKey = config.providerKey || config.presetKey || '';
  if (explicitKey === 'kimi-free-trial') return 'kimi';
  if (findPresetById(explicitKey)) return explicitKey;

  const id = String(config.id || '').toLowerCase();
  const model = String(config.modelName || config.model || config.name || '').toLowerCase();
  const baseUrl = String(config.baseUrl || config.baseURL || '').toLowerCase();

  if (id.includes('kimi') || id.includes('moonshot') || model.startsWith('kimi-') || model.startsWith('moonshot-') || baseUrl.includes('api.moonshot.')) {
    return 'kimi';
  }
  if (id.includes('minimax') || model.startsWith('minimax-') || baseUrl.includes('api.minimaxi.com') || baseUrl.includes('api.minimax.io')) {
    return 'minimax';
  }
  if (id.includes('mimo') || model.startsWith('mimo-') || baseUrl.includes('xiaomimimo.com')) {
    return 'mimo';
  }
  if (id.includes('deepseek') || model.startsWith('deepseek-') || baseUrl.includes('api.deepseek.com')) {
    return 'deepseek';
  }
  if (id.includes('stepfun') || id.includes('step-') || model.startsWith('step-') || baseUrl.includes('api.stepfun.com')) {
    return 'stepfun';
  }
  if (baseUrl.includes('api.openai.com')) return 'openai';
  if (baseUrl.includes('api.anthropic.com')) return 'anthropic';
  return '';
}

export function normalizeModelConfigRecord(config = {}) {
  const providerKey = inferProviderKey(config);
  const preset = providerKey ? findPresetById(providerKey) : null;
  let rawBaseUrl = config.baseUrl || config.baseURL || preset?.baseUrl || '';
  if (providerKey === 'minimax' || providerKey === 'minimax-api') {
    rawBaseUrl = preset?.baseUrl || rawBaseUrl;
  }
  const originalName = String(config.name || '').trim();
  let modelName = config.modelName || config.model || originalName || preset?.defaultModel || '';
  if ((providerKey === 'minimax' || providerKey === 'minimax-api') && /^MiniMax-M2\./i.test(modelName)) {
    modelName = 'MiniMax-M3';
  }
  if (providerKey === 'kimi' && /^moonshot-v1-/i.test(modelName)) {
    modelName = preset?.defaultModel || 'kimi-k2.6';
  }
  const displayName =
    /^MiniMax-M2\./i.test(originalName) || /^moonshot-v1-/i.test(originalName)
      ? modelName
      : (originalName || modelName);
  const apiFormat =
    config.apiFormat ||
    (config.apiType === 'anthropic-compatible' || preset?.apiType === 'anthropic-compatible' ? 'anthropic' : 'openai');
  const baseUrl = normalizeConfigBaseUrl(rawBaseUrl, preset, apiFormat);
  const authType = config.authType || preset?.authType || 'bearer';
  const credentialMode = config.credentialMode || preset?.credentialMode || '';
  const canSkipApiKey = config.requiresApiKey === false && (authType === 'none' || isLocalEndpoint(baseUrl));

  return {
    ...config,
    baseUrl,
    modelName,
    name: displayName,
    apiFormat,
    providerKey,
    requiresApiKey: !canSkipApiKey,
    authType,
    credentialMode,
  };
}

export function normalizeModelConfigList(configs) {
  if (!Array.isArray(configs)) return [];
  return configs
    .filter((config) => config && typeof config === 'object')
    .filter((config) => !shouldDropModelConfigRecord(config))
    .map((config) => normalizeModelConfigRecord(config));
}
