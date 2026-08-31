import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, message as antMessage } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import MarkdownRenderer from './MarkdownRenderer';
import { sanitizeHtmlToText } from './services/documentService';
import {
    loadPersistentReadingPosition,
    savePersistentReadingPosition,
} from './services/persistentStorage';
import { createDragInjectPayload, DEFAULT_DRAG_REFERENCE_PAGE, writeDragInjectData } from './dragInject';

function getReadableContent(document) {
    if (!document?.contentText) return '';
    if (document.kind === 'html') return sanitizeHtmlToText(document.contentText);
    return document.contentText;
}

function readableChunks(content = '') {
    return String(content || '')
        .split(/\n{2,}/)
        .map((text) => text.trim())
        .filter(Boolean);
}

function normalizeSearchText(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function DocumentReader({ document: activeDocument, onInject, style = {} }) {
    const containerRef = useRef(null);
    const [selection, setSelection] = useState(null);
    const content = useMemo(() => getReadableContent(activeDocument), [activeDocument]);
    const chunks = useMemo(() => readableChunks(content), [content]);

    // 阅读位置记忆：滚动时防抖（500ms）保存滚动比例，打开文档时恢复并提示
    useEffect(() => {
        const documentId = activeDocument?.id;
        const container = containerRef.current;
        if (!documentId || !container) return undefined;
        let cancelled = false;

        loadPersistentReadingPosition(documentId)
            .then((position) => {
                if (cancelled) return;
                // 审查修复（I2）：只认文本阅读器自己保存的位置（variant==='text'），
                // 避免把 PDF 阅读器写的 {page:N} 覆盖回 page:1。
                if (position?.variant !== 'text') return;
                const ratio = Number(position.scrollRatio);
                // 审查修复（I5）：接近页首（<0.05）不恢复也不弹提示，降低噪音
                if (!Number.isFinite(ratio) || ratio < 0.05) return;
                const max = container.scrollHeight - container.clientHeight;
                if (max <= 0) return;
                container.scrollTop = Math.min(1, ratio) * max;
                antMessage.success('已恢复到上次阅读位置');
            })
            .catch(() => {});

        let timer = null;
        const handleScroll = () => {
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                timer = null;
                const max = container.scrollHeight - container.clientHeight;
                const scrollRatio = max > 0
                    ? Math.min(1, Math.max(0, container.scrollTop / max))
                    : 0;
                savePersistentReadingPosition(documentId, {
                    variant: 'text',
                    page: 1,
                    scrollRatio,
                    updatedAt: Date.now(),
                }).catch(() => {});
            }, 500);
        };
        container.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            cancelled = true;
            container.removeEventListener('scroll', handleScroll);
            if (timer) window.clearTimeout(timer);
        };
    }, [activeDocument?.id]);

    useEffect(() => {
        setSelection(null);
        window.getSelection()?.removeAllRanges();
    }, [activeDocument?.id]);

    useEffect(() => {
        const handleSelectionChange = () => {
            const sel = window.getSelection();
            const text = sel?.toString().trim() || '';
            const container = containerRef.current;
            const isInsideReader = !!container && !!sel && (
                container.contains(sel.anchorNode) ||
                container.contains(sel.focusNode) ||
                (sel.rangeCount > 0 && sel.getRangeAt(0).intersectsNode(container))
            );
            if (text && isInsideReader) {
                setSelection(text);
            } else {
                setSelection(null);
            }
        };

        globalThis.document.addEventListener('selectionchange', handleSelectionChange);
        return () => globalThis.document.removeEventListener('selectionchange', handleSelectionChange);
    }, []);

    const handleInject = useCallback(() => {
        if (!selection || !onInject) return;
        onInject(selection);
        setSelection(null);
        window.getSelection()?.removeAllRanges();
    }, [onInject, selection]);

    const handleDragStart = useCallback((event) => {
        const payload = createDragInjectPayload({
            text: selection,
            page: DEFAULT_DRAG_REFERENCE_PAGE,
            source: activeDocument?.kind || 'document',
        });
        if (!payload) return;
        writeDragInjectData(event.dataTransfer, payload);
    }, [activeDocument?.kind, selection]);

    const highlightParagraph = useCallback((paragraphId) => {
        const container = containerRef.current;
        if (!container || !paragraphId) return false;
        const target = container.querySelector(`[data-paragraph-id="${paragraphId}"]`);
        if (!target) return false;

        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        target.classList.add('paragraph-pulse-highlight');
        window.setTimeout(() => {
            target.classList.remove('paragraph-pulse-highlight');
        }, 3000);
        return true;
    }, []);

    const highlightClosestText = useCallback((text) => {
        const container = containerRef.current;
        const normalizedText = normalizeSearchText(text);
        if (!container || !normalizedText) return false;
        const paragraphs = [...container.querySelectorAll('[data-paragraph-id]')];
        const target = paragraphs.find((paragraph) => {
            const paragraphText = normalizeSearchText(paragraph.textContent || '');
            return paragraphText.includes(normalizedText) ||
                (normalizedText.length >= 24 && normalizedText.includes(paragraphText));
        });
        if (!target) return false;

        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        target.classList.add('paragraph-pulse-highlight');
        window.setTimeout(() => {
            target.classList.remove('paragraph-pulse-highlight');
        }, 3000);
        return true;
    }, []);

    useEffect(() => {
        const handleNavigateParagraph = (event) => {
            const detail = event.detail || {};
            if (detail.documentId && activeDocument?.id && detail.documentId !== activeDocument.id) return;
            const navigated = detail.paragraphId
                ? highlightParagraph(detail.paragraphId) || highlightClosestText(detail.text)
                : highlightClosestText(detail.text);
            if (!navigated) {
                antMessage.warning('未找到这张卡片的原文段落');
            }
        };

        window.addEventListener('vibereader:navigate-paragraph', handleNavigateParagraph);
        window.addEventListener('vibereader:navigate-source-span', handleNavigateParagraph);
        return () => {
            window.removeEventListener('vibereader:navigate-paragraph', handleNavigateParagraph);
            window.removeEventListener('vibereader:navigate-source-span', handleNavigateParagraph);
        };
    }, [activeDocument?.id, highlightClosestText, highlightParagraph]);

    if (!activeDocument || !content) {
        return (
            <div className="document-reader-empty" style={style}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="打开 PDF、Markdown、Text 或 HTML 文件开始阅读" />
            </div>
        );
    }

    return (
        <div className="document-reader" style={style}>
            <div
                ref={containerRef}
                className="document-reader-scroll"
                draggable={!!selection}
                onDragStart={handleDragStart}
            >
                {activeDocument.kind === 'markdown' && (
                    <div className="document-reader-markdown">
                        {chunks.map((chunk, index) => (
                            <div
                                key={`${activeDocument.id || 'document'}-chunk-${index + 1}`}
                                data-paragraph-id={`chunk-${index + 1}`}
                                className="document-reader-paragraph"
                            >
                                <MarkdownRenderer content={chunk} />
                            </div>
                        ))}
                    </div>
                )}
                {activeDocument.kind === 'html' && (
                    <article className="document-reader-text" data-testid="html-document-content">
                        {chunks.map((chunk, index) => (
                            <p
                                key={`${activeDocument.id || 'document'}-chunk-${index + 1}`}
                                data-paragraph-id={`chunk-${index + 1}`}
                                className="document-reader-paragraph"
                            >
                                {chunk}
                            </p>
                        ))}
                    </article>
                )}
                {(activeDocument.kind === 'text' || activeDocument.kind === 'pdf') && (
                    // pdf：无二进制时以文本模式展示提取内容（「最近文档」恢复路径）
                    <article className="document-reader-text" data-testid="text-document-content" style={{ whiteSpace: 'pre-wrap' }}>
                        {chunks.map((chunk, index) => (
                            <p
                                key={`${activeDocument.id || 'document'}-chunk-${index + 1}`}
                                data-paragraph-id={`chunk-${index + 1}`}
                                className="document-reader-paragraph"
                            >
                                {chunk}
                            </p>
                        ))}
                    </article>
                )}
            </div>
            {selection && (
                <Button
                    type="primary"
                    size="small"
                    icon={<MessageOutlined />}
                    className="document-reader-inject"
                    onClick={handleInject}
                >
                    注入 AI
                </Button>
            )}
        </div>
    );
}

export default DocumentReader;
