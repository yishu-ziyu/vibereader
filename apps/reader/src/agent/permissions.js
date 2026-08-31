export const READING_TOOL_NAMES = Object.freeze([
    'get_current_document',
    'get_document_chunks',
    'get_page_text',
    'search_document',
    'list_attention_insights',
    'knowledge_search',
    'memory_search',
    'verify_citation',
    'list_tools',
    'extractText',
    'navigatePage',
    'listAnnotations',
]);

export const DEFAULT_READING_PERMISSIONS = Object.freeze({
    allowedTools: READING_TOOL_NAMES,
    canReadDocument: true,
    canSearchDocument: true,
    canListAttentionInsights: true,
    canSearchKnowledge: true,
    canSearchMemory: true,
    canVerifyCitation: true,
    canListTools: true,
    canNavigate: true,
    canListAnnotations: true,
    canWriteAnnotations: false,
    canWriteVibeCards: false,
    canWriteMemory: false,
    canExportNotes: false,
    canUseWeb: false,
});

const TOOL_PERMISSION_FLAGS = Object.freeze({
    get_current_document: 'canReadDocument',
    get_document_chunks: 'canReadDocument',
    get_page_text: 'canReadDocument',
    search_document: 'canSearchDocument',
    list_attention_insights: 'canListAttentionInsights',
    knowledge_search: 'canSearchKnowledge',
    memory_search: 'canSearchMemory',
    memory_save: 'canWriteMemory',
    verify_citation: 'canVerifyCitation',
    list_tools: 'canListTools',
    create_vibecard: 'canWriteVibeCards',
    create_annotation: 'canWriteAnnotations',
    export_note: 'canExportNotes',
    extractText: 'canReadDocument',
    navigatePage: 'canNavigate',
    listAnnotations: 'canListAnnotations',
});

function allowedToolSet(permissions = DEFAULT_READING_PERMISSIONS) {
    return new Set(permissions.allowedTools || DEFAULT_READING_PERMISSIONS.allowedTools);
}

function hasRequiredFlag(toolName, permissions = DEFAULT_READING_PERMISSIONS) {
    const flagName = TOOL_PERMISSION_FLAGS[toolName];
    if (!flagName) return true;
    if (permissions[flagName] === undefined) return DEFAULT_READING_PERMISSIONS[flagName];
    return Boolean(permissions[flagName]);
}

export function isToolAllowed(toolName, permissions = DEFAULT_READING_PERMISSIONS) {
    if (!toolName) return false;
    return allowedToolSet(permissions).has(toolName) && hasRequiredFlag(toolName, permissions);
}

export function assertToolAllowed(toolName, permissions = DEFAULT_READING_PERMISSIONS) {
    if (!isToolAllowed(toolName, permissions)) {
        throw new Error(`Tool "${toolName}" is not allowed by the reading agent permissions`);
    }
    return true;
}

export function filterAllowedTools(registry = {}, permissions = DEFAULT_READING_PERMISSIONS) {
    return Object.freeze(
        Object.fromEntries(
            Object.entries(registry).filter(([toolName]) => isToolAllowed(toolName, permissions))
        )
    );
}
