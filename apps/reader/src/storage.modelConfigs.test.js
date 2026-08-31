import { beforeEach, describe, expect, it, vi } from 'vitest';

// R3：模型配置读写改造验证 —— saveModelConfigs 落盘时 apiKey 一律置空，
// 明文只进 Keychain；删除/清空 key 的配置同步删除 Keychain 条目；
// bootstrapModelApiKeys 执行一次性明文迁移。

const persistentMock = vi.hoisted(() => ({
    isPersistentStorageAvailable: vi.fn(() => true),
    deletePersistentConversation: vi.fn(async () => true),
    listPersistentConversations: vi.fn(async () => []),
    loadPersistentConversation: vi.fn(async () => null),
    savePersistentConversation: vi.fn(async () => ({ sessionId: 'session-1' })),
}));

vi.mock('./services/persistentStorage', () => persistentMock);

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args) => invokeMock(...args),
}));

const MODEL_CONFIGS_LS_KEY = 'ai-chat.modelConfigs';

// saveModelConfigs 的 Keychain 同步是 fire-and-forget，需要宏任务级别的
// flush 才能让整条 promise 链（invoke → sync → 写回 keyed ids）跑完。
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function readRawStoredConfigs() {
    const raw = localStorage.getItem(MODEL_CONFIGS_LS_KEY);
    return raw ? JSON.parse(raw) : [];
}

describe('storage model configs (R3 keychain integration)', () => {
    beforeEach(() => {
        localStorage.clear();
        invokeMock.mockReset();
        invokeMock.mockResolvedValue(null);
        persistentMock.isPersistentStorageAvailable.mockReturnValue(true);
    });

    it('saves configs with apiKey stripped from localStorage and writes plaintext to keychain', async () => {
        const { saveModelConfigs } = await import('./storage');

        saveModelConfigs([
            { id: 'cfg-a', modelName: 'Model A', apiKey: 'sk-a' },
            { id: 'cfg-b', modelName: 'Model B', apiKey: '' },
        ]);
        await flush();
        await flush();

        expect(readRawStoredConfigs()).toEqual([
            expect.objectContaining({ id: 'cfg-a', apiKey: '' }),
            expect.objectContaining({ id: 'cfg-b', apiKey: '' }),
        ]);
        expect(JSON.stringify(readRawStoredConfigs())).not.toContain('sk-a');
        expect(invokeMock).toHaveBeenCalledWith('storage_set_api_key', { configId: 'cfg-a', apiKey: 'sk-a' });
    });

    it('deletes the keychain entry of removed configs on the next save', async () => {
        const { saveModelConfigs } = await import('./storage');

        saveModelConfigs([
            { id: 'cfg-a', modelName: 'Model A', apiKey: 'sk-a' },
            { id: 'cfg-b', modelName: 'Model B', apiKey: 'sk-b' },
        ]);
        await flush();
        await flush();
        invokeMock.mockClear();

        // 删除 cfg-b；cfg-a 保留（明文只存 Keychain，落盘列表里是空占位）
        saveModelConfigs([
            { id: 'cfg-a', modelName: 'Model A', apiKey: '' },
            { id: 'cfg-c', modelName: 'Model C' },
        ]);
        await flush();
        await flush();

        expect(invokeMock).toHaveBeenCalledWith('storage_delete_api_key', { configId: 'cfg-b' });
        expect(invokeMock).not.toHaveBeenCalledWith('storage_delete_api_key', { configId: 'cfg-a' });
        expect(invokeMock).not.toHaveBeenCalledWith('storage_set_api_key', expect.anything());
        // 后续删除 cfg-a 时（其 id 仍在 keyed 列表中）也能清理 Keychain 条目
        saveModelConfigs([{ id: 'cfg-c', modelName: 'Model C' }]);
        await flush();
        await flush();
        expect(invokeMock).toHaveBeenCalledWith('storage_delete_api_key', { configId: 'cfg-a' });
    });

    it('migrates legacy plaintext keys once at bootstrap and clears them from localStorage', async () => {
        localStorage.setItem(MODEL_CONFIGS_LS_KEY, JSON.stringify([
            { id: 'legacy-1', modelName: 'Legacy One', apiKey: 'sk-legacy-1' },
            { id: 'legacy-2', modelName: 'Legacy Two', apiKey: 'sk-legacy-2' },
            { id: 'clean', modelName: 'Clean', apiKey: '' },
        ]));
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

        const { bootstrapModelApiKeys } = await import('./storage');
        await expect(bootstrapModelApiKeys()).resolves.toBe(2);

        expect(invokeMock).toHaveBeenCalledWith('storage_set_api_key', { configId: 'legacy-1', apiKey: 'sk-legacy-1' });
        expect(invokeMock).toHaveBeenCalledWith('storage_set_api_key', { configId: 'legacy-2', apiKey: 'sk-legacy-2' });
        expect(readRawStoredConfigs()).toEqual([
            expect.objectContaining({ id: 'legacy-1', apiKey: '' }),
            expect.objectContaining({ id: 'legacy-2', apiKey: '' }),
            expect.objectContaining({ id: 'clean', apiKey: '' }),
        ]);
        expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Migrated 2 plaintext API key(s)'));
        infoSpy.mockRestore();
    });

    it('reports zero migrations when no plaintext keys remain', async () => {
        localStorage.setItem(MODEL_CONFIGS_LS_KEY, JSON.stringify([
            { id: 'clean', modelName: 'Clean', apiKey: '' },
        ]));

        const { bootstrapModelApiKeys } = await import('./storage');
        await expect(bootstrapModelApiKeys()).resolves.toBe(0);
        expect(invokeMock).not.toHaveBeenCalled();
    });
});
