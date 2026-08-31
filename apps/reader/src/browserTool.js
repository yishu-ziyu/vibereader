/**
 * Browser Tool — fetch web page content for AI context injection
 *
 * Strategies (in order):
 * 1. Kimi WebBridge (localhost:10086) — best quality, full page render,
 *    but CORS-blocked from web pages; works only in extension contexts
 * 2. jina.ai reader API — CORS-friendly, extracts article text
 * 3. Direct fetch — for CORS-enabled pages
 */

const WEBBRIDGE_URL = 'http://127.0.0.1:10086/command';
const JINA_READER_URL = 'https://r.jina.ai/http://';

/**
 * Fetch page content via Kimi WebBridge snapshot API
 * @param {string} url
 * @returns {Promise<{title:string, text:string, url:string, source:string}>|null}
 */
async function fetchViaWebBridge(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(WEBBRIDGE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'navigate',
                args: { url, newTab: true },
                session: 'ai-chat-browser-tool',
            }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const navResult = await response.json();
        if (!navResult.success) return null;

        // Get page snapshot (accessibility tree)
        const snapshotRes = await fetch(WEBBRIDGE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'snapshot',
                session: 'ai-chat-browser-tool',
            }),
        });

        if (!snapshotRes.ok) return null;
        const snapshot = await snapshotRes.json();

        // Close the tab we opened
        try {
            await fetch(WEBBRIDGE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'close_tab',
                    session: 'ai-chat-browser-tool',
                }),
            });
        } catch {
            /* ignore cleanup errors */
        }

        const title = snapshot.title || '';
        const text = extractTextFromSnapshot(snapshot.tree || '');

        if (!text.trim()) return null;

        return {
            title,
            text: truncateText(text, 12000),
            url,
            source: 'webbridge',
        };
    } catch {
        // CORS error or WebBridge not running — expected in most browser contexts
        return null;
    }
}

/**
 * Extract readable text from WebBridge accessibility tree
 * @param {string} treeText
 */
function extractTextFromSnapshot(treeText) {
    if (!treeText) return '';
    // Remove @e refs and structural markers, keep text content
    return treeText
        .replace(/\[\d+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Fetch page content via jina.ai reader API (CORS-friendly)
 * @param {string} url
 * @returns {Promise<{title:string, text:string, url:string, source:string}>|null}
 */
async function fetchViaJina(url) {
    try {
        const targetUrl = url.startsWith('http') ? url : `https://${url}`;
        const jinaUrl = `https://r.jina.ai/http://${targetUrl.replace(/^https?:\/\//, '')}`;

        const response = await fetch(jinaUrl, {
            method: 'GET',
            headers: {
                Accept: 'text/plain',
            },
        });

        if (!response.ok) return null;

        const text = await response.text();
        if (!text.trim()) return null;

        // jina.ai returns: Title\n\nContent
        const lines = text.split('\n');
        const title = lines[0]?.trim() || '';
        const body = lines.slice(2).join('\n').trim();

        return {
            title,
            text: truncateText(body || text, 12000),
            url: targetUrl,
            source: 'jina',
        };
    } catch {
        return null;
    }
}

/**
 * Fetch page content via direct fetch (requires target to allow CORS)
 * @param {string} url
 * @returns {Promise<{title:string, text:string, url:string, source:string}>|null}
 */
async function fetchViaDirect(url) {
    try {
        const targetUrl = url.startsWith('http') ? url : `https://${url}`;
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                Accept: 'text/html,application/xhtml+xml',
            },
        });

        if (!response.ok) return null;

        const html = await response.text();
        if (!html.trim()) return null;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Try to find main content
        const article =
            doc.querySelector('article') ||
            doc.querySelector('main') ||
            doc.querySelector('[role="main"]') ||
            doc.querySelector('.content') ||
            doc.querySelector('.post-content') ||
            doc.querySelector('.entry-content') ||
            doc.body;

        const title = doc.title || '';
        const text = article ? article.innerText : doc.body?.innerText || '';

        if (!text.trim()) return null;

        return {
            title,
            text: truncateText(text, 12000),
            url: targetUrl,
            source: 'direct',
        };
    } catch {
        return null;
    }
}

/**
 * Truncate text to max length with ellipsis indicator
 * @param {string} text
 * @param {number} maxLength
 */
function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '\n\n[Content truncated...]';
}

/**
 * Format fetched content as a Markdown block for AI context injection
 * @param {{title:string, text:string, url:string, source:string}} content
 * @returns {string}
 */
export function formatAsMarkdownBlock(content) {
    const { title, text, url } = content;
    const sourceLine = url ? `Source: ${url}` : '';
    const header = title ? `## ${title}\n\n` : '';
    return `${header}${text}\n\n${sourceLine}`.trim();
}

/**
 * Fetch web page content with automatic fallback chain
 * @param {string} url — raw URL or domain (e.g. "example.com" or "https://example.com/page")
 * @returns {Promise<{title:string, text:string, url:string, source:string}>}
 * @throws {Error} if all strategies fail
 */
export async function fetchWebContent(url) {
    if (!url || typeof url !== 'string') {
        throw new Error('URL is required');
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
        throw new Error('URL is required');
    }

    // Normalize URL
    let targetUrl = trimmedUrl;
    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
    }

    // Strategy 1: WebBridge (best quality, but usually CORS-blocked)
    const webBridgeResult = await fetchViaWebBridge(targetUrl);
    if (webBridgeResult) return webBridgeResult;

    // Strategy 2: jina.ai reader (CORS-friendly, good for articles)
    const jinaResult = await fetchViaJina(targetUrl);
    if (jinaResult) return jinaResult;

    // Strategy 3: direct fetch (requires target CORS headers)
    const directResult = await fetchViaDirect(targetUrl);
    if (directResult) return directResult;

    throw new Error(
        'Unable to fetch page content. The site may block cross-origin requests. ' +
        'Try a different URL or use a CORS-enabled source.'
    );
}

/**
 * Quick check: can we reach any content-fetching service?
 * @returns {Promise<boolean>}
 */
export async function isBrowserToolAvailable() {
    try {
        await fetch('https://r.jina.ai/http://example.com', {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000),
        });
        return true;
    } catch {
        return false;
    }
}
