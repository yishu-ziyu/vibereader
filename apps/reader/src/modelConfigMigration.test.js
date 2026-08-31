import { describe, expect, it } from 'vitest';

import {
  inferProviderKey,
  normalizeModelConfigList,
  normalizeModelConfigRecord,
} from './modelConfigMigration';

describe('model config migration', () => {
  it('drops legacy keyless Kimi configs from the runnable config list', () => {
    const migrated = normalizeModelConfigList([{
      id: 'preset-kimi-free-trial',
      baseUrl: 'https://api.moonshot.cn/v1',
      modelName: 'moonshot-v1-8k',
      apiFormat: 'openai',
      apiKey: '',
      requiresApiKey: false,
    }]);

    expect(migrated).toEqual([]);
  });

  it('migrates explicitly keyed legacy Kimi configs away from Moonshot v1 models', () => {
    const migrated = normalizeModelConfigRecord({
      id: 'custom-kimi',
      baseUrl: 'https://api.moonshot.cn/v1',
      modelName: 'moonshot-v1-8k',
      apiFormat: 'openai',
      apiKey: 'sk-test',
      providerKey: 'kimi',
    });

    expect(migrated).toMatchObject({
      providerKey: 'kimi',
      baseUrl: 'https://api.moonshot.cn/v1',
      modelName: 'kimi-k2.6',
      apiFormat: 'openai',
      requiresApiKey: true,
      authType: 'bearer',
    });
  });

  it('infers provider metadata for older MiniMax configs', () => {
    expect(inferProviderKey({
      id: 'preset-minimax-default',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      modelName: 'MiniMax-M2.7',
    })).toBe('minimax');

    expect(normalizeModelConfigRecord({
      id: 'preset-minimax-default',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      name: 'MiniMax-M2.7',
      modelName: 'MiniMax-M2.7',
      apiFormat: 'anthropic',
      apiKey: '',
    })).toMatchObject({
      providerKey: 'minimax',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      modelName: 'MiniMax-M3',
      name: 'MiniMax-M3',
      requiresApiKey: true,
      authType: 'bearer',
      credentialMode: 'token-plan',
    });
  });

  it('repairs Anthropic-compatible provider URLs that were normalized with a stray /v1', () => {
    expect(normalizeModelConfigRecord({
      id: 'preset-minimax-default',
      baseUrl: 'https://api.minimaxi.com/anthropic/v1',
      name: 'MiniMax-M2.7',
      modelName: 'MiniMax-M2.7',
      apiFormat: 'anthropic',
    })).toMatchObject({
      providerKey: 'minimax',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      modelName: 'MiniMax-M3',
      name: 'MiniMax-M3',
    });
  });

  it('preserves explicit MiniMax API configs as pay-as-you-go API mode', () => {
    expect(normalizeModelConfigRecord({
      id: 'minimax-api',
      providerKey: 'minimax-api',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      modelName: 'MiniMax-M3',
      apiFormat: 'anthropic',
    })).toMatchObject({
      providerKey: 'minimax-api',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      modelName: 'MiniMax-M3',
      credentialMode: 'pay-as-you-go-api',
    });
  });

  it('preserves no-key mode only for local or explicitly unauthenticated configs', () => {
    expect(normalizeModelConfigRecord({
      id: 'local-agent',
      baseUrl: 'http://127.0.0.1:8317/v1',
      modelName: 'local-model',
      apiFormat: 'openai',
      requiresApiKey: false,
    })).toMatchObject({
      requiresApiKey: false,
    });

    expect(normalizeModelConfigRecord({
      id: 'no-auth-proxy',
      baseUrl: 'https://proxy.example.test/v1',
      modelName: 'proxy-model',
      apiFormat: 'openai',
      authType: 'none',
      requiresApiKey: false,
    })).toMatchObject({
      requiresApiKey: false,
      authType: 'none',
    });

    expect(normalizeModelConfigRecord({
      id: 'external-no-key',
      baseUrl: 'https://api.example.test/v1',
      modelName: 'remote-model',
      apiFormat: 'openai',
      requiresApiKey: false,
    })).toMatchObject({
      requiresApiKey: true,
    });
  });

  it('drops malformed records while normalizing config lists', () => {
    expect(normalizeModelConfigList([
      null,
      { id: 'kimi', baseUrl: 'https://api.moonshot.cn/v1', modelName: 'kimi-k2.6' },
      'bad',
    ])).toHaveLength(1);
  });
});
