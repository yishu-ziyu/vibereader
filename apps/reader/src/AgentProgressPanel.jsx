import React, { useMemo } from 'react';
import { Spin, Button, Tag } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  SettingOutlined,
  FileTextOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useProgressStore } from './store';

/**
 * Agent Progress Visibility Panel
 *
 * 把长任务过程显化：用户不只看到"等待中"，
 * 而是能看到任务走到哪一步、当前由哪个 Agent 在工作、
 * 失败后是否进入自修复、技术细节是什么。
 */

const STAGE_CONFIG = [
  { key: 'queued', label: '准备', icon: <ClockCircleOutlined /> },
  { key: 'validation', label: '验证', icon: <FileTextOutlined /> },
  { key: 'render', label: '执行', icon: <SettingOutlined /> },
  { key: 'repair', label: '修复', icon: <WarningOutlined /> },
  { key: 'alignment', label: '整理', icon: <ToolOutlined /> },
  { key: 'complete', label: '完成', icon: <CheckCircleOutlined /> },
];

function stageIndexFor(stageKey) {
  const idx = STAGE_CONFIG.findIndex((s) => s.key === stageKey);
  return idx >= 0 ? idx : 0;
}

function severityColor(severity) {
  switch (severity) {
    case 'error':
      return '#ff4d4f';
    case 'warn':
      return '#faad14';
    default:
      return 'var(--accent-blue, #1890ff)';
  }
}

export function AgentProgressPanel() {
  const {
    visible,
    status,
    stage,
    currentStudentMessage,
    events,
    technicalEvents,
    elapsedSeconds,
    error,
    dismiss,
    reset,
  } = useProgressStore();

  const currentStageIndex = useMemo(() => stageIndexFor(stage), [stage]);

  if (!visible) return null;

  const isFailed = status === 'failed';
  const isSucceeded = status === 'succeeded';

  // 最近 6 条用户可见事件
  const recentEvents = events.slice(-6);

  // 最近 20 条技术事件
  const recentTechnical = technicalEvents.slice(-20);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(8px)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!isFailed && !isSucceeded && (
              <Spin size="small" style={{ marginRight: 4 }} />
            )}
            {isFailed && (
              <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
            )}
            {isSucceeded && (
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
            )}
            <span
              style={{
                fontWeight: 600,
                fontSize: 15,
                color: isFailed ? '#ff4d4f' : isSucceeded ? '#52c41a' : '#262626',
              }}
            >
              {currentStudentMessage || '处理中...'}
            </span>
          </div>
          <Tag
            style={{
              fontSize: 12,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--fill-tertiary)',
              borderColor: 'var(--fill-quinary)',
            }}
          >
            {Math.floor(elapsedSeconds / 60)}:
            {String(elapsedSeconds % 60).padStart(2, '0')}
          </Tag>
        </div>

        {/* Stage Steps */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            alignItems: 'center',
          }}
        >
          {STAGE_CONFIG.map((s, index) => {
            const isDone = index < currentStageIndex;
            const isActive = index === currentStageIndex;
            const isFuture = index > currentStageIndex;

            return (
              <React.Fragment key={s.key}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    flex: 1,
                    opacity: isFuture ? 0.4 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      background: isFailed && isActive
                        ? '#ff4d4f'
                        : isDone || isSucceeded
                          ? '#52c41a'
                          : isActive
                            ? 'var(--accent-blue, #1890ff)'
                            : '#f0f0f0',
                      color: isDone || isActive || isSucceeded ? '#fff' : '#999',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {isDone || isSucceeded ? (
                      <CheckCircleOutlined style={{ fontSize: 14 }} />
                    ) : (
                      s.icon
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive
                        ? isFailed
                          ? '#ff4d4f'
                          : 'var(--accent-blue, #1890ff)'
                        : '#666',
                    }}
                  >
                    {s.label}
                  </span>
                </div>
                {index < STAGE_CONFIG.length - 1 && (
                  <div
                    style={{
                      flex: 1,
                      height: 2,
                      background: index < currentStageIndex ? '#52c41a' : '#e8e8e8',
                      borderRadius: 1,
                      minWidth: 12,
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Event Feed */}
        {recentEvents.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxHeight: 160,
              overflowY: 'auto',
            }}
          >
            {recentEvents.map((event, idx) => {
              const meta = event.metadata || {};
              const agentLabel = meta.agent
                ? `${meta.agent} · `
                : '';
              const iteration = meta.iteration ?? event.attempt;
              const iterationLabel = iteration
                ? `第 ${iteration} 轮 · `
                : '';
              const toolLabel = meta.toolName
                ? `工具 ${meta.toolName} · `
                : '';
              const typeLabel = meta.type && meta.type !== 'model'
                ? `${meta.type} · `
                : '';
              return (
                <div
                  key={idx}
                  data-testid="agent-progress-event"
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: '#f8f9fa',
                    borderLeft: `3px solid ${severityColor(event.severity)}`,
                    fontSize: 12,
                    color: '#444',
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ color: '#888', fontSize: 11 }}>
                    {agentLabel}
                    {typeLabel}
                    {toolLabel}
                    {iterationLabel}
                  </span>
                  {event.studentMessage}
                </div>
              );
            })}
          </div>
        )}

        {/* Technical Details (collapsible) */}
        {recentTechnical.length > 0 && (
          <details style={{ fontSize: 12 }}>
            <summary
              style={{
                cursor: 'pointer',
                color: 'var(--fill-tertiary)',
                userSelect: 'none',
                fontSize: 12,
              }}
            >
              技术细节 ({recentTechnical.length} 条)
            </summary>
            <pre
              style={{
                marginTop: 8,
                padding: 10,
                background: '#1a1a2e',
                color: '#c5d4e8',
                borderRadius: 8,
                fontSize: 11,
                lineHeight: 1.6,
                maxHeight: 160,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {recentTechnical
                .map(
                  (e) =>
                    `[${e.time?.slice(11, 19) || '--:--'}] ${e.stage}${e.attempt ? ` attempt=${e.attempt}` : ''} ${e.technicalMessage}`
                )
                .join('\n')}
            </pre>
          </details>
        )}

        {/* Error display */}
        {isFailed && error && (
          <div
            style={{
              padding: 10,
              background: '#fff2f0',
              border: '1px solid #ffccc7',
              borderRadius: 8,
              fontSize: 12,
              color: '#ff4d4f',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>错误详情</div>
            <div>Code: {error.code || 'UNKNOWN'}</div>
            <div>{error.message}</div>
          </div>
        )}

        {/* Actions */}
        {(isFailed || isSucceeded) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {isFailed && (
              <Button size="small" onClick={reset}>
                重试
              </Button>
            )}
            <Button size="small" type="primary" onClick={dismiss}>
              {isFailed ? '关闭' : '继续'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentProgressPanel;
