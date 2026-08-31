import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    AGENT_CHAT_QA_STORAGE_KEY,
    formatDocumentQaChatContent,
    isAgentDocumentQaEnabled,
    readAgentChatQaEnv,
    readAgentChatQaStorage,
    runDocumentQaFromChat,
    setAgentDocumentQaEnabled,
    shouldRunDocumentQaFromChat,
} from './documentQaChat';

const SAMPLE_DOC = Object.freeze({
    id: 'doc-chat-qa-1',
    name: 'Paper',
    contentText: 'Method uses attention for retrieval.',
});

function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => {
            map.set(key, String(value));
        },
        removeItem: (key) => {
            map.delete(key);
        },
        _map: map,
    };
}

describe('isAgentDocumentQaEnabled', () => {
    it('defaults to OFF when nothing is set', () => {
        expect(isAgentDocumentQaEnabled({
            storage: memoryStorage(),
            envValue: null,
        })).toBe(false);
    });

    it('honors explicit enabled / useAgentDocumentQa over storage and env', () => {
        const storage = memoryStorage({ [AGENT_CHAT_QA_STORAGE_KEY]: '1' });
        expect(isAgentDocumentQaEnabled({
            enabled: false,
            storage,
            envValue: true,
        })).toBe(false);
        expect(isAgentDocumentQaEnabled({
            useAgentDocumentQa: true,
            storage: memoryStorage({ [AGENT_CHAT_QA_STORAGE_KEY]: '0' }),
            envValue: false,
        })).toBe(true);
    });

    it('prefers localStorage over env when storage key is set', () => {
        const storage = memoryStorage({ [AGENT_CHAT_QA_STORAGE_KEY]: '0' });
        expect(isAgentDocumentQaEnabled({
            storage,
            envValue: true,
        })).toBe(false);

        storage.setItem(AGENT_CHAT_QA_STORAGE_KEY, '1');
        expect(isAgentDocumentQaEnabled({
            storage,
            envValue: false,
        })).toBe(true);
    });

    it('falls back to env when storage is unset', () => {
        expect(isAgentDocumentQaEnabled({
            storage: memoryStorage(),
            envValue: true,
        })).toBe(true);
        expect(isAgentDocumentQaEnabled({
            storage: memoryStorage(),
            envValue: false,
        })).toBe(false);
    });
});

describe('setAgentDocumentQaEnabled / readAgentChatQaStorage', () => {
    it('writes 1/0 and reads back as boolean', () => {
        const storage = memoryStorage();
        expect(setAgentDocumentQaEnabled(true, storage)).toBe(true);
        expect(storage.getItem(AGENT_CHAT_QA_STORAGE_KEY)).toBe('1');
        expect(readAgentChatQaStorage(storage)).toBe(true);

        expect(setAgentDocumentQaEnabled(false, storage)).toBe(false);
        expect(storage.getItem(AGENT_CHAT_QA_STORAGE_KEY)).toBe('0');
        expect(readAgentChatQaStorage(storage)).toBe(false);
    });

    it('parses common truthy/falsy strings', () => {
        const storage = memoryStorage({ [AGENT_CHAT_QA_STORAGE_KEY]: 'on' });
        expect(readAgentChatQaStorage(storage)).toBe(true);
        storage.setItem(AGENT_CHAT_QA_STORAGE_KEY, 'off');
        expect(readAgentChatQaStorage(storage)).toBe(false);
        storage.setItem(AGENT_CHAT_QA_STORAGE_KEY, 'maybe');
        expect(readAgentChatQaStorage(storage)).toBeNull();
    });
});

describe('shouldRunDocumentQaFromChat', () => {
    it('returns false when flag is off even with document + question', () => {
        expect(shouldRunDocumentQaFromChat({
            enabled: false,
            document: SAMPLE_DOC,
            question: 'What is the method?',
        })).toBe(false);
    });

    it('returns true when ON + document id + question + no images', () => {
        expect(shouldRunDocumentQaFromChat({
            enabled: true,
            document: SAMPLE_DOC,
            question: 'What is the method?',
            images: [],
        })).toBe(true);
    });

    it('requires document id and non-empty question', () => {
        expect(shouldRunDocumentQaFromChat({
            enabled: true,
            document: { name: 'no-id' },
            question: 'Q?',
        })).toBe(false);
        expect(shouldRunDocumentQaFromChat({
            enabled: true,
            document: SAMPLE_DOC,
            question: '   ',
        })).toBe(false);
        expect(shouldRunDocumentQaFromChat({
            enabled: true,
            document: null,
            question: 'Q?',
        })).toBe(false);
    });

    it('stays on legacy chat when images are attached', () => {
        expect(shouldRunDocumentQaFromChat({
            enabled: true,
            document: SAMPLE_DOC,
            question: 'Describe this figure',
            images: [{ base64: 'data:image/png;base64,abc' }],
        })).toBe(false);
    });
});

describe('runDocumentQaFromChat', () => {
    it('skips without calling agent when gate fails (default OFF)', async () => {
        const runDocumentQa = vi.fn();
        const result = await runDocumentQaFromChat(
            SAMPLE_DOC,
            'What is the method?',
            null,
            {
                enabled: false,
                runDocumentQa,
            },
        );
        expect(result).toEqual(expect.objectContaining({
            used: false,
            status: 'skipped',
            via: 'document_qa_agent',
            content: '',
        }));
        expect(runDocumentQa).not.toHaveBeenCalled();
    });

    it('calls runDocumentQaAgent with model config and product adapters when ON', async () => {
        const runDocumentQa = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'Attention ranks evidence density.',
            sourceRefs: [{ page: 2, text: 'attention route' }],
            skillType: 'knowledge_qa_agent',
            goal: 'How does attention work?',
            agentResult: { status: 'completed', content: 'Attention ranks evidence density.' },
        });
        const modelConfig = {
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'test-key',
            model: 'grok-4.5',
        };
        const createOptions = vi.fn();
        const experienceStore = { buildLessonsPrompt: () => '' };
        const onEvent = vi.fn();
        const abortSignal = { aborted: false };

        const result = await runDocumentQaFromChat(
            SAMPLE_DOC,
            'How does attention work?',
            modelConfig,
            {
                enabled: true,
                runDocumentQa,
                createOptions,
                useLlm: true,
                uniRagAvailable: true,
                experienceStore,
                onEvent,
                abortSignal,
            },
        );

        expect(runDocumentQa).toHaveBeenCalledTimes(1);
        expect(runDocumentQa).toHaveBeenCalledWith(
            SAMPLE_DOC,
            'How does attention work?',
            modelConfig,
            expect.objectContaining({
                createOptions,
                useLlm: true,
                uniRagAvailable: true,
                experienceStore,
                onEvent,
                abortSignal,
            }),
        );
        expect(result).toEqual(expect.objectContaining({
            used: true,
            status: 'completed',
            content: 'Attention ranks evidence density.',
            via: 'document_qa_agent',
            skillType: 'knowledge_qa_agent',
            sourceRefs: [{ page: 2, text: 'attention route' }],
        }));
    });

    it('skipGate forces agent call even when flag is off', async () => {
        const runDocumentQa = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'ok',
            sourceRefs: [],
            skillType: 'knowledge_qa_agent',
            goal: 'Q',
            agentResult: null,
        });
        const result = await runDocumentQaFromChat(SAMPLE_DOC, 'Q', null, {
            enabled: false,
            skipGate: true,
            runDocumentQa,
            useLlm: false,
        });
        expect(runDocumentQa).toHaveBeenCalled();
        expect(result.used).toBe(true);
        expect(result.content).toBe('ok');
    });
});

describe('formatDocumentQaChatContent', () => {
    it('prefers content, then error, then fallbacks', () => {
        expect(formatDocumentQaChatContent({ content: '  answer  ' })).toBe('answer');
        expect(formatDocumentQaChatContent({ error: 'timeout' })).toBe('文档工具问答失败：timeout');
        expect(formatDocumentQaChatContent({ status: 'invalid' }))
            .toMatch(/条件不满足/);
        expect(formatDocumentQaChatContent({})).toMatch(/未返回内容/);
    });
});

describe('readAgentChatQaEnv (smoke)', () => {
    afterEach(() => {
        delete process.env.VIBEREADER_AGENT_CHAT_QA;
        delete process.env.VITE_AGENT_CHAT_QA;
    });

    it('reads Node env when set', () => {
        process.env.VIBEREADER_AGENT_CHAT_QA = '1';
        expect(readAgentChatQaEnv()).toBe(true);
        process.env.VIBEREADER_AGENT_CHAT_QA = '0';
        expect(readAgentChatQaEnv()).toBe(false);
    });
});
