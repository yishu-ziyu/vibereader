const PARAGRAPH_ID_PATTERN = /^page-(\d+)-para-(\d+)$/;
const DEFAULT_PULSE_DURATION = 3000;
const DEFAULT_PULSE_COUNT = 2;
const PULSE_CLASS = 'pulse-highlight-active';
const TREE_ANCHOR_CLASS = 'bidirectional-anchor-active';

function invalidParagraphLocation() {
    return { page: null, index: null };
}

function isSafeNonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

function isSafePositiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
}

function normalizePositiveNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizePositiveInteger(value, fallback) {
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function isValidParagraphId(paragraphId) {
    return parseParagraphId(paragraphId).page !== null;
}

function paragraphSelector(attributeName, paragraphId) {
    return `[${attributeName}="${paragraphId}"]`;
}

function clearTreeAnchorMarkers(treeContainer) {
    treeContainer
        .querySelectorAll(`.${TREE_ANCHOR_CLASS}, [data-anchor-active="true"]`)
        .forEach((element) => {
            element.classList.remove(TREE_ANCHOR_CLASS);
            delete element.dataset.anchorActive;
        });
}

function childNodesFor(node) {
    if (!node || typeof node !== 'object') return [];

    return [
        ...(Array.isArray(node.children) ? node.children : []),
        ...(Array.isArray(node.paragraphs) ? node.paragraphs : []),
    ];
}

function findAncestorPath(nodes, paragraphId, ancestors = []) {
    if (!Array.isArray(nodes)) return null;

    for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        if (node.paragraphId === paragraphId) return ancestors;

        const nextAncestors = node.id ? [...ancestors, node.id] : ancestors;
        const childPath = findAncestorPath(childNodesFor(node), paragraphId, nextAncestors);
        if (childPath) return childPath;
    }

    return null;
}

function mergeExpandedIds(previousIds, idsToAdd) {
    if (previousIds instanceof Set) {
        return new Set([...previousIds, ...idsToAdd]);
    }

    const previousArray = Array.isArray(previousIds) ? previousIds : [];
    return [...previousArray, ...idsToAdd.filter((id) => !previousArray.includes(id))];
}

/**
 * Construct a stable paragraph id from a one-based page and zero-based paragraph index.
 * @param {number} page
 * @param {number} index
 * @returns {string | null}
 */
export function buildParagraphId(page, index) {
    if (!isSafePositiveInteger(page) || !isSafeNonNegativeInteger(index)) return null;
    return `page-${page}-para-${index}`;
}

/**
 * Parse a paragraph id into a one-based page and zero-based paragraph index.
 * @param {string} paragraphId
 * @returns {{page: number | null, index: number | null}}
 */
export function parseParagraphId(paragraphId) {
    if (typeof paragraphId !== 'string') return invalidParagraphLocation();

    const match = paragraphId.match(PARAGRAPH_ID_PATTERN);
    if (!match) return invalidParagraphLocation();

    const page = Number.parseInt(match[1], 10);
    const index = Number.parseInt(match[2], 10);
    if (!isSafePositiveInteger(page) || !isSafeNonNegativeInteger(index)) {
        return invalidParagraphLocation();
    }

    return { page, index };
}

/**
 * Find all rendered text-layer elements for a paragraph id.
 * @param {string} paragraphId
 * @returns {NodeListOf<Element> | Element[]}
 */
export function findParagraphElements(paragraphId) {
    if (!isValidParagraphId(paragraphId) || typeof document === 'undefined') return [];
    return document.querySelectorAll(paragraphSelector('data-paragraph-id', paragraphId));
}

/**
 * Temporarily mark paragraph text-layer elements for CSS-driven pulse highlighting.
 * @param {string} paragraphId
 * @param {{duration?: number, pulses?: number}} options
 * @returns {number}
 */
export function pulseHighlightParagraph(paragraphId, options = {}) {
    const elements = [...findParagraphElements(paragraphId)];
    if (elements.length === 0) return 0;

    const duration = normalizePositiveNumber(options.duration, DEFAULT_PULSE_DURATION);
    const pulses = normalizePositiveInteger(options.pulses, DEFAULT_PULSE_COUNT);
    const pulseDuration = duration / pulses;

    elements.forEach((element) => {
        element.classList.add(PULSE_CLASS);
        element.dataset.anchorPulse = 'true';
        element.style.setProperty('--anchor-pulse-duration', `${pulseDuration}ms`);
        element.style.setProperty('--anchor-pulse-count', String(pulses));
    });

    setTimeout(() => {
        elements.forEach((element) => {
            element.classList.remove(PULSE_CLASS);
            delete element.dataset.anchorPulse;
            element.style.removeProperty('--anchor-pulse-duration');
            element.style.removeProperty('--anchor-pulse-count');
        });
    }, duration);

    return elements.length;
}

/**
 * Scroll the thinking tree to a matching node and mark it for CSS highlighting.
 * @param {string} paragraphId
 * @param {HTMLElement} treeContainer
 * @returns {Element | null}
 */
export function scrollTreeToNode(paragraphId, treeContainer) {
    if (!isValidParagraphId(paragraphId) || !treeContainer?.querySelector) return null;

    const target = treeContainer.querySelector([
        paragraphSelector('data-tree-paragraph-id', paragraphId),
        paragraphSelector('data-paragraph-id', paragraphId),
    ].join(', '));

    if (!target) return null;

    clearTreeAnchorMarkers(treeContainer);
    target.classList.add(TREE_ANCHOR_CLASS);
    target.dataset.anchorActive = 'true';

    if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return target;
}

/**
 * Expand the tree ancestors needed to reveal a paragraph node.
 * @param {string} paragraphId
 * @param {Function} setExpandedIds
 * @param {Array} sections
 * @returns {string[]}
 */
export function expandTreeToParagraph(paragraphId, setExpandedIds, sections) {
    if (!isValidParagraphId(paragraphId) || typeof setExpandedIds !== 'function') return [];

    const ancestorPath = findAncestorPath(sections, paragraphId) || [];
    if (ancestorPath.length === 0) return [];

    setExpandedIds((previousIds) => mergeExpandedIds(previousIds, ancestorPath));
    return ancestorPath;
}
