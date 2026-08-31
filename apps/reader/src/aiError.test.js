import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import {
  AI_ERROR_CODES,
  classifyAiError,
  extractErrorFromResponse,
  buildUserFriendlyErrorContent,
} from './aiError';

// 强制中文环境
describe('classifyAiError', () => {
  let originalLanguage;

  beforeAll(() => {
    originalLanguage = globalThis.navigator?.language;
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'zh-CN' },
      writable: true,
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: originalLanguage },
      writable: true,
      configurable: true,
    });
  });

  it('classifies 401 as UNAUTHORIZED', () => {
    const result = classifyAiError(401, 'Unauthorized');
    expect(result.code).toBe(AI_ERROR_CODES.UNAUTHORIZED);
    expect(result.title).toBe('API Key 无效');
    expect(result.message).toContain('API Key 无效或已过期');
    expect(result.action).toBe('检查 API Key');
  });

  it('classifies 403 as FORBIDDEN', () => {
    const result = classifyAiError(403, 'Forbidden');
    expect(result.code).toBe(AI_ERROR_CODES.FORBIDDEN);
    expect(result.title).toBe('权限不足');
    expect(result.message).toContain('没有权限');
    expect(result.action).toBe('更换模型或 Key');
  });

  it('classifies 429 as RATE_LIMIT', () => {
    const result = classifyAiError(429, 'Too Many Requests');
    expect(result.code).toBe(AI_ERROR_CODES.RATE_LIMIT);
    expect(result.title).toBe('请求过于频繁');
    expect(result.message).toContain('速率限制');
    expect(result.action).toBe('稍后再试');
  });

  it('classifies 503 as PROVIDER_UNAVAILABLE', () => {
    const result = classifyAiError(503, 'Provider temporarily unavailable');
    expect(result.code).toBe(AI_ERROR_CODES.PROVIDER_UNAVAILABLE);
    expect(result.title).toBe('模型服务不可用');
    expect(result.action).toBe('稍后重试或切换模型');
  });

  it('classifies timeout errors as TIMEOUT', () => {
    const result = classifyAiError(null, 'Request timeout');
    expect(result.code).toBe(AI_ERROR_CODES.TIMEOUT);
    expect(result.title).toBe('请求超时');
  });

  it('classifies ETIMEDOUT error as TIMEOUT', () => {
    const err = new Error('Connection timed out');
    err.code = 'ETIMEDOUT';
    const result = classifyAiError(null, err.message, err);
    expect(result.code).toBe(AI_ERROR_CODES.TIMEOUT);
  });

  it('classifies CORS errors as CORS', () => {
    const result = classifyAiError(null, 'CORS policy blocked');
    expect(result.code).toBe(AI_ERROR_CODES.CORS);
    expect(result.title).toBe('跨域请求被阻止');
  });

  it('classifies Failed to fetch as CORS', () => {
    const err = new TypeError('Failed to fetch');
    const result = classifyAiError(null, err.message, err);
    expect(result.code).toBe(AI_ERROR_CODES.CORS);
  });

  it('classifies network errors as NETWORK', () => {
    const result = classifyAiError(null, 'Network error');
    expect(result.code).toBe(AI_ERROR_CODES.NETWORK);
    expect(result.title).toBe('网络错误');
  });

  it('classifies ECONNREFUSED as NETWORK', () => {
    const err = new Error('Connection refused');
    err.code = 'ECONNREFUSED';
    const result = classifyAiError(null, err.message, err);
    expect(result.code).toBe(AI_ERROR_CODES.NETWORK);
  });

  it('classifies unknown errors as UNKNOWN', () => {
    const result = classifyAiError(500, 'Internal Server Error');
    expect(result.code).toBe(AI_ERROR_CODES.UNKNOWN);
    expect(result.title).toBe('请求失败');
    expect(result.action).toBe('点击重试');
  });

  it('preserves originalError in result', () => {
    const original = new Error('test');
    const result = classifyAiError(401, 'Unauthorized', original);
    expect(result.originalError).toBe(original);
  });

  it('does not leak sensitive info like full API key', () => {
    const result = classifyAiError(401, 'Key sk-abc123def456 is invalid');
    expect(result.message).not.toContain('sk-abc123def456');
    expect(result.title).toBe('API Key 无效');
  });
});

describe('extractErrorFromResponse', () => {
  it('extracts error from JSON response', async () => {
    const response = new Response(
      JSON.stringify({ error: { message: 'Invalid key' } }),
      { status: 401 }
    );
    const result = await extractErrorFromResponse(response);
    expect(result.statusCode).toBe(401);
    expect(result.message).toContain('Invalid key');
  });

  it('handles non-JSON response gracefully', async () => {
    const response = new Response('Internal Server Error', { status: 500 });
    const result = await extractErrorFromResponse(response);
    expect(result.statusCode).toBe(500);
    expect(result.message).toBe('API 请求失败: 500');
  });
});

describe('buildUserFriendlyErrorContent', () => {
  it('builds markdown content with title, message and action', () => {
    const content = buildUserFriendlyErrorContent({
      title: '测试错误',
      message: '这是一个测试',
      action: '点击重试',
    });
    expect(content).toContain('**测试错误**');
    expect(content).toContain('这是一个测试');
    expect(content).toContain('点击重试');
  });
});
