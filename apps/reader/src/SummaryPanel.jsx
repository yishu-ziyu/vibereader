import React, { useMemo, useCallback } from 'react';
import { Button, Empty, Spin, Tag } from 'antd';
import { FileTextOutlined, RobotOutlined } from '@ant-design/icons';
import { SummaryCard } from './SummaryCard';
import { usePdfStore } from './store';
import { t } from './i18n';

/**
 * Simple section extractor: splits PDF text by common academic headings.
 * This is a heuristic parser — real implementation could use AI or PDF structure.
 */
function extractSections(pdfText) {
  if (!pdfText) return [];

  // Common academic section patterns (English + Chinese)
  const sectionRegex =
    /(?:^|\n)\s*(?:\d+\.\s*)?(Abstract|Introduction|Related Work|Background|Methodology|Methods?|Experiments?|Results?|Discussion|Conclusion|References|附录|摘要|引言|相关工作|背景|方法|实验|结果|讨论|结论|参考文献)\s*(?:\n|:)/gim;

  const sections = [];
  let match;
  const indices = [];

  while ((match = sectionRegex.exec(pdfText)) !== null) {
    indices.push({ title: match[1].trim(), index: match.index });
  }

  if (indices.length === 0) {
    // Fallback: split into chunks
    const chunks = pdfText
      .split(/\n{2,}/)
      .filter((c) => c.trim().length > 50);
    return chunks.slice(0, 8).map((content, i) => ({
      id: `section-${i}`,
      title: `Part ${i + 1}`,
      content: content.trim(),
    }));
  }

  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].index;
    const end = i < indices.length - 1 ? indices[i + 1].index : pdfText.length;
    sections.push({
      id: `section-${i}`,
      title: indices[i].title,
      content: pdfText.slice(start, end).trim(),
    });
  }

  return sections;
}

/**
 * SummaryPanel — Sidebar panel showing a grid/list of SummaryCards.
 *
 * Props:
 *   - documentId: current document id for persisted summaries
 *   - onAskAI: (question: string) => void
 *   - onArtifactCreated: (artifact) => void
 *   - style: CSS style object
 */
export function SummaryPanel({ documentId, onAskAI, onArtifactCreated, style = {} }) {
  const { pdfText, pdfPages, pdfParsing } = usePdfStore();

  const sections = useMemo(() => extractSections(pdfText), [pdfText]);

  const handleAskAI = useCallback(
    (question) => {
      if (onAskAI) onAskAI(question);
    },
    [onAskAI]
  );

  if (pdfParsing) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 24,
          ...style,
        }}
      >
        <Spin size="small" />
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--fill-tertiary)' }}>
          {t('ai-chat-pdf-parsing')}
        </div>
      </div>
    );
  }

  if (!pdfText) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 24,
          ...style,
        }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span style={{ color: 'var(--fill-tertiary)', fontSize: 13 }}>
              {t('ai-chat-no-pdf-context')}
            </span>
          }
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--material-sidepane)',
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--fill-quinary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileTextOutlined style={{ color: 'var(--accent-blue)' }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--fill-primary)' }}>
            {t('ai-chat-summary-panel-title', null, 'Paper Summary')}
          </span>
        </div>
        <Tag size="small" style={{ fontSize: 11 }}>
          {sections.length} {t('ai-chat-sections', null, 'sections')}
        </Tag>
      </div>

      {/* Cards list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
        }}
      >
        {sections.map((section, idx) => (
          <SummaryCard
            key={section.id}
            documentId={documentId}
            section={section}
            onAskAI={handleAskAI}
            onArtifactCreated={onArtifactCreated}
            defaultExpanded={idx === 0}
          />
        ))}

        {sections.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span style={{ color: 'var(--fill-tertiary)', fontSize: 13 }}>
                {t('ai-chat-no-sections-found', null, 'No sections detected')}
              </span>
            }
          />
        )}
      </div>
    </div>
  );
}
