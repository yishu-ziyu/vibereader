/**
 * OpenAI-compatible parameter schemas for reading-agent tools.
 * Used when converting the local tool registry into chat.completions tools.
 */

const EMPTY_OBJECT_SCHEMA = Object.freeze({
    type: 'object',
    properties: Object.freeze({}),
});

export const TOOL_PARAMETER_SCHEMAS = Object.freeze({
    get_current_document: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            documentId: Object.freeze({
                type: 'string',
                description: 'Optional document id; defaults to the current document.',
            }),
        }),
    }),
    get_document_chunks: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            query: Object.freeze({
                type: 'string',
                description: 'Optional focus query used to rank chunks.',
            }),
            limit: Object.freeze({
                type: 'integer',
                description: 'Maximum number of chunks to return.',
            }),
            maxChars: Object.freeze({
                type: 'integer',
                description: 'Maximum characters per chunk body.',
            }),
            documentId: Object.freeze({
                type: 'string',
                description: 'Optional document id; defaults to the current document.',
            }),
        }),
    }),
    get_page_text: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            page: Object.freeze({
                type: 'integer',
                description: '1-based page number to extract.',
            }),
            maxChars: Object.freeze({
                type: 'integer',
                description: 'Maximum characters to return.',
            }),
            documentId: Object.freeze({
                type: 'string',
                description: 'Optional document id; defaults to the current document.',
            }),
        }),
        required: Object.freeze(['page']),
    }),
    search_document: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            query: Object.freeze({
                type: 'string',
                description: 'Search query over the current document.',
            }),
            limit: Object.freeze({
                type: 'integer',
                description: 'Maximum number of matches to return.',
            }),
            maxChars: Object.freeze({
                type: 'integer',
                description: 'Maximum characters per match snippet.',
            }),
            documentId: Object.freeze({
                type: 'string',
                description: 'Optional document id; defaults to the current document.',
            }),
        }),
        required: Object.freeze(['query']),
    }),
    list_attention_insights: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            documentId: Object.freeze({
                type: 'string',
                description: 'Optional document id; defaults to the current document.',
            }),
        }),
    }),
    create_vibecard: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            documentId: Object.freeze({
                type: 'string',
                description: 'Document id the card should bind to.',
            }),
            card: Object.freeze({
                type: 'object',
                description: 'VibeCard payload (title, content, source refs, etc.).',
            }),
        }),
    }),
    create_annotation: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            documentId: Object.freeze({
                type: 'string',
                description: 'Document id the annotation should bind to.',
            }),
            annotation: Object.freeze({
                type: 'object',
                description: 'Annotation payload (page, span, note text, etc.).',
            }),
        }),
    }),
    export_note: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            documentId: Object.freeze({
                type: 'string',
                description: 'Document id of the note to export.',
            }),
            template: Object.freeze({
                type: 'string',
                description: 'Export template name.',
            }),
            format: Object.freeze({
                type: 'string',
                description: 'Export format such as markdown or json.',
            }),
        }),
    }),
    extractText: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            page: Object.freeze({
                type: 'integer',
                description: 'Optional 1-based page; omit for full document text.',
            }),
            maxChars: Object.freeze({
                type: 'integer',
                description: 'Maximum characters to return.',
            }),
            documentId: Object.freeze({
                type: 'string',
                description: 'Optional document id; defaults to the current document.',
            }),
        }),
    }),
    navigatePage: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            page: Object.freeze({
                type: 'integer',
                description: '1-based page number to navigate to.',
            }),
        }),
        required: Object.freeze(['page']),
    }),
    listAnnotations: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            documentId: Object.freeze({
                type: 'string',
                description: 'Optional document id; defaults to the current document.',
            }),
        }),
    }),
    knowledge_search: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            query: Object.freeze({
                type: 'string',
                description: 'Query over local document knowledge.',
            }),
            limit: Object.freeze({
                type: 'integer',
                description: 'Maximum number of hits.',
            }),
        }),
        required: Object.freeze(['query']),
    }),
    memory_search: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            query: Object.freeze({
                type: 'string',
                description: 'Query over saved reading memory.',
            }),
            limit: Object.freeze({
                type: 'integer',
                description: 'Maximum number of hits.',
            }),
        }),
        required: Object.freeze(['query']),
    }),
    memory_save: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            artifactId: Object.freeze({
                type: 'string',
                description: 'Local Reader artifact id already persisted by the user.',
            }),
            userConfirmed: Object.freeze({
                type: 'boolean',
                description: 'Must be true. Product UI sets this after explicit user confirm; model cannot self-confirm.',
            }),
            documentId: Object.freeze({
                type: 'string',
                description: 'Optional; defaults to artifact.documentId / base context.',
            }),
            waitForCompletion: Object.freeze({
                type: 'boolean',
                description: 'If true, poll job status; if false, return queued job only.',
            }),
        }),
        required: Object.freeze(['artifactId', 'userConfirmed']),
    }),
    verify_citation: Object.freeze({
        type: 'object',
        properties: Object.freeze({
            claim: Object.freeze({
                type: 'string',
                description: 'Claim text to verify against sources.',
            }),
            sourceRefs: Object.freeze({
                type: 'array',
                description: 'Candidate source references to check.',
                items: Object.freeze({ type: 'object' }),
            }),
        }),
        required: Object.freeze(['claim']),
    }),
    list_tools: Object.freeze({
        type: 'object',
        properties: Object.freeze({}),
    }),
});

function cloneSchema(schema) {
    if (!schema || typeof schema !== 'object') {
        return { ...EMPTY_OBJECT_SCHEMA, properties: {} };
    }
    return JSON.parse(JSON.stringify(schema));
}

/**
 * Convert a registry tool entry into an OpenAI chat.completions tool definition.
 * Prefers tool.parameters, then TOOL_PARAMETER_SCHEMAS[name], then empty object schema.
 */
export function toolToOpenAIFunction(tool = {}) {
    const name = tool.name || tool.toolName || '';
    if (!name) {
        throw new Error('toolToOpenAIFunction requires a tool name');
    }

    const description = tool.description || tool.summary || '';
    const parameters = tool.parameters
        ? cloneSchema(tool.parameters)
        : TOOL_PARAMETER_SCHEMAS[name]
            ? cloneSchema(TOOL_PARAMETER_SCHEMAS[name])
            : { type: 'object', properties: {} };

    return {
        type: 'function',
        function: {
            name,
            description,
            parameters,
        },
    };
}
