import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskStatusPanel } from './TaskStatusPanel';

const persistentMock = vi.hoisted(() => ({
  listPersistentTasks: vi.fn(async () => []),
  TASK_UPDATED_EVENT: 'vibereader:task-updated',
}));

vi.mock('./services/persistentStorage', () => persistentMock);

describe('TaskStatusPanel', () => {
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
    persistentMock.listPersistentTasks.mockReset();
    persistentMock.listPersistentTasks.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('lists current document tasks with status, progress, and failure reason', async () => {
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-memory',
        documentId: 'doc-1',
        type: 'saved_memory_ingest',
        status: 'running',
        title: '记忆沉淀',
        progress: 42,
        updatedAt: 3000,
      },
      {
        id: 'task-summary',
        documentId: 'doc-1',
        type: 'section_summary',
        status: 'succeeded',
        title: 'Summarize Introduction',
        progress: 100,
        updatedAt: 2000,
      },
      {
        id: 'task-attention',
        documentId: 'doc-1',
        type: 'attention_analysis',
        status: 'failed',
        title: 'Find key locations',
        progress: 100,
        errorMessage: 'model timeout',
        updatedAt: 1000,
      },
    ]);

    render(<TaskStatusPanel documentId="doc-1" />);

    expect((await screen.findAllByText('记忆沉淀')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Summarize Introduction')).toBeTruthy();
    expect(screen.getByText('Find key locations')).toBeTruthy();
    expect(screen.getByText('运行中')).toBeTruthy();
    expect(screen.getByText('已完成')).toBeTruthy();
    expect(screen.getByText('失败')).toBeTruthy();
    expect(screen.getAllByRole('progressbar').map((item) => item.getAttribute('aria-valuenow'))).toEqual([
      '42',
      '100',
      '100',
    ]);
    expect(screen.getByText('model timeout')).toBeTruthy();
    expect(persistentMock.listPersistentTasks).toHaveBeenCalledWith('doc-1');
  });

  it('shows status bar and recent agent trace steps for a succeeded agent task', async () => {
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-agent-trace',
        documentId: 'doc-1',
        type: 'paper_overview_agent',
        status: 'running',
        title: 'Paper overview',
        progress: 45,
        result: {
          statusBar: 'iter 2/4 · last: get_document_chunks · goal: Explain the paper.',
          lastTool: 'get_document_chunks',
          iterations: 2,
          trace: [
            { kind: 'model', iteration: 1, summary: 'model #1: tool_call get_current_document' },
            { kind: 'tool', iteration: 1, toolName: 'get_current_document', summary: 'tool #1: get_current_document (ok)' },
            { kind: 'tool', iteration: 2, toolName: 'get_document_chunks', summary: 'tool #2: get_document_chunks (ok)' },
          ],
        },
        updatedAt: 6000,
      },
    ]);

    render(<TaskStatusPanel documentId="doc-1" />);

    const statusBar = await screen.findByTestId('task-status-bar');
    expect(statusBar.textContent).toContain('iter 2/4');
    expect(statusBar.textContent).toContain('get_document_chunks');
    const trace = await screen.findByTestId('task-status-trace');
    expect(trace.textContent).toContain('get_current_document');
    expect(trace.textContent).toContain('get_document_chunks');
  });

  it('shows last few observability.steps under statusBar when present', async () => {
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-agent-obs',
        documentId: 'doc-1',
        type: 'paper_overview_agent',
        status: 'succeeded',
        title: 'Paper overview',
        progress: 100,
        result: {
          content: 'Overview done.',
          observability: {
            statusBar: 'iter 3/4 · last: extractText · goal: Check claim.',
            iterations: 3,
            steps: [
              { kind: 'model', iteration: 1, summary: 'model #1: tool_call extractText' },
              { kind: 'tool', iteration: 1, toolName: 'extractText', summary: 'tool #1: extractText (ok)' },
              { kind: 'model', iteration: 2, summary: 'model #2: tool_call search_document' },
              { kind: 'tool', iteration: 2, toolName: 'search_document', summary: 'tool #2: search_document (ok)' },
              { kind: 'model', iteration: 3, summary: 'model #3: final - Claim supported.' },
            ],
          },
        },
        updatedAt: 7000,
      },
    ]);

    render(<TaskStatusPanel documentId="doc-1" />);

    const statusBar = await screen.findByTestId('task-status-bar');
    expect(statusBar.textContent).toContain('iter 3/4');
    expect(statusBar.textContent).toContain('extractText');
    const trace = await screen.findByTestId('task-status-trace');
    // last 4 of 5 steps
    expect(trace.textContent).not.toContain('model #1');
    expect(trace.textContent).toContain('extractText');
    expect(trace.textContent).toContain('search_document');
    expect(trace.textContent).toContain('Claim supported');
    expect(trace.querySelectorAll('.task-status-trace-step')).toHaveLength(4);
  });

  it('shows a bounded result preview for a succeeded agent task', async () => {
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-agent-overview',
        documentId: 'doc-1',
        type: 'paper_overview_agent',
        status: 'succeeded',
        title: 'Paper overview',
        progress: 100,
        result: {
          content: `# Paper overview\n\n${'Important source-backed finding. '.repeat(20)}`,
        },
        updatedAt: 5000,
      },
    ]);

    render(<TaskStatusPanel documentId="doc-1" />);

    expect((await screen.findAllByText('论文总览')).length).toBeGreaterThan(0);
    const preview = document.querySelector('.task-status-result');
    expect(preview?.textContent).toContain('Important source-backed finding.');
    expect(preview?.textContent).toContain('...');
    expect(preview?.textContent.length).toBeLessThan(260);
  });

  it('does not render an empty result preview when task content is missing', async () => {
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-agent-empty-result',
        documentId: 'doc-1',
        type: 'paper_overview_agent',
        status: 'succeeded',
        title: 'Paper overview',
        progress: 100,
        result: {},
        updatedAt: 5000,
      },
    ]);

    render(<TaskStatusPanel documentId="doc-1" />);

    expect((await screen.findAllByText('论文总览')).length).toBeGreaterThan(0);
    expect(document.querySelector('.task-status-result')).toBeNull();
  });

  it('requests saving a succeeded task result to Notes', async () => {
    const onSaveTaskResult = vi.fn();
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-agent-overview',
        documentId: 'doc-1',
        type: 'paper_overview_agent',
        status: 'succeeded',
        title: 'Paper overview',
        progress: 100,
        result: {
          content: '# Paper overview\n\nImportant source-backed finding.',
        },
        updatedAt: 5000,
      },
    ]);

    render(
      <TaskStatusPanel
        documentId="doc-1"
        onSaveTaskResult={onSaveTaskResult}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '保存到笔记' }));

    expect(onSaveTaskResult).toHaveBeenCalledTimes(1);
    expect(onSaveTaskResult).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-agent-overview',
      documentId: 'doc-1',
      type: 'paper_overview_agent',
      status: 'succeeded',
    }));
  });

  it('does not show Save to Notes when task result content is missing', async () => {
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-agent-empty-result',
        documentId: 'doc-1',
        type: 'paper_overview_agent',
        status: 'succeeded',
        title: 'Paper overview',
        progress: 100,
        result: {},
        updatedAt: 5000,
      },
    ]);

    render(
      <TaskStatusPanel
        documentId="doc-1"
        onSaveTaskResult={vi.fn()}
      />
    );

    expect((await screen.findAllByText('论文总览')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '保存到笔记' })).toBeNull();
  });

  it('renders an empty state when no document tasks are available', async () => {
    render(<TaskStatusPanel documentId="doc-empty" />);

    expect(await screen.findByText('暂无阅读任务')).toBeTruthy();
  });

  it('starts a paper overview agent for the current document', async () => {
    const onStartAgentTask = vi.fn();

    render(
      <TaskStatusPanel
        documentId="doc-1"
        onStartAgentTask={onStartAgentTask}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '论文总览' }));

    expect(onStartAgentTask).toHaveBeenCalledTimes(1);
    expect(onStartAgentTask).toHaveBeenCalledWith('paper_overview_agent');
  });

  it('starts configured reading agent skills for the current document', async () => {
    const onStartAgentTask = vi.fn();

    render(
      <TaskStatusPanel
        documentId="doc-1"
        agentSkills={[
          { type: 'paper_overview_agent', title: 'Paper overview' },
          { type: 'attention_agent', title: 'Attention route' },
          { type: 'card_generation_agent', title: 'Create VibeCard' },
        ]}
        onStartAgentTask={onStartAgentTask}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '生成卡片' }));

    expect(onStartAgentTask).toHaveBeenCalledTimes(1);
    expect(onStartAgentTask).toHaveBeenCalledWith('card_generation_agent');
  });

  it('shows Chinese labels and brief help for knowledge/critic/memory/export skills', async () => {
    const onStartAgentTask = vi.fn();

    render(
      <TaskStatusPanel
        documentId="doc-1"
        agentSkills={[
          { type: 'knowledge_qa_agent', title: 'Knowledge QA' },
          { type: 'critic_agent', title: 'Claim critic' },
          { type: 'memory_curator_agent', title: 'Memory curator' },
          { type: 'note_export_agent', title: 'Note export' },
        ]}
        onStartAgentTask={onStartAgentTask}
      />
    );

    const knowledgeBtn = screen.getByRole('button', { name: '知识问答' });
    const criticBtn = screen.getByRole('button', { name: '主张审查' });
    const memoryBtn = screen.getByRole('button', { name: '记忆策展' });
    const exportBtn = screen.getByRole('button', { name: '导出笔记' });

    expect(knowledgeBtn.getAttribute('title')).toContain('知识检索');
    expect(criticBtn.getAttribute('title')).toContain('核验主张');
    expect(memoryBtn.getAttribute('title')).toContain('不自动写入');
    expect(exportBtn.getAttribute('title')).toContain('导出');

    fireEvent.click(knowledgeBtn);
    fireEvent.click(criticBtn);
    fireEvent.click(memoryBtn);
    fireEvent.click(exportBtn);

    expect(onStartAgentTask).toHaveBeenCalledWith('knowledge_qa_agent');
    expect(onStartAgentTask).toHaveBeenCalledWith('critic_agent');
    expect(onStartAgentTask).toHaveBeenCalledWith('memory_curator_agent');
    expect(onStartAgentTask).toHaveBeenCalledWith('note_export_agent');
  });

  it('shows all 7 runnable reading agent skills with Chinese titles and help', async () => {
    const onStartAgentTask = vi.fn();
    const allSkills = [
      { type: 'paper_overview_agent', title: 'Paper overview' },
      { type: 'attention_agent', title: 'Attention route' },
      { type: 'card_generation_agent', title: 'Create VibeCard' },
      { type: 'note_export_agent', title: 'Note export' },
      { type: 'knowledge_qa_agent', title: 'Knowledge QA' },
      { type: 'critic_agent', title: 'Claim critic' },
      { type: 'memory_curator_agent', title: 'Memory curator' },
    ];

    render(
      <TaskStatusPanel
        documentId="doc-1"
        agentSkills={allSkills}
        onStartAgentTask={onStartAgentTask}
      />
    );

    const labels = [
      '论文总览',
      '阅读路线',
      '生成卡片',
      '导出笔记',
      '知识问答',
      '主张审查',
      '记忆策展',
    ];
    for (const label of labels) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: '论文总览' }).getAttribute('title')).toContain('论文总览');
    expect(screen.getByRole('button', { name: '阅读路线' }).getAttribute('title')).toContain('阅读路线');
    expect(screen.getByRole('button', { name: '生成卡片' }).getAttribute('title')).toContain('阅读卡片');
  });

  it('localizes task list titles for the new agent skills from skills.js', async () => {
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-kq',
        documentId: 'doc-1',
        type: 'knowledge_qa_agent',
        status: 'succeeded',
        title: 'Knowledge QA',
        progress: 100,
        updatedAt: 4000,
      },
      {
        id: 'task-critic',
        documentId: 'doc-1',
        type: 'critic_agent',
        status: 'running',
        title: 'Claim critic',
        progress: 50,
        updatedAt: 3000,
      },
      {
        id: 'task-memory',
        documentId: 'doc-1',
        type: 'memory_curator_agent',
        status: 'pending',
        title: 'Memory curator',
        progress: 0,
        updatedAt: 2000,
      },
      {
        id: 'task-export',
        documentId: 'doc-1',
        type: 'note_export_agent',
        status: 'succeeded',
        title: 'Note export',
        progress: 100,
        updatedAt: 1000,
      },
    ]);

    render(<TaskStatusPanel documentId="doc-1" />);

    expect((await screen.findAllByText('知识问答')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('主张审查').length).toBeGreaterThan(0);
    expect(screen.getAllByText('记忆策展').length).toBeGreaterThan(0);
    expect(screen.getAllByText('导出笔记').length).toBeGreaterThan(0);
  });

  it('does not show the paper overview entry without a current document', () => {
    render(<TaskStatusPanel onStartAgentTask={vi.fn()} />);

    expect(screen.queryByRole('button', { name: '论文总览' })).toBeNull();
  });

  it('refreshes current document tasks when a task update event is emitted', async () => {
    persistentMock.listPersistentTasks
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'task-live',
          documentId: 'doc-1',
          type: 'section_summary',
          status: 'running',
          title: 'Live summary',
          progress: 30,
          updatedAt: 3000,
        },
      ]);

    render(<TaskStatusPanel documentId="doc-1" />);

    expect(await screen.findByText('暂无阅读任务')).toBeTruthy();

    window.dispatchEvent(new CustomEvent('vibereader:task-updated', {
      detail: {
        documentId: 'doc-1',
        task: {
          id: 'task-live',
          documentId: 'doc-1',
        },
      },
    }));

    expect(await screen.findByText('Live summary')).toBeTruthy();
    expect(screen.getByText('运行中')).toBeTruthy();
    expect(persistentMock.listPersistentTasks).toHaveBeenCalledTimes(2);
    expect(persistentMock.listPersistentTasks).toHaveBeenLastCalledWith('doc-1');
  });

  it('ignores task update events for other documents', async () => {
    render(<TaskStatusPanel documentId="doc-1" />);

    expect(await screen.findByText('暂无阅读任务')).toBeTruthy();

    window.dispatchEvent(new CustomEvent('vibereader:task-updated', {
      detail: {
        documentId: 'doc-2',
        task: {
          id: 'task-other',
          documentId: 'doc-2',
        },
      },
    }));

    expect(persistentMock.listPersistentTasks).toHaveBeenCalledTimes(1);
  });

  it('requests retry for a failed source index task', async () => {
    const onRetryTask = vi.fn();
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-source-index-doc-1',
        documentId: 'doc-1',
        type: 'source_index',
        status: 'failed',
        title: 'Index Paper.pdf',
        progress: 100,
        errorMessage: 'disk full',
        updatedAt: 4000,
      },
    ]);

    render(<TaskStatusPanel documentId="doc-1" onRetryTask={onRetryTask} />);

    fireEvent.click(await screen.findByRole('button', { name: '重试' }));

    expect(onRetryTask).toHaveBeenCalledTimes(1);
    expect(onRetryTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-source-index-doc-1',
      documentId: 'doc-1',
      type: 'source_index',
      status: 'failed',
    }));
  });

  it('requests retry for a failed agent task', async () => {
    const onRetryTask = vi.fn();
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-agent-doc-1',
        documentId: 'doc-1',
        type: 'paper_overview_agent',
        status: 'failed',
        title: 'Paper overview',
        progress: 100,
        errorMessage: 'permission denied',
        payloadJson: JSON.stringify({
          agentOptions: {
            goal: 'Summarize this paper.',
          },
        }),
        updatedAt: 5000,
      },
    ]);

    render(<TaskStatusPanel documentId="doc-1" onRetryTask={onRetryTask} />);

    fireEvent.click(await screen.findByRole('button', { name: '重试' }));

    expect(onRetryTask).toHaveBeenCalledTimes(1);
    expect(onRetryTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-agent-doc-1',
      documentId: 'doc-1',
      type: 'paper_overview_agent',
      status: 'failed',
    }));
  });
});
