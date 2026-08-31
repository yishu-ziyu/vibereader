import React, { useMemo, useState, useCallback } from 'react';
import { Button, Empty, Tag, Tooltip } from 'antd';
import {
  FileTextOutlined,
  MessageOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { usePdfStore } from './store';
import { t } from './i18n';

/* ------------------------------------------------------------------ */
/*  Simple top-down tree layout with SVG                              */
/* ------------------------------------------------------------------ */

const NODE_W = 140;
const NODE_H = 44;
const LEVEL_GAP = 100;
const SIBLING_GAP = 24;

function layoutTree(nodes) {
  // Assign levels
  const root = nodes[0];
  const byParent = new Map();
  nodes.forEach((n) => {
    if (!byParent.has(n.parentId)) byParent.set(n.parentId, []);
    byParent.get(n.parentId).push(n);
  });

  function setLevel(node, lvl) {
    node.level = lvl;
    const kids = byParent.get(node.id) || [];
    kids.forEach((k) => setLevel(k, lvl + 1));
  }
  setLevel(root, 0);

  // Compute subtree widths (post-order)
  function subtreeWidth(node) {
    const kids = byParent.get(node.id) || [];
    if (kids.length === 0) {
      node.width = NODE_W + SIBLING_GAP;
      return node.width;
    }
    let w = 0;
    kids.forEach((k) => {
      w += subtreeWidth(k);
    });
    node.width = w;
    return w;
  }
  subtreeWidth(root);

  // Assign x (in-order), y by level
  function assignX(node, startX) {
    const kids = byParent.get(node.id) || [];
    if (kids.length === 0) {
      node.x = startX + node.width / 2;
    } else {
      let cx = startX;
      kids.forEach((k) => {
        assignX(k, cx);
        cx += k.width;
      });
      const first = kids[0];
      const last = kids[kids.length - 1];
      node.x = (first.x + last.x) / 2;
    }
    node.y = node.level * LEVEL_GAP + NODE_H / 2 + 20;
  }
  assignX(root, 0);

  // Center everything
  const allX = nodes.map((n) => n.x);
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const offsetX = (maxX - minX) / 2 + minX;

  nodes.forEach((n) => {
    n.x -= offsetX;
  });

  return { width: maxX - minX + NODE_W + 40, height: root.level * LEVEL_GAP + NODE_H + 40 };
}

/* ------------------------------------------------------------------ */
/*  Section extractor (same heuristic as SummaryPanel)                */
/* ------------------------------------------------------------------ */

function extractSections(pdfText) {
  if (!pdfText) return [];
  const sectionRegex =
    /(?:^|\n)\s*(?:\d+\.\s*)?(Abstract|Introduction|Related Work|Background|Methodology|Methods?|Experiments?|Results?|Discussion|Conclusion|References|附录|摘要|引言|相关工作|背景|方法|实验|结果|讨论|结论|参考文献)\s*(?:\n|:)/gim;

  const titles = [];
  let m;
  while ((m = sectionRegex.exec(pdfText)) !== null) {
    titles.push(m[1].trim());
  }
  if (titles.length === 0) {
    // fallback chunks
    const chunks = pdfText.split(/\n{2,}/).filter((c) => c.trim().length > 50);
    return chunks.slice(0, 6).map((_, i) => `Part ${i + 1}`);
  }
  return titles;
}

/* ------------------------------------------------------------------ */
/*  MindMap component                                                  */
/* ------------------------------------------------------------------ */

export function MindMap({ onAskAI, style = {} }) {
  const { pdfText, pdfParsing } = usePdfStore();
  const [zoom, setZoom] = useState(1);
  const [hoveredId, setHoveredId] = useState(null);

  const { nodes, svgWidth, svgHeight } = useMemo(() => {
    if (!pdfText) return { nodes: [], svgWidth: 0, svgHeight: 0 };

    const sections = extractSections(pdfText);
    const title = 'Paper'; // Could extract real title from first line

    const allNodes = [
      { id: 'root', label: title, parentId: null, type: 'root' },
      ...sections.map((s, i) => ({
        id: `l1-${i}`,
        label: s,
        parentId: 'root',
        type: 'level1',
      })),
    ];

    // Add some dummy level-2 nodes for visual richness
    sections.forEach((s, i) => {
      const parentId = `l1-${i}`;
      allNodes.push({
        id: `${parentId}-a`,
        label: 'Key Concept',
        parentId,
        type: 'level2',
      });
      if (i % 2 === 0) {
        allNodes.push({
          id: `${parentId}-b`,
          label: 'Detail',
          parentId,
          type: 'level2',
        });
      }
    });

    const { width, height } = layoutTree(allNodes);
    return { nodes: allNodes, svgWidth: width, svgHeight: height };
  }, [pdfText]);

  const handleNodeClick = useCallback(
    (node) => {
      if (onAskAI && node.type !== 'root') {
        onAskAI(`请解释「${node.label}」在论文中的作用和含义。`);
      }
    },
    [onAskAI]
  );

  const getNodeColor = (type) => {
    switch (type) {
      case 'root':
        return { fill: 'var(--accent-blue)', stroke: 'var(--accent-blue)', text: '#fff' };
      case 'level1':
        return { fill: 'var(--material-background)', stroke: 'var(--accent-blue)', text: 'var(--fill-primary)' };
      default:
        return { fill: 'var(--material-sidepane)', stroke: 'var(--fill-quaternary)', text: 'var(--fill-secondary)' };
    }
  };

  if (!pdfText) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
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
            {t('ai-chat-mindmap-title', null, 'Mind Map')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button
            type="text"
            size="small"
            icon={<ZoomOutOutlined />}
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
          />
          <Tag size="small" style={{ fontSize: 11 }}>{Math.round(zoom * 100)}%</Tag>
          <Button
            type="text"
            size="small"
            icon={<ZoomInOutlined />}
            onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          />
        </div>
      </div>

      {/* SVG Canvas */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <svg
          width={Math.max(svgWidth * zoom, 400)}
          height={Math.max(svgHeight * zoom, 300)}
          style={{ display: 'block', margin: '0 auto' }}
        >
          <g transform={`translate(${Math.max(svgWidth * zoom, 400) / 2}, 0) scale(${zoom})`}>
            {/* Edges */}
            {nodes.map((node) => {
              if (!node.parentId) return null;
              const parent = nodes.find((n) => n.id === node.parentId);
              if (!parent) return null;
              return (
                <line
                  key={`edge-${node.id}`}
                  x1={parent.x}
                  y1={parent.y + NODE_H / 2}
                  x2={node.x}
                  y2={node.y - NODE_H / 2}
                  stroke="var(--fill-quaternary)"
                  strokeWidth={1.5}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const colors = getNodeColor(node.type);
              const isHovered = hoveredId === node.id;
              const rx = node.type === 'root' ? 22 : 6;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x - NODE_W / 2}, ${node.y - NODE_H / 2})`}
                  style={{ cursor: node.type === 'root' ? 'default' : 'pointer' }}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => handleNodeClick(node)}
                >
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={rx}
                    ry={rx}
                    fill={colors.fill}
                    stroke={isHovered ? 'var(--accent-blue)' : colors.stroke}
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    style={{
                      filter: isHovered ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  />
                  <text
                    x={NODE_W / 2}
                    y={NODE_H / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={colors.text}
                    fontSize={node.type === 'root' ? 13 : node.type === 'level1' ? 12 : 11}
                    fontWeight={node.type === 'root' || node.type === 'level1' ? 600 : 400}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {node.label.length > 16
                      ? node.label.slice(0, 15) + '…'
                      : node.label}
                  </text>

                  {/* Ask icon on hover for non-root nodes */}
                  {isHovered && node.type !== 'root' && (
                    <g transform={`translate(${NODE_W - 18}, ${NODE_H / 2 - 6})`}>
                      <circle r={7} fill="var(--accent-blue)" />
                      <text
                        x={0}
                        y={1}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#fff"
                        fontSize={8}
                      >
                        ?
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Footer hint */}
      <div
        style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--fill-quinary)',
          fontSize: 12,
          color: 'var(--fill-tertiary)',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {t('ai-chat-mindmap-hint', null, 'Click a node to ask AI about it')}
      </div>
    </div>
  );
}
