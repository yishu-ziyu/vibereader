function hashText(text = '') {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(36);
}

export function normalizeOcrConfidence(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
    const numeric = Number(value);
    const normalized = numeric > 1 ? numeric / 100 : numeric;
    return Math.max(0, Math.min(1, Number(normalized.toFixed(3))));
}

function normalizeBbox(bbox = {}) {
    const hasCorners = ['x0', 'y0', 'x1', 'y1'].every((key) => Number.isFinite(Number(bbox[key])));
    if (hasCorners) {
        const left = Number(bbox.x0);
        const top = Number(bbox.y0);
        return {
            left,
            top,
            width: Math.max(0, Number(bbox.x1) - left),
            height: Math.max(0, Number(bbox.y1) - top),
        };
    }

    const left = Number(bbox.left) || 0;
    const top = Number(bbox.top) || 0;
    return {
        left,
        top,
        width: Math.max(0, Number(bbox.width) || 0),
        height: Math.max(0, Number(bbox.height) || 0),
    };
}

export function createOcrSourceSpans({ documentId = 'current-pdf', page, engine = 'ocr', words = [] }) {
    return words
        .map((word) => ({
            text: String(word?.text || '').trim(),
            bbox: normalizeBbox(word?.bbox),
            confidence: normalizeOcrConfidence(word?.confidence),
        }))
        .filter((word) => word.text && word.bbox.width > 0 && word.bbox.height > 0)
        .map((word) => ({
            documentId,
            page,
            spanId: `${documentId}:p${page}:ocr-${Math.round(word.bbox.top)}-${Math.round(word.bbox.left)}-${hashText(word.text)}`,
            text: word.text,
            bbox: word.bbox,
            source: 'ocr',
            engine,
            confidence: word.confidence,
        }));
}
