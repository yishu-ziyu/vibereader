export function isInsidePdfAnnotationToolbar(element) {
    return Boolean(element?.closest?.('.pdf-annotation-toolbar'));
}

export function isSelectionInsidePdfTextLayer(selection, textLayer) {
    if (!selection || !textLayer || selection.rangeCount === 0) return false;
    if (!selection.toString().trim()) return false;

    for (let index = 0; index < selection.rangeCount; index += 1) {
        const range = selection.getRangeAt(index);
        if (range.collapsed) continue;

        if (textLayer.contains(range.commonAncestorContainer)) return true;
        if (typeof range.intersectsNode === 'function' && range.intersectsNode(textLayer)) return true;
    }

    return false;
}

export function didPointerDrag(start, end, threshold = 4) {
    if (!start || !end) return false;
    return Math.abs(end.clientX - start.clientX) > threshold
        || Math.abs(end.clientY - start.clientY) > threshold;
}

function finitePositiveNumber(value) {
    return Number.isFinite(value) && value > 0;
}

function normalizeRectValue(value, size) {
    if (!finitePositiveNumber(size)) return 0;
    return Number((value / size).toFixed(6));
}

export function normalizePageRects(rects = [], pageBox = {}) {
    const width = Number(pageBox.width);
    const height = Number(pageBox.height);
    if (!finitePositiveNumber(width) || !finitePositiveNumber(height)) return [];

    return rects
        .filter((rect) => rect && rect.width > 0 && rect.height > 0)
        .map((rect) => ({
            left: normalizeRectValue(Number(rect.left) || 0, width),
            top: normalizeRectValue(Number(rect.top) || 0, height),
            width: normalizeRectValue(Number(rect.width) || 0, width),
            height: normalizeRectValue(Number(rect.height) || 0, height),
        }));
}

export function denormalizePageRects(rects = [], pageBox = {}) {
    const width = Number(pageBox.width);
    const height = Number(pageBox.height);
    if (!finitePositiveNumber(width) || !finitePositiveNumber(height)) return [];

    return rects
        .filter((rect) => rect && rect.width > 0 && rect.height > 0)
        .map((rect) => ({
            left: (Number(rect.left) || 0) * width,
            top: (Number(rect.top) || 0) * height,
            width: (Number(rect.width) || 0) * width,
            height: (Number(rect.height) || 0) * height,
        }));
}
