import { beforeEach, describe, expect, it } from 'vitest';
import { useDocumentStore } from './documentStore';

describe('documentStore', () => {
  beforeEach(() => {
    useDocumentStore.getState().clearDocuments();
  });

  it('loads recent document records without making them the active readable document', () => {
    useDocumentStore.getState().setDocuments([
      {
        id: 'doc-recent',
        name: 'Recent.pdf',
        kind: 'pdf',
        openedAt: 200,
        isRecentOnly: true,
      },
    ]);

    const state = useDocumentStore.getState();
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0]).toEqual(expect.objectContaining({
      id: 'doc-recent',
      name: 'Recent.pdf',
      isRecentOnly: true,
    }));
    expect(state.activeDocumentId).toBeNull();
    expect(state.currentDocument).toBeNull();
  });

  it('keeps an already active document when refreshing recent records', () => {
    useDocumentStore.getState().addDocument({
      id: 'doc-active',
      name: 'Active.md',
      kind: 'markdown',
      contentText: 'Readable',
    });

    useDocumentStore.getState().setDocuments([
      {
        id: 'doc-active',
        name: 'Active.md',
        kind: 'markdown',
        isRecentOnly: true,
      },
      {
        id: 'doc-other',
        name: 'Other.pdf',
        kind: 'pdf',
        isRecentOnly: true,
      },
    ]);

    const state = useDocumentStore.getState();
    expect(state.activeDocumentId).toBe('doc-active');
    expect(state.currentDocument).toEqual(expect.objectContaining({
      id: 'doc-active',
      contentText: 'Readable',
    }));
    expect(state.documents.map((document) => document.id)).toEqual(['doc-active', 'doc-other']);
  });
});
