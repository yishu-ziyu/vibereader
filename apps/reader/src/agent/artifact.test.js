import { describe, expect, it } from 'vitest';
import {
    createLensCardArtifact,
    createReadingArtifact,
} from './artifact';

describe('reading artifacts', () => {
    it('creates a source-grounded Lens Card artifact from a selected span', () => {
        const artifact = createLensCardArtifact({
            id: 'artifact-1',
            documentId: 'doc-1',
            goal: 'Explain this passage.',
            modelId: 'MiniMax-M3',
            createdAt: '2026-06-02T10:00:00.000Z',
            selection: {
                spanId: 'span-12',
                text: 'The paper claims local reading should preserve source spans.',
            },
            explanation: 'The passage argues that traceability is part of the product value.',
            claims: [
                {
                    text: 'The selected passage is about traceable local reading.',
                    sourceSpanIds: ['span-12'],
                },
            ],
        });

        expect(artifact).toEqual({
            id: 'artifact-1',
            documentId: 'doc-1',
            type: 'lens_card',
            goal: 'Explain this passage.',
            sourceSpanIds: ['span-12'],
            modelId: 'MiniMax-M3',
            createdAt: '2026-06-02T10:00:00.000Z',
            originalContent: {
                selectionText: 'The paper claims local reading should preserve source spans.',
                explanation: 'The passage argues that traceability is part of the product value.',
                claims: [
                    {
                        text: 'The selected passage is about traceable local reading.',
                        sourceSpanIds: ['span-12'],
                        inference: false,
                    },
                ],
            },
            currentContent: {
                selectionText: 'The paper claims local reading should preserve source spans.',
                explanation: 'The passage argues that traceability is part of the product value.',
                claims: [
                    {
                        text: 'The selected passage is about traceable local reading.',
                        sourceSpanIds: ['span-12'],
                        inference: false,
                    },
                ],
            },
            verificationStatus: 'grounded',
        });
        expect(Object.isFrozen(artifact)).toBe(true);
        expect(Object.isFrozen(artifact.originalContent)).toBe(true);
    });

    it('does not mark PDF selections as grounded unless they can navigate back to page rects', () => {
        const artifact = createLensCardArtifact({
            id: 'artifact-span-only',
            documentId: 'doc-1',
            selection: {
                spanId: 'span-12',
                text: 'A PDF selection without page coordinates.',
            },
            source: {
                documentId: 'doc-1',
                sourceType: 'pdf-selection',
                spanId: 'span-12',
            },
            explanation: 'This card lacks return coordinates.',
            claims: [
                {
                    text: 'This card lacks return coordinates.',
                    sourceSpanIds: ['span-12'],
                },
            ],
        });

        expect(artifact.verificationStatus).toBe('ungrounded');
        expect(artifact.source).toEqual({
            documentId: 'doc-1',
            sourceType: 'pdf-selection',
            spanId: 'span-12',
        });
    });

    it('allows generated claims only when each claim has a source span or inference label', () => {
        const artifact = createReadingArtifact({
            id: 'artifact-2',
            documentId: 'doc-1',
            type: 'evidence_table',
            goal: 'Separate evidence from interpretation.',
            modelId: 'MiniMax-M3',
            createdAt: '2026-06-02T10:05:00.000Z',
            originalContent: {
                claims: [
                    { text: 'The method section reports a local index.', sourceSpanIds: ['span-7'] },
                    { text: 'The architecture may scale to multi-document search.', inference: true },
                ],
            },
        });

        expect(artifact.sourceSpanIds).toEqual(['span-7']);
        expect(artifact.originalContent.claims).toEqual([
            {
                text: 'The method section reports a local index.',
                sourceSpanIds: ['span-7'],
                inference: false,
            },
            {
                text: 'The architecture may scale to multi-document search.',
                sourceSpanIds: [],
                inference: true,
            },
        ]);
        expect(artifact.verificationStatus).toBe('contains_inference');
    });

    it('rejects generated claims that lack both source spans and inference labels', () => {
        expect(() => createReadingArtifact({
            id: 'artifact-3',
            documentId: 'doc-1',
            type: 'claim_map',
            goal: 'Map claims.',
            originalContent: {
                claims: [
                    { text: 'This unsupported sentence looks like a fact.' },
                ],
            },
        })).toThrow('Claim 1 requires sourceSpanIds or inference=true');
    });
});
