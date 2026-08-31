import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    computeApiKeySyncPlan,
    deleteStoredApiKey,
    getStoredApiKey,
    hasPlaintextApiKey,
    hydrateModelConfigsFromKeychain,
    migrateLegacyPlaintextApiKeys,
    sanitizeModelConfigsForStorage,
    setStoredApiKey,
    stripApiKeyForDurableStorage,
    syncApiKeysWithKeychain,
} from './apiKeyStore';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args) => invokeMock(...args),
}));

describe('apiKeyStore', () => {
    beforeEach(() => {
        delete window.__TAURI__;
        delete window.__TAURI_INTERNALS__;
        invokeMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('pure helpers', () => {
        it('detects non-empty plaintext api keys', () => {
            expect(hasPlaintextApiKey({ apiKey: 'sk-test' })).toBe(true);
            expect(hasPlaintextApiKey({ apiKey: '   ' })).toBe(false);
            expect(hasPlaintextApiKey({})).toBe(false);
            expect(hasPlaintextApiKey(null)).toBe(false);
        });

        it('strips api keys from raw configs and selectedModel wrappers', () => {
            expect(stripApiKeyForDurableStorage({ id: 'a', apiKey: 'sk-test' })).toEqual({
                id: 'a',
                apiKey: '',
            });
            expect(stripApiKeyForDurableStorage({
                key: 'custom',
                configId: 'a',
                config: { id: 'a', apiKey: 'sk-test' },
            })).toEqual({
                key: 'custom',
                configId: 'a',
                config: { id: 'a', apiKey: '' },
            });
            expect(stripApiKeyForDurableStorage(null)).toBeNull();
        });

        it('sanitizes a config list before durable storage', () => {
            expect(sanitizeModelConfigsForStorage([
                { id: 'a', apiKey: 'sk-a' },
                { id: 'b' },
            ])).toEqual([
                { id: 'a', apiKey: '' },
                { id: 'b', apiKey: '' },
            ]);
        });

        it('computes keychain sync plan: sets for new/updated keys, deletes for removed configs', () => {
            const plan = computeApiKeySyncPlan(
                ['kept', 'removed', 'cleared'],
                [
                    { id: 'kept', apiKey: 'sk-new' },
                    { id: 'fresh', apiKey: 'sk-fresh' },
                    { id: 'cleared', apiKey: '' },
                    { id: 'never-had-key' },
                ]
            );

            expect(plan.sets).toEqual([
                { configId: 'kept', apiKey: 'sk-new' },
                { configId: 'fresh', apiKey: 'sk-fresh' },
            ]);
            // 仅“配置被移除”触发删除；仍在列表中的 cleared 条目不区分
            // （编辑器保存前会从 Keychain 回填表单 key，见模块注释）
            expect(plan.deletes).toEqual(['removed']);
            expect(plan.keyedIds).toEqual(['kept', 'cleared', 'fresh']);
        });
    });

    describe('keychain command wrappers (Tauri runtime)', () => {
        beforeEach(() => {
            window.__TAURI_INTERNALS__ = {};
        });

        it('sets, gets and deletes keys through the new storage_*_api_key commands', async () => {
            invokeMock.mockResolvedValueOnce(null).mockResolvedValueOnce('sk-stored').mockResolvedValueOnce(null);

            await expect(setStoredApiKey('cfg-1', 'sk-stored')).resolves.toBe(true);
            expect(invokeMock).toHaveBeenNthCalledWith(1, 'storage_set_api_key', {
                configId: 'cfg-1',
                apiKey: 'sk-stored',
            });

            await expect(getStoredApiKey('cfg-1')).resolves.toBe('sk-stored');
            expect(invokeMock).toHaveBeenNthCalledWith(2, 'storage_get_api_key', { configId: 'cfg-1' });

            await expect(deleteStoredApiKey('cfg-1')).resolves.toBe(true);
            expect(invokeMock).toHaveBeenNthCalledWith(3, 'storage_delete_api_key', { configId: 'cfg-1' });
        });

        it('returns null when keychain reports no entry or a non-string value', async () => {
            invokeMock.mockResolvedValueOnce(null).mockResolvedValueOnce(42);
            await expect(getStoredApiKey('cfg-missing')).resolves.toBeNull();
            await expect(getStoredApiKey('cfg-bad')).resolves.toBeNull();
        });

        it('maps command failures to false/null with a warning', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            invokeMock.mockRejectedValueOnce({ message: 'keychain_error: access denied' });
            await expect(setStoredApiKey('cfg-1', 'sk-x')).resolves.toBe(false);
            expect(warnSpy).toHaveBeenCalled();
        });
    });

    describe('non-Tauri runtime (dev-server mode)', () => {
        it('degrades every operation to a no-op and warns only once', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await expect(setStoredApiKey('cfg-1', 'sk-x')).resolves.toBe(false);
            await expect(getStoredApiKey('cfg-1')).resolves.toBeNull();
            await expect(deleteStoredApiKey('cfg-1')).resolves.toBe(false);
            expect(invokeMock).not.toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('one-time legacy migration', () => {
        it('writes legacy plaintext keys into keychain and returns sanitized configs', async () => {
            window.__TAURI_INTERNALS__ = {};
            invokeMock.mockResolvedValue(null);

            const { migratedCount, sanitizedConfigs } = await migrateLegacyPlaintextApiKeys([
                { id: 'cfg-a', apiKey: 'sk-a' },
                { id: 'cfg-b', apiKey: '' },
                { id: 'cfg-c', apiKey: '  sk-c  ' },
            ]);

            expect(migratedCount).toBe(2);
            expect(invokeMock).toHaveBeenNthCalledWith(1, 'storage_set_api_key', { configId: 'cfg-a', apiKey: 'sk-a' });
            expect(invokeMock).toHaveBeenNthCalledWith(2, 'storage_set_api_key', { configId: 'cfg-c', apiKey: 'sk-c' });
            expect(sanitizedConfigs).toEqual([
                { id: 'cfg-a', apiKey: '' },
                { id: 'cfg-b', apiKey: '' },
                { id: 'cfg-c', apiKey: '' },
            ]);
        });

        it('does not persist anything in non-Tauri runtime and drops plaintext', async () => {
            const { migratedCount, sanitizedConfigs } = await migrateLegacyPlaintextApiKeys([
                { id: 'cfg-a', apiKey: 'sk-a' },
            ]);
            expect(migratedCount).toBe(0);
            expect(sanitizedConfigs).toEqual([{ id: 'cfg-a', apiKey: '' }]);
            expect(invokeMock).not.toHaveBeenCalled();
        });
    });

    describe('startup hydrate', () => {
        it('fills blank placeholder keys from the keychain and keeps existing ones', async () => {
            window.__TAURI_INTERNALS__ = {};
            invokeMock
                .mockResolvedValueOnce('sk-hydrated')
                .mockResolvedValueOnce(null);

            const hydrated = await hydrateModelConfigsFromKeychain([
                { id: 'cfg-empty', apiKey: '' },
                { id: 'cfg-keep', apiKey: 'sk-keep' },
                { id: 'cfg-missing', apiKey: '' },
                { id: null, apiKey: '' },
            ]);

            expect(hydrated).toEqual([
                { id: 'cfg-empty', apiKey: 'sk-hydrated' },
                { id: 'cfg-keep', apiKey: 'sk-keep' },
                { id: 'cfg-missing', apiKey: '' },
                { id: null, apiKey: '' },
            ]);
        });
    });

    describe('sync on save', () => {
        it('applies the sync plan through keychain commands', async () => {
            window.__TAURI_INTERNALS__ = {};
            invokeMock.mockResolvedValue(null);

            const result = await syncApiKeysWithKeychain(
                ['kept', 'removed'],
                [
                    { id: 'kept', apiKey: 'sk-new' },
                    { id: 'added', apiKey: 'sk-added' },
                ]
            );

            expect(result).toEqual({ sets: 2, deletes: 1, keyedIds: ['kept', 'added'] });
            expect(invokeMock).toHaveBeenCalledWith('storage_set_api_key', { configId: 'kept', apiKey: 'sk-new' });
            expect(invokeMock).toHaveBeenCalledWith('storage_set_api_key', { configId: 'added', apiKey: 'sk-added' });
            expect(invokeMock).toHaveBeenCalledWith('storage_delete_api_key', { configId: 'removed' });
        });
    });
});
