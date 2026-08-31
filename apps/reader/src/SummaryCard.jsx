import React, { useState, useCallback, useEffect } from 'react';
import { Card, Button, Tag, Space, Spin, Collapse, Empty, message as antMessage } from 'antd';
import {
  RobotOutlined,
  MessageOutlined,
  DownOutlined,
  RightOutlined,
  BulbOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { t } from './i18n';
import aiService from './aiService';
import {
  loadPersistentSummary,
  savePersistentSummary,
  savePersistentTask,
} from './services/persistentStorage';
import { createArtifact } from './services/artifactService';

const { Panel } = Collapse;

function summaryTaskId(documentId, sectionId) {
  return `task-section-summary-${documentId}-${sectionId || 'section'}`;
}

async function recordSummaryTask(documentId, section = {}, patch = {}) {
  if (!documentId || !section?.id) return null;

  try {
    return await savePersistentTask({
      id: summaryTaskId(documentId, section.id),
      documentId,
      type: 'section_summary',
      title: `Summarize ${section.title || 'section'}`,
      payload: {
        documentId,
        sectionId: section.id,
        sectionTitle: section.title || '',
      },
      ...patch,
    });
  } catch (error) {
    console.warn('[SummaryCard] Failed to record summary task:', error);
    return null;
  }
}

/**
 * SummaryCard - A collapsible card for a paper section summary.
 *
 * Props:
 *   - documentId: current document id for persisted summaries
 *   - section: { id, title, content (raw text of the section) }
 *   - onAskAI: (question: string) => void — callback to send a focused question
 *   - onArtifactCreated: (artifact) => void — callback to add a saved card to Notes
 *   - defaultExpanded: boolean
 */
export function SummaryCard({ documentId, section, onAskAI, onArtifactCreated, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [summary, setSummary] = useState('');
  const [keyPoints, setKeyPoints] = useState([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSummary('');
    setKeyPoints([]);

    if (!documentId || !section?.id) {
      return () => {
        cancelled = true;
      };
    }

    loadPersistentSummary(documentId, 'section', section.id)
      .then((record) => {
        if (cancelled || !record) return;
        setSummary(record.summary || '');
        setKeyPoints(Array.isArray(record.keyPoints) ? record.keyPoints : []);
      })
      .catch((error) => {
        console.warn('[SummaryCard] Failed to load persisted summary:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, section?.id]);

  const handleGenerate = useCallback(async () => {
    if (!section?.content) return;
    setGenerating(true);
    const startedAt = Date.now();
    await recordSummaryTask(documentId, section, {
      status: 'running',
      progress: 10,
      createdAt: startedAt,
      updatedAt: startedAt,
      startedAt,
    });
    try {
      const prompt = `请为以下论文段落生成简洁的学术摘要和关键要点（3-5条）。

段落标题：${section.title}
段落内容：
${section.content.slice(0, 4000)}

请按以下格式输出：
摘要：<一段简洁的摘要>
要点：
- <要点1>
- <要点2>
- <要点3>`;

      let fullText = '';
      await aiService.chatStream(
        prompt,
        ({ done, content, fullMessage }) => {
          if (!done && content) {
            fullText = fullMessage;
          }
        },
        { includeHistory: false, systemPrompt: null }
      );

      // Parse result
      const summaryMatch = fullText.match(/摘要[:：]\s*([\s\S]*?)(?=要点[:：]|$)/i);
      const pointsMatch = fullText.match(/要点[:：]\s*([\s\S]*)/i);

      const nextSummary = summaryMatch ? summaryMatch[1].trim() : fullText.slice(0, 300);

      let nextKeyPoints = [];
      if (pointsMatch) {
        nextKeyPoints = pointsMatch[1]
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('-') || l.startsWith('•'))
          .map((l) => l.replace(/^[-•]\s*/, '').trim())
          .filter(Boolean);
      }

      setSummary(nextSummary);
      setKeyPoints(nextKeyPoints);

      if (documentId) {
        await savePersistentSummary({
            documentId,
            summaryKind: 'section',
            sectionId: section.id,
            sectionTitle: section.title,
            summary: nextSummary,
            keyPoints: nextKeyPoints,
            rawResponse: fullText,
          })
          .catch((error) => {
            console.warn('[SummaryCard] Failed to save persisted summary:', error);
          });
      }
      await recordSummaryTask(documentId, section, {
        status: 'succeeded',
        progress: 100,
        result: {
          sectionId: section.id,
          summaryLength: nextSummary.length,
          keyPointCount: nextKeyPoints.length,
        },
        createdAt: startedAt,
        updatedAt: Date.now(),
        startedAt,
        completedAt: Date.now(),
      });
    } catch (e) {
      await recordSummaryTask(documentId, section, {
        status: 'failed',
        progress: 100,
        errorMessage: e?.message || String(e),
        createdAt: startedAt,
        updatedAt: Date.now(),
        startedAt,
        completedAt: Date.now(),
      });
      setSummary(t('ai-chat-summary-error', null, 'Failed to generate summary'));
    } finally {
      setGenerating(false);
    }
  }, [documentId, section]);

  const handleAskAboutSection = useCallback(() => {
    if (onAskAI) {
      onAskAI(`请详细解释「${section.title}」这部分的内容和意义。`);
    }
  }, [onAskAI, section]);

  const handleSaveConceptCard = useCallback(async () => {
    if (!documentId) {
      antMessage.warning('请先打开文档');
      return;
    }
    if (!summary && keyPoints.length === 0) return;

    const source = {
      documentId,
      sourceType: 'summary-section',
      sectionId: section.id,
      sectionTitle: section.title,
      text: section.content || '',
      selectedText: section.content || '',
      ...(typeof section.pageStart === 'number' ? { page: section.pageStart } : {}),
      ...(section.pageStart || section.pageEnd ? {
        pageStart: section.pageStart,
        pageEnd: section.pageEnd,
      } : {}),
    };
    const sourceRefs = [
      {
        documentId,
        page: section.pageStart,
        paragraphId: section.id,
        text: section.content || summary,
      },
    ].filter((sourceRef) => sourceRef.paragraphId || sourceRef.page || sourceRef.text);
    const content = {
      sectionId: section.id,
      sectionTitle: section.title,
      summary,
      keyPoints,
      sourceRefs,
      source,
    };

    try {
      const saved = await createArtifact({
        documentId,
        type: 'concept_card',
        goal: `Concept Card：${section.title}`,
        sourceSpanIds: [section.id].filter(Boolean),
        source,
        originalContent: content,
        currentContent: content,
        verificationStatus: section.content ? 'grounded' : 'ungrounded',
      });
      onArtifactCreated?.(saved);
      antMessage.success('已保存概念卡片');
    } catch (error) {
      console.error('[SummaryCard] Failed to save concept card:', error);
      antMessage.error(error?.message || '保存概念卡片失败');
    }
  }, [documentId, keyPoints, onArtifactCreated, section, summary]);

  const hasSummary = summary || keyPoints.length > 0;

  return (
    <Card
      size="small"
      style={{
        marginBottom: 12,
        borderRadius: 8,
        border: '1px solid var(--fill-quinary)',
        background: 'var(--material-background)',
      }}
      bodyStyle={{ padding: 12 }}
      title={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <DownOutlined style={{ fontSize: 12, color: 'var(--fill-tertiary)' }} />
          ) : (
            <RightOutlined style={{ fontSize: 12, color: 'var(--fill-tertiary)' }} />
          )}
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--fill-primary)' }}>
            {section.title}
          </span>
          {hasSummary && (
            <Tag color="blue" style={{ fontSize: 11, marginLeft: 'auto' }}>
              <BulbOutlined /> {keyPoints.length}
            </Tag>
          )}
        </div>
      }
    >
      {expanded && (
        <div>
          {!hasSummary && !generating && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span style={{ color: 'var(--fill-tertiary)', fontSize: 13 }}>
                    {t('ai-chat-summary-empty', null, 'No summary yet')}
                  </span>
                }
              />
              <Button
                type="primary"
                icon={<RobotOutlined />}
                onClick={handleGenerate}
                style={{ marginTop: 8 }}
                size="small"
              >
                {t('ai-chat-generate-summary', null, 'Generate Summary')}
              </Button>
            </div>
          )}

          {generating && (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <Spin size="small" />
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--fill-tertiary)' }}>
                {t('ai-chat-summary-generating', null, 'Generating summary...')}
              </div>
            </div>
          )}

          {hasSummary && !generating && (
            <div>
              {summary && (
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--fill-secondary)',
                    marginBottom: 12,
                    padding: 10,
                    background: 'var(--material-sidepane)',
                    borderRadius: 6,
                    borderLeft: '3px solid var(--accent-blue)',
                  }}
                >
                  {summary}
                </div>
              )}

              {keyPoints.length > 0 && (
                <ul
                  style={{
                    margin: '0 0 12px 0',
                    paddingLeft: 18,
                    fontSize: 13,
                    color: 'var(--fill-primary)',
                  }}
                >
                  {keyPoints.map((pt, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>
                      {pt}
                    </li>
                  ))}
                </ul>
              )}

              <Space>
                <Button
                  size="small"
                  icon={<RobotOutlined />}
                  onClick={handleGenerate}
                >
                  {t('ai-chat-regenerate', null, 'Regenerate')}
                </Button>
                <Button
                  size="small"
                  icon={<MessageOutlined />}
                  onClick={handleAskAboutSection}
                >
                  {t('ai-chat-ask-about', null, 'Ask AI')}
                </Button>
                <Button
                  size="small"
                  icon={<SaveOutlined />}
                  onClick={handleSaveConceptCard}
                >
                  保存概念卡片
                </Button>
              </Space>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
