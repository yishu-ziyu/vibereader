import React, { useEffect, useMemo, useState } from 'react';
import { Button, Empty, List, Progress, Spin, Tag } from 'antd';
import { ClockCircleOutlined, SaveOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { listPersistentTasks, TASK_UPDATED_EVENT } from './services/persistentStorage';

const STATUS_COLORS = {
  pending: 'default',
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'warning',
};

// English titles from agent/skills.js → Chinese UI labels.
const KNOWN_TASK_TITLE_LABELS = {
  'Paper overview': '论文总览',
  'Attention route': '阅读路线',
  'Create VibeCard': '生成卡片',
  'Note export': '导出笔记',
  'Knowledge QA': '知识问答',
  'Claim critic': '主张审查',
  'Memory curator': '记忆策展',
};

// Brief Chinese help for skill buttons (goals summarized from agent/skills.js).
const KNOWN_SKILL_HELP = {
  paper_overview_agent: '用安全元数据与有限原文片段生成简洁论文总览',
  attention_agent: '找出最重要的原文位置，排成简短阅读路线',
  card_generation_agent: '基于原文生成阅读卡片，不编造无依据主张',
  knowledge_qa_agent: '用知识检索与文档工具回答问题，并附来源引用',
  critic_agent: '对照原文核验主张，区分支持 / 部分支持 / 不支持',
  memory_curator_agent: '检索已保存记忆并提出写入候选，不自动写入长期记忆',
  note_export_agent: '汇总摘要、洞察与卡片，导出带出处的阅读笔记',
};

function taskTypeLabel(type = '') {
  switch (type) {
    case 'source_index':
      return '文档索引';
    case 'knowledge_ingest':
      return '知识入库';
    case 'saved_memory_ingest':
      return '记忆沉淀';
    case 'section_summary':
      return '章节摘要';
    case 'attention_analysis':
      return '注意力路线';
    case 'paper_overview_agent':
      return '论文总览';
    case 'attention_agent':
      return '阅读路线';
    case 'card_generation_agent':
      return '生成卡片';
    case 'knowledge_qa_agent':
      return '知识问答';
    case 'critic_agent':
      return '主张审查';
    case 'memory_curator_agent':
      return '记忆策展';
    case 'note_export_agent':
      return '导出笔记';
    default:
      return type || '任务';
  }
}

function agentSkillHelp(skill = {}) {
  if (skill.type && KNOWN_SKILL_HELP[skill.type]) return KNOWN_SKILL_HELP[skill.type];
  if (typeof skill.goal === 'string' && skill.goal.trim()) return skill.goal.trim();
  return '';
}

function taskStatusLabel(status = '') {
  switch (status) {
    case 'pending':
      return '等待中';
    case 'running':
      return '运行中';
    case 'succeeded':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    default:
      return status || '等待中';
  }
}

function agentSkillLabel(skill = {}) {
  if (skill.type) return taskTypeLabel(skill.type);
  return skill.title || '任务';
}

function taskTitleLabel(task = {}) {
  if (task.title && KNOWN_TASK_TITLE_LABELS[task.title]) return KNOWN_TASK_TITLE_LABELS[task.title];
  return task.title || taskTypeLabel(task.type);
}

function sortTasks(tasks = []) {
  return [...tasks].sort(
    (left, right) =>
      Number(right.updatedAt || right.updated_at || 0) - Number(left.updatedAt || left.updated_at || 0)
  );
}

function canRetryTask(task = {}) {
  const statusRetryable = ['failed', 'cancelled'].includes(task.status);
  const type = String(task.type || '');
  return statusRetryable && (type === 'source_index' || type === 'knowledge_ingest' || type.endsWith('_agent'));
}

function taskResultObject(task = {}) {
  return task.result && typeof task.result === 'object' ? task.result : {};
}

function taskResultText(task = {}) {
  const result = taskResultObject(task);
  return String(result.content || result.summary || result.text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function boundedTaskResultText(task = {}, maxLength = 220) {
  const text = taskResultText(task);
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function taskStatusBar(task = {}) {
  const result = taskResultObject(task);
  const fromObservability = result.observability && typeof result.observability === 'object'
    ? result.observability.statusBar
    : '';
  return String(result.statusBar || fromObservability || '').trim();
}

function taskTraceSteps(task = {}, maxSteps = 4) {
  const result = taskResultObject(task);
  const obsSteps = result.observability && typeof result.observability === 'object'
    ? result.observability.steps
    : null;
  const steps = Array.isArray(obsSteps)
    ? obsSteps
    : (Array.isArray(result.trace) ? result.trace : []);
  if (steps.length === 0) return [];
  return steps.slice(-Math.max(1, maxSteps));
}

function formatTraceStep(step = {}) {
  if (step.summary) return String(step.summary);
  if (step.toolName) {
    const iter = step.iteration != null ? ` #${step.iteration}` : '';
    return `tool${iter}: ${step.toolName}`;
  }
  if (step.kind === 'model' || step.type === 'model') {
    const iter = step.iteration != null ? ` #${step.iteration}` : '';
    return `model${iter}`;
  }
  return String(step.kind || step.type || 'step');
}

function canSaveTaskResult(task = {}) {
  return task.status === 'succeeded' && !!taskResultText(task);
}

const DEFAULT_AGENT_SKILLS = Object.freeze([
  Object.freeze({ type: 'paper_overview_agent', title: '论文总览' }),
]);

function visibleAgentSkills(agentSkills) {
  const skills = Array.isArray(agentSkills) && agentSkills.length > 0
    ? agentSkills
    : DEFAULT_AGENT_SKILLS;
  return skills.filter((skill) => skill?.type && skill?.title);
}

export function TaskStatusPanel({
  documentId,
  agentSkills,
  compact = false,
  onRetryTask,
  onStartAgentTask,
  onSaveTaskResult,
  style = {},
}) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTasks([]);

    if (!documentId) return () => {
      cancelled = true;
    };

    const loadTasks = ({ showLoading = true } = {}) => {
      if (showLoading) setLoading(true);
      return listPersistentTasks(documentId)
        .then((items) => {
          if (cancelled) return;
          setTasks(Array.isArray(items) ? items : []);
        })
        .catch((error) => {
          console.warn('[TaskStatusPanel] Failed to load tasks:', error);
          if (!cancelled) setTasks([]);
        })
        .finally(() => {
          if (!cancelled && showLoading) setLoading(false);
        });
    };

    loadTasks();

    const handleTaskUpdated = (event) => {
      const updatedDocumentId = event?.detail?.documentId || event?.detail?.task?.documentId || null;
      if (updatedDocumentId !== documentId) return;
      loadTasks({ showLoading: false });
    };

    window.addEventListener(TASK_UPDATED_EVENT, handleTaskUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener(TASK_UPDATED_EVENT, handleTaskUpdated);
    };
  }, [documentId]);

  const visibleTasks = useMemo(() => sortTasks(tasks), [tasks]);

  return (
    <div className={`task-status-panel${compact ? ' task-status-panel-compact' : ''}`} style={style}>
      <div className="task-status-header">
        <div className="task-status-title">
          <ClockCircleOutlined />
          <span>{compact ? '精读进度' : '阅读任务'}</span>
        </div>
        {documentId && typeof onStartAgentTask === 'function' && (
          <div className="task-status-agent-actions">
            {visibleAgentSkills(agentSkills).map((skill) => {
              const label = agentSkillLabel(skill);
              const help = agentSkillHelp(skill);
              return (
                <Button
                  aria-label={label}
                  icon={<ThunderboltOutlined />}
                  key={skill.type}
                  size="small"
                  title={help || undefined}
                  type={skill.type === 'paper_overview_agent' ? 'primary' : 'default'}
                  onClick={() => onStartAgentTask(skill.type)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {loading && (
        <div className="task-status-empty">
          <Spin size="small" />
        </div>
      )}

      {!loading && visibleTasks.length === 0 && (
        <div className="task-status-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={compact ? '精读流程尚未启动' : '暂无阅读任务'}
          />
        </div>
      )}

      {!loading && visibleTasks.length > 0 && (
        <List
          className="task-status-list"
          size="small"
          dataSource={visibleTasks}
          renderItem={(task) => {
            const resultPreview = boundedTaskResultText(task);
            const statusBar = taskStatusBar(task);
            const traceSteps = taskTraceSteps(task);
            return (
              <List.Item className="task-status-item">
                <div className="task-status-item-main">
                  <div className="task-status-item-topline">
                    <span className="task-status-item-title">
                      {taskTitleLabel(task)}
                    </span>
                    <Tag color={STATUS_COLORS[task.status] || 'default'}>
                      {taskStatusLabel(task.status)}
                    </Tag>
                  </div>
                  <div className="task-status-item-meta">
                    {taskTypeLabel(task.type)}
                  </div>
                  <Progress
                    size="small"
                    percent={Math.max(0, Math.min(100, Number(task.progress || 0)))}
                    showInfo
                  />
                  {statusBar && (
                    <div className="task-status-bar" data-testid="task-status-bar">
                      {statusBar}
                    </div>
                  )}
                  {traceSteps.length > 0 && (
                    <div className="task-status-trace" data-testid="task-status-trace">
                      {traceSteps.map((step, index) => (
                        <div
                          className="task-status-trace-step"
                          key={`${step.summary || step.toolName || 'step'}-${index}`}
                        >
                          {formatTraceStep(step)}
                        </div>
                      ))}
                    </div>
                  )}
                  {resultPreview && (
                    <div className="task-status-result">
                      {resultPreview}
                    </div>
                  )}
                  {task.errorMessage && (
                    <div className="task-status-error">
                      {task.errorMessage}
                    </div>
                  )}
                  {canRetryTask(task) && typeof onRetryTask === 'function' && (
                    <div className="task-status-actions">
                      <Button
                        size="small"
                        type="link"
                        onClick={() => onRetryTask(task)}
                      >
                        重试
                      </Button>
                    </div>
                  )}
                  {canSaveTaskResult(task) && typeof onSaveTaskResult === 'function' && (
                    <div className="task-status-actions">
                      <Button
                        aria-label="保存到笔记"
                        icon={<SaveOutlined />}
                        size="small"
                        type="link"
                        onClick={() => onSaveTaskResult(task)}
                      >
                        保存到笔记
                      </Button>
                    </div>
                  )}
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );
}

export default TaskStatusPanel;
