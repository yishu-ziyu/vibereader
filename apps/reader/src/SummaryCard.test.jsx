import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SummaryCard } from './SummaryCard';

const persistentMock = vi.hoisted(() => ({
  loadPersistentSummary: vi.fn(async () => null),
  savePersistentSummary: vi.fn(async (summary) => summary),
  savePersistentTask: vi.fn(async (task) => task),
}));

const artifactMock = vi.hoisted(() => ({
  createArtifact: vi.fn(async (artifact) => ({ id: 'artifact-concept-card', ...artifact })),
}));

const chatStreamMock = vi.hoisted(() => vi.fn(async (_prompt, onChunk) => {
  onChunk({
    done: false,
    content: 'done',
    fullMessage: '摘要：Generated section summary\n要点：\n- Point one\n- Point two',
  });
}));

vi.mock('./services/persistentStorage', () => persistentMock);
vi.mock('./services/artifactService', () => artifactMock);

vi.mock('./aiService', () => ({
  default: {
    chatStream: chatStreamMock,
  },
}));

const section = {
  id: 'section-0',
  title: 'Introduction',
  content: 'This is a section with enough text to summarize.',
};

describe('SummaryCard', () => {
  beforeEach(() => {
    persistentMock.loadPersistentSummary.mockClear();
    persistentMock.loadPersistentSummary.mockResolvedValue(null);
    persistentMock.savePersistentSummary.mockClear();
    persistentMock.savePersistentTask.mockClear();
    persistentMock.savePersistentTask.mockResolvedValue({});
    artifactMock.createArtifact.mockClear();
    chatStreamMock.mockClear();
    chatStreamMock.mockImplementation(async (_prompt, onChunk) => {
      onChunk({
        done: false,
        content: 'done',
        fullMessage: '摘要：Generated section summary\n要点：\n- Point one\n- Point two',
      });
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('saves generated section summaries for the active document', async () => {
    render(<SummaryCard documentId="doc-1" section={section} defaultExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /Generate Summary|生成/ }));

    await screen.findByText('Generated section summary');
    expect(screen.getByText('Point one')).toBeTruthy();
    expect(persistentMock.savePersistentSummary).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      summaryKind: 'section',
      sectionId: 'section-0',
      sectionTitle: 'Introduction',
      summary: 'Generated section summary',
      keyPoints: ['Point one', 'Point two'],
    }));
  });

  it('restores a persisted summary for the active document and section', async () => {
    persistentMock.loadPersistentSummary.mockResolvedValue({
      documentId: 'doc-1',
      summaryKind: 'section',
      sectionId: 'section-0',
      sectionTitle: 'Introduction',
      summary: 'Persisted section summary',
      keyPoints: ['Saved point'],
    });

    render(<SummaryCard documentId="doc-1" section={section} defaultExpanded />);

    expect(await screen.findByText('Persisted section summary')).toBeTruthy();
    expect(screen.getByText('Saved point')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Generate Summary|生成/ })).toBeNull();
  });

  it('does not load or save summaries when no document is bound', async () => {
    render(<SummaryCard section={section} defaultExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /Generate Summary|生成/ }));

    await waitFor(() => {
      expect(screen.getByText('Generated section summary')).toBeTruthy();
    });
    expect(persistentMock.loadPersistentSummary).not.toHaveBeenCalled();
    expect(persistentMock.savePersistentSummary).not.toHaveBeenCalled();
  });

  it('saves a generated summary as a grounded Concept Card', async () => {
    const onArtifactCreated = vi.fn();
    render(
      <SummaryCard
        documentId="doc-1"
        section={section}
        onArtifactCreated={onArtifactCreated}
        defaultExpanded
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Generate Summary|生成/ }));
    await screen.findByText('Generated section summary');

    fireEvent.click(screen.getByRole('button', { name: /保存概念卡片|Save Concept Card/i }));

    await waitFor(() => {
      expect(artifactMock.createArtifact).toHaveBeenCalledWith(expect.objectContaining({
        documentId: 'doc-1',
        type: 'concept_card',
        goal: 'Concept Card：Introduction',
        verificationStatus: 'grounded',
        source: expect.objectContaining({
          documentId: 'doc-1',
          sourceType: 'summary-section',
          sectionId: 'section-0',
          sectionTitle: 'Introduction',
          text: section.content,
        }),
        currentContent: expect.objectContaining({
          sectionId: 'section-0',
          sectionTitle: 'Introduction',
          summary: 'Generated section summary',
          keyPoints: ['Point one', 'Point two'],
        }),
      }));
    });
    expect(onArtifactCreated).toHaveBeenCalledWith(expect.objectContaining({
      id: 'artifact-concept-card',
      type: 'concept_card',
    }));
  });

  it('records section summary task state when generation succeeds', async () => {
    render(<SummaryCard documentId="doc-1" section={section} defaultExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /Generate Summary|生成/ }));

    await screen.findByText('Generated section summary');
    expect(persistentMock.savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      type: 'section_summary',
      status: 'running',
      progress: 10,
    }));
    expect(persistentMock.savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      type: 'section_summary',
      status: 'succeeded',
      progress: 100,
      result: expect.objectContaining({
        sectionId: 'section-0',
        keyPointCount: 2,
      }),
    }));
  });

  it('records section summary task failure before showing the error state', async () => {
    chatStreamMock.mockRejectedValueOnce(new Error('provider unavailable'));
    render(<SummaryCard documentId="doc-1" section={section} defaultExpanded />);

    fireEvent.click(screen.getByRole('button', { name: /Generate Summary|生成/ }));

    await screen.findByText('Failed to generate summary');
    expect(persistentMock.savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      type: 'section_summary',
      status: 'failed',
      progress: 100,
      errorMessage: 'provider unavailable',
    }));
  });
});
