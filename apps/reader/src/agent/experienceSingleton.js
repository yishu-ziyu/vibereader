/**
 * Process-wide experience store for the product App path.
 * Uses window.localStorage when available; otherwise stays in-memory (offline-safe).
 */

import { createExperienceStore, DEFAULT_STORAGE_KEY } from './experienceStore';

let singleton = null;

/**
 * Best-effort browser storage. Returns null when unavailable (SSR, private mode, tests).
 * @returns {{ getItem: Function, setItem: Function }|null}
 */
export function resolveBrowserStorage() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            // Probe access: some environments expose the object but throw on use.
            const probeKey = '__vibereader_exp_probe__';
            window.localStorage.setItem(probeKey, '1');
            window.localStorage.removeItem(probeKey);
            return window.localStorage;
        }
    } catch (_) {
        // Private mode / restricted storage.
    }
    return null;
}

/**
 * Shared experience store for recording agent runs and building lessons prompts.
 *
 * @param {{
 *   storage?: { getItem: Function, setItem: Function }|null,
 *   storageKey?: string,
 *   maxRuns?: number,
 *   now?: () => number,
 *   forceNew?: boolean,
 * }} [options]
 *   When `forceNew` is true (tests), rebuilds the singleton with the given options.
 *   When `storage` is provided, that adapter is used instead of browser storage.
 * @returns {ReturnType<typeof createExperienceStore>}
 */
export function getExperienceStore(options = {}) {
    const forceNew = options.forceNew === true;
    if (singleton && !forceNew) {
        return singleton;
    }

    const hasExplicitStorage = Object.prototype.hasOwnProperty.call(options, 'storage');
    const storage = hasExplicitStorage
        ? (options.storage || null)
        : resolveBrowserStorage();

    singleton = createExperienceStore({
        storage,
        storageKey: options.storageKey || DEFAULT_STORAGE_KEY,
        maxRuns: options.maxRuns,
        now: options.now,
    });
    return singleton;
}

/** Test helper: drop the cached singleton so the next getExperienceStore recreates it. */
export function resetExperienceStore() {
    singleton = null;
}
