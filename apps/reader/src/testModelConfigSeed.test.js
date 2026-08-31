import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  assertSafeModelSeedTarget,
  buildSeedModelConfig,
  buildModelStorageState,
  isLocalSeedTarget,
} = require('../scripts/modelConfigSeed.cjs');

describe('model config seed helper', () => {
  it('builds the owned MiniMax M3 config by default', () => {
    const config = buildSeedModelConfig({});

    expect(config).toMatchObject({
      id: 'preset-minimax-default',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      modelName: 'MiniMax-M3',
      apiFormat: 'anthropic',
      apiKey: '',
      requiresApiKey: true,
      providerKey: 'minimax',
      credentialMode: 'token-plan',
    });
  });

  it('builds a provider config from explicit QA environment variables', () => {
    const config = buildSeedModelConfig({
      VIBEREADER_TEST_MODEL_ID: 'qa-moonshot',
      VIBEREADER_TEST_BASE_URL: 'https://api.moonshot.cn/v1',
      VIBEREADER_TEST_API_KEY: 'local-secret',
      VIBEREADER_TEST_MODEL: 'kimi-k2.6',
      VIBEREADER_TEST_API_FORMAT: 'openai',
      VIBEREADER_TEST_PROVIDER_KEY: 'kimi',
    });

    expect(config).toMatchObject({
      id: 'qa-moonshot',
      baseUrl: 'https://api.moonshot.cn/v1',
      apiKey: 'local-secret',
      modelName: 'kimi-k2.6',
      apiFormat: 'openai',
      requiresApiKey: true,
      providerKey: 'kimi',
    });
  });

  it('builds a StepFun config from local provider environment variables', () => {
    const config = buildSeedModelConfig({
      STEPFUN_API_KEY: 'step-secret',
      STEPFUN_BASE_URL: 'https://api.stepfun.com/v1',
      STEPFUN_MODEL: 'step-3.7-flash',
    });

    expect(config).toMatchObject({
      id: 'qa-env-stepfun',
      baseUrl: 'https://api.stepfun.com/v1',
      apiKey: 'step-secret',
      modelName: 'step-3.7-flash',
      apiFormat: 'openai',
      requiresApiKey: true,
      providerKey: 'stepfun',
    });
  });

  it('builds a MiMo Token Plan config with Anthropic protocol', () => {
    const config = buildSeedModelConfig({
      MIMO_API_KEY: 'mimo-secret',
      MIMO_BASE_URL: 'https://token-plan-cn.xiaomimimo.com/anthropic',
      MIMO_MODEL: 'mimo-v2.5-pro',
    });

    expect(config).toMatchObject({
      id: 'qa-env-mimo',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
      apiKey: 'mimo-secret',
      modelName: 'mimo-v2.5-pro',
      apiFormat: 'anthropic',
      requiresApiKey: true,
      providerKey: 'mimo',
    });
  });

  it('uses the MiniMax Token Plan key alias and local overrides', () => {
    const config = buildSeedModelConfig({
      MINIMAX_TOKEN_PLAN_KEY: 'minimax-token-secret',
      MINIMAX_BASE_URL: 'https://api.minimaxi.com/anthropic',
      MINIMAX_MODEL: 'MiniMax-M3',
    });

    expect(config).toMatchObject({
      id: 'qa-env-minimax-token-plan',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      apiKey: 'minimax-token-secret',
      modelName: 'MiniMax-M3',
      apiFormat: 'anthropic',
      requiresApiKey: true,
      providerKey: 'minimax',
      credentialMode: 'token-plan',
    });
  });

  it('uses MiniMax API mode for pay-as-you-go API keys', () => {
    const config = buildSeedModelConfig({
      MINIMAX_API_KEY: 'minimax-api-secret',
    });

    expect(config).toMatchObject({
      id: 'qa-env-minimax-api',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      apiKey: 'minimax-api-secret',
      modelName: 'MiniMax-M3',
      apiFormat: 'anthropic',
      requiresApiKey: true,
      providerKey: 'minimax-api',
      credentialMode: 'pay-as-you-go-api',
    });
  });

  it('uses current Kimi model naming when a Moonshot key is explicitly provided', () => {
    const config = buildSeedModelConfig({
      MOONSHOT_API_KEY: 'moonshot-secret',
    });

    expect(config).toMatchObject({
      id: 'qa-env-moonshot',
      baseUrl: 'https://api.moonshot.cn/v1',
      apiKey: 'moonshot-secret',
      modelName: 'kimi-k2.6',
      apiFormat: 'openai',
      requiresApiKey: true,
      providerKey: 'kimi',
    });
  });

  it('writes both model config storage surfaces', () => {
    const config = buildSeedModelConfig({
      VIBEREADER_TEST_MODEL_ID: 'qa-model',
      VIBEREADER_TEST_BASE_URL: 'https://example.test/v1',
      VIBEREADER_TEST_API_KEY: 'secret',
      VIBEREADER_TEST_MODEL: 'example-model',
    });
    const entries = buildModelStorageState(config);

    expect(JSON.parse(entries['ai-chat.modelConfigs'])).toEqual([config]);
    expect(JSON.parse(entries['ai-chat.selectedConfigId'])).toBe('qa-model');
    expect(JSON.parse(entries['ai-chat-model-store'])).toMatchObject({
      state: {
        selectedModel: {
          key: 'custom',
          label: 'Custom model (example-model)',
          configId: 'qa-model',
          config,
        },
        selectedConfigId: 'qa-model',
      },
    });
  });

  it('allows model seeding only into local targets by default', () => {
    expect(isLocalSeedTarget('http://127.0.0.1:3217/')).toBe(true);
    expect(isLocalSeedTarget('http://localhost:3217/')).toBe(true);
    expect(isLocalSeedTarget('https://example.com/')).toBe(false);

    expect(() => assertSafeModelSeedTarget('https://example.com/', {})).toThrow(/Refusing to seed/);
    expect(() => assertSafeModelSeedTarget('https://example.com/', {
      ALLOW_REMOTE_MODEL_SEED: '1',
    })).not.toThrow();
  });
});
