import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThinkingTreePanel } from './ThinkingTreePanel';
import { usePdfStore, useVibeStore } from './store';

const persistentMock = vi.hoisted(() => ({
  loadPersistentThinkingTree: vi.fn(async () => null),
  savePersistentThinkingTree: vi.fn(async (documentId, tree) => ({ documentId, treeJson: JSON.stringify(tree) })),
}));

vi.mock('./services/persistentStorage', () => persistentMock);

const sampleText = `--- 第 1 页 ---

This paper motivates paragraph trees. It shows why headings alone are insufficient.

A second paragraph defines the reader workflow. It keeps source grounding visible.

--- 第 2 页 ---

The method groups PDF text into paragraphs. It creates deterministic summaries without AI keys.`;

const sampleVibeData = {
  title: 'Sample Paper',
  sections: [
    { id: 'sec-intro', title: 'Introduction', pageStart: 1, pageEnd: 1 },
    { id: 'sec-method', title: 'Methods', pageStart: 2, pageEnd: 2 },
  ],
};

describe('ThinkingTreePanel', () => {
  beforeEach(() => {
    persistentMock.loadPersistentThinkingTree.mockResolvedValue(null);
    persistentMock.savePersistentThinkingTree.mockClear();
    act(() => {
      usePdfStore.getState().clearPdf();
      usePdfStore.getState().setPdfData(sampleText, 2);
      useVibeStore.getState().clearVibeData();
      useVibeStore.getState().setVibeData(sampleVibeData);
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows a generate button before the thinking tree exists', () => {
    render(<ThinkingTreePanel />);

    expect(screen.getByRole('button', { name: /生成思维树/ })).toBeTruthy();
  });

  it('generates a root-section-paragraph-point tree from PDF text without AI keys', async () => {
    render(<ThinkingTreePanel />);

    fireEvent.click(screen.getByRole('button', { name: /生成思维树/ }));

    await waitFor(() => {
      expect(screen.getByText('Sample Paper')).toBeTruthy();
    });
    expect(screen.getByText('Introduction')).toBeTruthy();
    expect(screen.getByText('Methods')).toBeTruthy();
    expect(screen.getByText('This paper motivates paragraph trees.')).toBeTruthy();
    expect(screen.getByText(/It shows why/)).toBeTruthy();
  });

  it('calls onNavigateToParagraph when a paragraph summary node is clicked', async () => {
    const onNavigateToParagraph = vi.fn();
    render(<ThinkingTreePanel onNavigateToParagraph={onNavigateToParagraph} />);

    fireEvent.click(screen.getByRole('button', { name: /生成思维树/ }));

    const paragraphNode = await screen.findByText('This paper motivates paragraph trees.');
    fireEvent.click(paragraphNode);

    expect(onNavigateToParagraph).toHaveBeenCalledWith('page-1-para-0');
  });

  it('expands and collapses section nodes', async () => {
    render(<ThinkingTreePanel />);

    fireEvent.click(screen.getByRole('button', { name: /生成思维树/ }));

    await screen.findByText('This paper motivates paragraph trees.');
    fireEvent.click(screen.getByRole('button', { name: '折叠 Introduction' }));

    expect(screen.queryByText('This paper motivates paragraph trees.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '展开 Introduction' }));

    expect(screen.getByText('This paper motivates paragraph trees.')).toBeTruthy();
  });

  it('saves a generated thinking tree for the active document', async () => {
    render(<ThinkingTreePanel documentId="doc-1" />);

    fireEvent.click(screen.getByRole('button', { name: /生成思维树/ }));

    await waitFor(() => {
      expect(persistentMock.savePersistentThinkingTree).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({ id: 'root' })
      );
    });
  });

  it('restores a persisted thinking tree for the active document', async () => {
    persistentMock.loadPersistentThinkingTree.mockResolvedValue({
      documentId: 'doc-1',
      treeJson: JSON.stringify({
        id: 'root',
        type: 'root',
        label: 'Persisted Paper',
        children: [
          {
            id: 'section-persisted',
            type: 'section',
            label: 'Persisted Section',
            children: [],
          },
        ],
      }),
    });

    render(<ThinkingTreePanel documentId="doc-1" />);

    expect(await screen.findByText('Persisted Paper')).toBeTruthy();
    expect(screen.getByText('Persisted Section')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /生成思维树/ })).toBeNull();
  });
});
