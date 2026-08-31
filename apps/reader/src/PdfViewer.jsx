import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Empty, Spin, Tooltip, Input, message as antMessage } from 'antd';
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  ColumnWidthOutlined,
  LeftOutlined,
  RightOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import * as pdfjsLib from 'pdfjs-dist';
import { usePdfStore } from './store';
import { useProgressStore } from './store/progressStore';
import { AgentProgressPanel } from './AgentProgressPanel';
import { PdfAnnotationToolbar } from './PdfAnnotationToolbar';
import { createAnnotation, listAnnotationsForDocument } from './services/annotationService';
import { recognizeCurrentPdfPage } from './services/ocrService';
import {
  loadPersistentReadingPosition,
  savePersistentReadingPosition,
} from './services/persistentStorage';
import { flattenPdfOutline, resolveOutlinePageNumber } from './pdfOutline';
import { configurePdfWorker } from './pdfWorker';
import {
  didPointerDrag,
  denormalizePageRects,
  isInsidePdfAnnotationToolbar,
  isSelectionInsidePdfTextLayer,
  normalizePageRects,
} from './pdfSelection';
import { t } from './i18n';
import { createDragInjectPayload, writeDragInjectData } from './dragInject';
import { extractParagraphsFromPage } from './paragraphExtractor';

configurePdfWorker(pdfjsLib);

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.25;
const FIT_WIDTH_ZOOM = 'fit-width';
// 稳定的空数组默认值：避免每次渲染新建引用导致渲染 effect 无限重跑
const EMPTY_INSIGHTS = [];

function copyPdfData(data) {
  if (data instanceof Uint8Array) return data.slice();
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  return data;
}

function getParagraphPage(paragraphId) {
  const match = String(paragraphId || '').match(/^page-(\d+)-para-\d+$/);
  return match ? Number(match[1]) : null;
}

function computeScrollRatio(element) {
  if (!element) return 0;
  const max = element.scrollHeight - element.clientHeight;
  if (max <= 0) return 0;
  const ratio = element.scrollTop / max;
  return Math.min(1, Math.max(0, ratio));
}

function getTextItemY(item) {
  const transform = Array.isArray(item?.transform) ? item.transform : [];
  return Number(transform[5]) || 0;
}

function findParagraphIdForItem(item, paragraphs) {
  if (!paragraphs.length) return null;
  const y = getTextItemY(item);
  const sorted = [...paragraphs].sort((a, b) => b.y - a.y);
  if (y >= sorted[0].y) return sorted[0].id;

  for (let index = 0; index < sorted.length; index += 1) {
    const next = sorted[index + 1];
    if (y <= sorted[index].y && (!next || y > next.y)) return sorted[index].id;
  }
  return sorted[sorted.length - 1].id;
}

function hashText(text = '') {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function createSelectionSpanId(documentId, page, rect, text) {
  const left = Math.round(rect?.left || 0);
  const top = Math.round(rect?.top || 0);
  return `${documentId || 'current-pdf'}:p${page}:sel-${top}-${left}-${hashText(text)}`;
}

function appendOcrSpan(textLayerDiv, sourceSpan) {
  const el = document.createElement('span');
  el.textContent = sourceSpan.text;
  el.setAttribute('data-source', 'ocr');
  el.setAttribute('data-span-id', sourceSpan.spanId);
  el.setAttribute('data-confidence', String(sourceSpan.confidence ?? ''));
  el.style.position = 'absolute';
  el.style.left = `${sourceSpan.bbox.left}px`;
  el.style.top = `${sourceSpan.bbox.top}px`;
  el.style.width = `${sourceSpan.bbox.width}px`;
  el.style.height = `${sourceSpan.bbox.height}px`;
  el.style.display = 'inline-flex';
  el.style.alignItems = 'center';
  el.style.overflow = 'hidden';
  el.style.fontSize = `${Math.max(8, sourceSpan.bbox.height * 0.72)}px`;
  el.style.lineHeight = `${sourceSpan.bbox.height}px`;
  el.style.whiteSpace = 'pre';
  el.style.userSelect = 'text';
  el.style.cursor = 'text';
  el.style.color = 'transparent';
  textLayerDiv.appendChild(el);
}

/**
 * PdfViewer - Visual PDF renderer using pdf.js with TextLayer support.
 *
 * Features:
 *   - Renders PDF pages visually on canvas
 *   - TextLayer for selectable text
 *   - Page navigation (prev/next/jump)
 *   - Zoom controls (in/out/reset/fit-width)
 *   - Floating "Inject as Context" button on text selection
 *
 * Props:
 *   - onInject: (text: string) => void — called when user clicks inject button
 *   - documentId: string — used for annotation persistence
 *   - onGenerateLensCard: (selection) => void — called when user saves a Lens Card
 *   - onPageChange: (page: number) => void — called when the visible page changes
 *   - style: CSS style object
 */
export function PdfViewer({ onInject, onGenerateLensCard, onPageChange, documentId = 'current-pdf', insights = EMPTY_INSIGHTS, style = {} }) {
  const { pdfFile, pdfText, pdfParsing, pdfPages } = usePdfStore();

  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(FIT_WIDTH_ZOOM);
  const [pageLoading, setPageLoading] = useState(false);
  const [selection, setSelection] = useState(null); // { text, x, y, rect }
  const [outlineItems, setOutlineItems] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [sourceHighlight, setSourceHighlight] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageBoxSize, setPageBoxSize] = useState({ width: 0, height: 0 });
  const [pageTextLayerInfo, setPageTextLayerInfo] = useState({ page: null, textItemCount: 0 });
  const [ocrSpansByPage, setOcrSpansByPage] = useState({});
  const [ocrStatusByPage, setOcrStatusByPage] = useState({});

  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const highlightLayerRef = useRef(null);
  const attentionMarkerLayerRef = useRef(null);
  const containerRef = useRef(null);
  const pageScrollRef = useRef(null);
  const renderTaskRef = useRef(null);
  const pendingParagraphIdRef = useRef(null);
  const textPointerStartRef = useRef(null);
  const textPointerDraggedRef = useRef(false);
  // 阅读位置记忆（PageFlow 式）：恢复完成前不写位置，避免用初始值覆盖已保存位置
  const saveGateRef = useRef(false);
  const pendingScrollRatioRef = useRef(null);
  const restoredForDocRef = useRef(null);

  const highlightParagraph = useCallback((paragraphId) => {
    const textLayer = textLayerRef.current;
    if (!paragraphId || !textLayer) return false;
    const spans = textLayer.querySelectorAll(`[data-paragraph-id="${paragraphId}"]`);
    if (spans.length === 0) return false;

    spans[0].scrollIntoView({ block: 'center', inline: 'nearest' });
    spans.forEach((span) => span.classList.add('paragraph-pulse-highlight'));
    window.setTimeout(() => {
      spans.forEach((span) => span.classList.remove('paragraph-pulse-highlight'));
    }, 3000);
    return true;
  }, []);

  // Load PDF document when pdfFile changes
  useEffect(() => {
    if (!pdfFile) {
      setPdfDoc(null);
      return;
    }
    // 审查修复（I3）：每次文档加载都重置恢复标记与写入闸门。否则同一文档
    // 二次打开（pdfDoc 重载但 documentId 未变）会跳过恢复，并把重置后的
    // 初始位置（page 1）写回槽位，覆盖已保存的阅读位置。
    restoredForDocRef.current = null;
    saveGateRef.current = false;
    pendingScrollRatioRef.current = null;
    let cancelled = false;
    const load = async () => {
      try {
        const pdf = await pdfjsLib.getDocument({ data: copyPdfData(pdfFile) }).promise;
        if (!cancelled) {
          setPdfDoc(pdf);
          setCurrentPage(1);
          setZoom(FIT_WIDTH_ZOOM);
        }
      } catch (err) {
        console.error('[PdfViewer] Failed to load PDF:', err);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [pdfFile]);

  useEffect(() => {
    if (!pdfDoc) {
      setOutlineItems([]);
      return;
    }

    let cancelled = false;
    const loadOutline = async () => {
      try {
        const outline = await pdfDoc.getOutline();
        if (!cancelled) setOutlineItems(flattenPdfOutline(outline || []));
      } catch (error) {
        console.warn('[PdfViewer] Failed to load outline:', error);
        if (!cancelled) setOutlineItems([]);
      }
    };
    loadOutline();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);

  // Reset visual/page states immediately when documentId changes to isolate documents completely
  useEffect(() => {
    setPdfDoc(null);
    setCurrentPage(1);
    setZoom(FIT_WIDTH_ZOOM);
    setSelection(null);
    setOutlineItems([]);
    setAnnotations([]);
    setSourceHighlight(null);
    setPageBoxSize({ width: 0, height: 0 });
    setPageTextLayerInfo({ page: null, textItemCount: 0 });
    setOcrSpansByPage({});
    setOcrStatusByPage({});
    // 切换文档时先关闭位置写入，等恢复流程完成后再开启
    saveGateRef.current = false;
    pendingScrollRatioRef.current = null;
  }, [documentId]);

  // 恢复上次阅读位置：pdfDoc 就绪后应用页码/缩放，页面渲染完成后应用滚动比例
  useEffect(() => {
    if (!pdfDoc || !documentId) return undefined;
    if (restoredForDocRef.current === documentId) return undefined;
    restoredForDocRef.current = documentId;
    let cancelled = false;
    loadPersistentReadingPosition(documentId)
      .then((position) => {
        if (cancelled) return;
        // 审查修复（I2）：位置槽位按 variant 区分阅读器。PdfViewer 只认 'pdf'
        // （历史数据无 variant，视为 'pdf' 保持兼容），避免读到文本模式覆盖的
        // {page:1, scrollRatio} 把页级记忆打回第 1 页。
        const pdfPosition = position && typeof position === 'object'
          && (position.variant == null || position.variant === 'pdf')
          ? position
          : null;
        if (pdfPosition) {
          const savedPage = Number(pdfPosition.page);
          const hasSavedPage = Number.isFinite(savedPage) && savedPage >= 1 && savedPage <= pdfDoc.numPages;
          const savedRatio = Number(pdfPosition.scrollRatio);
          const hasSavedRatio = Number.isFinite(savedRatio) && savedRatio > 0;
          if (hasSavedPage) setCurrentPage(savedPage);
          if (typeof pdfPosition.zoom === 'number'
            && pdfPosition.zoom >= MIN_ZOOM && pdfPosition.zoom <= MAX_ZOOM) {
            setZoom(pdfPosition.zoom);
          }
          if (hasSavedRatio) {
            pendingScrollRatioRef.current = Math.min(1, savedRatio);
          }
          if (hasSavedPage || hasSavedRatio) {
            antMessage.success('已恢复到上次阅读位置');
          }
        }
        // 恢复尝试结束（无论是否有保存位置）后才允许写入，避免初始化覆盖保存值
        saveGateRef.current = true;
      })
      .catch(() => {
        saveGateRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, documentId]);

  // 保存阅读位置：{variant:'pdf', page, scrollRatio, zoom, updatedAt}
  const saveReadingPosition = useCallback(() => {
    if (!saveGateRef.current || !documentId) return;
    savePersistentReadingPosition(documentId, {
      variant: 'pdf',
      page: currentPage,
      scrollRatio: computeScrollRatio(pageScrollRef.current),
      zoom,
      updatedAt: Date.now(),
    }).catch(() => {});
  }, [documentId, currentPage, zoom]);

  // 页码/缩放变化时保存（saveReadingPosition 随两者重建）
  useEffect(() => {
    saveReadingPosition();
  }, [saveReadingPosition]);

  // 滚动时防抖保存（500ms）
  useEffect(() => {
    const element = pageScrollRef.current;
    if (!element || !pdfDoc) return undefined;
    let timer = null;
    const handleScroll = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        saveReadingPosition();
      }, 500);
    };
    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (timer) window.clearTimeout(timer);
    };
  }, [pdfDoc, saveReadingPosition]);

  // 页面渲染尺寸就绪后应用待恢复的滚动比例
  useEffect(() => {
    const ratio = pendingScrollRatioRef.current;
    if (ratio == null) return;
    const element = pageScrollRef.current;
    if (!element) return;
    const max = element.scrollHeight - element.clientHeight;
    if (max <= 0) return;
    element.scrollTop = ratio * max;
    pendingScrollRatioRef.current = null;
  }, [pageBoxSize]);

  useEffect(() => {
    const element = pageScrollRef.current || containerRef.current;
    if (!element) return undefined;

    const measure = () => {
      setContainerWidth(Math.round(element.clientWidth || 0));
    };
    measure();

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [pdfDoc]);

  useEffect(() => {
    onPageChange?.(currentPage);
  }, [currentPage, onPageChange]);

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    listAnnotationsForDocument(documentId).then((items) => {
      if (!cancelled) setAnnotations(items);
    });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc) return;

    let cancelled = false;
    const render = async () => {
      setPageLoading(true);
      try {
        const page = await pdfDoc.getPage(currentPage);
        const scrollArea = pageScrollRef.current;
        const availableWidth = Math.max(240, (containerWidth || scrollArea?.clientWidth || 800) - 32);

        // Calculate scale
        let scale = zoom;
        if (zoom === FIT_WIDTH_ZOOM) {
          const viewportUnscaled = page.getViewport({ scale: 1 });
          scale = availableWidth / viewportUnscaled.width;
        }

        const viewport = page.getViewport({ scale });
        // 内容不变时保留旧对象，避免每次渲染都触发依赖 pageBoxSize 的 effect
        setPageBoxSize((prev) => (
          prev.width === Math.ceil(viewport.width) && prev.height === Math.ceil(viewport.height)
            ? prev
            : { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) }
        ));

        const textContent = await page.getTextContent();
        const textItems = textContent.items;
        setPageTextLayerInfo((prev) => (
          prev.page === currentPage && prev.textItemCount === textItems.length
            ? prev
            : { page: currentPage, textItemCount: textItems.length }
        ));

        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        // Cancel previous render
        if (typeof renderTaskRef.current?.cancel === 'function') {
          renderTaskRef.current.cancel();
        }

        const renderTask = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        renderTaskRef.current = null;

        if (cancelled) return;

        // Build text layer
        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;
          textLayerDiv.style.maxWidth = `${viewport.width}px`;
          textLayerDiv.style.maxHeight = `${viewport.height}px`;

          const paragraphs = extractParagraphsFromPage(textContent, currentPage);

          textItems.forEach((item) => {
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const fontHeight = Math.hypot(tx[0], tx[1]);
            const fontWidth = Math.hypot(tx[2], tx[3]);
            const targetTextWidth = Math.max(0, (Number(item.width) || 0) * (Number(viewport.scale) || 1));
            const baseTextWidth = fontWidth || targetTextWidth;
            const textScaleX = baseTextWidth ? targetTextWidth / baseTextWidth : 1;
            const paragraphId = findParagraphIdForItem(item, paragraphs);

            const el = document.createElement('span');
            el.textContent = item.str;
            if (paragraphId) {
              el.setAttribute('data-paragraph-id', paragraphId);
              el.addEventListener('click', (event) => {
                event.stopPropagation();
                const activeSelection = window.getSelection()?.toString().trim();
                if (textPointerDraggedRef.current || activeSelection) {
                  textPointerDraggedRef.current = false;
                  return;
                }
                window.dispatchEvent(new CustomEvent('vibereader:select-paragraph', {
                  detail: { paragraphId },
                }));
              });
            }
            el.style.position = 'absolute';
            el.style.left = `${tx[4]}px`;
            el.style.top = `${tx[5] - fontHeight}px`;
            el.style.fontSize = `${fontHeight}px`;
            el.style.fontFamily = item.fontName || 'sans-serif';
            el.style.display = 'inline-block';
            el.style.width = `${baseTextWidth}px`;
            el.style.overflow = 'hidden';
            el.style.transform = `scaleX(${textScaleX})`;
            el.style.transformOrigin = '0 0';
            el.style.whiteSpace = 'pre';
            el.style.userSelect = 'text';
            el.style.cursor = 'text';
            el.style.color = 'transparent';
            textLayerDiv.appendChild(el);
          });

          (ocrSpansByPage[currentPage] || []).forEach((sourceSpan) => {
            appendOcrSpan(textLayerDiv, sourceSpan);
          });

          const pendingParagraphId = pendingParagraphIdRef.current;
          if (getParagraphPage(pendingParagraphId) === currentPage) {
            window.setTimeout(() => {
              if (highlightParagraph(pendingParagraphId)) pendingParagraphIdRef.current = null;
            }, 0);
          }

          // Render attention markers for the current page
          const markerLayer = attentionMarkerLayerRef.current;
          if (markerLayer && textLayerRef.current) {
            markerLayer.innerHTML = '';
            const pageInsights = (insights || []).filter((i) => i.location?.page === currentPage);
            pageInsights.forEach((insight) => {
              const spans = textLayerRef.current.querySelectorAll(
                `[data-paragraph-id="${insight.paragraphId}"]`
              );
              if (spans.length === 0) return;

              const firstSpan = spans[0];
              const spanRect = firstSpan.getBoundingClientRect();
              const layerRect = textLayerRef.current.getBoundingClientRect();
              const top = spanRect.top - layerRect.top;

              const marker = document.createElement('div');
              marker.className = 'pdf-attention-marker';
              marker.style.top = `${top}px`;
              marker.style.right = '4px';
              marker.style.backgroundColor = insight.typeColor || '#999';
              marker.title = `${insight.typeLabel || insight.type}: ${insight.description}`;
              marker.addEventListener('click', () => {
                window.dispatchEvent(
                  new CustomEvent('vibereader:navigate-paragraph', {
                    detail: { paragraphId: insight.paragraphId },
                  })
                );
              });

              const label = document.createElement('span');
              label.className = 'pdf-attention-marker-label';
              label.textContent = insight.typeLabel || insight.type;
              marker.appendChild(label);

              markerLayer.appendChild(marker);
            });
          }
        }
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('[PdfViewer] Render error:', err);
        }
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    };

    render();
    return () => {
      cancelled = true;
      if (typeof renderTaskRef.current?.cancel === 'function') {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, currentPage, zoom, containerWidth, highlightParagraph, insights]);

  // Render annotation highlights on the current page
  useEffect(() => {
    if (!highlightLayerRef.current || !textLayerRef.current) return;

    const layer = highlightLayerRef.current;
    layer.innerHTML = '';

    const pageAnnotations = annotations.filter((a) => a.page === currentPage && a.rect);
    const pageSourceHighlight =
      sourceHighlight?.page === currentPage
        && (sourceHighlight.rect || (Array.isArray(sourceHighlight.rects) && sourceHighlight.rects.length > 0))
        ? sourceHighlight
        : null;
    if (pageAnnotations.length === 0 && !pageSourceHighlight) return;

    const { width, height } = textLayerRef.current.getBoundingClientRect();
    layer.style.width = `${width}px`;
    layer.style.height = `${height}px`;

    pageAnnotations.forEach((annotation) => {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.left = `${annotation.rect.left}px`;
      el.style.top = `${annotation.rect.top}px`;
      el.style.width = `${annotation.rect.width}px`;
      el.style.height = `${annotation.rect.height}px`;
      el.style.backgroundColor =
        annotation.color === 'yellow' ? 'rgba(255, 235, 59, 0.4)' : 'rgba(33, 150, 243, 0.3)';
      el.style.borderRadius = '2px';
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.title = annotation.note || annotation.selectedText;
      el.addEventListener('click', () => {
        antMessage.info(annotation.note || annotation.selectedText);
      });
      layer.appendChild(el);
    });

    if (pageSourceHighlight) {
      const sourceRects = Array.isArray(pageSourceHighlight.rects) && pageSourceHighlight.rects.length > 0
        ? pageSourceHighlight.rects
        : [pageSourceHighlight.rect];
      const renderedSourceRects = pageSourceHighlight.coordinateSpace === 'page-normalized'
        ? denormalizePageRects(sourceRects, { width, height })
        : sourceRects;

      renderedSourceRects.forEach((rect) => {
        if (!rect?.width || !rect?.height) return;
      const el = document.createElement('div');
        el.setAttribute('data-testid', 'pdf-source-highlight');
      el.style.position = 'absolute';
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
      el.style.backgroundColor = 'rgba(244, 215, 88, 0.28)';
      el.style.border = '2px solid var(--accent-blue, #2B7FD8)';
      el.style.borderRadius = '3px';
      el.style.pointerEvents = 'none';
      layer.appendChild(el);
      });
    }
  }, [annotations, currentPage, sourceHighlight]);

  // Listen for text selection to show floating inject button
  useEffect(() => {
    const handleSelectionChange = () => {
      if (isInsidePdfAnnotationToolbar(document.activeElement)) {
        return;
      }

      const sel = window.getSelection();
      const text = sel.toString().trim();
      const textLayer = textLayerRef.current;
      const scrollArea = pageScrollRef.current;
      if (text && textLayer && scrollArea && isSelectionInsidePdfTextLayer(sel, textLayer)) {
        const range = sel.getRangeAt(0);
        const visibleRects = [...range.getClientRects()].filter((item) => item.width > 0 && item.height > 0);
        const visibleRect = visibleRects[0];
        const rect = visibleRect || range.getBoundingClientRect();
        if (!rect.width && !rect.height) {
          setSelection(null);
          return;
        }

        const scrollRect = scrollArea.getBoundingClientRect();
        const textLayerRect = textLayer.getBoundingClientRect();
        const pixelRects = (visibleRects.length > 0 ? visibleRects : [rect]).map((item) => ({
          left: item.left - textLayerRect.left,
          top: item.top - textLayerRect.top,
          width: item.width,
          height: item.height,
        }));
        const sourceRects = normalizePageRects(pixelRects, {
          width: textLayerRect.width,
          height: textLayerRect.height,
        });
        setSelection({
          documentId,
          text,
          page: currentPage,
          spanId: createSelectionSpanId(documentId, currentPage, {
            left: rect.left - textLayerRect.left,
            top: rect.top - textLayerRect.top,
          }, text),
          sourceType: 'pdf-selection',
          x: rect.left - scrollRect.left + scrollArea.scrollLeft + rect.width / 2,
          y: rect.bottom - scrollRect.top + scrollArea.scrollTop + 10,
          rect: {
            left: rect.left - textLayerRect.left,
            top: rect.top - textLayerRect.top,
            width: rect.width,
            height: rect.height,
          },
          sourceRect: sourceRects[0] || null,
          sourceRects,
          coordinateSpace: 'page-normalized',
        });
      } else {
        setSelection(null);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [currentPage, documentId]);

  const goToPage = useCallback(
    (page) => {
      if (!pdfDoc) return;
      const target = Math.max(1, Math.min(page, pdfDoc.numPages));
      setCurrentPage(target);
      setSelection(null);
    },
    [pdfDoc]
  );

  const goPrev = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);
  const goNext = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);

  useEffect(() => {
    const handleNavigateParagraph = (event) => {
      const paragraphId = event.detail?.paragraphId;
      const page = getParagraphPage(paragraphId);
      if (!paragraphId || !page) return;

      pendingParagraphIdRef.current = paragraphId;
      if (page !== currentPage) {
        goToPage(page);
      } else {
        window.setTimeout(() => {
          if (highlightParagraph(paragraphId)) pendingParagraphIdRef.current = null;
        }, 0);
      }
    };

    window.addEventListener('vibereader:navigate-paragraph', handleNavigateParagraph);
    return () => window.removeEventListener('vibereader:navigate-paragraph', handleNavigateParagraph);
  }, [currentPage, goToPage, highlightParagraph]);

  useEffect(() => {
    const handleNavigateSourceSpan = (event) => {
      const source = event.detail || {};
      const hasSourceRect = Boolean(source.rect) || (Array.isArray(source.rects) && source.rects.length > 0);
      if (!source.page) return;
      if (source.documentId && source.documentId !== documentId) return;

      if (hasSourceRect) setSourceHighlight(source);
      if (source.page !== currentPage) {
        goToPage(source.page);
      }
    };

    window.addEventListener('vibereader:navigate-source-span', handleNavigateSourceSpan);
    return () => window.removeEventListener('vibereader:navigate-source-span', handleNavigateSourceSpan);
  }, [currentPage, documentId, goToPage]);

  const zoomIn = useCallback(() => {
    setZoom((z) => (z === FIT_WIDTH_ZOOM ? 1.25 : Math.min(MAX_ZOOM, z + ZOOM_STEP)));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => (z === FIT_WIDTH_ZOOM ? 0.75 : Math.max(MIN_ZOOM, z - ZOOM_STEP)));
  }, []);

  const zoomReset = useCallback(() => setZoom(1.0), []);
  const zoomFitWidth = useCallback(() => setZoom(FIT_WIDTH_ZOOM), []);

  const handleInject = useCallback(() => {
    if (selection && onInject) {
      onInject(selection.text);
      setSelection(null);
      window.getSelection().removeAllRanges();
    }
  }, [selection, onInject]);

  const handleAnnotationDragStart = useCallback((event, annotation) => {
    const payload = createDragInjectPayload({
      text: annotation?.selectedText,
      page: annotation?.page,
      source: 'pdf-annotation',
    });
    if (!payload) return;
    writeDragInjectData(event.dataTransfer, payload);
  }, []);

  const handleHighlight = useCallback(async (selectedText) => {
    if (!selectedText || !documentId) return;
    const annotation = await createAnnotation({
      documentId,
      page: currentPage,
      selectedText,
      color: 'yellow',
      rect: selection?.rect || null,
    });
    setAnnotations((items) => [annotation, ...items]);
    setSelection(null);
    window.getSelection().removeAllRanges();
    antMessage.success('已保存高亮');
  }, [currentPage, documentId, selection]);

  const handleSaveNote = useCallback(async (selectedText, note) => {
    if (!selectedText || !note || !documentId) return;
    const annotation = await createAnnotation({
      documentId,
      page: currentPage,
      selectedText,
      note,
      color: 'blue',
      rect: selection?.rect || null,
    });
    setAnnotations((items) => [annotation, ...items]);
    setSelection(null);
    window.getSelection().removeAllRanges();
    antMessage.success('已保存笔记');
  }, [currentPage, documentId, selection]);

  const handleRecognizeCurrentPage = useCallback(async () => {
    if (!canvasRef.current) return;

    setOcrStatusByPage((items) => ({ ...items, [currentPage]: 'running' }));
    try {
      const spans = await recognizeCurrentPdfPage({
        canvas: canvasRef.current,
        documentId,
        page: currentPage,
      });

      setOcrSpansByPage((items) => ({ ...items, [currentPage]: spans }));
      setOcrStatusByPage((items) => ({ ...items, [currentPage]: 'succeeded' }));
      if (textLayerRef.current) {
        spans.forEach((sourceSpan) => appendOcrSpan(textLayerRef.current, sourceSpan));
      }

      if (spans.length > 0) {
        antMessage.success(`已识别当前页 ${spans.length} 个文本片段`);
      } else {
        antMessage.warning('OCR 未识别出可用文字');
      }
    } catch (error) {
      console.error('[PdfViewer] OCR failed:', error);
      setOcrStatusByPage((items) => ({ ...items, [currentPage]: 'failed' }));
      antMessage.error(error?.message || 'OCR 识别失败');
    }
  }, [currentPage, documentId]);

  const handleOutlineClick = useCallback(async (outlineItem) => {
    const pageNumber = await resolveOutlinePageNumber(pdfDoc, outlineItem);
    if (pageNumber) {
      goToPage(pageNumber);
    } else {
      antMessage.warning('暂时无法跳转该目录项');
    }
  }, [goToPage, pdfDoc]);

  const { visible: progressVisible, status: progressStatus, dismiss } = useProgressStore();

  // PDF 解析完成后自动关闭进度面板
  useEffect(() => {
    if (pdfText && progressVisible && progressStatus === 'succeeded') {
      const timer = setTimeout(() => dismiss(), 800);
      return () => clearTimeout(timer);
    }
  }, [pdfText, progressVisible, progressStatus, dismiss]);

  if (pdfParsing || (progressVisible && progressStatus === 'running')) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative', ...style }}>
        <AgentProgressPanel />
      </div>
    );
  }

  if (!pdfFile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', ...style }}>
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

  const totalPages = pdfDoc ? pdfDoc.numPages : pdfPages;
  const currentPageTextLayerReady = pageTextLayerInfo.page === currentPage;
  const currentPageHasNativeText =
    currentPageTextLayerReady && pageTextLayerInfo.textItemCount > 0;
  const currentPageOcrSpans = ocrSpansByPage[currentPage] || [];
  const currentPageNeedsOcr =
    currentPageTextLayerReady
    && pageTextLayerInfo.textItemCount === 0
    && currentPageOcrSpans.length === 0;
  const currentOcrStatus = ocrStatusByPage[currentPage] || 'idle';

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--material-sidepane, #f5f5f5)',
        position: 'relative',
        ...style,
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--fill-quinary, #e0e0e0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'var(--material-background, #fff)',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FilePdfOutlined style={{ color: 'var(--accent-blue, #1890ff)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>PDF</span>
        </div>

        {/* Page navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Button size="small" icon={<LeftOutlined />} onClick={goPrev} disabled={currentPage <= 1} />
          <Input
            size="small"
            value={currentPage}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) goToPage(val);
            }}
            style={{ width: 50, textAlign: 'center' }}
          />
          <span style={{ fontSize: 13, color: 'var(--fill-tertiary)' }}>/ {totalPages}</span>
          <Button size="small" icon={<RightOutlined />} onClick={goNext} disabled={currentPage >= totalPages} />
        </div>

        {/* Zoom controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tooltip title="Zoom out">
            <Button size="small" icon={<ZoomOutOutlined />} onClick={zoomOut} />
          </Tooltip>
          <Tooltip title="Reset zoom">
            <Button size="small" onClick={zoomReset} style={{ fontSize: 12, minWidth: 48 }}>
              {zoom === FIT_WIDTH_ZOOM ? 'Fit' : `${Math.round((zoom || 1) * 100)}%`}
            </Button>
          </Tooltip>
          <Tooltip title="Zoom in">
            <Button size="small" icon={<ZoomInOutlined />} onClick={zoomIn} />
          </Tooltip>
          <Tooltip title="Fit width">
            <Button size="small" icon={<ColumnWidthOutlined />} onClick={zoomFitWidth} />
          </Tooltip>
        </div>

        {pdfDoc && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--fill-tertiary)' }}>
              {!currentPageTextLayerReady
                ? '正在检测文字层'
                : currentPageHasNativeText
                ? '当前页可划词'
                : (currentPageOcrSpans.length > 0 ? '当前页已 OCR' : '当前页没有可选文字')}
            </span>
            {currentPageTextLayerReady && !currentPageHasNativeText && (
              <Button
                size="small"
                type={currentPageNeedsOcr ? 'primary' : 'default'}
                loading={currentOcrStatus === 'running'}
                disabled={currentOcrStatus === 'running'}
                onClick={handleRecognizeCurrentPage}
              >
                识别当前页
              </Button>
            )}
          </div>
        )}
      </div>

      {outlineItems.length > 0 && (
        <div className="pdf-outline-strip" aria-label="PDF 大纲">
          {outlineItems.map((item) => (
            <Button
              key={item.id}
              type="text"
              size="small"
              className="pdf-outline-item"
              style={{ paddingLeft: 8 + item.level * 14 }}
              onClick={() => handleOutlineClick(item)}
            >
              {item.title}
            </Button>
          ))}
        </div>
      )}

      {/* Page canvas area */}
      <div
        ref={pageScrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          display: 'flex',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: pageBoxSize.width ? `${pageBoxSize.width}px` : undefined,
            height: pageBoxSize.height ? `${pageBoxSize.height}px` : undefined,
            flex: '0 0 auto',
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            contain: 'layout paint size',
          }}
        >
          <canvas ref={canvasRef} style={{ display: 'block', background: '#fff' }} />
          <div
            ref={textLayerRef}
            className="textLayer pdf-text-layer"
            onPointerDown={(event) => {
              textPointerStartRef.current = { clientX: event.clientX, clientY: event.clientY };
              textPointerDraggedRef.current = false;
            }}
            onPointerMove={(event) => {
              if (didPointerDrag(textPointerStartRef.current, event)) {
                textPointerDraggedRef.current = true;
              }
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              overflow: 'hidden',
              contain: 'layout paint size',
              maxWidth: '100%',
              maxHeight: '100%',
              pointerEvents: 'auto',
              userSelect: 'text',
            }}
          />
          <div
            ref={highlightLayerRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
          <div
            ref={attentionMarkerLayerRef}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '20px',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
          {pageLoading && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.7)',
              }}
            >
              <Spin size="small" />
            </div>
          )}
        </div>

        <PdfAnnotationToolbar
          selection={selection && {
            ...selection,
            x: (() => {
              const scrollArea = pageScrollRef.current;
              const viewportWidth = scrollArea?.clientWidth || 400;
              const scrollLeft = scrollArea?.scrollLeft || 0;
              const minX = scrollLeft + 8;
              const toolbarWidth = 188;
              const maxX = scrollLeft + Math.max(8, viewportWidth - toolbarWidth);
              return Math.max(minX, Math.min(selection.x - toolbarWidth / 2, maxX));
            })(),
            y: (() => {
              const scrollArea = pageScrollRef.current;
              const scrollTop = scrollArea?.scrollTop || 0;
              const viewportHeight = scrollArea?.clientHeight || 600;
              const toolbarHeight = 40;
              const minY = scrollTop + 8;
              const maxY = scrollTop + Math.max(8, viewportHeight - toolbarHeight - 8);
              return Math.max(minY, Math.min(selection.y, maxY));
            })(),
          }}
          onInject={() => handleInject()}
          onHighlight={handleHighlight}
          onSaveNote={handleSaveNote}
          onGenerateLensCard={onGenerateLensCard}
        />
      </div>

      {annotations.length > 0 && (
        <div className="pdf-annotation-list" aria-label="PDF 批注列表">
          {annotations.slice(0, 5).map((annotation) => (
            <div
              key={annotation.id}
              className="pdf-annotation-list-item"
              draggable
              onDragStart={(event) => handleAnnotationDragStart(event, annotation)}
            >
              <span className={`pdf-annotation-color pdf-annotation-color-${annotation.color}`} />
              <span className="pdf-annotation-page">P{annotation.page}</span>
              <span className="pdf-annotation-text">{annotation.selectedText}</span>
              {annotation.note && <span className="pdf-annotation-note">｜{annotation.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PdfViewer;
