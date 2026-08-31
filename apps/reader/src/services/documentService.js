export const SUPPORTED_DOCUMENT_EXTENSIONS = ['pdf', 'md', 'markdown', 'txt', 'html', 'htm'];

const MIME_BY_EXTENSION = {
    pdf: 'application/pdf',
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
};

export function isTauriRuntime() {
    return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

function normalizeIdPart(value) {
    return String(value || 'unknown')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'unknown';
}

function stableHash(value) {
    const text = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function createDocumentFingerprint(source, name, metadata = {}) {
    return [
        source || 'unknown-source',
        name || 'document',
        metadata.path || '',
        metadata.size || 0,
        metadata.lastModified || '',
    ].join('|');
}

function createDocumentId(source, name, metadata = {}) {
    const normalizedSource = normalizeIdPart(source);
    const normalizedName = normalizeIdPart(name || 'document');
    return `${normalizedSource}-${stableHash(createDocumentFingerprint(source, name, metadata))}-${normalizedName}`;
}

function getFileNameFromPath(path) {
    return String(path || '').split(/[\\/]/).filter(Boolean).pop() || 'untitled';
}

function getExtension(name) {
    const fileName = String(name || '');
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex === -1 || dotIndex === fileName.length - 1) return '';
    return fileName.slice(dotIndex + 1).toLowerCase();
}

export function inferMimeType(name, fallback = '') {
    return fallback || MIME_BY_EXTENSION[getExtension(name)] || 'application/octet-stream';
}

export function inferDocumentKind(name, mimeType = '') {
    const extension = getExtension(name);
    const mime = String(mimeType).toLowerCase();

    if (extension === 'pdf' || mime.includes('pdf')) return 'pdf';
    if (extension === 'md' || extension === 'markdown' || mime.includes('markdown')) return 'markdown';
    if (extension === 'html' || extension === 'htm' || mime.includes('html')) return 'html';
    if (extension === 'txt' || mime.startsWith('text/')) return 'text';

    return 'unknown';
}

export function fileToDocument(file, source = 'browser-upload') {
    if (!file) return null;

    const name = file.name || 'untitled';
    const mimeType = inferMimeType(name, file.type);
    const fingerprint = createDocumentFingerprint(source, name, {
        size: file.size || 0,
        lastModified: file.lastModified || '',
    });

    return {
        id: createDocumentId(source, name, {
            size: file.size || 0,
            lastModified: file.lastModified || '',
        }),
        name,
        kind: inferDocumentKind(name, mimeType),
        source,
        mimeType,
        size: file.size || 0,
        fingerprint,
        file,
        openedAt: Date.now(),
    };
}

export function sanitizeHtmlToText(html) {
    if (!html) return '';

    if (typeof DOMParser === 'undefined') {
        return String(html)
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const parser = new DOMParser();
    const parsed = parser.parseFromString(String(html), 'text/html');
    parsed.querySelectorAll('script, style, noscript, template').forEach((node) => node.remove());
    return (parsed.body?.innerText || parsed.body?.textContent || '')
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

export async function fileToDocumentWithContent(file, source = 'browser-upload') {
    const document = fileToDocument(file, source);
    if (!document) return null;

    if (document.kind === 'pdf') {
        return document;
    }

    const rawText = await file.text();
    return {
        ...document,
        contentText: document.kind === 'html' ? sanitizeHtmlToText(rawText) : rawText,
    };
}

function normalizeSelectedPath(selectedPath) {
    if (typeof selectedPath === 'string') return selectedPath;
    if (selectedPath && typeof selectedPath.path === 'string') return selectedPath.path;
    return String(selectedPath || '');
}

export async function openTauriDocument() {
    if (!isTauriRuntime()) {
        return { status: 'unsupported' };
    }

    const [{ open }, { readFile, readTextFile, stat }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
    ]);

    const selectedPath = await open({
        directory: false,
        multiple: false,
        filters: [
            {
                name: 'Readable documents',
                extensions: SUPPORTED_DOCUMENT_EXTENSIONS,
            },
        ],
    });

    if (!selectedPath) {
        return { status: 'cancelled' };
    }

    if (Array.isArray(selectedPath)) {
        return { status: 'cancelled' };
    }

    const path = normalizeSelectedPath(selectedPath);
    const name = getFileNameFromPath(path);
    const mimeType = inferMimeType(name);
    const kind = inferDocumentKind(path, mimeType);
    const fileInfo = await stat(path);

    if (fileInfo.isDirectory) {
        return {
            status: 'invalid',
            reason: 'directory-selected',
            path,
            message: '请选择具体文件，不要选择文件夹。',
        };
    }

    if (kind === 'pdf') {
        const bytes = await readFile(path);
        const binary = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes);
        const file = new File([binary], name, { type: mimeType });

        return {
            status: 'opened',
            document: {
                id: createDocumentId('local-file', name, {
                    path,
                    size: file.size,
                }),
                name,
                kind,
                source: 'local-file',
                path,
                mimeType,
                size: file.size,
                fingerprint: createDocumentFingerprint('local-file', name, {
                    path,
                    size: file.size,
                }),
                binary: binary.buffer,
                file,
                openedAt: Date.now(),
            },
        };
    }

    const rawContentText = await readTextFile(path);
    const contentText = kind === 'html' ? sanitizeHtmlToText(rawContentText) : rawContentText;
    const file = new File([contentText], name, { type: mimeType });

    return {
        status: 'opened',
        document: {
            id: createDocumentId('local-file', name, {
                path,
                size: file.size,
            }),
            name,
            kind,
            source: 'local-file',
            path,
            mimeType,
            size: file.size,
            fingerprint: createDocumentFingerprint('local-file', name, {
                path,
                size: file.size,
            }),
            contentText,
            file,
            openedAt: Date.now(),
        },
    };
}
