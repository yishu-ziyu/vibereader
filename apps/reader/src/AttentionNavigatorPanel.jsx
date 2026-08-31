import React, { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Spin, Tag, List, Segmented, message as antMessage } from 'antd';
import { CompassOutlined, AimOutlined } from '@ant-design/icons';
import { usePdfStore } from './store';
import { analyzeKeyInsights, INSIGHT_TYPES } from './attentionNavigator';
import { t } from './i18n';
import { createArtifact } from './services/artifactService';
import {
  listPersistentAttentionInsights,
  savePersistentAttentionInsights,
  savePersistentTask,
} from './services/persistentStorage';

function extractParagraphsFromText(pdfText) {
  const PAGE_MARKER_RE = /---\s*第\s*(\d+)\s*页\s*---/;
  const parts = String(pdfText || '').split(PAGE_MARKER_RE);
  if (parts.length === 1) return [{ page: 1, text: parts[0] }];

  const pages = [];
  if (parts[0].trim()) pages.push({ page: 1, text: parts[0] });
  for (let index = 1; index < parts.length; index += 2) {
    pages.push({ page: Number(parts[index]) || pages.length + 1, text: parts[index + 1] || '' });
  }

  return pages.flatMap(({ page, text }) =>
    text
      .split(/\n\s*\n+/)
      .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
      .filter((chunk) => chunk.length > 0 && !PAGE_MARKER_RE.test(chunk))
      .map((chunk, index) => ({
        id: `page-${page}-para-${index}`,
        text: chunk,
        page,
        y: 0,
      }))
  );
}

function attentionTaskId(documentId) {
  return `task-attention-analysis-${documentId}`;
}

async function recordAttentionTask(documentId, patch = {}) {
  if (!documentId) return null;

  try {
    return await savePersistentTask({
      id: attentionTaskId(documentId),
      documentId,
      type: 'attention_analysis',
      title: 'Analyze key locations',
      payload: { documentId },
      ...patch,
    });
  } catch (error) {
    console.warn('[AttentionNavigator] Failed to record attention task:', error);
    return null;
  }
}

export function AttentionNavigatorPanel({
  documentId,
  onNavigateToParagraph,
  onInsightsChange,
  onArtifactCreated,
  onAskAI,
  onStartDeepRead,
  style = {},
}) {
  const { pdfText, pdfParsing } = usePdfStore();
  const [insights, setInsights] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const persistInsights = useCallback((nextInsights) => {
    setInsights(nextInsights);
    if (onInsightsChange) onInsightsChange(nextInsights);
    if (documentId) {
      savePersistentAttentionInsights(documentId, nextInsights).catch((error) => {
        console.warn('[AttentionNavigator] Failed to persist insights:', error);
      });
    }
  }, [documentId, onInsightsChange]);

  useEffect(() => {
    let cancelled = false;

    setInsights([]);
    setTypeFilter('all');
    if (onInsightsChange) onInsightsChange([]);

    if (!documentId || !pdfText) {
      return () => {
        cancelled = true;
      };
    }

    listPersistentAttentionInsights(documentId)
      .then((items) => {
        if (cancelled || !items.length) return;
        setInsights(items);
        if (onInsightsChange) onInsightsChange(items);
      })
      .catch((error) => {
        console.warn('[AttentionNavigator] Failed to load persisted insights:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, pdfText, onInsightsChange]);

  const handleAnalyze = useCallback(async () => {
    if (!pdfText || analyzing) return;
    const paragraphs = extractParagraphsFromText(pdfText);
    if (paragraphs.length === 0) return;

    setAnalyzing(true);
    setProgress('');
    setInsights([]);
    const startedAt = Date.now();
    await recordAttentionTask(documentId, {
      status: 'running',
      progress: 10,
      createdAt: startedAt,
      updatedAt: startedAt,
      startedAt,
    });

    try {
      const results = await analyzeKeyInsights(pdfText, paragraphs, (msg) => setProgress(msg));
      persistInsights(results);
      await recordAttentionTask(documentId, {
        status: 'succeeded',
        progress: 100,
        result: {
          insightCount: results.length,
        },
        createdAt: startedAt,
        updatedAt: Date.now(),
        startedAt,
        completedAt: Date.now(),
      });
    } catch (error) {
      await recordAttentionTask(documentId, {
        status: 'failed',
        progress: 100,
        errorMessage: error?.message || String(error),
        createdAt: startedAt,
        updatedAt: Date.now(),
        startedAt,
        completedAt: Date.now(),
      });
      console.error('[AttentionNavigator] Analysis failed:', error);
    } finally {
      setAnalyzing(false);
    }
  }, [documentId, pdfText, analyzing, persistInsights]);

  const handleInsightClick = useCallback((insight) => {
    if (onNavigateToParagraph && insight.paragraphId) {
      onNavigateToParagraph(insight.paragraphId);
    }
  }, [onNavigateToParagraph]);

  const handleToggleRead = useCallback((event, insight) => {
    event.stopPropagation();
    const nextStatus = insight.readStatus === 'read' ? 'unread' : 'read';
    const nextInsights = insights.map((item) =>
      item.id === insight.id
        ? { ...item, readStatus: nextStatus, updatedAt: Date.now() }
        : item
    );
    persistInsights(nextInsights);
  }, [insights, persistInsights]);

  const handleSaveInsightCard = useCallback(async (event, insight) => {
    event.stopPropagation();
    if (!documentId) {
      antMessage.warning('请先打开文档');
      return;
    }

    const typeMeta = INSIGHT_TYPES[insight.type?.toUpperCase()] || {};
    const typeLabel = typeMeta.label || insight.type || 'Insight';
    const source = {
      documentId,
      sourceType: 'attention-insight',
      page: insight.location?.page ?? null,
      paragraphId: insight.paragraphId || '',
      text: insight.description || '',
    };
    const content = {
      insightId: insight.id,
      insightType: insight.type,
      typeLabel,
      description: insight.description || '',
      source,
    };

    try {
      const saved = await createArtifact({
        documentId,
        type: 'evidence_card',
        goal: `${typeLabel}：${insight.description || ''}`,
        sourceSpanIds: insight.paragraphId ? [insight.paragraphId] : [],
        source,
        originalContent: content,
        currentContent: content,
        verificationStatus: insight.paragraphId ? 'grounded' : 'ungrounded',
      });
      if (onArtifactCreated) onArtifactCreated(saved);
      antMessage.success('已保存为阅读卡片');
    } catch (error) {
      console.error('[AttentionNavigator] Failed to save insight card:', error);
      antMessage.error('保存卡片失败');
    }
  }, [documentId, onArtifactCreated]);

  const handleAskAboutInsight = useCallback((event, insight) => {
    event.stopPropagation();
    if (!onAskAI) return;

    const typeMeta = INSIGHT_TYPES[insight.type?.toUpperCase()] || {};
    const typeLabel = typeMeta.label || insight.type || 'Insight';
    onAskAI([
      '请基于当前文档解释这个关键位置：',
      `类型：${typeLabel}`,
      `位置：P${insight.location?.page ?? '?'} · ${insight.paragraphId || '未绑定段落'}`,
      `内容：${insight.description || ''}`,
    ].join('\n'));
  }, [onAskAI]);

  const typeOptions = [
    { label: '全部', value: 'all' },
    ...Array.from(new Set(insights.map((insight) => insight.type).filter(Boolean))).map((type) => {
      const typeMeta = INSIGHT_TYPES[type?.toUpperCase()] || {};
      return {
        label: typeMeta.label || type,
        value: type,
      };
    }),
  ];
  const visibleInsights = typeFilter === 'all'
    ? insights
    : insights.filter((insight) => insight.type === typeFilter);

  if (pdfParsing) {
    return (
      <div className="attention-navigator-empty" style={style}>
        <Spin size="small" />
        <div className="attention-navigator-muted">{t('ai-chat-pdf-parsing')}</div>
      </div>
    );
  }

  if (!pdfText) {
    return (
      <div className="attention-navigator-empty" style={style}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('ai-chat-no-pdf-context')}
        />
      </div>
    );
  }

  return (
    <div className="attention-navigator-panel" style={style}>
      <div className="attention-navigator-header">
        <div className="attention-navigator-title">
          <CompassOutlined />
          <span>阅读路线</span>
        </div>
        {documentId && typeof onStartDeepRead === 'function' && (
          <Button
            size="small"
            type="primary"
            icon={<AimOutlined />}
            onClick={onStartDeepRead}
          >
            开始精读
          </Button>
        )}
      </div>

      {!analyzing && insights.length === 0 && (
        <div className="attention-navigator-generate">
          <AimOutlined className="attention-navigator-generate-icon" />
          <div className="attention-navigator-generate-copy">
            先让 AI 标出这篇文档最值得精读的位置，再逐段回到原文确认。
          </div>
          <Button type="primary" icon={<CompassOutlined />} onClick={handleAnalyze}>
            生成阅读路线
          </Button>
        </div>
      )}

      {analyzing && (
        <div className="attention-navigator-progress">
          <Spin size="small" />
          <div className="attention-navigator-muted">
            {progress || '正在生成阅读路线...'}
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <div className="attention-navigator-content">
          {typeOptions.length > 2 && (
            <div className="attention-navigator-filters">
              <Segmented
                size="small"
                aria-label="Insight type filter"
                value={typeFilter}
                onChange={setTypeFilter}
                options={typeOptions}
              />
            </div>
          )}
          <List
            size="small"
            dataSource={visibleInsights}
            renderItem={(insight) => {
              const typeMeta = INSIGHT_TYPES[insight.type?.toUpperCase()] || {
                label: insight.type,
                color: '#999',
              };
              const read = insight.readStatus === 'read';
              return (
                <List.Item
                  className={`attention-navigator-item${read ? ' attention-navigator-item-read' : ''}`}
                  onClick={() => handleInsightClick(insight)}
                >
                  <div className="attention-navigator-item-inner">
                    <Tag
                      color={typeMeta.color}
                      style={{ fontSize: 11, marginRight: 8, flexShrink: 0 }}
                    >
                      {typeMeta.label}
                    </Tag>
                    <div className="attention-navigator-item-body">
                      <div className="attention-navigator-item-desc">
                        {insight.description}
                      </div>
                      <div className="attention-navigator-item-meta">
                        P{insight.location?.page} · {insight.paragraphId}
                      </div>
                      <div className="attention-navigator-item-actions">
                        <Button
                          size="small"
                          type="text"
                          className="attention-navigator-read-toggle"
                          aria-label={`${read ? '标记未读' : '标记已读'}：${insight.description}`}
                          onClick={(event) => handleToggleRead(event, insight)}
                        >
                          {read ? '标记未读' : '标记已读'}
                        </Button>
                        <Button
                          size="small"
                          type="text"
                          className="attention-navigator-card-button"
                          aria-label={`保存卡片：${insight.description}`}
                          onClick={(event) => handleSaveInsightCard(event, insight)}
                        >
                          保存卡片
                        </Button>
                        <Button
                          size="small"
                          type="text"
                          className="attention-navigator-ask-button"
                          aria-label={`问 AI：${insight.description}`}
                          onClick={(event) => handleAskAboutInsight(event, insight)}
                        >
                          问 AI
                        </Button>
                      </div>
                    </div>
                  </div>
                </List.Item>
              );
            }}
          />
          <div className="attention-navigator-footer">
            <Button size="small" onClick={handleAnalyze} loading={analyzing}>
              重新分析
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AttentionNavigatorPanel;
