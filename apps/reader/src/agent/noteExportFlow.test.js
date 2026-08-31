import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_READING_PERMISSIONS } from './permissions';
import { createLocalNoteExportModel } from './readingTaskModels';
import { runReadingAgent } from './runtime';
import { createReadingTools } from './tools';

function noteExportPermissions() {
    return {
        ...DEFAULT_READING_PERMISSIONS,
        allowedTools: [
            ...new Set([
                ...DEFAULT_READING_PERMISSIONS.allowedTools,
                'export_note',
            ]),
        ],
        canExportNotes: true,
    };
}

describe('Note export reading-agent flow', () => {
    it('runs the local agent loop and calls export_note via adapter', async () => {
        const exportNote = vi.fn(async ({ documentId, template, format }) => ({
            documentId,
            template,
            format,
            filename: `reading-note-${documentId}.md`,
            path: `reading-note-${documentId}.md`,
            status: 'exported',
            hasMarkdown: true,
            hasJson: true,
        }));

        const document = {
            id: 'doc-export-flow',
            name: 'export-flow.md',
            kind: 'markdown',
            contentText: 'A short paper body with claims for export.',
        };

        const listAttentionInsightsForDocument = vi.fn(async () => ([
            {
                id: 'insight-1',
                documentId: 'doc-export-flow',
                type: 'Claim',
                description: 'Main claim from page 1.',
                location: { page: 1, paragraphId: 'page-1-para-0' },
            },
        ]));

        const result = await runReadingAgent({
            goal: 'Export reading note as markdown',
            model: createLocalNoteExportModel(),
            tools: createReadingTools(
                { document },
                { exportNote, listAttentionInsightsForDocument },
            ),
            permissions: noteExportPermissions(),
            maxIterations: 4,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('completed');
        expect(result.content).toContain('# Note export');
        expect(result.content).toContain('Export completed via export_note');
        expect(result.content).toContain('Path: reading-note-doc-export-flow.md');
        expect(exportNote).toHaveBeenCalledTimes(1);
        expect(exportNote).toHaveBeenCalledWith({
            documentId: 'doc-export-flow',
            template: 'default',
            format: 'markdown',
        });
    });

    it('does not call export_note when canExportNotes is false', async () => {
        const exportNote = vi.fn(async () => ({ status: 'exported' }));
        const document = {
            id: 'doc-export-denied',
            name: 'denied.md',
            kind: 'markdown',
            contentText: 'Body.',
        };

        const tools = createReadingTools({ document }, { exportNote });
        // Simulate permission filter stripping export_note.
        const { export_note: _removed, ...readOnlyTools } = tools;

        const result = await runReadingAgent({
            goal: 'Export reading note as markdown',
            model: createLocalNoteExportModel(),
            tools: readOnlyTools,
            permissions: {
                ...DEFAULT_READING_PERMISSIONS,
                canExportNotes: false,
            },
            maxIterations: 4,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('completed');
        expect(result.content).toContain('export_note was not called');
        expect(exportNote).not.toHaveBeenCalled();
    });
});
