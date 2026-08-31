import { beforeEach, describe, expect, it, vi } from 'vitest';
import aiService from './aiService';

const tauriFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/plugin-http', () => ({
    fetch: tauriFetchMock,
}));

const encoder = new TextEncoder();

function createStreamResponse(read) {
    return {
        ok: true,
        body: {
            getReader: () => ({ read }),
        },
    };
}

describe('aiService chatStream abort support', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        tauriFetchMock.mockReset();
        delete window.__TAURI_INTERNALS__;
        delete window.__TAURI__;
        aiService.clearHistory();
        aiService.setConfig({
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'test-key',
            model: 'test-model',
            apiType: 'openai-compatible',
        });
    });

    it('passes the provided AbortSignal to fetch so the active request can be cancelled', async () => {
        const controller = new AbortController();
        const read = vi.fn().mockResolvedValue({ done: true, value: undefined });
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(createStreamResponse(read));

        await aiService.chatStream('hello', vi.fn(), {
            includeHistory: false,
            signal: controller.signal,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    });

    it('passes the provided AbortSignal to Tauri native HTTP so desktop requests can be cancelled', async () => {
        window.__TAURI_INTERNALS__ = {};
        const controller = new AbortController();
        const read = vi.fn().mockResolvedValue({ done: true, value: undefined });
        tauriFetchMock.mockResolvedValue(createStreamResponse(read));

        await aiService.chatStream('hello', vi.fn(), {
            includeHistory: false,
            signal: controller.signal,
        });

        expect(tauriFetchMock).toHaveBeenCalledTimes(1);
        expect(tauriFetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    });

    it('reports a Tauri native HTTP cancellation as an aborted interruption', async () => {
        window.__TAURI_INTERNALS__ = {};
        tauriFetchMock.mockRejectedValue(new Error('Request cancelled'));
        const chunks = [];

        await aiService.chatStream('hello', (chunk) => chunks.push(chunk), {
            includeHistory: false,
            signal: new AbortController().signal,
        });

        expect(chunks[chunks.length - 1]).toEqual(
            expect.objectContaining({
                done: true,
                interrupted: true,
                aborted: true,
                fullMessage: '',
            })
        );
    });

    it('classifies Tauri native HTTP 401 responses as invalid API key errors', async () => {
        window.__TAURI_INTERNALS__ = {};
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        tauriFetchMock.mockResolvedValue({
            ok: false,
            status: 401,
            json: vi.fn(async () => ({
                error: { message: 'Key sk-test-secret is invalid' },
            })),
        });
        const chunks = [];

        await aiService.chatStream('hello', (chunk) => chunks.push(chunk), {
            includeHistory: false,
        });

        expect(chunks[chunks.length - 1]).toEqual(expect.objectContaining({
            done: true,
            interrupted: true,
            errorCode: 'UNAUTHORIZED',
            errorTitle: expect.stringMatching(/API Key|Key/i),
        }));
        expect(chunks[chunks.length - 1].error).not.toContain('sk-test-secret');
        expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain('sk-test-secret');
    });

    it('classifies Tauri native HTTP 503 responses as provider unavailable errors', async () => {
        window.__TAURI_INTERNALS__ = {};
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        tauriFetchMock.mockResolvedValue({
            ok: false,
            status: 503,
            json: vi.fn(async () => ({
                message: 'Provider temporarily unavailable',
            })),
        });
        const chunks = [];

        await aiService.chatStream('hello', (chunk) => chunks.push(chunk), {
            includeHistory: false,
        });

        expect(chunks[chunks.length - 1]).toEqual(expect.objectContaining({
            done: true,
            interrupted: true,
            errorCode: 'PROVIDER_UNAVAILABLE',
            errorTitle: expect.stringMatching(/服务不可用|Unavailable/i),
        }));
        expect(chunks[chunks.length - 1].errorAction).toEqual(expect.stringMatching(/稍后|Retry/i));
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('reports an aborted stream as an interruption while preserving partial content', async () => {
        const abortError = new DOMException('The operation was aborted.', 'AbortError');
        const read = vi
            .fn()
            .mockResolvedValueOnce({
                done: false,
                value: encoder.encode('data: {"choices":[{"delta":{"content":"Partial answer"}}]}\n\n'),
            })
            .mockRejectedValueOnce(abortError);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(createStreamResponse(read));
        const chunks = [];

        await aiService.chatStream('hello', (chunk) => chunks.push(chunk), {
            includeHistory: false,
            signal: new AbortController().signal,
        });

        expect(chunks).toContainEqual(
            expect.objectContaining({
                done: false,
                content: 'Partial answer',
                fullMessage: 'Partial answer',
            })
        );
        expect(chunks[chunks.length - 1]).toEqual(
            expect.objectContaining({
                done: true,
                interrupted: true,
                aborted: true,
                fullMessage: 'Partial answer',
            })
        );
    });
});
