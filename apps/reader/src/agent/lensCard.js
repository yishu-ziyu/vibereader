import { createLensCardArtifact } from './artifact';
import { packDocumentContext } from './contextPacker';

const DEFAULT_GOAL = '解释选中的原文，并生成一张可保存的 Lens Card。';

function firstContentLine(text) {
    return String(text || '')
        .split(/\n+/)
        .map((line) => line.trim())
        .find(Boolean) || '这张卡片需要人工补充解释。';
}

function readableContent(text) {
    const content = String(text || '')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n');
    return content || '这张卡片需要人工补充解释。';
}

function normalizeSelection(selection = {}) {
    return {
        documentId: selection.documentId || 'current-document',
        text: selection.text || '',
        page: selection.page || null,
        spanId: selection.spanId || '',
        rect: selection.sourceRect || selection.rect || null,
        rects: selection.sourceRects || selection.rects || null,
        coordinateSpace: selection.coordinateSpace || null,
        sourceType: selection.sourceType || 'selection',
    };
}

function compactObject(value = {}) {
    return Object.fromEntries(
        Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined)
    );
}

export function buildLensCardPrompt(packedContext) {
    return [
        '请基于下面的阅读上下文生成一张 Lens Card。',
        '要求：',
        '- 用中文简洁解释选中内容。',
        '- 输出 1-3 个关键点。',
        '- 如果你在做超出原文的推断，请明确写出“推断”。',
        '- 不要编造未在上下文中出现的事实。',
        '',
        packedContext.prompt,
    ].join('\n');
}

export async function generateLensCardArtifact(input = {}) {
    const selection = normalizeSelection(input.selection);
    const goal = input.goal || DEFAULT_GOAL;
    const packedContext = packDocumentContext({
        goal,
        document: input.document || { id: selection.documentId },
        selection,
        annotations: input.annotations || [],
    }, input.contextOptions || { maxTokens: 900 });
    const generateText = input.generateText || (async () => firstContentLine(selection.text));
    const explanation = readableContent(await generateText(buildLensCardPrompt(packedContext), packedContext));
    const sourceSpanIds = selection.spanId ? [selection.spanId] : [];
    const source = compactObject({
        documentId: selection.documentId,
        page: selection.page,
        spanId: selection.spanId,
        rect: selection.rect,
        rects: selection.rects,
        coordinateSpace: selection.coordinateSpace,
        sourceType: selection.sourceType,
    });

    return createLensCardArtifact({
        id: input.id,
        documentId: selection.documentId,
        goal,
        modelId: input.modelId || '',
        createdAt: input.createdAt,
        selection: {
            text: selection.text,
            spanId: selection.spanId,
            sourceSpanIds,
        },
        source,
        explanation,
        claims: [
            {
                text: explanation,
                sourceSpanIds,
                inference: sourceSpanIds.length === 0,
            },
        ],
        currentContent: {
            selectionText: selection.text,
            explanation,
            claims: [
                {
                    text: explanation,
                    sourceSpanIds,
                    inference: sourceSpanIds.length === 0,
                },
            ],
            source,
        },
        originalContent: {
            selectionText: selection.text,
            explanation,
            claims: [
                {
                    text: explanation,
                    sourceSpanIds,
                    inference: sourceSpanIds.length === 0,
                },
            ],
            source,
        },
    });
}
