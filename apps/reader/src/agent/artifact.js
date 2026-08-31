const DEFAULT_VERIFICATION_STATUS = 'grounded';

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
}

function normalizeStringList(values = []) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function collectClaimSpanIds(claims = []) {
    return claims.flatMap((claim) => normalizeStringList(claim.sourceSpanIds));
}

function normalizeClaims(claims = []) {
    if (!Array.isArray(claims)) return [];

    return claims.map((claim, index) => {
        const sourceSpanIds = normalizeStringList(claim?.sourceSpanIds);
        const inference = Boolean(claim?.inference);

        if (sourceSpanIds.length === 0 && !inference) {
            throw new Error(`Claim ${index + 1} requires sourceSpanIds or inference=true`);
        }

        return {
            ...claim,
            text: String(claim?.text || '').trim(),
            sourceSpanIds,
            inference,
        };
    });
}

function contentWithNormalizedClaims(content = {}) {
    const claims = normalizeClaims(content.claims);
    return {
        ...content,
        ...(claims.length > 0 ? { claims } : {}),
    };
}

function collectSourceSpanIds(explicitSpanIds, originalContent, currentContent) {
    return normalizeStringList([
        ...normalizeStringList(explicitSpanIds),
        ...collectClaimSpanIds(originalContent.claims),
        ...collectClaimSpanIds(currentContent.claims),
    ]);
}

function hasReturnRect(source = {}) {
    return Boolean(source.rect) || (Array.isArray(source.rects) && source.rects.length > 0);
}

function isNavigablePdfSource(source = {}) {
    if (source.sourceType !== 'pdf-selection') return true;
    return Boolean(source.page) && hasReturnRect(source);
}

function verificationStatusFor(sourceSpanIds, originalContent, currentContent, fallback, source) {
    const allClaims = [
        ...(originalContent.claims || []),
        ...(currentContent.claims || []),
    ];
    if (allClaims.some((claim) => claim.inference)) return 'contains_inference';
    if (sourceSpanIds.length === 0) return 'ungrounded';
    if (source && !isNavigablePdfSource(source)) return 'ungrounded';
    return fallback || DEFAULT_VERIFICATION_STATUS;
}

export function createReadingArtifact(input = {}) {
    const originalContent = contentWithNormalizedClaims(input.originalContent || {});
    const currentContent = contentWithNormalizedClaims(input.currentContent || originalContent);
    const sourceSpanIds = collectSourceSpanIds(input.sourceSpanIds, originalContent, currentContent);
    const source = input.source || originalContent.source || currentContent.source || null;
    const artifact = {
        id: input.id || `artifact-${Date.now()}`,
        documentId: input.documentId || 'current-document',
        type: input.type || 'reading_note',
        goal: input.goal || '',
        sourceSpanIds,
        ...(source ? { source } : {}),
        modelId: input.modelId || '',
        createdAt: input.createdAt || new Date().toISOString(),
        originalContent,
        currentContent,
        verificationStatus: verificationStatusFor(
            sourceSpanIds,
            originalContent,
            currentContent,
            input.verificationStatus,
            source
        ),
    };

    return deepFreeze(artifact);
}

export function createLensCardArtifact(input = {}) {
    const selection = input.selection || {};
    const selectionSpanIds = normalizeStringList([
        selection.spanId,
        ...(selection.sourceSpanIds || []),
    ]);
    const originalContent = {
        selectionText: selection.text || '',
        explanation: input.explanation || '',
        claims: normalizeClaims(input.claims || []),
        ...(input.source ? { source: input.source } : {}),
    };

    return createReadingArtifact({
        ...input,
        type: 'lens_card',
        source: input.source,
        sourceSpanIds: selectionSpanIds,
        originalContent,
        currentContent: input.currentContent || originalContent,
    });
}
