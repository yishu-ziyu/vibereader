function lastToolResult(trace = [], toolName) {
    return [...trace].reverse().find((entry) => (
        entry?.type === 'tool' && entry.toolName === toolName
    ))?.result || null;
}

function overviewSnippet(text = '', maxLength = 180) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function toolResults(trace = [], toolName) {
    return trace
        .filter((entry) => entry?.type === 'tool' && entry.toolName === toolName)
        .map((entry) => entry.result)
        .filter(Boolean);
}

export function createLocalPaperOverviewModel() {
    return async ({ iteration, trace }) => {
        if (iteration === 1) {
            return {
                type: 'tool_call',
                toolName: 'get_current_document',
                args: {},
            };
        }

        if (iteration === 2) {
            return {
                type: 'tool_call',
                toolName: 'get_document_chunks',
                args: {
                    query: 'abstract introduction method results conclusion',
                    limit: 4,
                    maxChars: 900,
                },
            };
        }

        const metadata = lastToolResult(trace, 'get_current_document') || {};
        const chunkResult = lastToolResult(trace, 'get_document_chunks') || {};
        const chunks = Array.isArray(chunkResult.chunks) ? chunkResult.chunks : [];
        const sourceLines = chunks
            .map((chunk, index) => {
                const location = chunk.page ? `p.${chunk.page}` : chunk.paragraphId || `chunk-${index + 1}`;
                const snippet = overviewSnippet(chunk.text);
                return snippet ? `- ${location}: ${snippet}` : null;
            })
            .filter(Boolean);
        const sourceRefs = chunks
            .map((chunk) => ({
                documentId: chunk.documentId || metadata.id,
                page: chunk.page || null,
                paragraphId: chunk.paragraphId || chunk.id || null,
                text: overviewSnippet(chunk.text, 240),
            }))
            .filter((sourceRef) => sourceRef.paragraphId || sourceRef.page || sourceRef.text);

        return {
            type: 'final',
            content: [
                '# Paper overview',
                '',
                `Document: ${metadata.name || 'Untitled'}`,
                `Type: ${metadata.kind || 'unknown'}`,
                metadata.pageCount ? `Pages: ${metadata.pageCount}` : '',
                '',
                'Initial source scan:',
                sourceLines.length > 0 ? sourceLines.join('\n') : '- No bounded source chunks were available.',
            ].filter(Boolean).join('\n'),
            sourceRefs,
        };
    };
}

export function createLocalAttentionRouteModel() {
    return async ({ iteration, trace }) => {
        if (iteration === 1) {
            return {
                type: 'tool_call',
                toolName: 'get_current_document',
                args: {},
            };
        }

        if (iteration === 2) {
            return {
                type: 'tool_call',
                toolName: 'list_attention_insights',
                args: {},
            };
        }

        if (iteration === 3) {
            return {
                type: 'tool_call',
                toolName: 'get_document_chunks',
                args: {
                    query: 'problem claim method evidence result limitation definition formula warning',
                    limit: 5,
                    maxChars: 800,
                },
            };
        }

        const metadata = lastToolResult(trace, 'get_current_document') || {};
        const insightResult = lastToolResult(trace, 'list_attention_insights') || {};
        const chunkResult = lastToolResult(trace, 'get_document_chunks') || {};
        const insights = Array.isArray(insightResult.insights) ? insightResult.insights : [];
        const chunks = Array.isArray(chunkResult.chunks) ? chunkResult.chunks : [];
        const insightLines = insights
            .slice(0, 5)
            .map((insight, index) => {
                const description = insightDescription(insight);
                const type = insight.type || 'Insight';
                return description ? `${index + 1}. ${insightLocationLabel(insight)} · ${type}: ${description}` : null;
            })
            .filter(Boolean);
        const chunkLines = chunks
            .slice(0, 5)
            .map((chunk, index) => {
                const location = chunk.page ? `P${chunk.page}` : chunk.paragraphId || `chunk-${index + 1}`;
                const snippet = overviewSnippet(chunk.text);
                return snippet ? `${index + 1}. ${location}: ${snippet}` : null;
            })
            .filter(Boolean);
        const sourceRefs = [
            ...insights.map((insight) => ({
                documentId: insight.documentId || metadata.documentId || metadata.id,
                page: insight.location?.page || insight.page || null,
                paragraphId: insight.location?.paragraphId || insight.paragraphId || insight.id || null,
                text: insightDescription(insight),
            })),
            ...chunks.map((chunk) => ({
                documentId: chunk.documentId || metadata.documentId || metadata.id,
                page: chunk.page || null,
                paragraphId: chunk.paragraphId || chunk.id || null,
                text: overviewSnippet(chunk.text, 240),
            })),
        ].filter((sourceRef) => sourceRef.paragraphId || sourceRef.page || sourceRef.text);

        return {
            type: 'final',
            content: [
                '# Attention route',
                '',
                `Document: ${metadata.name || 'Untitled'}`,
                '',
                'Saved attention insights:',
                insightLines.length > 0 ? insightLines.join('\n') : '- No saved attention insights were available.',
                '',
                'Source scan:',
                chunkLines.length > 0 ? chunkLines.join('\n') : '- No bounded source chunks were available.',
            ].join('\n'),
            sourceRefs,
        };
    };
}

export function createLocalCardGenerationModel() {
    return async ({ iteration, trace }) => {
        if (iteration === 1) {
            return {
                type: 'tool_call',
                toolName: 'get_current_document',
                args: {},
            };
        }

        if (iteration === 2) {
            return {
                type: 'tool_call',
                toolName: 'get_document_chunks',
                args: {
                    query: 'problem method evidence result definition contribution limitation',
                    limit: 6,
                    maxChars: 900,
                },
            };
        }

        const metadata = lastToolResult(trace, 'get_current_document') || {};
        const chunkResult = lastToolResult(trace, 'get_document_chunks') || {};
        const candidates = cardCandidateChunks(chunkResult.chunks, metadata);
        const createdResults = toolResults(trace, 'create_vibecard');

        if (createdResults.length === 0 && candidates.length < 3) {
            return {
                type: 'final',
                content: [
                    '# Create VibeCard needs more sources',
                    '',
                    `Document: ${metadata.name || 'Untitled'}`,
                    '',
                    `Need at least 3 source chunks to create VibeCards. Found ${candidates.length}.`,
                    'No VibeCards were created.',
                ].join('\n'),
                sourceRefs: candidates.map((chunk) => ({
                    documentId: chunk.documentId || metadata.documentId || metadata.id,
                    page: chunk.page || null,
                    paragraphId: chunk.paragraphId || chunk.id || null,
                    text: overviewSnippet(chunk.text, 240),
                })).filter((sourceRef) => sourceRef.paragraphId || sourceRef.page || sourceRef.text),
            };
        }

        if (createdResults.length < 3 && candidates[createdResults.length]) {
            return {
                type: 'tool_call',
                toolName: 'create_vibecard',
                args: {
                    card: buildVibeCard(candidates[createdResults.length], createdResults.length, metadata),
                },
            };
        }

        const sourceRefs = createdResults
            .map((result) => result.card || {})
            .map((card) => ({
                documentId: card.documentId || metadata.documentId || metadata.id,
                page: card.page || null,
                paragraphId: card.paragraphId || null,
                text: overviewSnippet(card.sourceText, 240),
            }))
            .filter((sourceRef) => sourceRef.paragraphId || sourceRef.page || sourceRef.text);

        return {
            type: 'final',
            content: [
                '# Created VibeCards',
                '',
                `Document: ${metadata.name || 'Untitled'}`,
                '',
                `Created ${createdResults.length} source-grounded VibeCards.`,
                ...createdResults.map((result, index) => {
                    const card = result.card || {};
                    return `${index + 1}. ${card.title || `VibeCard ${index + 1}`}`;
                }),
            ].join('\n'),
            sourceRefs,
        };
    };
}

/**
 * Knowledge QA: document scope → knowledge_search (or search_document) → grounded answer.
 */
export function createLocalKnowledgeQaModel() {
    return async ({ iteration, goal = '', trace }) => {
        if (iteration === 1) {
            return {
                type: 'tool_call',
                toolName: 'get_current_document',
                args: {},
            };
        }

        if (iteration === 2) {
            return {
                type: 'tool_call',
                toolName: 'knowledge_search',
                args: {
                    query: queryFromGoal(goal, 'key claims evidence method result definition'),
                    limit: 5,
                },
            };
        }

        const metadata = lastToolResult(trace, 'get_current_document') || {};
        const knowledgeResult = lastToolResult(trace, 'knowledge_search') || {};
        const searchResult = lastToolResult(trace, 'search_document') || {};
        let matches = Array.isArray(knowledgeResult.matches) ? knowledgeResult.matches : [];
        if (matches.length === 0 && Array.isArray(searchResult.matches)) {
            matches = searchResult.matches;
        }

        // Local fallback when knowledge_search returned empty and search_document not yet tried.
        if (matches.length === 0 && !lastToolResult(trace, 'search_document')) {
            return {
                type: 'tool_call',
                toolName: 'search_document',
                args: {
                    query: queryFromGoal(goal, 'key claims evidence method result definition'),
                    limit: 5,
                    maxChars: 400,
                },
            };
        }

        const sourceRefs = matchesToSourceRefs(matches, metadata);
        const answerLines = matches
            .slice(0, 5)
            .map((match, index) => {
                const location = match.page
                    ? `p.${match.page}`
                    : match.paragraphId || match.id || `match-${index + 1}`;
                const snippet = overviewSnippet(match.text || match.sourceText || '');
                return snippet ? `${index + 1}. ${location}: ${snippet}` : null;
            })
            .filter(Boolean);

        return {
            type: 'final',
            content: [
                '# Knowledge answer',
                '',
                `Document: ${metadata.name || 'Untitled'}`,
                knowledgeResult.engine ? `Engine: ${knowledgeResult.engine}` : '',
                '',
                answerLines.length > 0
                    ? 'Grounded evidence:'
                    : 'Insufficient evidence: no knowledge or document matches were returned.',
                answerLines.length > 0 ? answerLines.join('\n') : '',
            ].filter(Boolean).join('\n'),
            sourceRefs,
        };
    };
}

/**
 * Critic: load chunks, verify one claim (from goal or sample chunk), report verdict.
 */
export function createLocalCriticModel() {
    return async ({ iteration, goal = '', trace }) => {
        if (iteration === 1) {
            return {
                type: 'tool_call',
                toolName: 'get_document_chunks',
                args: {
                    query: queryFromGoal(goal, 'claim method evidence result conclusion'),
                    limit: 4,
                    maxChars: 700,
                },
            };
        }

        const chunkResult = lastToolResult(trace, 'get_document_chunks') || {};
        const chunks = Array.isArray(chunkResult.chunks) ? chunkResult.chunks : [];
        const verifyResult = lastToolResult(trace, 'verify_citation');

        if (!verifyResult) {
            const claim = claimFromGoalOrChunks(goal, chunks);
            const evidenceChunk = chunks[0] || {};
            const args = {
                claim,
                evidenceText: String(evidenceChunk.text || ''),
            };
            if (evidenceChunk.text) {
                args.sourceRef = {
                    documentId: evidenceChunk.documentId || null,
                    page: evidenceChunk.page || null,
                    paragraphId: evidenceChunk.paragraphId || evidenceChunk.id || null,
                    text: overviewSnippet(evidenceChunk.text, 400),
                };
            }
            return {
                type: 'tool_call',
                toolName: 'verify_citation',
                args,
            };
        }

        const claim = verifyResult.claim || claimFromGoalOrChunks(goal, chunks);
        const score = Number.isFinite(Number(verifyResult.score)) ? Number(verifyResult.score) : 0;
        const grounded = Boolean(verifyResult.grounded);
        const verdict = grounded
            ? 'supported'
            : score > 0
                ? 'partially_supported'
                : chunks.length > 0
                    ? 'unsupported'
                    : 'not_found';
        const evidenceRefs = matchesToSourceRefs(chunks, {});

        return {
            type: 'final',
            content: [
                '# Claim critique',
                '',
                `Claim: ${claim || '(empty claim)'}`,
                `Verdict: ${verdict}`,
                `Grounded: ${grounded ? 'yes' : 'no'}`,
                `Score: ${score.toFixed(3)}`,
                `Method: ${verifyResult.method || 'token-overlap'}`,
                '',
                grounded
                    ? 'Evidence appears consistent with the claim under lexical overlap.'
                    : 'Claim is not sufficiently supported by retrieved chunks; re-read source spans before citing.',
            ].join('\n'),
            sourceRefs: evidenceRefs,
        };
    };
}

/**
 * Note export: document metadata → attention insights → export_note (when allowed)
 * or final assembly markdown from available tool results.
 *
 * "Allowed" means canExportNotes is not false and the filtered tools registry includes
 * export_note. When tools is omitted (model unit tests), export_note is attempted once.
 */
export function createLocalNoteExportModel() {
    return async ({ iteration, goal = '', trace, tools, permissions }) => {
        if (iteration === 1) {
            return {
                type: 'tool_call',
                toolName: 'get_current_document',
                args: {},
            };
        }

        if (iteration === 2) {
            return {
                type: 'tool_call',
                toolName: 'list_attention_insights',
                args: {},
            };
        }

        const metadata = lastToolResult(trace, 'get_current_document') || {};
        const insightResult = lastToolResult(trace, 'list_attention_insights') || {};
        const insights = Array.isArray(insightResult.insights) ? insightResult.insights : [];
        const exportResult = lastToolResult(trace, 'export_note');

        // Gate write path:
        // - explicit canExportNotes:false → never call export_note (even if tool is registered)
        // - tools present → only when export_note survived filterAllowedTools
        // - tools omitted (model unit tests) → allow one export call by default
        const canCallExport = (() => {
            if (permissions && permissions.canExportNotes === false) return false;
            if (tools == null) return true;
            return Boolean(tools.export_note);
        })();

        if (canCallExport && !exportResult) {
            const documentId = metadata.id || metadata.documentId || undefined;
            return {
                type: 'tool_call',
                toolName: 'export_note',
                args: {
                    ...(documentId ? { documentId } : {}),
                    template: templateFromGoal(goal, 'default'),
                    format: formatFromGoal(goal, 'markdown'),
                },
            };
        }

        const insightLines = insights
            .slice(0, 12)
            .map((insight, index) => {
                const description = insightDescription(insight);
                const type = insight.type || 'Insight';
                return description
                    ? `${index + 1}. ${insightLocationLabel(insight)} · ${type}: ${description}`
                    : null;
            })
            .filter(Boolean);

        const sourceRefs = insights
            .map((insight) => ({
                documentId: insight.documentId || metadata.documentId || metadata.id || null,
                page: insight.location?.page || insight.page || null,
                paragraphId: insight.location?.paragraphId || insight.paragraphId || insight.id || null,
                text: insightDescription(insight),
            }))
            .filter((sourceRef) => sourceRef.paragraphId || sourceRef.page || sourceRef.text);

        if (exportResult) {
            const payload = exportResult.export || {};
            const path = payload.path || payload.filePath || payload.filename || null;
            const exportStatus = exportResult.status || payload.status || 'exported';
            const format = payload.format || formatFromGoal(goal, 'markdown');
            return {
                type: 'final',
                content: [
                    '# Note export',
                    '',
                    `Document: ${metadata.name || 'Untitled'}`,
                    metadata.kind ? `Type: ${metadata.kind}` : '',
                    `Export status: ${exportStatus}`,
                    path ? `Path: ${path}` : '',
                    `Format: ${format}`,
                    '',
                    'Attention insights included:',
                    insightLines.length > 0
                        ? insightLines.join('\n')
                        : '- No saved attention insights were available.',
                    '',
                    'Export completed via export_note. Source refs from collected insights are attached.',
                ].filter(Boolean).join('\n'),
                sourceRefs,
            };
        }

        // Assembly path when export_note is not allowed / not in tools.
        return {
            type: 'final',
            content: [
                '# Note export (assembled)',
                '',
                `Document: ${metadata.name || 'Untitled'}`,
                metadata.kind ? `Type: ${metadata.kind}` : '',
                metadata.pageCount ? `Pages: ${metadata.pageCount}` : '',
                '',
                '## Attention insights',
                insightLines.length > 0
                    ? insightLines.join('\n')
                    : '- No saved attention insights were available.',
                '',
                'Note: export_note was not called (write permission or tool unavailable).',
                'This markdown is assembled from get_current_document and list_attention_insights only.',
            ].filter(Boolean).join('\n'),
            sourceRefs,
        };
    };
}

/**
 * Memory curator: search saved memory, propose save candidates only (never write).
 */
export function createLocalMemoryCuratorModel() {
    return async ({ iteration, goal = '', trace }) => {
        if (iteration === 1) {
            return {
                type: 'tool_call',
                toolName: 'memory_search',
                args: {
                    query: queryFromGoal(goal, 'saved insights claims methods definitions'),
                    limit: 8,
                },
            };
        }

        const memoryResult = lastToolResult(trace, 'memory_search') || {};
        const memories = Array.isArray(memoryResult.memories) ? memoryResult.memories : [];
        const status = memoryResult.status || (memories.length > 0 ? 'ok' : 'empty');

        const hitLines = memories
            .slice(0, 8)
            .map((memory, index) => {
                const title = memory.title || memory.id || `memory-${index + 1}`;
                const snippet = overviewSnippet(memory.text || '', 160);
                return snippet
                    ? `${index + 1}. [${memory.id || title}] ${title}: ${snippet}`
                    : `${index + 1}. [${memory.id || title}] ${title}`;
            });

        const proposals = memories
            .filter((memory) => memory.id || memory.artifactId)
            .slice(0, 3)
            .map((memory) => ({
                artifactId: memory.artifactId || memory.id,
                title: memory.title || memory.id || 'Untitled memory',
                reason: 'Relevant memory_search hit; confirm before long-term save.',
                documentId: memory.documentId || null,
            }));

        // When search is empty, still propose confirm-gated candidates from the goal text only as placeholders.
        const proposalLines = proposals.length > 0
            ? proposals.map((proposal, index) => (
                `${index + 1}. artifact=${proposal.artifactId} · ${proposal.title} · ${proposal.reason}`
            ))
            : [
                '1. No concrete artifact ids returned. Capture a card or insight first, then re-run curator.',
            ];

        return {
            type: 'final',
            content: [
                '# Memory curation',
                '',
                `Search status: ${status}`,
                `Query: ${memoryResult.query || queryFromGoal(goal, '')}`,
                '',
                'Hits:',
                hitLines.length > 0 ? hitLines.join('\n') : '- No saved memories matched.',
                '',
                'Propose to save (do not write until user confirms):',
                proposalLines.join('\n'),
                '',
                'Note: this local curator never calls memory_save.',
            ].join('\n'),
            sourceRefs: memories
                .map((memory) => ({
                    documentId: memory.documentId || null,
                    page: null,
                    paragraphId: memory.artifactId || memory.id || null,
                    text: overviewSnippet(memory.text || memory.title || '', 240),
                }))
                .filter((sourceRef) => sourceRef.paragraphId || sourceRef.text),
        };
    };
}

function queryFromGoal(goal = '', fallback = '') {
    const normalized = String(goal || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return fallback;
    // Prefer an explicit "Question:" / "Query:" suffix when present.
    const labeled = normalized.match(/(?:question|query|claim)\s*[:：]\s*(.+)$/i);
    if (labeled?.[1]) {
        return overviewSnippet(labeled[1], 200);
    }
    return overviewSnippet(normalized, 200);
}

function formatFromGoal(goal = '', fallback = 'markdown') {
    const normalized = String(goal || '').toLowerCase();
    if (/\bjson\b/.test(normalized)) return 'json';
    if (/\bmarkdown\b|\bmd\b/.test(normalized)) return 'markdown';
    return fallback;
}

function templateFromGoal(goal = '', fallback = 'default') {
    const normalized = String(goal || '');
    const match = normalized.match(/template\s*[:＝=]\s*([a-z0-9_-]+)/i);
    if (match?.[1]) return match[1];
    return fallback;
}

function claimFromGoalOrChunks(goal = '', chunks = []) {
    const fromGoal = queryFromGoal(goal, '');
    if (fromGoal) {
        // Strip common critic framing prefixes.
        const stripped = fromGoal
            .replace(/^(re-?check|verify|critique|check)\b[\s:：-]*/i, '')
            .replace(/^the claims? in the prior overview against document sources\.?/i, '')
            .trim();
        if (stripped && stripped.length >= 12) {
            return overviewSnippet(stripped, 280);
        }
    }
    const sample = Array.isArray(chunks) ? chunks.find((chunk) => chunk?.text) : null;
    return sample ? overviewSnippet(sample.text, 280) : 'No claim available';
}

function matchesToSourceRefs(matches = [], metadata = {}) {
    return (Array.isArray(matches) ? matches : [])
        .map((match) => ({
            documentId: match.documentId || metadata.documentId || metadata.id || null,
            page: match.page || null,
            paragraphId: match.paragraphId || match.id || null,
            text: overviewSnippet(match.text || match.sourceText || '', 240),
        }))
        .filter((sourceRef) => sourceRef.paragraphId || sourceRef.page || sourceRef.text);
}

function insightLocationLabel(insight = {}) {
    const location = insight.location || {};
    if (location.page) return `P${location.page}`;
    if (insight.page) return `P${insight.page}`;
    return insight.paragraphId || insight.id || 'source';
}

function insightDescription(insight = {}) {
    return String(insight.description || insight.title || insight.text || '').replace(/\s+/g, ' ').trim();
}

function cardCandidateChunks(chunks = [], metadata = {}) {
    const seen = new Set();
    return (Array.isArray(chunks) ? chunks : [])
        .map((chunk) => ({
            ...chunk,
            documentId: chunk.documentId || metadata.documentId || metadata.id,
            text: overviewSnippet(chunk.text, 900),
        }))
        .filter((chunk) => {
            if (!chunk.text) return false;
            const key = chunk.paragraphId || chunk.id || chunk.text;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function buildVibeCard(chunk = {}, index = 0, metadata = {}) {
    const sourceText = overviewSnippet(chunk.text, 900);
    const paragraphId = chunk.paragraphId || chunk.id || null;
    const page = chunk.page || null;
    return {
        documentId: chunk.documentId || metadata.documentId || metadata.id,
        type: 'concept',
        title: `VibeCard ${index + 1}: ${overviewSnippet(sourceText, 64)}`,
        sourceText,
        aiContent: `Review this source-backed point: ${overviewSnippet(sourceText, 220)}`,
        userNote: '',
        page,
        paragraphId,
        tags: ['agent-generated', 'vibecard'],
        source: {
            documentId: chunk.documentId || metadata.documentId || metadata.id,
            page,
            paragraphId,
            selectedText: sourceText,
            sourceType: 'agent-card-generation',
        },
        verificationStatus: sourceText && (page || paragraphId) ? 'grounded' : 'ungrounded',
    };
}
