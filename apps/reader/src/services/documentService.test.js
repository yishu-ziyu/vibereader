import { describe, expect, it } from 'vitest';
import {
    fileToDocument,
    fileToDocumentWithContent,
    sanitizeHtmlToText,
} from './documentService';

describe('documentService text document support', () => {
    it('generates a stable document id when the same browser file is reopened', () => {
        const firstOpen = new File(['same content'], 'paper.pdf', {
            type: 'application/pdf',
            lastModified: 12345,
        });
        const secondOpen = new File(['same content'], 'paper.pdf', {
            type: 'application/pdf',
            lastModified: 12345,
        });

        const firstDocument = fileToDocument(firstOpen);
        const secondDocument = fileToDocument(secondOpen);

        expect(firstDocument.id).toBe(secondDocument.id);
        expect(firstDocument.fingerprint).toBe(secondDocument.fingerprint);
        expect(firstDocument.id).not.toContain(String(Date.now()));
    });

    it('reads Markdown files into document contentText', async () => {
        const file = new File(['# Research Note\n\nThis is readable.'], 'note.md', {
            type: 'text/markdown',
        });

        const document = await fileToDocumentWithContent(file);

        expect(document).toEqual(expect.objectContaining({
            name: 'note.md',
            kind: 'markdown',
            contentText: '# Research Note\n\nThis is readable.',
        }));
    });

    it('extracts safe readable text from HTML without script content', () => {
        const text = sanitizeHtmlToText(`
            <html>
                <head><style>body { color: red; }</style></head>
                <body>
                    <h1>Article Title</h1>
                    <script>window.__vibereader_hacked = true;</script>
                    <p onclick="window.__vibereader_hacked = true">First paragraph.</p>
                </body>
            </html>
        `);

        expect(text).toContain('Article Title');
        expect(text).toContain('First paragraph.');
        expect(text).not.toContain('window.__vibereader_hacked');
        expect(text).not.toContain('color: red');
    });
});
