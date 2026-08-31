import { describe, expect, it } from 'vitest';
import {
    createLocalAttentionRouteModel,
    createLocalCardGenerationModel,
    createLocalCriticModel,
    createLocalKnowledgeQaModel,
    createLocalMemoryCuratorModel,
    createLocalNoteExportModel,
    createLocalPaperOverviewModel,
} from './readingTaskModels';

describe('local reading task models', () => {
    it('builds a paper overview from document metadata and bounded chunks', async () => {
        const model = createLocalPaperOverviewModel();

        await expect(model({ iteration: 1, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_current_document',
            args: {},
        });
        await expect(model({ iteration: 2, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_document_chunks',
            args: {
                query: 'abstract introduction method results conclusion',
                limit: 4,
                maxChars: 900,
            },
        });

        const result = await model({
            iteration: 3,
            trace: [
                {
                    type: 'tool',
                    toolName: 'get_current_document',
                    result: {
                        id: 'doc-1',
                        documentId: 'doc-1',
                        name: 'paper.pdf',
                        kind: 'pdf',
                        pageCount: 12,
                    },
                },
                {
                    type: 'tool',
                    toolName: 'get_document_chunks',
                    result: {
                        chunks: [
                            {
                                id: 'chunk-1',
                                documentId: 'doc-1',
                                page: 2,
                                paragraphId: 'page-2-para-1',
                                text: 'The abstract states the research problem and contribution.',
                            },
                        ],
                    },
                },
            ],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('# Paper overview');
        expect(result.content).toContain('Document: paper.pdf');
        expect(result.content).toContain('p.2: The abstract states the research problem and contribution.');
        expect(result.sourceRefs).toEqual([
            {
                documentId: 'doc-1',
                page: 2,
                paragraphId: 'page-2-para-1',
                text: 'The abstract states the research problem and contribution.',
            },
        ]);
    });

    it('builds an attention route from saved insights and bounded chunks', async () => {
        const model = createLocalAttentionRouteModel();

        await expect(model({ iteration: 1, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_current_document',
            args: {},
        });
        await expect(model({ iteration: 2, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'list_attention_insights',
            args: {},
        });
        await expect(model({ iteration: 3, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_document_chunks',
            args: {
                query: 'problem claim method evidence result limitation definition formula warning',
                limit: 5,
                maxChars: 800,
            },
        });

        const result = await model({
            iteration: 4,
            trace: [
                {
                    type: 'tool',
                    toolName: 'get_current_document',
                    result: {
                        id: 'doc-1',
                        documentId: 'doc-1',
                        name: 'paper.pdf',
                        kind: 'pdf',
                    },
                },
                {
                    type: 'tool',
                    toolName: 'list_attention_insights',
                    result: {
                        insights: [
                            {
                                id: 'insight-1',
                                documentId: 'doc-1',
                                type: 'Method',
                                description: 'The method section defines the causal identification strategy.',
                                location: {
                                    page: 5,
                                    paragraphId: 'page-5-para-2',
                                },
                            },
                        ],
                    },
                },
                {
                    type: 'tool',
                    toolName: 'get_document_chunks',
                    result: {
                        chunks: [
                            {
                                id: 'chunk-7',
                                documentId: 'doc-1',
                                page: 7,
                                paragraphId: 'page-7-para-1',
                                text: 'The results section reports the main estimate and robustness checks.',
                            },
                        ],
                    },
                },
            ],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('# Attention route');
        expect(result.content).toContain('1. P5 · Method: The method section defines the causal identification strategy.');
        expect(result.content).toContain('1. P7: The results section reports the main estimate and robustness checks.');
        expect(result.sourceRefs).toEqual([
            {
                documentId: 'doc-1',
                page: 5,
                paragraphId: 'page-5-para-2',
                text: 'The method section defines the causal identification strategy.',
            },
            {
                documentId: 'doc-1',
                page: 7,
                paragraphId: 'page-7-para-1',
                text: 'The results section reports the main estimate and robustness checks.',
            },
        ]);
    });

    it('creates three source-grounded VibeCards from bounded chunks under load', async () => {
        const model = createLocalCardGenerationModel();
        const trace = [
            {
                type: 'tool',
                toolName: 'get_current_document',
                result: {
                    id: 'doc-1',
                    documentId: 'doc-1',
                    name: 'paper.pdf',
                    kind: 'pdf',
                },
            },
            {
                type: 'tool',
                toolName: 'get_document_chunks',
                result: {
                    chunks: [
                        {
                            id: 'chunk-1',
                            documentId: 'doc-1',
                            page: 1,
                            paragraphId: 'page-1-para-1',
                            text: 'The problem card explains the central research question and motivation.',
                        },
                        {
                            id: 'chunk-2',
                            documentId: 'doc-1',
                            page: 2,
                            paragraphId: 'page-2-para-1',
                            text: 'The method card describes the identification strategy and model design.',
                        },
                        {
                            id: 'chunk-3',
                            documentId: 'doc-1',
                            page: 3,
                            paragraphId: 'page-3-para-1',
                            text: 'The evidence card reports the main empirical result and robustness check.',
                        },
                        {
                            id: 'chunk-4',
                            documentId: 'doc-1',
                            page: 4,
                            paragraphId: 'page-4-para-1',
                            text: 'The limitation card warns about external validity and measurement constraints.',
                        },
                        {
                            id: 'chunk-5',
                            documentId: 'doc-1',
                            page: 5,
                            paragraphId: 'page-5-para-1',
                            text: 'The definition card clarifies a key concept used by the paper.',
                        },
                    ],
                },
            },
        ];

        await expect(model({ iteration: 1, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_current_document',
            args: {},
        });
        await expect(model({ iteration: 2, trace })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_document_chunks',
            args: {
                query: 'problem method evidence result definition contribution limitation',
                limit: 6,
                maxChars: 900,
            },
        });

        const createCalls = [];
        let currentTrace = [...trace];
        for (let iteration = 3; iteration <= 5; iteration += 1) {
            const response = await model({ iteration, trace: currentTrace });
            createCalls.push(response);
            currentTrace = [
                ...currentTrace,
                {
                    type: 'tool',
                    toolName: 'create_vibecard',
                    args: response.args,
                    result: {
                        status: 'created',
                        cardId: `card-${iteration - 2}`,
                        card: {
                            id: `card-${iteration - 2}`,
                            ...response.args.card,
                        },
                    },
                },
            ];
        }

        expect(createCalls).toHaveLength(3);
        expect(createCalls.every((call) => call.type === 'tool_call')).toBe(true);
        expect(createCalls.every((call) => call.toolName === 'create_vibecard')).toBe(true);
        expect(createCalls.map((call) => call.args.card.paragraphId)).toEqual([
            'page-1-para-1',
            'page-2-para-1',
            'page-3-para-1',
        ]);
        expect(new Set(createCalls.map((call) => call.args.card.sourceText)).size).toBe(3);
        expect(createCalls[0].args.card).toEqual(expect.objectContaining({
            documentId: 'doc-1',
            type: 'concept',
            title: expect.stringContaining('VibeCard 1'),
            sourceText: 'The problem card explains the central research question and motivation.',
            page: 1,
            paragraphId: 'page-1-para-1',
            verificationStatus: 'grounded',
        }));

        const final = await model({ iteration: 6, trace: currentTrace });

        expect(final.type).toBe('final');
        expect(final.content).toContain('# Created VibeCards');
        expect(final.content).toContain('Created 3 source-grounded VibeCards.');
        expect(final.sourceRefs).toEqual([
            {
                documentId: 'doc-1',
                page: 1,
                paragraphId: 'page-1-para-1',
                text: 'The problem card explains the central research question and motivation.',
            },
            {
                documentId: 'doc-1',
                page: 2,
                paragraphId: 'page-2-para-1',
                text: 'The method card describes the identification strategy and model design.',
            },
            {
                documentId: 'doc-1',
                page: 3,
                paragraphId: 'page-3-para-1',
                text: 'The evidence card reports the main empirical result and robustness check.',
            },
        ]);
    });

    it('refuses partial VibeCard creation when fewer than three source chunks are available', async () => {
        const model = createLocalCardGenerationModel();
        const result = await model({
            iteration: 3,
            trace: [
                {
                    type: 'tool',
                    toolName: 'get_current_document',
                    result: {
                        id: 'doc-short',
                        documentId: 'doc-short',
                        name: 'short.md',
                        kind: 'markdown',
                    },
                },
                {
                    type: 'tool',
                    toolName: 'get_document_chunks',
                    result: {
                        chunks: [
                            {
                                id: 'chunk-1',
                                documentId: 'doc-short',
                                page: 1,
                                paragraphId: 'page-1-para-1',
                                text: 'The problem is stated, but there is not enough material.',
                            },
                            {
                                id: 'chunk-2',
                                documentId: 'doc-short',
                                page: 1,
                                paragraphId: 'page-1-para-2',
                                text: 'The method is mentioned briefly.',
                            },
                        ],
                    },
                },
            ],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('# Create VibeCard needs more sources');
        expect(result.content).toContain('Need at least 3 source chunks');
        expect(result.content).not.toContain('Created 1');
        expect(result.content).not.toContain('Created 2');
        expect(result.sourceRefs).toEqual([
            {
                documentId: 'doc-short',
                page: 1,
                paragraphId: 'page-1-para-1',
                text: 'The problem is stated, but there is not enough material.',
            },
            {
                documentId: 'doc-short',
                page: 1,
                paragraphId: 'page-1-para-2',
                text: 'The method is mentioned briefly.',
            },
        ]);
    });

    it('answers knowledge QA from knowledge_search matches with sourceRefs', async () => {
        const model = createLocalKnowledgeQaModel();
        const goal = 'Question: What is the main contribution?';

        await expect(model({ iteration: 1, goal, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_current_document',
            args: {},
        });
        await expect(model({ iteration: 2, goal, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'knowledge_search',
            args: {
                query: 'What is the main contribution?',
                limit: 5,
            },
        });

        const result = await model({
            iteration: 3,
            goal,
            trace: [
                {
                    type: 'tool',
                    toolName: 'get_current_document',
                    result: {
                        id: 'doc-1',
                        documentId: 'doc-1',
                        name: 'paper.pdf',
                        kind: 'pdf',
                    },
                },
                {
                    type: 'tool',
                    toolName: 'knowledge_search',
                    result: {
                        query: 'What is the main contribution?',
                        engine: 'local-keyword',
                        matches: [
                            {
                                id: 'm-1',
                                documentId: 'doc-1',
                                page: 3,
                                paragraphId: 'page-3-para-1',
                                text: 'The main contribution is a staggered DiD estimator.',
                            },
                        ],
                    },
                },
            ],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('# Knowledge answer');
        expect(result.content).toContain('Document: paper.pdf');
        expect(result.content).toContain('Engine: local-keyword');
        expect(result.content).toContain('p.3: The main contribution is a staggered DiD estimator.');
        expect(result.sourceRefs).toEqual([
            {
                documentId: 'doc-1',
                page: 3,
                paragraphId: 'page-3-para-1',
                text: 'The main contribution is a staggered DiD estimator.',
            },
        ]);
    });

    it('falls back to search_document when knowledge_search returns no matches', async () => {
        const model = createLocalKnowledgeQaModel();
        const goal = 'Query: identification strategy';
        const afterEmptyKnowledge = [
            {
                type: 'tool',
                toolName: 'get_current_document',
                result: { id: 'doc-1', name: 'paper.pdf' },
            },
            {
                type: 'tool',
                toolName: 'knowledge_search',
                result: { query: 'identification strategy', matches: [], engine: 'local-keyword' },
            },
        ];

        await expect(model({
            iteration: 3,
            goal,
            trace: afterEmptyKnowledge,
        })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'search_document',
            args: {
                query: 'identification strategy',
                limit: 5,
                maxChars: 400,
            },
        });

        const result = await model({
            iteration: 4,
            goal,
            trace: [
                ...afterEmptyKnowledge,
                {
                    type: 'tool',
                    toolName: 'search_document',
                    result: {
                        documentId: 'doc-1',
                        query: 'identification strategy',
                        matches: [
                            {
                                documentId: 'doc-1',
                                page: 4,
                                paragraphId: 'page-4-para-2',
                                text: 'Identification relies on parallel trends.',
                            },
                        ],
                    },
                },
            ],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('Identification relies on parallel trends.');
        expect(result.sourceRefs).toEqual([
            {
                documentId: 'doc-1',
                page: 4,
                paragraphId: 'page-4-para-2',
                text: 'Identification relies on parallel trends.',
            },
        ]);
    });

    it('verifies a claim via get_document_chunks then verify_citation', async () => {
        const model = createLocalCriticModel();
        const goal = 'Claim: methods improve evidence quality';

        await expect(model({ iteration: 1, goal, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_document_chunks',
            args: {
                query: 'methods improve evidence quality',
                limit: 4,
                maxChars: 700,
            },
        });

        const chunkTrace = [
            {
                type: 'tool',
                toolName: 'get_document_chunks',
                result: {
                    chunks: [
                        {
                            id: 'chunk-1',
                            documentId: 'doc-1',
                            page: 2,
                            paragraphId: 'page-2-para-1',
                            text: 'These methods improve evidence quality in trials.',
                        },
                    ],
                },
            },
        ];

        const verifyCall = await model({ iteration: 2, goal, trace: chunkTrace });
        expect(verifyCall).toEqual({
            type: 'tool_call',
            toolName: 'verify_citation',
            args: {
                claim: 'methods improve evidence quality',
                evidenceText: 'These methods improve evidence quality in trials.',
                sourceRef: {
                    documentId: 'doc-1',
                    page: 2,
                    paragraphId: 'page-2-para-1',
                    text: 'These methods improve evidence quality in trials.',
                },
            },
        });

        const result = await model({
            iteration: 3,
            goal,
            trace: [
                ...chunkTrace,
                {
                    type: 'tool',
                    toolName: 'verify_citation',
                    result: {
                        claim: 'methods improve evidence quality',
                        score: 0.75,
                        grounded: true,
                        method: 'token-overlap',
                    },
                },
            ],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('# Claim critique');
        expect(result.content).toContain('Claim: methods improve evidence quality');
        expect(result.content).toContain('Verdict: supported');
        expect(result.content).toContain('Grounded: yes');
        expect(result.sourceRefs).toEqual([
            {
                documentId: 'doc-1',
                page: 2,
                paragraphId: 'page-2-para-1',
                text: 'These methods improve evidence quality in trials.',
            },
        ]);
    });

    it('uses a sample chunk as claim when goal has no explicit claim', async () => {
        const model = createLocalCriticModel();
        const goal = 'Re-check the claims in the prior overview against document sources.';
        const chunkTrace = [
            {
                type: 'tool',
                toolName: 'get_document_chunks',
                result: {
                    chunks: [
                        {
                            documentId: 'doc-2',
                            page: 1,
                            paragraphId: 'p1',
                            text: 'Difference-in-differences identifies the average treatment effect.',
                        },
                    ],
                },
            },
        ];

        const verifyCall = await model({ iteration: 2, goal, trace: chunkTrace });
        expect(verifyCall.toolName).toBe('verify_citation');
        expect(verifyCall.args.claim).toContain('Difference-in-differences');
        expect(verifyCall.args.evidenceText).toContain('Difference-in-differences');
    });

    it('searches memory and proposes save candidates without writing', async () => {
        const model = createLocalMemoryCuratorModel();
        const goal = 'Query: prior method notes';

        await expect(model({ iteration: 1, goal, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'memory_search',
            args: {
                query: 'prior method notes',
                limit: 8,
            },
        });

        const result = await model({
            iteration: 2,
            goal,
            trace: [
                {
                    type: 'tool',
                    toolName: 'memory_search',
                    result: {
                        query: 'prior method notes',
                        status: 'ok',
                        memories: [
                            {
                                id: 'mem-1',
                                title: 'Saved method note',
                                text: 'User saved a claim about staggered adoption.',
                                documentId: 'doc-1',
                                artifactId: 'card-9',
                            },
                        ],
                    },
                },
            ],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('# Memory curation');
        expect(result.content).toContain('Search status: ok');
        expect(result.content).toContain('[mem-1] Saved method note');
        expect(result.content).toContain('Propose to save');
        expect(result.content).toContain('artifact=card-9');
        expect(result.content).toContain('never calls memory_save');
        expect(result.content).not.toMatch(/memory_save\s*\(/);
        expect(result.sourceRefs).toEqual([
            {
                documentId: 'doc-1',
                page: null,
                paragraphId: 'card-9',
                text: 'User saved a claim about staggered adoption.',
            },
        ]);
    });

    it('reports empty memory search honestly', async () => {
        const model = createLocalMemoryCuratorModel();
        const result = await model({
            iteration: 2,
            goal: 'find related memories',
            trace: [
                {
                    type: 'tool',
                    toolName: 'memory_search',
                    result: {
                        query: 'find related memories',
                        status: 'unavailable',
                        memories: [],
                    },
                },
            ],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('Search status: unavailable');
        expect(result.content).toContain('No saved memories matched');
        expect(result.content).toContain('No concrete artifact ids returned');
        expect(result.sourceRefs).toEqual([]);
    });

    it('exports a note via export_note after document and insights', async () => {
        const model = createLocalNoteExportModel();
        const goal = 'Export reading note as markdown';

        await expect(model({ iteration: 1, goal, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_current_document',
            args: {},
        });
        await expect(model({ iteration: 2, goal, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'list_attention_insights',
            args: {},
        });

        const collectedTrace = [
            {
                type: 'tool',
                toolName: 'get_current_document',
                result: {
                    id: 'doc-1',
                    documentId: 'doc-1',
                    name: 'paper.pdf',
                    kind: 'pdf',
                    pageCount: 10,
                },
            },
            {
                type: 'tool',
                toolName: 'list_attention_insights',
                result: {
                    insights: [
                        {
                            id: 'insight-1',
                            documentId: 'doc-1',
                            type: 'Claim',
                            description: 'Main identification claim on page 3.',
                            location: {
                                page: 3,
                                paragraphId: 'page-3-para-1',
                            },
                        },
                    ],
                },
            },
        ];

        await expect(model({
            iteration: 3,
            goal,
            trace: collectedTrace,
            tools: { export_note: { name: 'export_note' } },
        })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'export_note',
            args: {
                documentId: 'doc-1',
                template: 'default',
                format: 'markdown',
            },
        });

        const result = await model({
            iteration: 4,
            goal,
            trace: [
                ...collectedTrace,
                {
                    type: 'tool',
                    toolName: 'export_note',
                    result: {
                        documentId: 'doc-1',
                        status: 'exported',
                        export: {
                            path: '/tmp/paper-reading-note.md',
                            format: 'markdown',
                        },
                    },
                },
            ],
            tools: { export_note: { name: 'export_note' } },
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('# Note export');
        expect(result.content).toContain('Document: paper.pdf');
        expect(result.content).toContain('Export status: exported');
        expect(result.content).toContain('Path: /tmp/paper-reading-note.md');
        expect(result.content).toContain('Main identification claim on page 3.');
        expect(result.sourceRefs).toEqual([
            {
                documentId: 'doc-1',
                page: 3,
                paragraphId: 'page-3-para-1',
                text: 'Main identification claim on page 3.',
            },
        ]);
    });

    it('assembles markdown when export_note is not allowed in tools', async () => {
        const model = createLocalNoteExportModel();
        const result = await model({
            iteration: 3,
            goal: 'Export reading note',
            tools: {
                get_current_document: { name: 'get_current_document' },
                list_attention_insights: { name: 'list_attention_insights' },
                // export_note intentionally omitted (permission filtered)
            },
            trace: [
                {
                    type: 'tool',
                    toolName: 'get_current_document',
                    result: {
                        id: 'doc-2',
                        name: 'notes.md',
                        kind: 'markdown',
                    },
                },
                {
                    type: 'tool',
                    toolName: 'list_attention_insights',
                    result: {
                        insights: [
                            {
                                id: 'insight-9',
                                documentId: 'doc-2',
                                type: 'Method',
                                description: 'Saved method insight.',
                                location: { page: 1, paragraphId: 'p1' },
                            },
                        ],
                    },
                },
            ],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('# Note export (assembled)');
        expect(result.content).toContain('Document: notes.md');
        expect(result.content).toContain('Saved method insight.');
        expect(result.content).toContain('export_note was not called');
        expect(result.content).not.toMatch(/type:\s*['"]tool_call['"]/);
        expect(result.sourceRefs).toEqual([
            {
                documentId: 'doc-2',
                page: 1,
                paragraphId: 'p1',
                text: 'Saved method insight.',
            },
        ]);
    });

    it('does not call export_note when canExportNotes is false even if tool is registered', async () => {
        const model = createLocalNoteExportModel();
        const result = await model({
            iteration: 3,
            goal: 'Export reading note',
            tools: {
                export_note: { name: 'export_note' },
            },
            permissions: {
                canExportNotes: false,
            },
            trace: [
                {
                    type: 'tool',
                    toolName: 'get_current_document',
                    result: { id: 'doc-3', name: 'gated.md' },
                },
                {
                    type: 'tool',
                    toolName: 'list_attention_insights',
                    result: { insights: [] },
                },
            ],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('# Note export (assembled)');
        expect(result.content).toContain('export_note was not called');
    });
});
