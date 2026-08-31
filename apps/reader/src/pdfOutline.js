export function flattenPdfOutline(items = [], level = 0) {
    if (!Array.isArray(items)) return [];

    return items.flatMap((item, index) => {
        const entry = {
            id: `${level}-${index}-${item.title || 'outline'}`,
            title: item.title || 'Untitled',
            dest: item.dest,
            level,
        };
        return [entry, ...flattenPdfOutline(item.items || [], level + 1)];
    });
}

export async function resolveOutlinePageNumber(pdfDoc, outlineEntry) {
    if (!pdfDoc || !outlineEntry?.dest) return null;

    try {
        const destination = Array.isArray(outlineEntry.dest)
            ? outlineEntry.dest
            : await pdfDoc.getDestination(outlineEntry.dest);
        const ref = destination?.[0];
        if (!ref) return null;
        const pageIndex = await pdfDoc.getPageIndex(ref);
        return pageIndex + 1;
    } catch (_) {
        return null;
    }
}
