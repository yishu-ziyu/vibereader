import { describe, expect, it, vi } from 'vitest';
import { retryReadingAgentTask, runReadingAgentTask } from './taskRunner';

describe('reading agent task runner', () => {
    it('records pending, running, and succeeded states for a completed agent run', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'Overview with cited evidence.',
            sourceRefs: [
                {
                    documentId: 'doc-1',
                    page: 2,
                    paragraphId: 'page-2-para-0',
                    text: 'Evidence paragraph.',
                },
            ],
            trace: [],
        });

        const result = await runReadingAgentTask({
            task: {
                id: 'task-agent-1',
                documentId: 'doc-1',
                type: 'paper_overview_agent',
                title: 'Paper overview',
                payload: { goal: 'Explain the paper.' },
            },
            agentOptions: {
                goal: 'Explain the paper.',
            },
            runAgent,
            saveTask,
            now: () => 1000,
        });

        expect(runAgent).toHaveBeenCalledWith({
            goal: 'Explain the paper.',
            onEvent: expect.any(Function),
        });
        expect(saveTask).toHaveBeenCalledTimes(3);
        expect(saveTask.mock.calls.map(([task]) => task.status)).toEqual([
            'pending',
            'running',
            'succeeded',
        ]);
        expect(saveTask.mock.calls[0][0]).toEqual(expect.objectContaining({
            id: 'task-agent-1',
            documentId: 'doc-1',
            type: 'paper_overview_agent',
            progress: 0,
            payload: {
                goal: 'Explain the paper.',
                agentOptions: {
                    goal: 'Explain the paper.',
                },
            },
        }));
        expect(saveTask.mock.calls[1][0]).toEqual(expect.objectContaining({
            status: 'running',
            progress: 10,
            startedAt: 1000,
            result: expect.objectContaining({
                statusBar: expect.stringContaining('iter'),
            }),
        }));
        expect(saveTask.mock.calls[2][0]).toEqual(expect.objectContaining({
            status: 'succeeded',
            progress: 100,
            completedAt: 1000,
            result: expect.objectContaining({
                agentStatus: 'completed',
                content: 'Overview with cited evidence.',
                artifactCount: 0,
                sourceRefs: [
                    {
                        documentId: 'doc-1',
                        page: 2,
                        paragraphId: 'page-2-para-0',
                        text: 'Evidence paragraph.',
                    },
                ],
                statusBar: expect.stringContaining('iter'),
            }),
        }));
        expect(result).toEqual(expect.objectContaining({
            status: 'succeeded',
            taskId: 'task-agent-1',
            agentResult: expect.objectContaining({
                status: 'completed',
            }),
        }));
    });

    it('forwards groundingMode from agentOptions to runAgent', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'Answer with tools.',
            sourceRefs: [{ page: 1, text: 'Evidence.' }],
            trace: [{ type: 'tool', toolName: 'search_document' }],
        });

        await runReadingAgentTask({
            task: {
                id: 'task-grounding-1',
                documentId: 'doc-1',
                type: 'knowledge_qa_agent',
                title: 'Knowledge QA',
            },
            agentOptions: {
                goal: 'Answer with evidence.',
                groundingMode: 'warn',
            },
            runAgent,
            saveTask,
            now: () => 2000,
        });

        expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({
            goal: 'Answer with evidence.',
            groundingMode: 'warn',
            onEvent: expect.any(Function),
        }));
    });

    it('passes onEvent into runAgent and persists compact trace summary', async () => {
        const saveTask = vi.fn(async (task) => task);
        const onEvent = vi.fn();
        const runAgent = vi.fn(async ({ onEvent: agentOnEvent }) => {
            agentOnEvent?.({
                type: 'model',
                iteration: 1,
                summary: 'model #1: tool_call get_current_document',
                response: { type: 'tool_call', toolName: 'get_current_document', args: {} },
            });
            agentOnEvent?.({
                type: 'tool',
                iteration: 1,
                toolName: 'get_current_document',
                summary: 'tool #1: get_current_document',
                result: { title: 'Paper' },
            });
            agentOnEvent?.({
                type: 'final',
                status: 'completed',
                content: 'Done.',
                iterations: 1,
                summary: 'final - Done.',
            });
            return {
                status: 'completed',
                content: 'Done.',
                iterations: 1,
                trace: [
                    {
                        type: 'model',
                        iteration: 1,
                        response: { type: 'tool_call', toolName: 'get_current_document', args: {} },
                    },
                    {
                        type: 'tool',
                        iteration: 1,
                        toolName: 'get_current_document',
                        args: {},
                        result: { title: 'Paper' },
                    },
                    {
                        type: 'model',
                        iteration: 2,
                        response: { type: 'final', content: 'Done.' },
                    },
                ],
            };
        });

        const result = await runReadingAgentTask({
            task: {
                id: 'task-agent-trace',
                documentId: 'doc-1',
                type: 'paper_overview_agent',
                title: 'Paper overview',
            },
            agentOptions: {
                goal: 'Trace the run.',
                maxIterations: 4,
            },
            onEvent,
            runAgent,
            saveTask,
            now: () => 5000,
        });

        expect(onEvent).toHaveBeenCalled();
        expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual(['model', 'tool', 'final']);
        expect(result.status).toBe('succeeded');

        const finalSave = saveTask.mock.calls[saveTask.mock.calls.length - 1][0];
        expect(finalSave.result.trace).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: 'tool',
                toolName: 'get_current_document',
                summary: expect.stringContaining('get_current_document'),
            }),
        ]));
        expect(finalSave.result.statusBar).toContain('iter');
        expect(finalSave.result.lastTool).toBe('get_current_document');
        expect(finalSave.result.iterations).toBe(1);
    });

    it('preserves serialized retry agent options when runtime options contain functions', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'Overview with local tools.',
        });
        const model = vi.fn();

        await runReadingAgentTask({
            task: {
                id: 'task-agent-serializable',
                documentId: 'doc-1',
                type: 'paper_overview_agent',
                title: 'Paper overview',
                payload: {
                    agentOptions: {
                        taskType: 'paper_overview_agent',
                        documentId: 'doc-1',
                        goal: 'Create a paper overview.',
                    },
                },
            },
            agentOptions: {
                goal: 'Create a paper overview.',
                model,
                tools: {
                    get_current_document: {
                        run: vi.fn(),
                    },
                },
            },
            runAgent,
            saveTask,
            now: () => 1500,
        });

        expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({
            goal: 'Create a paper overview.',
            model,
            onEvent: expect.any(Function),
        }));
        expect(saveTask.mock.calls[0][0].payload).toEqual({
            agentOptions: {
                taskType: 'paper_overview_agent',
                documentId: 'doc-1',
                goal: 'Create a paper overview.',
            },
        });
    });

    it('records a failed task when the agent returns a non-completed status', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockResolvedValue({
            status: 'permission_denied',
            error: 'Tool "create_vibecard" is not allowed',
            trace: [],
        });

        const result = await runReadingAgentTask({
            task: {
                id: 'task-agent-2',
                documentId: 'doc-1',
                type: 'paper_overview_agent',
                title: 'Paper overview',
            },
            runAgent,
            saveTask,
            now: () => 2000,
        });

        expect(saveTask.mock.calls.map(([task]) => task.status)).toEqual([
            'pending',
            'running',
            'failed',
        ]);
        expect(saveTask.mock.calls[2][0]).toEqual(expect.objectContaining({
            status: 'failed',
            progress: 100,
            errorMessage: 'Tool "create_vibecard" is not allowed',
            completedAt: 2000,
        }));
        expect(result).toEqual(expect.objectContaining({
            status: 'failed',
            errorMessage: 'Tool "create_vibecard" is not allowed',
        }));
    });

    it('records a failed task when the agent runner throws', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockRejectedValue(new Error('Model unavailable'));

        const result = await runReadingAgentTask({
            task: {
                id: 'task-agent-3',
                documentId: 'doc-1',
                type: 'attention_agent',
                title: 'Attention route',
            },
            runAgent,
            saveTask,
            now: () => 3000,
        });

        expect(saveTask.mock.calls.map(([task]) => task.status)).toEqual([
            'pending',
            'running',
            'failed',
        ]);
        expect(saveTask.mock.calls[2][0]).toEqual(expect.objectContaining({
            status: 'failed',
            errorMessage: 'Model unavailable',
            completedAt: 3000,
        }));
        expect(result.errorMessage).toBe('Model unavailable');
    });

    it('aggregates structured toolOutcome from tool call traces (D7)', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'Cards created and note exported.',
            trace: [
                { type: 'tool', toolName: 'get_current_document', result: { name: 'Paper' } },
                { type: 'tool', toolName: 'create_vibecard', result: { status: 'created', cardId: 'card-1' } },
                { type: 'tool', toolName: 'create_vibecard', result: { status: 'created', cardId: 'card-2' } },
                // 失败/缺 cardId 的调用不计入
                { type: 'tool', toolName: 'create_vibecard', result: { status: 'error' } },
                { type: 'tool', toolName: 'create_vibecard', result: { status: 'created' } },
                { type: 'tool', toolName: 'export_note', result: { status: 'exported' } },
                { type: 'model', iteration: 3, response: { type: 'final', content: 'done' } },
            ],
        });

        const result = await runReadingAgentTask({
            task: {
                id: 'task-tool-outcome',
                documentId: 'doc-1',
                type: 'card_generation_agent',
                title: 'Cards',
            },
            agentOptions: { goal: 'Cards' },
            runAgent,
            saveTask,
            now: () => 8000,
        });

        expect(result.status).toBe('succeeded');
        expect(result.toolOutcome).toEqual({ vibecardsCreated: 2, noteExported: true });

        // 持久化的任务 result 上也带结构化字段，供 UI/重试使用
        const finalSave = saveTask.mock.calls[saveTask.mock.calls.length - 1][0];
        expect(finalSave.result.toolOutcome).toEqual({ vibecardsCreated: 2, noteExported: true });
    });

    it('aggregates zeroed toolOutcome when no create/export tools ran', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'Need at least 3 source chunks to create VibeCards.',
            trace: [],
        });

        const result = await runReadingAgentTask({
            task: { id: 'task-tool-outcome-zero', type: 'card_generation_agent' },
            agentOptions: { goal: 'Cards' },
            runAgent,
            saveTask,
            now: () => 8100,
        });

        expect(result.toolOutcome).toEqual({ vibecardsCreated: 0, noteExported: false });
    });

    it('retries a persisted agent task with the same task identity and agent options', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'Retry succeeded.',
        });

        const result = await retryReadingAgentTask({
            id: 'task-agent-retry',
            documentId: 'doc-1',
            type: 'paper_overview_agent',
            title: 'Paper overview',
            payloadJson: JSON.stringify({
                agentOptions: {
                    goal: 'Retry the overview.',
                    maxIterations: 2,
                },
                retryable: true,
            }),
        }, {
            runAgent,
            saveTask,
            now: () => 4000,
        });

        expect(runAgent).toHaveBeenCalledWith({
            goal: 'Retry the overview.',
            maxIterations: 2,
            onEvent: expect.any(Function),
        });
        expect(saveTask.mock.calls[0][0]).toEqual(expect.objectContaining({
            id: 'task-agent-retry',
            documentId: 'doc-1',
            type: 'paper_overview_agent',
            title: 'Paper overview',
            payload: {
                agentOptions: {
                    goal: 'Retry the overview.',
                    maxIterations: 2,
                },
                retryable: true,
            },
        }));
        expect(result.status).toBe('succeeded');
    });

    it('throws a clear error when retrying a task without agent options', async () => {
        await expect(retryReadingAgentTask({
            id: 'task-agent-missing-payload',
            documentId: 'doc-1',
            type: 'paper_overview_agent',
            payloadJson: '{}',
        })).rejects.toThrow('retryReadingAgentTask requires payload.agentOptions');
    });

    it('records experience when options.experienceStore is provided', async () => {
        const saveTask = vi.fn(async (task) => task);
        const recordRun = vi.fn((input) => ({ id: 'exp-1', ...input }));
        const experienceStore = { recordRun };
        const runAgent = vi.fn().mockResolvedValue({
            status: 'permission_denied',
            error: 'Tool "create_vibecard" is not allowed',
            content: '',
            sourceRefs: [{ page: 1, text: 'x' }],
            trace: [{
                type: 'tool',
                toolName: 'create_vibecard',
                result: { error: 'not allowed' },
            }],
        });

        await runReadingAgentTask({
            task: {
                id: 'task-agent-exp',
                documentId: 'doc-1',
                type: 'card_generation_agent',
                title: 'Cards',
            },
            agentOptions: {
                goal: 'Make cards',
            },
            experienceStore,
            runAgent,
            saveTask,
            now: () => 5000,
        });

        expect(recordRun).toHaveBeenCalledTimes(1);
        expect(recordRun).toHaveBeenCalledWith(expect.objectContaining({
            goal: 'Make cards',
            skillType: 'card_generation_agent',
            status: 'permission_denied',
            contentSummary: 'Tool "create_vibecard" is not allowed',
            sourceRefs: [{ page: 1, text: 'x' }],
            trace: [expect.objectContaining({ toolName: 'create_vibecard' })],
            error: 'Tool "create_vibecard" is not allowed',
        }));
    });

    it('records failed experience when the agent throws', async () => {
        const saveTask = vi.fn(async (task) => task);
        const recordRun = vi.fn();
        const runAgent = vi.fn().mockRejectedValue(new Error('boom'));

        await runReadingAgentTask({
            task: {
                id: 'task-agent-exp-throw',
                type: 'attention_agent',
            },
            agentOptions: { goal: 'route' },
            experienceStore: { recordRun },
            runAgent,
            saveTask,
            now: () => 6000,
        });

        expect(recordRun).toHaveBeenCalledWith(expect.objectContaining({
            goal: 'route',
            skillType: 'attention_agent',
            status: 'failed',
            contentSummary: 'boom',
            error: 'boom',
        }));
    });

    it('skips experience recording when experienceStore is absent', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'ok',
        });

        await runReadingAgentTask({
            task: { id: 'task-no-exp', type: 'paper_overview_agent' },
            agentOptions: { goal: 'g' },
            runAgent,
            saveTask,
            now: () => 7000,
        });

        // No throw; optional path only.
        expect(runAgent).toHaveBeenCalled();
    });
});
