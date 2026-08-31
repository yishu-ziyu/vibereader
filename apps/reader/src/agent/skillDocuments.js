/**
 * Browser-safe progressive skill document loading.
 *
 * Node eval injects skill md via fs (scripts/agent-eval-*.mjs).
 * Browser has no fs: Vite bundles docs/reading-agent-skills/*.md as raw strings
 * via import.meta.glob (?raw). resolveSkillDocument looks up by skill.skillPath.
 *
 * Fallback: empty string (skills.js registry already bundles the md via ?raw).
 * Never import node:fs here.
 */

/** @type {Record<string, string>} */
const BUNDLED_SKILL_DOCS = import.meta.glob(
    '../../docs/reading-agent-skills/*.md',
    {
        query: '?raw',
        import: 'default',
        eager: true,
    },
);

function normalizePath(path) {
    return String(path || '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '');
}

function basenameFromPath(path) {
    const normalized = normalizePath(path);
    const parts = normalized.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
}

/**
 * Index bundled modules by skillPath suffix and basename.
 * Glob keys look like: .../docs/reading-agent-skills/paper-overview.md
 * skillPath values look like: docs/reading-agent-skills/paper-overview.md
 *
 * @param {Record<string, unknown>} modules
 * @returns {{ bySkillPath: Map<string, string>, byBasename: Map<string, string> }}
 */
export function buildSkillDocumentIndex(modules = BUNDLED_SKILL_DOCS) {
    const bySkillPath = new Map();
    const byBasename = new Map();

    for (const [key, content] of Object.entries(modules || {})) {
        if (typeof content !== 'string') continue;
        const text = content.trim();
        if (!text) continue;

        const normalized = normalizePath(key);
        const base = basenameFromPath(normalized);
        if (base) {
            byBasename.set(base, text);
        }

        const marker = 'docs/reading-agent-skills/';
        const docsIdx = normalized.indexOf(marker);
        if (docsIdx >= 0) {
            bySkillPath.set(normalized.slice(docsIdx), text);
        } else if (base) {
            bySkillPath.set(`${marker}${base}`, text);
        }
    }

    return { bySkillPath, byBasename };
}

let cachedIndex = null;

function getBundledIndex() {
    if (!cachedIndex) {
        cachedIndex = buildSkillDocumentIndex(BUNDLED_SKILL_DOCS);
    }
    return cachedIndex;
}

/**
 * Lookup helpers for tests: replace or clear the cached bundled index.
 * Pass null to rebuild from real import.meta.glob modules next call.
 *
 * @param {Record<string, string>|null|undefined} modules
 */
export function __setBundledSkillDocumentsForTests(modules) {
    if (modules == null) {
        cachedIndex = null;
        return;
    }
    cachedIndex = buildSkillDocumentIndex(modules);
}

/**
 * Resolve full skill markdown for progressive disclosure.
 *
 * Precedence:
 * 1. options.skillDocument (explicit inject - tests / Node eval / product override)
 * 2. options.documents map keyed by skillPath or basename (test inject without global mock)
 * 3. Vite-bundled raw modules (browser + vitest)
 * 4. empty string (embed-only fallback)
 *
 * @param {{ skillPath?: string }|null|undefined} skill
 * @param {{
 *   skillDocument?: string,
 *   documents?: Record<string, string>,
 * }} [options]
 * @returns {string} trimmed markdown or ''
 */
export function resolveSkillDocument(skill, options = {}) {
    if (typeof options.skillDocument === 'string' && options.skillDocument.trim()) {
        return options.skillDocument.trim();
    }

    const skillPath = typeof skill?.skillPath === 'string' ? skill.skillPath.trim() : '';
    if (!skillPath) return '';

    const normalizedPath = normalizePath(skillPath);
    const base = basenameFromPath(normalizedPath);

    const documents = options.documents;
    if (documents && typeof documents === 'object') {
        const fromInject = documents[skillPath]
            || documents[normalizedPath]
            || (base ? documents[base] : undefined);
        if (typeof fromInject === 'string' && fromInject.trim()) {
            return fromInject.trim();
        }
        // Explicit empty map means "no document" for this call (tests).
        // Still allow bundled lookup only when documents is not an empty override
        // intent; empty object with no matching key falls through to bundled.
    }

    try {
        const index = getBundledIndex();
        const fromPath = index.bySkillPath.get(normalizedPath);
        if (fromPath) return fromPath;
        if (base) {
            const fromBase = index.byBasename.get(base);
            if (fromBase) return fromBase;
        }
    } catch (_) {
        // import.meta.glob unavailable or empty in odd runtimes
    }

    return '';
}
