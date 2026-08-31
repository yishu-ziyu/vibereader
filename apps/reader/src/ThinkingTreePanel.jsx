import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Empty, Progress, Spin, Tag } from 'antd';
import {
  BranchesOutlined,
  DownOutlined,
  FileTextOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { usePdfStore, useVibeStore } from './store';
import { groupParagraphsBySection } from './paragraphExtractor';
import { t } from './i18n';
import {
  expandTreeToParagraph,
  scrollTreeToNode,
} from './bidirectionalAnchor';
import {
  loadPersistentThinkingTree,
  savePersistentThinkingTree,
} from './services/persistentStorage';

const SUMMARY_MAX_LENGTH = 50;
const POINT_MAX_LENGTH = 20;
const POINT_LIMIT = 5;
const PAGE_MARKER_RE = /---\s*第\s*(\d+)\s*页\s*---/;

function truncateText(text, maxLength) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function summarizeParagraph(text) {
  const sentences = splitSentences(text);
  return truncateText(sentences[0] || text, SUMMARY_MAX_LENGTH);
}

function pointNodesForParagraph(paragraph) {
  const sentences = splitSentences(paragraph.text);
  const sourcePoints = sentences.slice(1, POINT_LIMIT + 1);
  const points = sourcePoints.length > 0 ? sourcePoints : sentences.slice(0, 1);
  return points.map((point, index) => ({
    id: `${paragraph.id}-point-${index}`,
    type: 'point',
    label: truncateText(point, POINT_MAX_LENGTH),
  }));
}

function splitTextIntoPageBlocks(pdfText) {
  const parts = String(pdfText || '').split(PAGE_MARKER_RE);
  if (parts.length === 1) return [{ page: 1, text: parts[0] }];

  const pages = [];
  if (parts[0].trim()) pages.push({ page: 1, text: parts[0] });
  for (let index = 1; index < parts.length; index += 2) {
    pages.push({ page: Number(parts[index]) || pages.length + 1, text: parts[index + 1] || '' });
  }
  return pages;
}

function extractParagraphsFromText(pdfText) {
  return splitTextIntoPageBlocks(pdfText).flatMap(({ page, text }) =>
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

function buildSectionNode(group, index) {
  return {
    id: `section-${group.sectionId || index}`,
    type: 'section',
    label: group.title || `Section ${index + 1}`,
    children: group.paragraphs.map((paragraph) => ({
      id: paragraph.id,
      type: 'paragraph',
      label: summarizeParagraph(paragraph.text),
      page: paragraph.page,
      paragraphId: paragraph.id,
      children: pointNodesForParagraph(paragraph),
    })),
  };
}

export function buildThinkingTree(pdfText, vibeData) {
  const paragraphs = extractParagraphsFromText(pdfText);
  const sections = vibeData?.sections || [];
  const groups = groupParagraphsBySection(paragraphs, sections);
  return {
    id: 'root',
    type: 'root',
    label: vibeData?.title || t('ai-chat-thinking-tree-root', null, 'Paper'),
    children: groups.map(buildSectionNode),
  };
}

function collectExpandableIds(node) {
  if (!node.children?.length) return [];
  return [node.id, ...node.children.flatMap(collectExpandableIds)];
}

function ThinkingTreeNode({ node, depth, expandedIds, onToggle, onParagraphClick }) {
  const hasChildren = (node.children || []).length > 0;
  const expanded = expandedIds.has(node.id);

  return (
    <div className="thinking-tree-node-wrap">
      <div className={`thinking-tree-node thinking-tree-node-${node.type}`} style={{ paddingLeft: 8 + depth * 16 }}>
        {hasChildren ? (
          <button
            type="button"
            className="thinking-tree-toggle"
            aria-label={`${expanded ? '折叠' : '展开'} ${node.label}`}
            onClick={() => onToggle(node.id)}
          >
            {expanded ? <DownOutlined /> : <RightOutlined />}
          </button>
        ) : (
          <span className="thinking-tree-toggle-spacer" />
        )}

        {node.type === 'paragraph' ? (
          <button
            type="button"
            className="thinking-tree-label-button"
            aria-label={node.label}
            data-tree-paragraph-id={node.paragraphId}
            data-paragraph-id={node.paragraphId}
            onClick={() => onParagraphClick(node)}
          >
            {node.label}
          </button>
        ) : (
          <span className="thinking-tree-label">{node.label}</span>
        )}

        {node.page && <span className="thinking-tree-page">P{node.page}</span>}
      </div>

      {hasChildren && expanded && (
        <div className="thinking-tree-children">
          {node.children.map((child) => (
            <ThinkingTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onParagraphClick={onParagraphClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ThinkingTreePanel({
  documentId,
  onAskAI,
  onNavigateToParagraph,
  activeParagraphId,
  title,
  generateLabel = '生成思维树',
  progressText = '正在生成段落级思维树...',
  style = {},
}) {
  const { pdfText, pdfParsing } = usePdfStore();
  const { vibeData } = useVibeStore();
  const [tree, setTree] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const treeContentRef = useRef(null);
  const panelTitle = title || t('ai-chat-thinking-tree-title', null, '思维树');

  useEffect(() => {
    let cancelled = false;

    setTree(null);
    setExpandedIds(new Set());

    if (!documentId || !pdfText) {
      return () => {
        cancelled = true;
      };
    }

    loadPersistentThinkingTree(documentId)
      .then((record) => {
        if (cancelled || !record?.treeJson) return;
        const persistedTree = JSON.parse(record.treeJson);
        setTree(persistedTree);
        setExpandedIds(new Set(collectExpandableIds(persistedTree)));
      })
      .catch((error) => {
        console.warn('[ThinkingTreePanel] Failed to load persisted tree:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, pdfText, vibeData]);

  // Expand tree and scroll to node when a paragraph is selected from PdfViewer
  useEffect(() => {
    if (!tree || !activeParagraphId) return;

    expandTreeToParagraph(activeParagraphId, setExpandedIds, tree.children);

    // Wait for React to render the expanded nodes before scrolling
    const timer = window.setTimeout(() => {
      if (treeContentRef.current) {
        scrollTreeToNode(activeParagraphId, treeContentRef.current);
      }
    }, 50);

    return () => window.clearTimeout(timer);
  }, [activeParagraphId, tree]);

  const handleGenerate = useCallback(async () => {
    if (!pdfText) return;
    setGenerating(true);
    setProgress(25);
    await Promise.resolve();
    const nextTree = buildThinkingTree(pdfText, vibeData);
    const defaultExpanded = new Set(collectExpandableIds(nextTree));
    setTree(nextTree);
    setExpandedIds(defaultExpanded);
    if (documentId) {
      savePersistentThinkingTree(documentId, nextTree).catch((error) => {
        console.warn('[ThinkingTreePanel] Failed to persist tree:', error);
      });
    }
    setProgress(100);
    setGenerating(false);
  }, [documentId, pdfText, vibeData]);

  const handleToggle = useCallback((nodeId) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const handleParagraphClick = useCallback(
    (node) => {
      if (onNavigateToParagraph) onNavigateToParagraph(node.paragraphId);
    },
    [onNavigateToParagraph]
  );

  const renderHeader = () => (
    <div className="thinking-tree-header">
      <div className="thinking-tree-title">
        <BranchesOutlined />
        <span>{panelTitle}</span>
      </div>
      {tree && <Tag>{tree.children.length} sections</Tag>}
    </div>
  );

  if (pdfParsing) {
    return (
      <div className="thinking-tree-panel" style={style}>
        {renderHeader()}
        <div className="thinking-tree-empty">
          <Spin size="small" />
          <div className="thinking-tree-muted">{t('ai-chat-pdf-parsing')}</div>
        </div>
      </div>
    );
  }

  if (!pdfText) {
    return (
      <div className="thinking-tree-panel" style={style}>
        {renderHeader()}
        <div className="thinking-tree-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ai-chat-no-pdf-context')} />
        </div>
      </div>
    );
  }

  return (
    <div className="thinking-tree-panel" style={style}>
      {renderHeader()}

      {!tree && !generating && (
        <div className="thinking-tree-generate">
          <FileTextOutlined className="thinking-tree-generate-icon" />
          <Button type="primary" icon={<BranchesOutlined />} onClick={handleGenerate}>
            {generateLabel}
          </Button>
        </div>
      )}

      {generating && (
        <div className="thinking-tree-progress">
          <Spin size="small" />
          <div className="thinking-tree-muted">{progressText}</div>
          <Progress percent={progress} size="small" showInfo={false} />
        </div>
      )}

      {tree && (
        <div ref={treeContentRef} className="thinking-tree-content">
          <ThinkingTreeNode
            node={tree}
            depth={0}
            expandedIds={expandedIds}
            onToggle={handleToggle}
            onParagraphClick={handleParagraphClick}
          />
        </div>
      )}
    </div>
  );
}

export default ThinkingTreePanel;
