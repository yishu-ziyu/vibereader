import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STORAGE_KEY } from './experienceStore';
import {
    getExperienceStore,
    resetExperienceStore,
    resolveBrowserStorage,
} from './experienceSingleton';

function memoryStorage(seed = {}) {
    const map = new Map(Object.entries(seed));
    return {
        getItem: vi.fn((key) => (map.has(key) ? map.get(key) : null)),
        setItem: vi.fn((key, value) => {
            map.set(key, String(value));
        }),
        removeItem: vi.fn((key) => {
            map.delete(key);
        }),
        _map: map,
    };
}

afterEach(() => {
    resetExperienceStore();
});

describe('resolveBrowserStorage', () => {
    it('returns window.localStorage when usable', () => {
        const storage = resolveBrowserStorage();
        // jsdom provides localStorage in vitest browser-like env.
        if (typeof window !== 'undefined' && window.localStorage) {
            expect(storage).toBe(window.localStorage);
        } else {
            expect(storage).toBeNull();
        }
    });
});

describe('getExperienceStore', () => {
    it('returns the same singleton instance by default', () => {
        const a = getExperienceStore({ storage: null, forceNew: true });
        const b = getExperienceStore();
        expect(a).toBe(b);
    });

    it('works offline with no storage (in-memory only)', () => {
        const store = getExperienceStore({ storage: null, forceNew: true });
        store.recordRun({
            goal: 'offline run',
            skillType: 'paper_overview_agent',
            status: 'completed',
            contentSummary: 'ok',
        });
        expect(store.listRuns()).toHaveLength(1);
        expect(store.buildLessonsPrompt()).toBe('');
    });

    it('uses injected storage adapter and persists runs', () => {
        const storage = memoryStorage();
        const store = getExperienceStore({
            storage,
            storageKey: 'test.exp.singleton',
            forceNew: true,
            now: () => 99,
        });

        store.recordRun({
            goal: 'persist',
            skillType: 'attention_agent',
            status: 'tool_not_found',
            contentSummary: 'missing tool',
        });

        expect(storage.setItem).toHaveBeenCalled();
        expect(storage._map.get('test.exp.singleton')).toContain('persist');
        expect(store.buildLessonsPrompt()).toContain('tool list');
    });

    it('forceNew rebuilds a fresh store', () => {
        const first = getExperienceStore({ storage: null, forceNew: true });
        first.recordRun({ goal: 'a', status: 'failed' });
        expect(first.listRuns()).toHaveLength(1);

        const second = getExperienceStore({ storage: null, forceNew: true });
        expect(second).not.toBe(first);
        expect(second.listRuns()).toHaveLength(0);
    });

    it('defaults storageKey to experience store key when using browser storage', () => {
        const storage = memoryStorage();
        const store = getExperienceStore({ storage, forceNew: true });
        store.recordRun({ goal: 'default key', status: 'completed' });
        expect(storage._map.has(DEFAULT_STORAGE_KEY)).toBe(true);
    });
});
