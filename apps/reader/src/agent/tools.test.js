import { describe, expect, it, vi } from 'vitest';
import {
    createReadingTools,
    createAnnotation,
    createVibeCard,
    exportNote,
    extractText,
    getCurrentDocument,
    getDocumentChunks,
    getPageText,
    knowledgeSearch,
    listAttentionInsights,
    listAnnotations,
    listToolsFromRegistry,
    memorySave,
    memorySearch,
    navigatePage,
    searchDocument,
    verifyCitation,
} from './tools';

describe('reading tools', () => {
    it('extracts bounded text from a document page without changing the document', async () => {
        const document = Object.freeze({
            id: 'doc-1',
            name: 'paper.pdf',
            pages: [
                { page: 1, text: 'First page text.' },
                { page: 2, text: 'Second page has the method section.' },
            ],
        });

        const result = await extractText({ document, page: 2, maxChars: 12 });

        expect(result).toEqual({
            documentId: 'doc-1',
            page: 2,
            text: 'Second page ',
            truncated: true,
            source: 'page',
        });
        expect(document.pages[1].text).toBe('Second page has the method section.');
    });

    it('navigates to a positive page through the provided adapter', async () => {
        const navigateToPage = vi.fn().mockResolvedValue({ currentPage: 3 });

        const result = await navigatePage({ page: 3 }, { navigateToPage });

        expect(navigateToPage).toHaveBeenCalledWith(3);
        expect(result).toEqual({
            page: 3,
            currentPage: 3,
            status: 'navigated',
        });
    });

    it('lists annotations through the provided adapter for the current document', async () => {
        const listAnnotationsForDocument = vi.fn().mockResolvedValue([
            { id: 'annotation-1', documentId: 'doc-1', selectedText: 'Claim' },
        ]);

        const result = await listAnnotations({
            document: { id: 'doc-1' },
        }, {
            listAnnotationsForDocument,
        });

        expect(listAnnotationsForDocument).toHaveBeenCalledWith('doc-1');
        expect(result.annotations).toEqual([
            { id: 'annotation-1', documentId: 'doc-1', selectedText: 'Claim' },
        ]);
    });

    it('returns current document metadata without full document content', async () => {
        const result = await getCurrentDocument({
            document: {
                id: 'doc-1',
                name: 'paper.pdf',
                kind: 'pdf',
                source: 'local-file',
                openedAt: '2026-06-11T10:00:00.000Z',
                parseStatus: 'ready',
                contentText: 'Full paper text should not be exposed here.',
                pages: [
                    { page: 1, text: 'First page text.' },
                    { page: 2, text: 'Second page text.' },
                ],
            },
        });

        expect(result).toEqual({
            documentId: 'doc-1',
            name: 'paper.pdf',
            kind: 'pdf',
            pageCount: 2,
            source: 'local-file',
            openedAt: '2026-06-11T10:00:00.000Z',
            parseStatus: 'ready',
        });
        expect(result).not.toHaveProperty('contentText');
        expect(result).not.toHaveProperty('pages');
    });

    it('gets page text through the PRD tool name', async () => {
        const result = await getPageText({
            document: {
                id: 'doc-1',
                pages: [{ page: 1, text: 'The introduction defines the research problem.' }],
            },
            page: 1,
            maxChars: 20,
        });

        expect(result).toEqual({
            documentId: 'doc-1',
            page: 1,
            text: 'The introduction def',
            truncated: true,
            source: 'page',
        });
    });

    it('searches the current document with bounded source-locatable matches', async () => {
        const result = await searchDocument({
            document: {
                id: 'doc-1',
                pages: [
                    { page: 1, text: 'The introduction frames the claim.' },
                    { page: 2, text: 'The method section explains the claim and evidence.' },
                ],
            },
            query: 'claim evidence',
            maxChars: 18,
        });

        expect(result.documentId).toBe('doc-1');
        expect(result.query).toBe('claim evidence');
        expect(result.matches).toEqual([
            {
                id: 'doc-1-page-2-match-1',
                documentId: 'doc-1',
                page: 2,
                paragraphId: 'page-2',
                text: 'The method section',
                score: 2,
                truncated: true,
            },
            {
                id: 'doc-1-page-1-match-2',
                documentId: 'doc-1',
                page: 1,
                paragraphId: 'page-1',
                text: 'The introduction f',
                score: 1,
                truncated: true,
            },
        ]);
    });

    it('returns document chunks from adapter or local document text', async () => {
        const result = await getDocumentChunks({
            document: {
                id: 'doc-1',
                contentText: 'Problem statement.\n\nMethod details.\n\nResult evidence.',
            },
            query: 'method',
            maxChars: 30,
        });

        expect(result).toEqual({
            documentId: 'doc-1',
            query: 'method',
            chunks: [
                {
                    id: 'doc-1-chunk-2',
                    documentId: 'doc-1',
                    page: null,
                    paragraphId: 'chunk-2',
                    text: 'Method details.',
                    score: 1,
                    truncated: false,
                },
            ],
        });
    });

    it('lists attention insights through the provided adapter for the current document', async () => {
        const listAttentionInsightsForDocument = vi.fn().mockResolvedValue([
            { id: 'insight-1', type: 'Claim', description: 'Core claim', location: { page: 2 } },
        ]);

        const result = await listAttentionInsights({
            document: { id: 'doc-1' },
        }, {
            listAttentionInsightsForDocument,
        });

        expect(listAttentionInsightsForDocument).toHaveBeenCalledWith('doc-1');
        expect(result).toEqual({
            documentId: 'doc-1',
            insights: [
                { id: 'insight-1', type: 'Claim', description: 'Core claim', location: { page: 2 } },
            ],
        });
    });

    it('delegates VibeCard creation to the provided adapter', async () => {
        const createVibeCardAdapter = vi.fn().mockResolvedValue({
            id: 'card-1',
            documentId: 'doc-1',
            type: 'concept',
            title: 'Core concept',
        });

        const result = await createVibeCard({
            document: { id: 'doc-1' },
            card: { type: 'concept', title: 'Core concept' },
        }, {
            createVibeCard: createVibeCardAdapter,
        });

        expect(createVibeCardAdapter).toHaveBeenCalledWith({
            documentId: 'doc-1',
            type: 'concept',
            title: 'Core concept',
        });
        expect(result).toEqual({
            documentId: 'doc-1',
            cardId: 'card-1',
            status: 'created',
            card: {
                id: 'card-1',
                documentId: 'doc-1',
                type: 'concept',
                title: 'Core concept',
            },
        });
    });

    it('requires adapters for write and export tools', async () => {
        await expect(createAnnotation({ document: { id: 'doc-1' } })).rejects.toThrow(
            'create_annotation requires a createAnnotation adapter'
        );
        await expect(exportNote({ document: { id: 'doc-1' } })).rejects.toThrow(
            'export_note requires an exportNote adapter'
        );
    });

    it('delegates note export to the provided adapter', async () => {
        const exportNoteAdapter = vi.fn().mockResolvedValue({
            documentId: 'doc-1',
            format: 'markdown',
            filename: 'reading-note-doc-1.md',
            path: 'reading-note-doc-1.md',
            status: 'exported',
        });

        const result = await exportNote({
            document: { id: 'doc-1' },
            template: 'default',
            format: 'markdown',
        }, {
            exportNote: exportNoteAdapter,
        });

        expect(exportNoteAdapter).toHaveBeenCalledWith({
            documentId: 'doc-1',
            template: 'default',
            format: 'markdown',
        });
        expect(result).toEqual({
            documentId: 'doc-1',
            status: 'exported',
            export: {
                documentId: 'doc-1',
                format: 'markdown',
                filename: 'reading-note-doc-1.md',
                path: 'reading-note-doc-1.md',
                status: 'exported',
            },
        });
    });

    it('creates a registry containing PRD tools and legacy reading aliases', () => {
        const tools = createReadingTools({
            document: { id: 'doc-1', contentText: 'Readable text.' },
        });

        expect(Object.keys(tools)).toEqual([
            'get_current_document',
            'get_document_chunks',
            'get_page_text',
            'search_document',
            'list_attention_insights',
            'knowledge_search',
            'memory_search',
            'memory_save',
            'verify_citation',
            'list_tools',
            'create_vibecard',
            'create_annotation',
            'export_note',
            'extractText',
            'navigatePage',
            'listAnnotations',
        ]);
        expect(tools.get_current_document.readOnly).toBe(true);
        expect(tools.get_document_chunks.readOnly).toBe(true);
        expect(tools.get_page_text.readOnly).toBe(true);
        expect(tools.search_document.readOnly).toBe(true);
        expect(tools.list_attention_insights.readOnly).toBe(true);
        expect(tools.knowledge_search.readOnly).toBe(true);
        expect(tools.knowledge_search.acceptsAbortSignal).toBe(true);
        expect(tools.get_document_chunks.acceptsAbortSignal).toBe(true);
        expect(tools.search_document.acceptsAbortSignal).toBe(true);
        expect(tools.memory_search.readOnly).toBe(true);
        expect(tools.memory_save.readOnly).toBe(false);
        expect(tools.verify_citation.readOnly).toBe(true);
        expect(tools.list_tools.readOnly).toBe(true);
        expect(tools.create_vibecard.readOnly).toBe(false);
        expect(tools.create_annotation.readOnly).toBe(false);
        expect(tools.export_note.readOnly).toBe(false);
        expect(tools.extractText.readOnly).toBe(true);
        expect(tools.navigatePage.readOnly).toBe(true);
        expect(tools.listAnnotations.readOnly).toBe(true);
    });


    it('marks knowledge_search, memory_search and document tools as accepting abort signals', () => {
        const tools = createReadingTools({ document: { id: 'doc-1' } });
        expect(tools.knowledge_search.acceptsAbortSignal).toBe(true);
        expect(tools.memory_search.acceptsAbortSignal).toBe(true);
        expect(tools.get_document_chunks.acceptsAbortSignal).toBe(true);
        expect(tools.search_document.acceptsAbortSignal).toBe(true);
    });

    it('throws AbortError from search_document when signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(searchDocument({
            document: {
                id: 'doc-1',
                pages: [{ page: 1, text: 'claim and evidence about method.' }],
            },
            query: 'claim evidence',
        }, {}, { signal: controller.signal })).rejects.toMatchObject({
            name: 'AbortError',
        });
    });

    it('throws AbortError from get_document_chunks when signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(getDocumentChunks({
            document: {
                id: 'doc-1',
                contentText: 'Paragraph one.\n\nParagraph two about claims.',
            },
            query: 'claims',
        }, {}, { signal: controller.signal })).rejects.toMatchObject({
            name: 'AbortError',
        });
    });

    it('passes abort signal into knowledgeSearch adapter when function length allows', async () => {
        const controller = new AbortController();
        let seenOptions = null;
        async function knowledgeSearchAdapter(payload, options) {
            seenOptions = options;
            return {
                engine: 'uni-rag',
                matches: [{
                    documentId: 'doc-1',
                    page: 1,
                    paragraphId: 'p1',
                    text: 'hit',
                    score: 1,
                }],
            };
        }

        const result = await knowledgeSearch({
            query: 'hit',
            documentId: 'doc-1',
        }, {
            knowledgeSearch: knowledgeSearchAdapter,
        }, {
            signal: controller.signal,
        });

        expect(seenOptions).toEqual(expect.objectContaining({
            signal: controller.signal,
            abortSignal: controller.signal,
        }));
        expect(result.engine).toBe('uni-rag');
        expect(result.matches).toHaveLength(1);
    });

    it('does not pass options into length-1 knowledgeSearch adapters', async () => {
        const controller = new AbortController();
        const knowledgeSearchAdapter = vi.fn(async (payload) => ({
            engine: 'uni-rag',
            matches: [],
        }));
        // ensure length stays 1
        expect(knowledgeSearchAdapter.length).toBe(1);

        await knowledgeSearch({
            query: 'q',
        }, {
            knowledgeSearch: knowledgeSearchAdapter,
        }, {
            signal: controller.signal,
        });

        expect(knowledgeSearchAdapter).toHaveBeenCalledTimes(1);
        expect(knowledgeSearchAdapter.mock.calls[0]).toHaveLength(1);
    });

    it('rethrows AbortError from knowledgeSearch without degrading to local-keyword', async () => {
        const controller = new AbortController();
        async function knowledgeSearchAdapter(_payload, _options) {
            const error = new Error('The operation was aborted.');
            error.name = 'AbortError';
            throw error;
        }

        await expect(knowledgeSearch({
            query: 'q',
            document: { id: 'doc-1', pages: [{ page: 1, text: 'local fallback text' }] },
        }, {
            knowledgeSearch: knowledgeSearchAdapter,
        }, {
            signal: controller.signal,
        })).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('propagates signal from registry knowledge_search.run second options arg', async () => {
        const controller = new AbortController();
        controller.abort();
        const tools = createReadingTools({
            document: {
                id: 'doc-1',
                pages: [{ page: 1, text: 'claim evidence method' }],
            },
        }, {
            searchMemory: async () => ({ memories: [] }),
        });

        await expect(tools.search_document.run(
            { query: 'claim' },
            { signal: controller.signal },
        )).rejects.toMatchObject({ name: 'AbortError' });

        await expect(tools.get_document_chunks.run(
            { query: 'claim' },
            { signal: controller.signal },
        )).rejects.toMatchObject({ name: 'AbortError' });

        await expect(tools.knowledge_search.run(
            { query: 'claim' },
            { signal: controller.signal },
        )).rejects.toMatchObject({ name: 'AbortError' });

        await expect(tools.memory_search.run(
            { query: 'claim' },
            { signal: controller.signal },
        )).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('throws AbortError from memory_search when signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(memorySearch({
            query: 'saved claim',
        }, {
            searchMemory: async () => ({ memories: [{ id: 'm1', text: 'hit' }] }),
        }, {
            signal: controller.signal,
        })).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('passes abort signal into searchMemory adapter when function length allows', async () => {
        const controller = new AbortController();
        let seenOptions = null;
        async function searchMemoryAdapter(payload, options) {
            seenOptions = options;
            return {
                status: 'ok',
                memories: [{ id: 'm1', text: 'hit', title: 't' }],
            };
        }

        const result = await memorySearch({
            query: 'hit',
        }, {
            searchMemory: searchMemoryAdapter,
        }, {
            signal: controller.signal,
        });

        expect(seenOptions).toEqual(expect.objectContaining({
            signal: controller.signal,
            abortSignal: controller.signal,
        }));
        expect(result.status).toBe('ok');
        expect(result.memories).toHaveLength(1);
    });

    it('rethrows AbortError from searchMemory without marking unavailable', async () => {
        async function searchMemoryAdapter(_payload, _options) {
            const error = new Error('The operation was aborted.');
            error.name = 'AbortError';
            throw error;
        }

        await expect(memorySearch({
            query: 'q',
        }, {
            searchMemory: searchMemoryAdapter,
        }, {
            signal: new AbortController().signal,
        })).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('searches knowledge through a dedicated adapter when provided', async () => {
        const knowledgeSearchAdapter = vi.fn().mockResolvedValue({
            engine: 'uni-rag',
            matches: [
                {
                    id: 'm-1',
                    documentId: 'doc-1',
                    page: 2,
                    paragraphId: 'page-2',
                    text: 'UniRAG evidence about claims.',
                    score: 0.9,
                },
            ],
        });

        const result = await knowledgeSearch({
            query: 'claims',
            documentId: 'doc-1',
            limit: 3,
        }, {
            knowledgeSearch: knowledgeSearchAdapter,
        });

        expect(knowledgeSearchAdapter).toHaveBeenCalledWith({
            query: 'claims',
            limit: 3,
            documentId: 'doc-1',
            document: {},
        });
        expect(result).toEqual({
            query: 'claims',
            engine: 'uni-rag',
            matches: [
                {
                    id: 'm-1',
                    documentId: 'doc-1',
                    page: 2,
                    paragraphId: 'page-2',
                    text: 'UniRAG evidence about claims.',
                    score: 0.9,
                    truncated: false,
                },
            ],
        });
    });

    it('falls back to ragAdapter.buildRetrievalContext then local keyword search', async () => {
        const buildRetrievalContext = vi.fn().mockResolvedValue({
            chunks: [
                {
                    id: 'chunk-1',
                    documentId: 'doc-1',
                    page: 1,
                    paragraphId: 'page-1-para-0',
                    text: 'Local rag chunk about method.',
                },
            ],
            ragEngine: { engine: 'local-keyword' },
        });

        const viaRag = await knowledgeSearch({
            query: 'method',
            document: { id: 'doc-1', contentText: 'unused when adapter present' },
            limit: 2,
        }, {
            ragAdapter: {
                engine: 'local-keyword',
                buildRetrievalContext,
            },
        });

        expect(buildRetrievalContext).toHaveBeenCalled();
        expect(viaRag.engine).toBe('local-keyword');
        expect(viaRag.matches).toHaveLength(1);
        expect(viaRag.matches[0].text).toBe('Local rag chunk about method.');

        const local = await knowledgeSearch({
            document: {
                id: 'doc-1',
                pages: [
                    { page: 1, text: 'Introduction without hit.' },
                    { page: 2, text: 'The method section explains evidence.' },
                ],
            },
            query: 'method evidence',
            limit: 1,
        });

        expect(local.engine).toBe('local-keyword');
        expect(local.matches).toHaveLength(1);
        expect(local.matches[0].page).toBe(2);
        expect(local.matches[0].score).toBe(2);
    });

    it('degrades to local-keyword with ok:false when UniRAG health fails (no throw)', async () => {
        const query = vi.fn().mockRejectedValue(new Error('should not query'));
        const document = {
            id: 'doc-1',
            pages: [
                { page: 1, text: 'Background only.' },
                { page: 2, text: 'The method section explains evidence.' },
            ],
        };

        const result = await knowledgeSearch({
            query: 'method evidence',
            document,
            documentId: 'doc-1',
            limit: 2,
        }, {
            ragAdapter: {
                engine: 'uni-rag',
                health: vi.fn().mockResolvedValue({
                    available: false,
                    engine: 'uni-rag',
                    degraded: true,
                    error: 'UniRAG health failed: HTTP 503',
                }),
                query,
            },
        });

        expect(query).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            ok: false,
            tool: 'knowledge_search',
            query: 'method evidence',
            engine: 'local-keyword',
            degraded: true,
            errorCode: 'unirag_unavailable',
        });
        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].page).toBe(2);
        expect(result.matches[0].text).toContain('method section');
    });

    it('degrades to local-keyword when knowledgeSearch adapter signals unavailable', async () => {
        const knowledgeSearchAdapter = vi.fn().mockResolvedValue({
            ok: false,
            engine: 'unavailable',
            errorCode: 'unirag_unavailable',
            message: 'UniRAG health failed.',
            matches: [],
        });

        const result = await knowledgeSearch({
            query: 'claims',
            documentId: 'doc-1',
            document: {
                id: 'doc-1',
                contentText: 'A paragraph about claims and evidence.',
            },
            limit: 3,
        }, {
            knowledgeSearch: knowledgeSearchAdapter,
        });

        expect(knowledgeSearchAdapter).toHaveBeenCalled();
        expect(result.ok).toBe(false);
        expect(result.engine).toBe('local-keyword');
        expect(result.degraded).toBe(true);
        expect(result.errorCode).toBe('unirag_unavailable');
        expect(result.matches.length).toBeGreaterThan(0);
        expect(result.matches[0].text).toContain('claims');
    });

    it('degrades to local-keyword when knowledgeSearch adapter throws', async () => {
        const knowledgeSearchAdapter = vi.fn().mockRejectedValue(
            new Error('UniRAG query timed out after 1000ms'),
        );

        const result = await knowledgeSearch({
            query: 'evidence',
            document: {
                id: 'doc-1',
                pages: [{ page: 1, text: 'Strong evidence on page one.' }],
            },
        }, {
            knowledgeSearch: knowledgeSearchAdapter,
        });

        expect(result.ok).toBe(false);
        expect(result.engine).toBe('local-keyword');
        expect(result.errorCode).toBe('timeout');
        expect(result.matches[0].text).toContain('evidence');
    });

    it('degrades to local-keyword when ragAdapter.query throws', async () => {
        const result = await knowledgeSearch({
            query: 'method',
            document: {
                id: 'doc-1',
                pages: [{ page: 3, text: 'Detailed method writeup.' }],
            },
        }, {
            ragAdapter: {
                engine: 'uni-rag',
                health: vi.fn().mockResolvedValue({ available: true, engine: 'uni-rag' }),
                query: vi.fn().mockRejectedValue(new Error('UniRAG query failed: HTTP 500')),
            },
        });

        expect(result.ok).toBe(false);
        expect(result.engine).toBe('local-keyword');
        expect(result.degraded).toBe(true);
        expect(result.errorCode).toBe('query_failed');
        expect(result.matches[0].page).toBe(3);
    });

    it('returns empty memories with unavailable status when searchMemory is missing', async () => {
        const result = await memorySearch({ query: 'prior claim' });

        expect(result).toEqual({
            query: 'prior claim',
            memories: [],
            status: 'unavailable',
            ok: false,
        });
    });

    it('soft-fails when searchMemory adapter throws (no throw up)', async () => {
        const searchMemory = vi.fn().mockRejectedValue(
            new Error('UniRAG memory query timed out after 800ms'),
        );

        const result = await memorySearch({
            query: 'prior claim',
            limit: 3,
        }, {
            searchMemory,
        });

        expect(searchMemory).toHaveBeenCalledWith({
            query: 'prior claim',
            limit: 3,
        });
        expect(result).toEqual({
            query: 'prior claim',
            memories: [],
            status: 'unavailable',
            ok: false,
            errorCode: 'timeout',
            message: 'UniRAG memory query timed out after 800ms',
            error: 'UniRAG memory query timed out after 800ms',
        });
    });

    it('soft-fails when searchMemory adapter signals unavailable', async () => {
        const searchMemory = vi.fn().mockResolvedValue({
            ok: false,
            status: 'unavailable',
            memories: [],
            errorCode: 'query_failed',
            message: 'network down',
        });

        const result = await memorySearch({ query: 'prior claim' }, { searchMemory });

        expect(result).toMatchObject({
            query: 'prior claim',
            memories: [],
            status: 'unavailable',
            ok: false,
            errorCode: 'query_failed',
            message: 'network down',
            error: 'network down',
        });
    });

    it('searches memory through the provided adapter', async () => {
        const searchMemory = vi.fn().mockResolvedValue({
            memories: [
                {
                    id: 'mem-1',
                    title: 'Saved claim',
                    text: 'User saved a claim about methods.',
                    score: 0.8,
                    documentId: 'doc-1',
                },
            ],
        });

        const result = await memorySearch({
            query: 'methods',
            limit: 5,
        }, {
            searchMemory,
        });

        expect(searchMemory).toHaveBeenCalledWith({
            query: 'methods',
            limit: 5,
        });
        expect(result).toEqual({
            query: 'methods',
            status: 'ok',
            memories: [
                {
                    id: 'mem-1',
                    title: 'Saved claim',
                    text: 'User saved a claim about methods.',
                    score: 0.8,
                    documentId: 'doc-1',
                    artifactId: null,
                    type: null,
                },
            ],
        });
    });

    it('verifies citations with token overlap without an LLM', async () => {
        const grounded = await verifyCitation({
            claim: 'methods improve evidence quality',
            evidenceText: 'These methods improve evidence quality in trials.',
        });

        expect(grounded.method).toBe('token-overlap');
        expect(grounded.grounded).toBe(true);
        expect(grounded.score).toBeGreaterThanOrEqual(0.2);

        const viaSourceRef = await verifyCitation({
            claim: 'alpha beta gamma',
            sourceRef: { text: 'alpha beta gamma delta' },
        });
        expect(viaSourceRef.grounded).toBe(true);

        const weak = await verifyCitation({
            claim: 'quantum entanglement superposition',
            evidenceText: 'cooking pasta with salt water',
        });
        expect(weak.grounded).toBe(false);
        expect(weak.score).toBe(0);
    });

    it('lists tools from the registry including list_tools itself', async () => {
        const tools = createReadingTools({
            document: { id: 'doc-1' },
        });

        const listed = await tools.list_tools.run();
        expect(listed.tools.some((tool) => tool.name === 'list_tools')).toBe(true);
        expect(listed.tools.some((tool) => tool.name === 'knowledge_search' && tool.readOnly)).toBe(true);
        expect(listed.tools.find((tool) => tool.name === 'create_vibecard')?.readOnly).toBe(false);
        expect(listed.tools.find((tool) => tool.name === 'memory_save')?.readOnly).toBe(false);

        const fromHelper = listToolsFromRegistry(tools);
        expect(fromHelper.tools.map((tool) => tool.name)).toEqual(Object.keys(tools));
    });

    it('rejects memory_save without userConfirmed true', async () => {
        const startSavedMemoryIngest = vi.fn();

        const missing = await memorySave({
            artifactId: 'art-1',
        }, { startSavedMemoryIngest });

        expect(missing).toMatchObject({
            ok: false,
            tool: 'memory_save',
            errorCode: 'confirmation_required',
            artifactId: 'art-1',
            degraded: true,
        });
        expect(startSavedMemoryIngest).not.toHaveBeenCalled();

        const falseFlag = await memorySave({
            artifactId: 'art-1',
            userConfirmed: false,
        }, { startSavedMemoryIngest });

        expect(falseFlag.errorCode).toBe('confirmation_required');
        expect(startSavedMemoryIngest).not.toHaveBeenCalled();
    });

    it('rejects memory_save when artifact is missing or unsupported', async () => {
        const notFound = await memorySave({
            artifactId: 'missing-art',
            userConfirmed: true,
        }, {
            getArtifactById: vi.fn().mockResolvedValue(null),
            startSavedMemoryIngest: vi.fn(),
        });

        expect(notFound).toMatchObject({
            ok: false,
            errorCode: 'artifact_not_found',
            artifactId: 'missing-art',
        });

        const unsupported = await memorySave({
            artifactId: 'art-chat',
            userConfirmed: true,
        }, {
            getArtifactById: vi.fn().mockResolvedValue({
                id: 'art-chat',
                documentId: 'doc-1',
                type: 'chat_message',
            }),
            canIngestSavedMemoryArtifact: () => false,
            startSavedMemoryIngest: vi.fn(),
        });

        expect(unsupported).toMatchObject({
            ok: false,
            errorCode: 'unsupported_artifact',
            artifactId: 'art-chat',
        });
    });

    it('saves memory through startSavedMemoryIngest only after userConfirmed', async () => {
        const artifact = {
            id: 'art-1',
            documentId: 'doc-1',
            type: 'explain_card',
            goal: 'Key claim',
            currentContent: { answer: 'Methods matter.' },
        };
        const document = { id: 'doc-1', name: 'paper.pdf' };
        const startSavedMemoryIngest = vi.fn().mockResolvedValue({
            status: 'completed',
            jobId: 'memory-job-1',
            statusUrl: '/api/memory/jobs/memory-job-1',
            result: { memory_id: 'mem-99' },
        });
        const getArtifactById = vi.fn().mockResolvedValue(artifact);
        const getDocumentById = vi.fn().mockResolvedValue(document);

        const result = await memorySave({
            artifactId: 'art-1',
            userConfirmed: true,
        }, {
            getArtifactById,
            getDocumentById,
            canIngestSavedMemoryArtifact: () => true,
            startSavedMemoryIngest,
        });

        expect(getArtifactById).toHaveBeenCalledWith('art-1');
        expect(startSavedMemoryIngest).toHaveBeenCalledWith(expect.objectContaining({
            artifact,
            document,
        }));
        expect(result).toMatchObject({
            ok: true,
            tool: 'memory_save',
            artifactId: 'art-1',
            documentId: 'doc-1',
            status: 'completed',
            jobId: 'memory-job-1',
            memoryId: 'mem-99',
            contractVersion: 'reader-unirag-memory-v1',
        });
    });

    it('queues memory_save without polling when waitForCompletion is false', async () => {
        const artifact = {
            id: 'art-2',
            documentId: 'doc-1',
            type: 'reading_note',
        };
        const buildSavedMemoryPayload = vi.fn().mockReturnValue({
            artifactId: 'art-2',
            contractVersion: 'reader-unirag-memory-v1',
            text: 'note body',
        });
        const ingestMemory = vi.fn().mockResolvedValue({
            jobId: 'memory-job-2',
            statusUrl: '/api/memory/jobs/memory-job-2',
            status: 'queued',
        });
        const startSavedMemoryIngest = vi.fn();

        const result = await memorySave({
            artifactId: 'art-2',
            userConfirmed: true,
            waitForCompletion: false,
            artifact,
            document: { id: 'doc-1' },
        }, {
            canIngestSavedMemoryArtifact: () => true,
            buildSavedMemoryPayload,
            startSavedMemoryIngest,
            ragAdapter: {
                engine: 'uni-rag',
                ingestMemory,
            },
        });

        expect(startSavedMemoryIngest).not.toHaveBeenCalled();
        expect(ingestMemory).toHaveBeenCalled();
        expect(result).toMatchObject({
            ok: true,
            status: 'queued',
            jobId: 'memory-job-2',
            artifactId: 'art-2',
        });
    });
});
