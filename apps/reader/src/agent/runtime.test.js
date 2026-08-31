import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAICompatibleAgentModel } from './llmModel';
import { DEFAULT_READING_PERMISSIONS } from './permissions';
import { LLM_AGENT_DEFAULTS, runReadingAgent } from './runtime';
import { createTrajectoryRecorder } from './trajectory';

describe('reading agent runtime', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('runs model and reading tool calls until a final answer is produced', async () => {
        const model = vi
            .fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolName: 'extractText',
                args: { page: 1 },
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'The source supports the claim.',
            });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'Claim evidence.', page: 1 }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Check the claim.',
            model,
            tools,
            maxIterations: 4,
            timeoutMs: 1000,
        });

        expect(result).toEqual(expect.objectContaining({
            status: 'completed',
            content: 'The source supports the claim.',
            iterations: 2,
        }));
        expect(result.trace).toEqual([
            expect.objectContaining({ type: 'model', iteration: 1 }),
            expect.objectContaining({ type: 'tool', toolName: 'extractText' }),
            expect.objectContaining({ type: 'model', iteration: 2 }),
        ]);
        expect(model).toHaveBeenCalledTimes(2);
        expect(tools.extractText.run).toHaveBeenCalledWith({ page: 1 });
    });

    it('preserves source refs from a final model response', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'final',
            content: 'Overview with cited evidence.',
            sourceRefs: [
                {
                    documentId: 'doc-1',
                    page: 2,
                    paragraphId: 'page-2-para-0',
                    text: 'Evidence paragraph.',
                },
            ],
        });

        const result = await runReadingAgent({
            goal: 'Create overview.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 1000,
        });

        expect(result).toEqual(expect.objectContaining({
            status: 'completed',
            sourceRefs: [
                {
                    documentId: 'doc-1',
                    page: 2,
                    paragraphId: 'page-2-para-0',
                    text: 'Evidence paragraph.',
                },
            ],
        }));
    });

    it('stops at the configured max iteration limit', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'tool_call',
            toolName: 'extractText',
            args: { page: 1 },
        });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'More text.' }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Keep reading.',
            model,
            tools,
            maxIterations: 2,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('max_iterations');
        expect(result.iterations).toBe(2);
        expect(model).toHaveBeenCalledTimes(2);
    });

    it('denies tool calls that are outside the permission policy', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'tool_call',
            toolName: 'createAnnotation',
            args: { text: 'write this' },
        });

        const result = await runReadingAgent({
            goal: 'Save a note.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('permission_denied');
        expect(result.error).toContain('createAnnotation');
    });

    it('denies reading tool calls when document reading permission is disabled', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'tool_call',
            toolName: 'extractText',
            args: { page: 1 },
        });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'Hidden text.' }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Read the current page.',
            model,
            tools,
            permissions: {
                allowedTools: ['extractText'],
                canReadDocument: false,
            },
            maxIterations: 2,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('permission_denied');
        expect(result.error).toContain('extractText');
        expect(tools.extractText.run).not.toHaveBeenCalled();
    });

    it('returns a timeout result when the loop exceeds the configured time', async () => {
        vi.useFakeTimers();
        const model = vi.fn(() => new Promise((resolve) => {
            setTimeout(() => resolve({ type: 'final', content: 'Late answer.' }), 50);
        }));

        const pending = runReadingAgent({
            goal: 'Slow task.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 10,
        });

        await vi.advanceTimersByTimeAsync(11);

        await expect(pending).resolves.toEqual(expect.objectContaining({
            status: 'timeout',
        }));
    });

    it('aborts the in-flight abortSignal on timeout so model/tool work can cancel', async () => {
        vi.useFakeTimers();
        let seenSignal = null;
        const model = vi.fn(({ abortSignal }) => {
            seenSignal = abortSignal;
            return new Promise((_resolve, reject) => {
                if (abortSignal?.aborted) {
                    reject(new DOMException('Aborted', 'AbortError'));
                    return;
                }
                abortSignal?.addEventListener('abort', () => {
                    reject(new DOMException('Aborted', 'AbortError'));
                }, { once: true });
            });
        });

        const pending = runReadingAgent({
            goal: 'Abort in-flight work.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 10,
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(model).toHaveBeenCalled();
        expect(seenSignal).toBeTruthy();
        expect(seenSignal.aborted).toBe(false);

        await vi.advanceTimersByTimeAsync(11);

        await expect(pending).resolves.toEqual(expect.objectContaining({
            status: 'timeout',
        }));
        expect(seenSignal.aborted).toBe(true);
    });

    it('propagates external abortSignal and finishes when caller cancels', async () => {
        const external = new AbortController();
        let seenSignal = null;
        const model = vi.fn(({ abortSignal }) => {
            seenSignal = abortSignal;
            return new Promise((_resolve, reject) => {
                if (abortSignal?.aborted) {
                    reject(new DOMException('Aborted', 'AbortError'));
                    return;
                }
                abortSignal?.addEventListener('abort', () => {
                    reject(new DOMException('Aborted', 'AbortError'));
                }, { once: true });
            });
        });

        const pending = runReadingAgent({
            goal: 'External abort.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 5000,
            abortSignal: external.signal,
        });

        await Promise.resolve();
        expect(seenSignal).toBeTruthy();
        expect(seenSignal.aborted).toBe(false);

        external.abort();

        expect(seenSignal.aborted).toBe(true);
        await expect(pending).resolves.toEqual(expect.objectContaining({
            status: 'timeout',
        }));
    });

    it('passes abortSignal into tools that accept a second options argument', async () => {
        let toolSignal = null;
        const model = vi
            .fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolName: 'slowTool',
                args: { page: 1 },
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'done',
            });
        const tools = {
            slowTool: {
                name: 'slowTool',
                readOnly: true,
                acceptsAbortSignal: true,
                run: vi.fn(async (args, options = {}) => {
                    toolSignal = options.signal || options.abortSignal || null;
                    return { text: 'ok', page: args.page };
                }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Tool signal.',
            model,
            tools,
            permissions: {
                ...DEFAULT_READING_PERMISSIONS,
                allowedTools: [...DEFAULT_READING_PERMISSIONS.allowedTools, 'slowTool'],
            },
            maxIterations: 4,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('completed');
        expect(tools.slowTool.run).toHaveBeenCalledWith(
            { page: 1 },
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        expect(toolSignal).toBeInstanceOf(AbortSignal);
        expect(toolSignal.aborted).toBe(false);
    });

    it('aborts mid-tool when the tool respects AbortSignal and returns timeout status', async () => {
        const external = new AbortController();
        let toolSignal = null;
        const model = vi.fn().mockResolvedValue({
            type: 'tool_call',
            toolName: 'slowTool',
            args: { page: 1 },
        });
        const tools = {
            slowTool: {
                name: 'slowTool',
                readOnly: true,
                acceptsAbortSignal: true,
                run: vi.fn(async (_args, options = {}) => {
                    toolSignal = options.signal || options.abortSignal || null;
                    return new Promise((_resolve, reject) => {
                        if (toolSignal?.aborted) {
                            const err = new Error('The operation was aborted.');
                            err.name = 'AbortError';
                            reject(err);
                            return;
                        }
                        toolSignal?.addEventListener('abort', () => {
                            const err = new Error('The operation was aborted.');
                            err.name = 'AbortError';
                            reject(err);
                        }, { once: true });
                    });
                }),
            },
        };

        const pending = runReadingAgent({
            goal: 'Hang then cancel.',
            model,
            tools,
            permissions: {
                ...DEFAULT_READING_PERMISSIONS,
                allowedTools: [...DEFAULT_READING_PERMISSIONS.allowedTools, 'slowTool'],
            },
            maxIterations: 4,
            timeoutMs: 5000,
            abortSignal: external.signal,
        });

        await Promise.resolve();
        await Promise.resolve();
        expect(tools.slowTool.run).toHaveBeenCalled();
        expect(toolSignal).toBeInstanceOf(AbortSignal);
        expect(toolSignal.aborted).toBe(false);

        external.abort();

        const result = await pending;
        expect(result.status).toBe('timeout');
        expect(result.error).toMatch(/abort/i);
        expect(result.trace.some((step) => step.type === 'model')).toBe(true);
        expect(tools.slowTool.run).toHaveBeenCalledWith(
            { page: 1 },
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
    });

    it('denies write tools registered under default reading permissions', async () => {
        const writeTools = [
            'create_vibecard',
            'create_annotation',
            'export_note',
            'memory_save',
        ];

        for (const toolName of writeTools) {
            const run = vi.fn().mockResolvedValue({ ok: true });
            const model = vi.fn().mockResolvedValue({
                type: 'tool_call',
                toolName,
                args: { documentId: 'doc-1' },
            });
            const result = await runReadingAgent({
                goal: `Try ${toolName}`,
                model,
                tools: {
                    [toolName]: { name: toolName, readOnly: false, run },
                },
                // default permissions: write flags false, tools not in allowedTools
                maxIterations: 2,
                timeoutMs: 1000,
            });

            expect(result.status).toBe('permission_denied');
            expect(result.error).toContain(toolName);
            expect(run).not.toHaveBeenCalled();
        }
    });

    it('returns error status when a non-abort tool throw escapes', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'tool_call',
            toolName: 'extractText',
            args: { page: 1 },
        });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockRejectedValue(new Error('page adapter boom')),
            },
        };

        const result = await runReadingAgent({
            goal: 'Broken tool.',
            model,
            tools,
            maxIterations: 2,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('error');
        expect(result.error).toContain('page adapter boom');
        expect(result.trace.some((step) => step.type === 'model')).toBe(true);
    });

    it('executes multiple tool_calls from one model response and records each in trace', async () => {
        const model = vi
            .fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolCalls: [
                    { toolName: 'extractText', args: { page: 1 } },
                    { toolName: 'search_document', args: { query: 'claim' } },
                ],
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'Combined evidence.',
            });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'Page one.' }),
            },
            search_document: {
                name: 'search_document',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ hits: [{ page: 3 }] }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Gather evidence.',
            model,
            tools,
            maxIterations: 4,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('completed');
        expect(result.content).toBe('Combined evidence.');
        expect(result.iterations).toBe(2);
        expect(tools.extractText.run).toHaveBeenCalledWith({ page: 1 });
        expect(tools.search_document.run).toHaveBeenCalledWith({ query: 'claim' });
        expect(result.trace).toEqual([
            expect.objectContaining({ type: 'model', iteration: 1 }),
            expect.objectContaining({ type: 'tool', toolName: 'extractText', iteration: 1 }),
            expect.objectContaining({ type: 'tool', toolName: 'search_document', iteration: 1 }),
            expect.objectContaining({ type: 'model', iteration: 2 }),
        ]);
        expect(model).toHaveBeenCalledTimes(2);
    });

    it('accepts tool_calls snake_case multi-call payload', async () => {
        const model = vi
            .fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                tool_calls: [
                    { name: 'extractText', args: { page: 2 } },
                ],
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'Done.',
            });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'Page two.' }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Snake case multi.',
            model,
            tools,
            maxIterations: 3,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('completed');
        expect(tools.extractText.run).toHaveBeenCalledWith({ page: 2 });
        expect(result.trace.filter((entry) => entry.type === 'tool')).toHaveLength(1);
    });

    it('emits onEvent for model, tool, and final steps', async () => {
        const events = [];
        const model = vi
            .fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolName: 'extractText',
                args: { page: 1 },
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'Answer.',
            });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'Evidence.' }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Emit events.',
            model,
            tools,
            maxIterations: 4,
            timeoutMs: 1000,
            onEvent: (event) => events.push(event),
        });

        expect(result.status).toBe('completed');
        expect(events.map((e) => e.type)).toEqual(['model', 'tool', 'model', 'final']);
        expect(events[0]).toEqual(expect.objectContaining({
            type: 'model',
            iteration: 1,
        }));
        expect(events[1]).toEqual(expect.objectContaining({
            type: 'tool',
            toolName: 'extractText',
            iteration: 1,
        }));
        expect(events[3]).toEqual(expect.objectContaining({
            type: 'final',
            status: 'completed',
            content: 'Answer.',
        }));
    });

    it('appends events to trajectoryRecorder when provided', async () => {
        const append = vi.fn();
        const model = vi.fn().mockResolvedValue({
            type: 'final',
            content: 'Tracked.',
        });

        await runReadingAgent({
            goal: 'Track trajectory.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 1000,
            trajectoryRecorder: { append },
        });

        expect(append).toHaveBeenCalled();
        expect(append.mock.calls.map(([event]) => event.type)).toEqual(['model', 'final']);
        expect(append.mock.calls[0][0].summary).toBeTruthy();
    });

    it('records into createTrajectoryRecorder with required summary fields', async () => {
        const recorder = createTrajectoryRecorder();
        const model = vi
            .fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolName: 'extractText',
                args: { page: 1 },
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'Tracked final.',
            });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'ok' }),
            },
        };

        await runReadingAgent({
            goal: 'Real trajectory recorder.',
            model,
            tools,
            maxIterations: 4,
            timeoutMs: 1000,
            trajectoryRecorder: recorder,
        });

        const events = recorder.list();
        expect(events.map((e) => e.type)).toEqual(['model', 'tool', 'model', 'final']);
        expect(events.every((e) => typeof e.summary === 'string' && e.summary.length > 0)).toBe(true);
    });

    it('passes richer model args including tools, permissions, maxIterations, and status', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'final',
            content: 'ok',
        });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn(),
            },
        };
        const permissions = {
            allowedTools: ['extractText'],
            canReadDocument: true,
        };

        await runReadingAgent({
            goal: 'Richer args.',
            model,
            tools,
            permissions,
            maxIterations: 3,
            timeoutMs: 1000,
        });

        expect(model).toHaveBeenCalledWith(expect.objectContaining({
            goal: 'Richer args.',
            iteration: 1,
            maxIterations: 3,
            tools,
            permissions,
            status: expect.any(String),
            trace: expect.any(Object),
        }));
        const status = model.mock.calls[0][0].status;
        expect(status).toMatch(/iteration=1\/3/);
    });

    it('updates status after a tool so the next model turn can inject it', async () => {
        const model = vi.fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolName: 'extractText',
                args: { page: 1 },
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'done',
            });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'page' }),
            },
        };

        await runReadingAgent({
            goal: 'Status after tool.',
            model,
            tools,
            maxIterations: 4,
            timeoutMs: 1000,
        });

        expect(model).toHaveBeenCalledTimes(2);
        expect(model.mock.calls[0][0].status).toMatch(/start iteration=1\/4|iteration=1\/4/);
        expect(model.mock.calls[1][0].status).toBe('after tool=extractText iteration=2/4');
        expect(model.mock.calls[1][0].iteration).toBe(2);
        expect(model.mock.calls[1][0].maxIterations).toBe(4);
    });

    it('exports LLM_AGENT_DEFAULTS without changing harness defaults used by tests', () => {
        expect(LLM_AGENT_DEFAULTS).toEqual({
            maxIterations: 8,
            timeoutMs: 120000,
        });
    });

    it('groundingMode off (default) does not block ungrounded finals', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'final',
            content: 'The result is 42 without any tool evidence.',
        });

        const result = await runReadingAgent({
            goal: 'Ungrounded final.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('completed');
        expect(result.content).toBe('The result is 42 without any tool evidence.');
        expect(result.grounding).toBeUndefined();
    });

    it('groundingMode warn appends warning for claim-heavy final without tools/refs', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'final',
            content: 'The result is 42 without any tool evidence.',
        });

        const result = await runReadingAgent({
            goal: 'Warn ungrounded.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 1000,
            groundingMode: 'warn',
        });

        expect(result.status).toBe('completed');
        expect(result.content).toContain('The result is 42 without any tool evidence.');
        expect(result.content).toContain('[grounding warning]');
        expect(result.content).toContain('no tools used when requireTools=true');
        expect(result.content).toContain('claim-heavy content without sourceRefs');
        expect(result.grounding?.ok).toBe(false);
        expect(result.grounding?.warnings).toEqual(expect.arrayContaining([
            'no tools used when requireTools=true',
            'claim-heavy content without sourceRefs',
        ]));
        expect(result.sourceRefs).toEqual([]);
        expect(result.trace.every((entry) => entry.type !== 'tool')).toBe(true);
    });

    it('groundingMode strict returns status ungrounded', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'final',
            content: '实验证明有效。',
        });

        const result = await runReadingAgent({
            goal: 'Strict ungrounded.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 1000,
            groundingMode: 'strict',
        });

        expect(result.status).toBe('ungrounded');
        expect(result.error).toContain('no tools used when requireTools=true');
        expect(result.error).toContain('claim-heavy content without sourceRefs');
        expect(result.grounding?.ok).toBe(false);
        expect(result.grounding?.warnings).toEqual(expect.arrayContaining([
            'no tools used when requireTools=true',
            'claim-heavy content without sourceRefs',
        ]));
    });

    it('groundingGate true enables warn path on final', async () => {
        const model = vi
            .fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolName: 'extractText',
                args: { page: 1 },
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'Accuracy is 99 on the private test set.',
                // no sourceRefs despite claim-heavy prose
            });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'raw' }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Gate flag warn.',
            model,
            tools,
            maxIterations: 4,
            timeoutMs: 1000,
            groundingGate: true,
        });

        expect(result.status).toBe('completed');
        expect(result.content).toContain('[grounding warning]');
        expect(result.grounding?.warnings).toContain(
            'claim-heavy content without sourceRefs',
        );
    });

    it('groundingMode strict passes grounded final with tools and sourceRefs', async () => {
        const model = vi
            .fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolName: 'extractText',
                args: { page: 1 },
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'The abstract is a short summary of findings.',
                sourceRefs: [{ page: 1, text: 'Abstract' }],
            });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'Abstract body' }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Strict grounded.',
            model,
            tools,
            maxIterations: 4,
            timeoutMs: 1000,
            groundingMode: 'strict',
        });

        expect(result.status).toBe('completed');
        expect(result.content).toBe('The abstract is a short summary of findings.');
        expect(result.error).toBeUndefined();
    });

    it('omits observability by default', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'final',
            content: 'Done.',
        });

        const result = await runReadingAgent({
            goal: 'Quick answer.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('completed');
        expect(result.observability).toBeUndefined();
    });

    it('attaches light observability when includeObservability is true (completed)', async () => {
        const model = vi
            .fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolName: 'extractText',
                args: { page: 1 },
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'Claim supported by page 1.',
            });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'Evidence.' }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Check the claim.',
            model,
            tools,
            maxIterations: 4,
            timeoutMs: 1000,
            includeObservability: true,
        });

        expect(result.status).toBe('completed');
        expect(result.observability).toEqual(expect.objectContaining({
            iterations: 2,
            statusBar: expect.stringContaining('iter 2/4'),
            steps: expect.any(Array),
        }));
        expect(result.observability.statusBar).toContain('last: extractText');
        expect(result.observability.statusBar).toContain('goal: Check the claim.');
        expect(result.observability.steps).toHaveLength(3);
        expect(result.observability.steps[0].kind).toBe('model');
        expect(result.observability.steps[1]).toEqual(expect.objectContaining({
            kind: 'tool',
            toolName: 'extractText',
            status: 'ok',
        }));
        expect(result.observability.steps[2].summary).toContain('final');
    });

    it('attaches light observability on failed/limit results when opted in', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'tool_call',
            toolName: 'extractText',
            args: { page: 1 },
        });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'More.' }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Keep going.',
            model,
            tools,
            maxIterations: 2,
            timeoutMs: 1000,
            includeObservability: true,
        });

        expect(result.status).toBe('max_iterations');
        expect(result.observability).toEqual(expect.objectContaining({
            iterations: 2,
            statusBar: expect.stringContaining('iter 2/2'),
            steps: expect.any(Array),
        }));
        expect(result.observability.steps.length).toBeGreaterThan(0);
        expect(result.observability.statusBar).toContain('last: extractText');
    });

    it('attaches OTel-style spans when exportSpans is true', async () => {
        const model = vi
            .fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolName: 'search_document',
                args: { query: 'claim' },
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'Found evidence.',
            });
        const tools = {
            search_document: {
                name: 'search_document',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ matches: [{ id: '1' }] }),
            },
        };

        const without = await runReadingAgent({
            goal: 'Find claim.',
            model,
            tools,
            maxIterations: 4,
            timeoutMs: 1000,
        });
        expect(without.spans).toBeUndefined();

        model
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolName: 'search_document',
                args: { query: 'claim' },
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'Found evidence.',
            });

        const withSpans = await runReadingAgent({
            goal: 'Find claim.',
            model,
            tools,
            maxIterations: 4,
            timeoutMs: 1000,
            exportSpans: true,
        });

        expect(withSpans.status).toBe('completed');
        expect(withSpans.spans).toEqual(expect.objectContaining({
            name: 'agent.run',
            status: 'ok',
        }));
        expect(withSpans.spans.children[0].name).toBe('llm.iteration');
        expect(withSpans.spans.children[0].children[0].name).toBe('retrieval');
        expect(withSpans.spans.children[0].children[0].attributes['retrieval.tool'])
            .toBe('search_document');
    });

    it('attaches cost/latency metrics on completed mock-model runs', async () => {
        const model = vi
            .fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolName: 'extractText',
                args: { page: 1 },
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'Evidence-backed answer.',
            });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'Evidence.' }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Check metrics.',
            model,
            tools,
            maxIterations: 4,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('completed');
        expect(result.metrics).toEqual(expect.objectContaining({
            wallMs: expect.any(Number),
            iterations: 2,
            toolCallCount: 1,
            llmCallCount: 2,
            toolDurations: expect.any(Array),
        }));
        expect(result.metrics.wallMs).toBeGreaterThanOrEqual(0);
        expect(result.metrics.toolDurations).toHaveLength(1);
        expect(result.metrics.toolDurations[0]).toEqual(expect.objectContaining({
            toolName: 'extractText',
            iteration: 1,
            durationMs: expect.any(Number),
        }));
        expect(result.metrics.toolDurations[0].durationMs).toBeGreaterThanOrEqual(0);
        expect(result.trace.find((step) => step.type === 'tool')?.durationMs)
            .toBeGreaterThanOrEqual(0);
    });

    it('attaches metrics on max_iterations and multi-tool runs', async () => {
        const model = vi
            .fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolCalls: [
                    { toolName: 'extractText', args: { page: 1 } },
                    { toolName: 'search_document', args: { query: 'q' } },
                ],
            })
            .mockResolvedValue({
                type: 'tool_call',
                toolName: 'extractText',
                args: { page: 2 },
            });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 't' }),
            },
            search_document: {
                name: 'search_document',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ hits: [] }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Metrics multi tool.',
            model,
            tools,
            maxIterations: 2,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('max_iterations');
        expect(result.metrics).toEqual(expect.objectContaining({
            iterations: 2,
            llmCallCount: 2,
            // iter1: 2 tools, iter2: 1 tool
            toolCallCount: 3,
        }));
        expect(result.metrics.toolDurations.map((d) => d.toolName)).toEqual([
            'extractText',
            'search_document',
            'extractText',
        ]);
        expect(result.metrics.wallMs).toBeGreaterThanOrEqual(0);
    });

    it('attaches metrics on timeout and invalid_model results', async () => {
        vi.useFakeTimers();
        const model = vi.fn(() => new Promise((resolve) => {
            setTimeout(() => resolve({ type: 'final', content: 'Late.' }), 50);
        }));

        const pending = runReadingAgent({
            goal: 'Timeout metrics.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 10,
        });
        await vi.advanceTimersByTimeAsync(11);
        const timeoutResult = await pending;

        expect(timeoutResult.status).toBe('timeout');
        expect(timeoutResult.metrics).toEqual(expect.objectContaining({
            wallMs: expect.any(Number),
            iterations: expect.any(Number),
            toolCallCount: expect.any(Number),
            llmCallCount: expect.any(Number),
            toolDurations: expect.any(Array),
        }));
        expect(timeoutResult.metrics.wallMs).toBeGreaterThanOrEqual(10);

        vi.useRealTimers();

        const invalid = await runReadingAgent({
            goal: 'No model.',
            tools: {},
            maxIterations: 1,
            timeoutMs: 1000,
        });
        expect(invalid.status).toBe('invalid_model');
        expect(invalid.metrics).toEqual(expect.objectContaining({
            wallMs: expect.any(Number),
            iterations: 0,
            toolCallCount: 0,
            llmCallCount: 0,
            toolDurations: [],
        }));
    });
});

describe('runtime + LLM adapter grounding integration', () => {
    function claimHeavyFinalFetchMock(content) {
        return vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        role: 'assistant',
                        content,
                    },
                }],
            }),
        });
    }

    function llmModel(fetchMock) {
        return createOpenAICompatibleAgentModel({
            baseUrl: 'http://127.0.0.1:8317/v1',
            apiKey: 'test-key',
            model: 'grok-4.5',
            fetch: fetchMock,
        });
    }

    it('LLM-mock claim-heavy final without tools/sourceRefs: warn keeps completed + grounding warning', async () => {
        const content = 'Attention is all you need for modern NLP systems.';
        const fetchMock = claimHeavyFinalFetchMock(content);
        const model = llmModel(fetchMock);

        const result = await runReadingAgent({
            goal: 'Summarize the paper.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 1000,
            groundingMode: 'warn',
        });

        expect(result.status).toBe('completed');
        expect(result.content).toContain(content);
        expect(result.content).toContain('[grounding warning]');
        expect(result.content).toContain('no tools used when requireTools=true');
        expect(result.content).toContain('claim-heavy content without sourceRefs');
        expect(result.grounding).toEqual({
            ok: false,
            warnings: expect.arrayContaining([
                'no tools used when requireTools=true',
                'claim-heavy content without sourceRefs',
            ]),
        });
        expect(result.sourceRefs || []).toEqual([]);
        expect(result.trace.some((entry) => entry.type === 'tool')).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('LLM-mock claim-heavy final without tools/sourceRefs: strict → ungrounded', async () => {
        const content = 'The result is 42 on the private benchmark.';
        const fetchMock = claimHeavyFinalFetchMock(content);
        const model = llmModel(fetchMock);

        const result = await runReadingAgent({
            goal: 'Report the score.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 1000,
            groundingMode: 'strict',
        });

        expect(result.status).toBe('ungrounded');
        expect(result.error).toContain('no tools used when requireTools=true');
        expect(result.error).toContain('claim-heavy content without sourceRefs');
        expect(result.grounding?.ok).toBe(false);
        expect(result.grounding?.warnings).toEqual(expect.arrayContaining([
            'no tools used when requireTools=true',
            'claim-heavy content without sourceRefs',
        ]));
        expect(result.trace.some((entry) => entry.type === 'tool')).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
