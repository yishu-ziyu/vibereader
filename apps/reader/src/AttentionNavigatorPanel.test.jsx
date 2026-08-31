import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttentionNavigatorPanel } from './AttentionNavigatorPanel';
import { usePdfStore } from './store';

const persistentMock = vi.hoisted(() => ({
  listPersistentAttentionInsights: vi.fn(async () => []),
  savePersistentAttentionInsights: vi.fn(async () => []),
  savePersistentTask: vi.fn(async (task) => task),
}));

const artifactMock = vi.hoisted(() => ({
  createArtifact: vi.fn(async (artifact) => artifact),
}));

const analyzeMock = vi.hoisted(() => vi.fn(async () => [
  {
    id: 'attention-1',
    type: 'method',
    typeLabel: '方法亮点',
    typeColor: '#1890ff',
    description: 'Method location',
    location: { page: 1, paragraph: 0 },
    paragraphId: 'page-1-para-0',
  },
]));

vi.mock('./services/persistentStorage', () => persistentMock);
vi.mock('./services/artifactService', () => artifactMock);

vi.mock('./attentionNavigator', () => ({
  INSIGHT_TYPES: {
    METHOD: { key: 'method', label: '方法亮点', color: '#1890ff' },
    INNOVATION: { key: 'innovation', label: '创新点', color: '#52c41a' },
  },
  analyzeKeyInsights: analyzeMock,
}));

const sampleText = `--- 第 1 页 ---

Our method combines paragraph extraction with ranking.`;

describe('AttentionNavigatorPanel', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    persistentMock.listPersistentAttentionInsights.mockResolvedValue([]);
    persistentMock.savePersistentAttentionInsights.mockClear();
    persistentMock.savePersistentTask.mockClear();
    persistentMock.savePersistentTask.mockResolvedValue({});
    artifactMock.createArtifact.mockClear();
    analyzeMock.mockClear();
    analyzeMock.mockResolvedValue([
      {
        id: 'attention-1',
        type: 'method',
        typeLabel: '方法亮点',
        typeColor: '#1890ff',
        description: 'Method location',
        location: { page: 1, paragraph: 0 },
        paragraphId: 'page-1-para-0',
      },
    ]);
    act(() => {
      usePdfStore.getState().clearPdf();
      usePdfStore.getState().setPdfData(sampleText, 1);
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('saves analyzed insights for the active document', async () => {
    const onInsightsChange = vi.fn();
    render(<AttentionNavigatorPanel documentId="doc-1" onInsightsChange={onInsightsChange} />);

    fireEvent.click(screen.getByRole('button', { name: /生成阅读路线/ }));

    await waitFor(() => {
      expect(persistentMock.savePersistentAttentionInsights).toHaveBeenCalledWith(
        'doc-1',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'attention-1',
            paragraphId: 'page-1-para-0',
          }),
        ])
      );
    });
    expect(await screen.findByText('Method location')).toBeTruthy();
    expect(onInsightsChange).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'attention-1' }),
    ]));
  });

  it('restores persisted insights for the active document', async () => {
    const onInsightsChange = vi.fn();
    persistentMock.listPersistentAttentionInsights.mockResolvedValue([
      {
        id: 'attention-saved',
        type: 'innovation',
        typeLabel: '创新点',
        typeColor: '#52c41a',
        description: 'Persisted location',
        location: { page: 2, paragraph: 1 },
        paragraphId: 'page-2-para-1',
      },
    ]);

    render(<AttentionNavigatorPanel documentId="doc-1" onInsightsChange={onInsightsChange} />);

    expect(await screen.findByText('Persisted location')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /生成阅读路线/ })).toBeNull();
    expect(onInsightsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'attention-saved',
        paragraphId: 'page-2-para-1',
      }),
    ]);
  });

  it('filters persisted insights by insight type', async () => {
    persistentMock.listPersistentAttentionInsights.mockResolvedValue([
      {
        id: 'attention-method',
        type: 'method',
        typeLabel: '方法亮点',
        typeColor: '#1890ff',
        description: 'Method location',
        location: { page: 1, paragraph: 0 },
        paragraphId: 'page-1-para-0',
        readStatus: 'unread',
      },
      {
        id: 'attention-innovation',
        type: 'innovation',
        typeLabel: '创新点',
        typeColor: '#52c41a',
        description: 'Innovation location',
        location: { page: 2, paragraph: 0 },
        paragraphId: 'page-2-para-0',
        readStatus: 'unread',
      },
    ]);

    render(<AttentionNavigatorPanel documentId="doc-1" />);

    expect(await screen.findByText('Method location')).toBeTruthy();
    expect(screen.getByText('Innovation location')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: '方法亮点' }));

    expect(screen.getByText('Method location')).toBeTruthy();
    expect(screen.queryByText('Innovation location')).toBeNull();
  });

  it('marks an insight as read and persists the updated list for the document', async () => {
    const onInsightsChange = vi.fn();
    persistentMock.listPersistentAttentionInsights.mockResolvedValue([
      {
        id: 'attention-method',
        type: 'method',
        typeLabel: '方法亮点',
        typeColor: '#1890ff',
        description: 'Method location',
        location: { page: 1, paragraph: 0 },
        paragraphId: 'page-1-para-0',
        readStatus: 'unread',
      },
    ]);

    render(<AttentionNavigatorPanel documentId="doc-1" onInsightsChange={onInsightsChange} />);

    fireEvent.click(await screen.findByRole('button', { name: /标记已读/ }));

    await waitFor(() => {
      expect(persistentMock.savePersistentAttentionInsights).toHaveBeenCalledWith(
        'doc-1',
        [
          expect.objectContaining({
            id: 'attention-method',
            readStatus: 'read',
          }),
        ]
      );
    });
    expect(screen.getByRole('button', { name: /标记未读/ })).toBeTruthy();
    expect(onInsightsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'attention-method',
        readStatus: 'read',
      }),
    ]);
  });

  it('saves an insight as a source-bound reading card', async () => {
    const onArtifactCreated = vi.fn();
    persistentMock.listPersistentAttentionInsights.mockResolvedValue([
      {
        id: 'attention-method',
        type: 'method',
        typeLabel: '方法亮点',
        typeColor: '#1890ff',
        description: 'Method location',
        location: { page: 1, paragraph: 0 },
        paragraphId: 'page-1-para-0',
        readStatus: 'unread',
      },
    ]);

    render(
      <AttentionNavigatorPanel
        documentId="doc-1"
        onArtifactCreated={onArtifactCreated}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: /保存卡片/ }));

    await waitFor(() => {
      expect(artifactMock.createArtifact).toHaveBeenCalledWith(expect.objectContaining({
        documentId: 'doc-1',
        type: 'evidence_card',
        goal: '方法亮点：Method location',
        source: expect.objectContaining({
          documentId: 'doc-1',
          sourceType: 'attention-insight',
          page: 1,
          paragraphId: 'page-1-para-0',
          text: 'Method location',
        }),
        originalContent: expect.objectContaining({
          insightId: 'attention-method',
          insightType: 'method',
          description: 'Method location',
        }),
        verificationStatus: 'grounded',
      }));
    });
    expect(onArtifactCreated).toHaveBeenCalledWith(expect.objectContaining({
      type: 'evidence_card',
      documentId: 'doc-1',
    }));
  });

  it('sends an insight to chat with source context', async () => {
    const onAskAI = vi.fn();
    persistentMock.listPersistentAttentionInsights.mockResolvedValue([
      {
        id: 'attention-method',
        type: 'method',
        typeLabel: '方法亮点',
        typeColor: '#1890ff',
        description: 'Method location',
        location: { page: 1, paragraph: 0 },
        paragraphId: 'page-1-para-0',
        readStatus: 'unread',
      },
    ]);

    render(
      <AttentionNavigatorPanel
        documentId="doc-1"
        onAskAI={onAskAI}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: /问 AI/ }));

    expect(onAskAI).toHaveBeenCalledWith([
      '请基于当前文档解释这个关键位置：',
      '类型：方法亮点',
      '位置：P1 · page-1-para-0',
      '内容：Method location',
    ].join('\n'));
  });

  it('records attention analysis task state when analysis succeeds', async () => {
    render(<AttentionNavigatorPanel documentId="doc-1" />);

    fireEvent.click(screen.getByRole('button', { name: /生成阅读路线/ }));

    await screen.findByText('Method location');
    expect(persistentMock.savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      type: 'attention_analysis',
      status: 'running',
      progress: 10,
    }));
    expect(persistentMock.savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      type: 'attention_analysis',
      status: 'succeeded',
      progress: 100,
      result: expect.objectContaining({
        insightCount: 1,
      }),
    }));
  });

  it('records attention analysis task failure before clearing loading state', async () => {
    analyzeMock.mockRejectedValueOnce(new Error('model timeout'));
    render(<AttentionNavigatorPanel documentId="doc-1" />);

    fireEvent.click(screen.getByRole('button', { name: /生成阅读路线/ }));

    await waitFor(() => {
      expect(persistentMock.savePersistentTask).toHaveBeenCalledWith(expect.objectContaining({
        documentId: 'doc-1',
        type: 'attention_analysis',
        status: 'failed',
        progress: 100,
        errorMessage: 'model timeout',
      }));
    });
    await waitFor(() => {
      expect(screen.queryByText('正在生成阅读路线...')).toBeNull();
    });
  });
});
