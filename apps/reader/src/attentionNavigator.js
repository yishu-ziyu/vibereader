export const INSIGHT_TYPES = {
    INNOVATION: { key: 'innovation', label: '创新点', color: '#52c41a' },
    METHOD: { key: 'method', label: '方法亮点', color: '#1890ff' },
    ANOMALY: { key: 'anomaly', label: '实验反常', color: '#fa8c16' },
    COMPARISON: { key: 'comparison', label: '关键对比', color: '#722ed1' },
};

const TYPE_BY_KEY = Object.values(INSIGHT_TYPES).reduce((acc, type) => {
    acc[type.key] = type;
    return acc;
}, {});

const LOCAL_TYPE_RULES = [
    {
        type: 'innovation',
        keywords: ['novel', 'new', 'introduce', 'propose', 'contribution', '创新', '提出', '贡献'],
        description: '这里可能概括了论文的新贡献，适合作为优先阅读位置。',
    },
    {
        type: 'method',
        keywords: ['method', 'approach', 'algorithm', 'model', 'estimation', 'design', '方法', '模型', '算法'],
        description: '这里可能说明了论文的核心方法，需要先理解其技术路径。',
    },
    {
        type: 'comparison',
        keywords: ['compared', 'comparison', 'baseline', 'versus', 'than', '相比', '对比', '基线'],
        description: '这里包含关键对比信息，有助于判断论文相对已有工作的价值。',
    },
    {
        type: 'anomaly',
        keywords: ['unexpected', 'anomaly', 'surprising', 'ablation', 'limitation', 'however', '反常', '异常', '局限'],
        description: '这里可能出现反常结果或限制条件，值得仔细核对。',
    },
];

function toPositiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
}

function toNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : null;
}

function getParagraphPage(paragraph) {
    if (!paragraph || typeof paragraph !== 'object') return null;
    const explicitPage = toPositiveInteger(paragraph.page ?? paragraph.pageNumber);
    if (explicitPage) return explicitPage;
    const pageIndex = toNonNegativeInteger(paragraph.pageIndex);
    return pageIndex === null ? null : pageIndex + 1;
}

function getExplicitParagraphIndex(paragraph) {
    if (!paragraph || typeof paragraph !== 'object') return null;
    return toNonNegativeInteger(
        paragraph.paragraphIndex ?? paragraph.index ?? paragraph.paragraph
    );
}

function decorateParagraphs(paragraphs) {
    if (!Array.isArray(paragraphs)) return [];

    const pageCounts = new Map();
    return paragraphs
        .map((paragraph) => {
            const page = getParagraphPage(paragraph);
            if (!page) return null;

            const fallbackIndex = pageCounts.get(page) ?? 0;
            pageCounts.set(page, fallbackIndex + 1);

            return {
                paragraph,
                id: typeof paragraph.id === 'string' && paragraph.id ? paragraph.id : null,
                page,
                paragraphIndex: getExplicitParagraphIndex(paragraph) ?? fallbackIndex,
                text: typeof paragraph.text === 'string' ? paragraph.text : '',
            };
        })
        .filter(Boolean);
}

function buildKeyInsightsPrompt(pdfText) {
    return `你是学术阅读助手。请分析以下论文，找出最值得读者关注的位置。

要求：
1. 找出 3-5 个关键洞察点
2. 每个洞察点包含：
   - type: "innovation" | "method" | "anomaly" | "comparison"
   - location: {"page": 1, "paragraph": 2}
   - description: "一句话说明为什么这个位置重要"
3. 输出 JSON 数组，严格格式：
   [
     {"type": "innovation", "location": {"page": 1, "paragraph": 0}, "description": "..."}
   ]

论文内容：
${pdfText.slice(0, 12000)}`;
}

function safeProgress(onProgress, message) {
    if (typeof onProgress === 'function') {
        onProgress(message);
    }
}

function parseJsonPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
        if (Array.isArray(payload.insights)) return payload.insights;
        return null;
    }
    if (typeof payload !== 'string') return null;

    const trimmed = payload.trim();
    const candidates = [trimmed];
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) candidates.push(fenceMatch[1].trim());

    const firstBracket = trimmed.indexOf('[');
    const lastBracket = trimmed.lastIndexOf(']');
    if (firstBracket >= 0 && lastBracket > firstBracket) {
        candidates.push(trimmed.slice(firstBracket, lastBracket + 1));
    }

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed)) return parsed;
            if (parsed && Array.isArray(parsed.insights)) return parsed.insights;
        } catch (_) {
            // Try the next candidate.
        }
    }
    return null;
}

function normalizeInsight(insight, decoratedParagraphs, ordinal) {
    if (!insight || typeof insight !== 'object') return null;

    const type = typeof insight.type === 'string' ? insight.type.trim().toLowerCase() : '';
    const typeMeta = TYPE_BY_KEY[type];
    if (!typeMeta) return null;

    const location = insight.location || {};
    const page = toPositiveInteger(location.page);
    const paragraphIndex = toNonNegativeInteger(
        location.paragraph ?? location.paragraphIndex ?? insight.paragraphIndex
    );
    if (!page || paragraphIndex === null) return null;

    const paragraph = decoratedParagraphs.find(
        (entry) => entry.page === page && entry.paragraphIndex === paragraphIndex
    );
    if (!paragraph?.id) return null;

    const description = typeof insight.description === 'string'
        ? insight.description.trim()
        : '';
    if (!description) return null;

    return {
        id: insight.id || `attention-${page}-${paragraphIndex}-${type}-${ordinal}`,
        type,
        typeLabel: typeMeta.label,
        typeColor: typeMeta.color,
        location: { page, paragraph: paragraphIndex },
        paragraphId: paragraph.id,
        description,
    };
}

function normalizeInsights(rawInsights, paragraphs) {
    const decorated = decorateParagraphs(paragraphs);
    if (!Array.isArray(rawInsights) || decorated.length === 0) return [];

    const seen = new Set();
    const normalized = [];
    rawInsights.forEach((insight, index) => {
        const item = normalizeInsight(insight, decorated, index);
        if (!item) return;

        const key = `${item.type}:${item.paragraphId}`;
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push(item);
    });
    return normalized.slice(0, 5);
}

function scoreParagraph(text, keywords) {
    const normalizedText = text.toLowerCase();
    return keywords.reduce((score, keyword) => {
        return normalizedText.includes(keyword.toLowerCase()) ? score + 1 : score;
    }, 0);
}

function buildLocalInsightCandidates(paragraphs) {
    const decorated = decorateParagraphs(paragraphs).filter((entry) => entry.id && entry.text);
    const usedParagraphIds = new Set();
    const candidates = [];

    for (const rule of LOCAL_TYPE_RULES) {
        const ranked = decorated
            .map((entry) => ({
                entry,
                score: scoreParagraph(entry.text, rule.keywords),
            }))
            .filter((candidate) => candidate.score > 0 && !usedParagraphIds.has(candidate.entry.id))
            .sort((a, b) => b.score - a.score);

        if (!ranked.length) continue;
        const best = ranked[0].entry;
        usedParagraphIds.add(best.id);
        candidates.push({
            type: rule.type,
            location: { page: best.page, paragraph: best.paragraphIndex },
            description: rule.description,
        });
    }

    for (const entry of decorated) {
        if (candidates.length >= 3) break;
        if (usedParagraphIds.has(entry.id)) continue;

        const rule = LOCAL_TYPE_RULES[candidates.length % LOCAL_TYPE_RULES.length];
        usedParagraphIds.add(entry.id);
        candidates.push({
            type: rule.type,
            location: { page: entry.page, paragraph: entry.paragraphIndex },
            description: rule.description,
        });
    }

    return candidates;
}

/**
 * AI 分析关键洞察点
 * @param {string} pdfText - 论文全文
 * @param {Array} paragraphs - 段落列表（任务 2 产出）
 * @param {Function} onProgress - 进度回调
 * @param {{ modelClient?: Function }} options - 可选模型边界，测试和 UI 可注入
 * @returns {Promise<Array>}
 */
export async function analyzeKeyInsights(pdfText, paragraphs, onProgress, options = {}) {
    if (typeof pdfText !== 'string' || !pdfText.trim() || !Array.isArray(paragraphs) || paragraphs.length === 0) {
        return [];
    }

    safeProgress(onProgress, '正在分析关键位置...');

    if (typeof options.modelClient === 'function') {
        try {
            const payload = await options.modelClient(buildKeyInsightsPrompt(pdfText), { paragraphs });
            const parsed = parseJsonPayload(payload);
            const normalized = normalizeInsights(parsed, paragraphs);
            if (normalized.length > 0) {
                safeProgress(onProgress, 'AI 分析完成');
                return normalized;
            }
        } catch (_) {
            // Model failures fall through to the local analyzer.
        }
    }

    safeProgress(onProgress, '使用本地规则分析关键位置...');
    const fallback = normalizeInsights(buildLocalInsightCandidates(paragraphs), paragraphs);
    safeProgress(onProgress, '分析完成');
    return fallback;
}

/**
 * 根据页码和段落查找段落 ID
 * @param {number} page
 * @param {number} paragraphIndex
 * @param {Array} paragraphs
 * @returns {string | null}
 */
export function findParagraphIdByLocation(page, paragraphIndex, paragraphs) {
    const normalizedPage = toPositiveInteger(page);
    const normalizedIndex = toNonNegativeInteger(paragraphIndex);
    if (!normalizedPage || normalizedIndex === null) return null;

    const paragraph = decorateParagraphs(paragraphs).find(
        (entry) => entry.page === normalizedPage && entry.paragraphIndex === normalizedIndex
    );
    return paragraph?.id || null;
}

/**
 * 按页码分组洞察点
 * @param {Array} insights
 * @returns {Map<number, Array>}
 */
export function groupInsightsByPage(insights) {
    const grouped = new Map();
    if (!Array.isArray(insights)) return grouped;

    for (const insight of insights) {
        const page = insight?.location?.page;
        if (!Number.isInteger(page) || page <= 0) continue;

        if (!grouped.has(page)) grouped.set(page, []);
        grouped.get(page).push(insight);
    }
    return grouped;
}
