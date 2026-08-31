import { describe, expect, it } from 'vitest';

import { findPreset, getProviderOptions } from './modelPresets';

describe('model provider presets', () => {
  it('keeps MiMo Token Plan on the Anthropic-compatible endpoint', () => {
    const preset = findPreset('mimo');

    expect(preset).toMatchObject({
      id: 'mimo',
      providerKey: 'mimo',
      apiType: 'anthropic-compatible',
      apiFormats: ['anthropic'],
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
      authType: 'bearer',
      requiresApiKey: true,
    });
    expect(preset.models[0].id).toBe('mimo-v2.5-pro');
  });

  it('keeps MiniMax Token Plan on the owned M3 subscription-key configuration', () => {
    const preset = findPreset('minimax');

    expect(preset).toMatchObject({
      id: 'minimax',
      providerKey: 'minimax',
      provider: 'MiniMax Token Plan',
      apiType: 'anthropic-compatible',
      apiFormats: ['anthropic'],
      baseUrl: 'https://api.minimaxi.com/anthropic',
      requiresApiKey: true,
      credentialMode: 'token-plan',
    });
    expect(preset.models[0].id).toBe('MiniMax-M3');
    expect(preset.models.map((model) => model.id)).not.toContain('MiniMax-M2.7');
  });

  it('offers MiniMax API separately from Token Plan', () => {
    const preset = findPreset('minimax-api');

    expect(preset).toMatchObject({
      id: 'minimax-api',
      providerKey: 'minimax-api',
      provider: 'MiniMax API',
      apiType: 'anthropic-compatible',
      apiFormats: ['anthropic'],
      baseUrl: 'https://api.minimaxi.com/anthropic',
      requiresApiKey: true,
      credentialMode: 'pay-as-you-go-api',
    });
    expect(getProviderOptions().map((option) => option.key)).toEqual(
      expect.arrayContaining(['minimax', 'minimax-api'])
    );
  });

  it('keeps the legacy Kimi free-trial preset out of the picker', () => {
    expect(findPreset('kimi-free-trial')).toMatchObject({
      providerKey: 'kimi-free-trial',
      hiddenFromPicker: true,
      requiresApiKey: true,
    });

    expect(getProviderOptions().map((option) => option.key)).not.toContain('kimi-free-trial');
  });

  it('offers xAI / Grok with OpenAI-compatible api.x.ai defaults', () => {
    const preset = findPreset('xai');

    expect(preset).toMatchObject({
      id: 'xai',
      providerKey: 'xai',
      provider: 'xAI / Grok',
      apiType: 'openai-compatible',
      apiFormats: ['openai'],
      baseUrl: 'https://api.x.ai/v1',
      requiresApiKey: true,
    });
    expect(preset.models.map((model) => model.id)).toEqual(
      expect.arrayContaining(['grok-4.5', 'grok-4.3', 'grok-3-mini'])
    );
    expect(getProviderOptions().map((option) => option.key)).toContain('xai');
  });

  it('offers Local OpenAI Proxy (8317) with Grok defaults for agent eval', () => {
    const preset = findPreset('local-openai-proxy');

    expect(preset).toMatchObject({
      id: 'local-openai-proxy',
      providerKey: 'local-openai-proxy',
      provider: 'Local OpenAI Proxy (8317)',
      apiType: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8317/v1',
      requiresApiKey: true,
    });
    expect(preset.models[0].id).toBe('grok-4.5');
    expect(getProviderOptions().map((option) => option.key)).toContain('local-openai-proxy');
  });
});
