import { describe, expect, it } from 'vitest';
import { resolveAiEndpointForRuntime } from './aiEndpoint';

describe('AI endpoint runtime routing', () => {
    it('routes MiniMax Anthropic requests through the same-origin dev proxy', () => {
        const endpoint = resolveAiEndpointForRuntime(
            'https://api.minimaxi.com/anthropic/v1/messages',
            'http://127.0.0.1:3217'
        );

        expect(endpoint).toBe('/api/minimax/v1/messages');
    });

    it('keeps the older MiniMax international host routed for saved configs', () => {
        const endpoint = resolveAiEndpointForRuntime(
            'https://api.minimax.io/anthropic/v1/messages',
            'http://127.0.0.1:3217'
        );

        expect(endpoint).toBe('/api/minimax/v1/messages');
    });

    it('routes MiMo Anthropic requests through the same-origin dev proxy', () => {
        const endpoint = resolveAiEndpointForRuntime(
            'https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages',
            'http://127.0.0.1:3217'
        );

        expect(endpoint).toBe('/api/mimo/v1/messages');
    });

    it('keeps non-local and non-MiniMax endpoints unchanged', () => {
        expect(resolveAiEndpointForRuntime(
            'https://api.minimaxi.com/anthropic/v1/messages',
            'tauri://localhost'
        )).toBe('https://api.minimaxi.com/anthropic/v1/messages');

        expect(resolveAiEndpointForRuntime(
            'https://api.openai.com/v1/chat/completions',
            'http://127.0.0.1:3217'
        )).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('routes Kimi/Moonshot requests through the same-origin dev proxy in local development', () => {
        const endpoint = resolveAiEndpointForRuntime(
            'https://api.moonshot.cn/v1/chat/completions',
            'http://127.0.0.1:3217'
        );

        expect(endpoint).toBe('/api/kimi/chat/completions');
    });

    it('routes local 8317 OpenAI-compatible chat through /api/llm-proxy in local development', () => {
        expect(resolveAiEndpointForRuntime(
            'http://127.0.0.1:8317/v1/chat/completions',
            'http://127.0.0.1:3217'
        )).toBe('/api/llm-proxy/v1/chat/completions');

        expect(resolveAiEndpointForRuntime(
            'http://localhost:8317/v1/chat/completions',
            'http://localhost:3217'
        )).toBe('/api/llm-proxy/v1/chat/completions');
    });

    it('keeps 8317 endpoints absolute outside local Vite origin', () => {
        expect(resolveAiEndpointForRuntime(
            'http://127.0.0.1:8317/v1/chat/completions',
            'tauri://localhost'
        )).toBe('http://127.0.0.1:8317/v1/chat/completions');
    });
});
