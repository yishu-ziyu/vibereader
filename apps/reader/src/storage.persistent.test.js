import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistentMock = vi.hoisted(() => ({
    isPersistentStorageAvailable: vi.fn(() => true),
    savePersistentConversation: vi.fn(async () => ({ sessionId: 'session-1' })),
    loadPersistentConversation: vi.fn(async () => ({
        sessionId: 'session-1',
        messagesJson: JSON.stringify([{ role: 'user', content: 'Hello' }]),
    })),
    listPersistentConversations: vi.fn(async () => [
        {
            sessionId: 'session-1',
            updatedAt: 200,
            messageCount: 1,
            title: 'Hello',
        },
    ]),
    deletePersistentConversation: vi.fn(async () => true),
}));

vi.mock('./services/persistentStorage', () => persistentMock);

describe('conversation storage in Tauri runtime', () => {
    beforeEach(() => {
        vi.resetModules();
        persistentMock.isPersistentStorageAvailable.mockReturnValue(true);
        persistentMock.savePersistentConversation.mockClear();
        persistentMock.loadPersistentConversation.mockClear();
        persistentMock.listPersistentConversations.mockClear();
        persistentMock.deletePersistentConversation.mockClear();
    });

    it('routes conversation operations through persistent storage when available', async () => {
        const {
            deleteConversation,
            listConversations,
            loadConversation,
            saveConversation,
        } = await import('./storage');

        const messages = [{ role: 'user', content: 'Hello' }];

        await expect(saveConversation('session-1', messages)).resolves.toBe(true);
        await expect(loadConversation('session-1')).resolves.toEqual(messages);
        await expect(listConversations()).resolves.toEqual([
            {
                sessionId: 'session-1',
                updatedAt: 200,
                messageCount: 1,
                title: 'Hello',
            },
        ]);
        await expect(deleteConversation('session-1')).resolves.toBe(true);

        expect(persistentMock.savePersistentConversation).toHaveBeenCalledWith('session-1', messages);
        expect(persistentMock.loadPersistentConversation).toHaveBeenCalledWith('session-1');
        expect(persistentMock.listPersistentConversations).toHaveBeenCalledTimes(1);
        expect(persistentMock.deletePersistentConversation).toHaveBeenCalledWith('session-1');
    });
});
