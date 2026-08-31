import { describe, expect, it } from 'vitest';
import {
    DEFAULT_READING_PERMISSIONS,
    READING_TOOL_NAMES,
    assertToolAllowed,
    filterAllowedTools,
    isToolAllowed,
} from './permissions';
import { TOOL_PARAMETER_SCHEMAS } from './toolSchemas';
import { createReadingTools } from './tools';

describe('agent permissions', () => {
    it('allows only reading tools by default', () => {
        expect(isToolAllowed('extractText')).toBe(true);
        expect(isToolAllowed('navigatePage')).toBe(true);
        expect(isToolAllowed('listAnnotations')).toBe(true);
        expect(isToolAllowed('get_current_document')).toBe(true);
        expect(isToolAllowed('get_page_text')).toBe(true);
        expect(isToolAllowed('search_document')).toBe(true);
        expect(isToolAllowed('get_document_chunks')).toBe(true);
        expect(isToolAllowed('list_attention_insights')).toBe(true);
        expect(isToolAllowed('knowledge_search')).toBe(true);
        expect(isToolAllowed('memory_search')).toBe(true);
        expect(isToolAllowed('verify_citation')).toBe(true);
        expect(isToolAllowed('list_tools')).toBe(true);

        expect(isToolAllowed('createAnnotation')).toBe(false);
        expect(isToolAllowed('create_vibecard')).toBe(false);
        expect(isToolAllowed('create_annotation')).toBe(false);
        expect(isToolAllowed('export_note')).toBe(false);
        expect(isToolAllowed('memory_save')).toBe(false);
        expect(isToolAllowed('searchWeb')).toBe(false);
        expect(isToolAllowed('shell')).toBe(false);
        expect(DEFAULT_READING_PERMISSIONS.canWriteMemory).toBe(false);
    });

    it('filters a tool registry without mutating the original registry', () => {
        const registry = {
            extractText: { name: 'extractText' },
            list_attention_insights: { name: 'list_attention_insights' },
            create_vibecard: { name: 'create_vibecard' },
            createAnnotation: { name: 'createAnnotation' },
            create_annotation: { name: 'create_annotation' },
            export_note: { name: 'export_note' },
        };

        const filtered = filterAllowedTools(registry, DEFAULT_READING_PERMISSIONS);

        expect(filtered).toEqual({
            extractText: { name: 'extractText' },
            list_attention_insights: { name: 'list_attention_insights' },
        });
        expect(registry).toHaveProperty('createAnnotation');
        expect(registry).toHaveProperty('create_vibecard');
        expect(registry).toHaveProperty('export_note');
        expect(filtered).not.toBe(registry);
    });

    it('throws a clear permission error for disallowed tools', () => {
        expect(() => assertToolAllowed('createAnnotation')).toThrow(
            'Tool "createAnnotation" is not allowed'
        );
    });

    it('honors tool-specific permission flags in addition to the allowed tool list', () => {
        expect(isToolAllowed('extractText', {
            ...DEFAULT_READING_PERMISSIONS,
            canReadDocument: false,
        })).toBe(false);

        expect(isToolAllowed('navigatePage', {
            ...DEFAULT_READING_PERMISSIONS,
            canNavigate: false,
        })).toBe(false);

        expect(isToolAllowed('listAnnotations', {
            ...DEFAULT_READING_PERMISSIONS,
            canListAnnotations: false,
        })).toBe(false);

        expect(isToolAllowed('search_document', {
            ...DEFAULT_READING_PERMISSIONS,
            canSearchDocument: false,
        })).toBe(false);

        expect(isToolAllowed('knowledge_search', {
            ...DEFAULT_READING_PERMISSIONS,
            canSearchKnowledge: false,
        })).toBe(false);

        expect(isToolAllowed('memory_search', {
            ...DEFAULT_READING_PERMISSIONS,
            canSearchMemory: false,
        })).toBe(false);

        expect(isToolAllowed('verify_citation', {
            ...DEFAULT_READING_PERMISSIONS,
            canVerifyCitation: false,
        })).toBe(false);

        expect(isToolAllowed('list_tools', {
            ...DEFAULT_READING_PERMISSIONS,
            canListTools: false,
        })).toBe(false);
    });

    it('requires explicit allowed tool names and write flags for mutation tools', () => {
        expect(isToolAllowed('create_vibecard', {
            ...DEFAULT_READING_PERMISSIONS,
            allowedTools: ['create_vibecard'],
        })).toBe(false);

        expect(isToolAllowed('create_vibecard', {
            ...DEFAULT_READING_PERMISSIONS,
            allowedTools: ['create_vibecard'],
            canWriteVibeCards: true,
        })).toBe(true);

        expect(isToolAllowed('export_note', {
            ...DEFAULT_READING_PERMISSIONS,
            allowedTools: ['export_note'],
            canExportNotes: true,
        })).toBe(true);

        expect(isToolAllowed('memory_save', {
            ...DEFAULT_READING_PERMISSIONS,
            allowedTools: ['memory_save'],
        })).toBe(false);

        expect(isToolAllowed('memory_save', {
            ...DEFAULT_READING_PERMISSIONS,
            allowedTools: ['memory_save'],
            canWriteMemory: true,
        })).toBe(true);
    });

    it('filterAllowedTools under default perms keeps only reading tools and drops writes', () => {
        const registry = createReadingTools({ document: { id: 'doc-1' } });
        const filtered = filterAllowedTools(registry, DEFAULT_READING_PERMISSIONS);
        const filteredNames = Object.keys(filtered).sort();
        const expected = [...READING_TOOL_NAMES].sort();

        expect(filteredNames).toEqual(expected);
        expect(filtered).not.toHaveProperty('create_vibecard');
        expect(filtered).not.toHaveProperty('create_annotation');
        expect(filtered).not.toHaveProperty('export_note');
        expect(filtered).not.toHaveProperty('memory_save');
        for (const name of READING_TOOL_NAMES) {
            expect(filtered[name]).toBe(registry[name]);
        }
    });

    it('keeps createReadingTools keys, schemas, and default allowed list consistent', () => {
        const registry = createReadingTools({ document: { id: 'doc-1' } });
        const registryNames = Object.keys(registry).sort();
        const schemaNames = Object.keys(TOOL_PARAMETER_SCHEMAS).sort();

        // Every registered tool has an OpenAI parameter schema.
        for (const name of registryNames) {
            expect(TOOL_PARAMETER_SCHEMAS[name]).toBeTruthy();
        }
        // Schemas do not introduce unknown tools outside the registry.
        expect(schemaNames).toEqual(registryNames);

        // Default allowed list is a subset of the registry / schemas.
        for (const name of READING_TOOL_NAMES) {
            expect(registry[name]).toBeTruthy();
            expect(TOOL_PARAMETER_SCHEMAS[name]).toBeTruthy();
            expect(isToolAllowed(name, DEFAULT_READING_PERMISSIONS)).toBe(true);
        }

        // Write tools exist in registry+schema but are denied by default.
        for (const writeName of ['create_vibecard', 'create_annotation', 'export_note', 'memory_save']) {
            expect(registry[writeName]).toBeTruthy();
            expect(TOOL_PARAMETER_SCHEMAS[writeName]).toBeTruthy();
            expect(isToolAllowed(writeName, DEFAULT_READING_PERMISSIONS)).toBe(false);
            expect(READING_TOOL_NAMES).not.toContain(writeName);
        }

        const filtered = filterAllowedTools(registry, DEFAULT_READING_PERMISSIONS);
        expect(Object.keys(filtered).sort()).toEqual([...READING_TOOL_NAMES].sort());
    });
});
