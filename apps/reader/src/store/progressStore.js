import { create } from 'zustand';

/**
 * Agent Progress Visibility Panel 状态管理
 * 用于把长任务过程显化，让用户看到任务走到哪一步
 */

const STAGES = [
  { key: 'queued', label: '准备中', description: '任务已创建，正在准备资源。' },
  { key: 'validation', label: '验证中', description: '正在检查输入格式和完整性。' },
  { key: 'render', label: '执行中', description: '正在执行核心任务。' },
  { key: 'repair', label: '修复中', description: '检测到问题，正在自动修复。' },
  { key: 'alignment', label: '整理中', description: '正在整理结果，生成最终输出。' },
  { key: 'complete', label: '完成', description: '任务已完成。' },
  { key: 'failed', label: '失败', description: '任务失败，请查看技术细节。' },
];

function stageIndexFor(stageKey) {
  const idx = STAGES.findIndex((s) => s.key === stageKey);
  return idx >= 0 ? idx : 0;
}

export const useProgressStore = create((set, get) => ({
  // State
  visible: false,
  status: 'idle', // idle | running | succeeded | failed
  stage: 'queued',
  currentStudentMessage: '',
  events: [],
  technicalEvents: [],
  startedAt: null,
  elapsedSeconds: 0,
  timerId: null,
  result: null,
  error: null,

  // Actions
  startJob: (initialMessage = '任务已开始...') => {
    const now = Date.now();
    const timerId = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - get().startedAt) / 1000);
      set({ elapsedSeconds: elapsed });
    }, 1000);

    set({
      visible: true,
      status: 'running',
      stage: 'queued',
      currentStudentMessage: initialMessage,
      events: [],
      technicalEvents: [],
      startedAt: now,
      elapsedSeconds: 0,
      timerId,
      result: null,
      error: null,
    });
  },

  emitEvent: ({ stage, studentMessage, technicalMessage = '', severity = 'info', attempt, metadata }) => {
    const now = new Date().toISOString();
    const event = {
      time: now,
      stage,
      severity,
      studentMessage,
      attempt,
      metadata,
    };
    const technicalEvent = {
      ...event,
      technicalMessage: technicalMessage || studentMessage,
    };

    set((state) => ({
      stage,
      currentStudentMessage: studentMessage,
      events: [...state.events, event].slice(-50), // 保留最近50条
      technicalEvents: [...state.technicalEvents, technicalEvent].slice(-100),
    }));
  },

  finishJob: (result) => {
    const { timerId } = get();
    if (timerId) window.clearInterval(timerId);
    set({
      status: 'succeeded',
      stage: 'complete',
      currentStudentMessage: '任务完成，结果已准备好。',
      timerId: null,
      result,
    });
  },

  failJob: (errorPayload, studentMessage = '任务失败，请稍后重试。') => {
    const { timerId } = get();
    if (timerId) window.clearInterval(timerId);
    set({
      status: 'failed',
      stage: 'failed',
      currentStudentMessage: studentMessage,
      timerId: null,
      error: errorPayload,
    });
  },

  dismiss: () => {
    const { timerId } = get();
    if (timerId) window.clearInterval(timerId);
    set({
      visible: false,
      status: 'idle',
      timerId: null,
    });
  },

  reset: () => {
    const { timerId } = get();
    if (timerId) window.clearInterval(timerId);
    set({
      visible: false,
      status: 'idle',
      stage: 'queued',
      currentStudentMessage: '',
      events: [],
      technicalEvents: [],
      startedAt: null,
      elapsedSeconds: 0,
      timerId: null,
      result: null,
      error: null,
    });
  },

  // Getters
  getStageIndex: () => stageIndexFor(get().stage),
  getStageLabel: (key) => STAGES.find((s) => s.key === key)?.label || key,
  getStages: () => STAGES,
}));
