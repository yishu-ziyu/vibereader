import React, { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, Empty, Input, Spin, Tag, message as antMessage } from 'antd';
import {
    CloseOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    FileSearchOutlined,
    FileTextOutlined,
    SaveOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import {
    exportPersistentReadingNote,
    importPersistentReadingNoteJson,
} from './services/persistentStorage';
import { createDragInjectPayload, writeDragInjectData } from './dragInject';
import MarkdownRenderer from './MarkdownRenderer';

function artifactTypeLabel(type) {
    if (type === 'lens_card') return '阅读卡片';
    if (type === 'explain_card') return '解释卡片';
    if (type === 'evidence_card') return '证据卡片';
    if (type === 'concept_card') return '概念卡片';
    if (type === 'reading_note') return '阅读笔记';
    if (type === 'concept') return '概念卡片';
    return type || '卡片';
}

function verificationStatusLabel(status = '') {
    if (status === 'grounded') return '有原文依据';
    if (status === 'contains_inference') return '含推断';
    if (status === 'ungrounded') return '未溯源';
    if (status === 'unverified') return '未验证';
    return status || '未验证';
}

function artifactContent(artifact) {
    return artifact.currentContent || artifact.originalContent || {};
}

function sourceRefLabel(sourceRef = {}) {
    const page = sourceRef.page || '?';
    return `P${page}${sourceRef.paragraphId ? ` · ${sourceRef.paragraphId}` : ''}`;
}

function firstSourcePage(artifact = {}, content = {}) {
    const sourceRef = Array.isArray(content.sourceRefs) ? content.sourceRefs.find((item) => item?.page) : null;
    return sourceRef?.page || artifact.source?.page || content.source?.page;
}

function artifactTitle(artifact = {}) {
    return artifact.goal || artifact.title || artifactTypeLabel(artifact.type);
}

function artifactDragText(artifact = {}, content = {}) {
    const lines = [
        artifactTitle(artifact),
        content.title,
        content.sourceText,
        content.aiContent,
        content.selectionText,
        content.question,
        content.answer,
        content.sectionTitle,
        content.summary,
        content.explanation,
        ...(Array.isArray(content.keyPoints) ? content.keyPoints.map((point) => `- ${point}`) : []),
        ...(Array.isArray(content.claims) ? content.claims.map((claim) => `- ${claim.text || claim}`) : []),
        content.description,
    ];
    return lines
        .filter((line) => typeof line === 'string' && line.trim())
        .join('\n');
}

function ArtifactMarkdown({ content }) {
    if (!content || !String(content).trim()) return null;
    return (
        <div className="artifact-markdown">
            <MarkdownRenderer content={String(content)} />
        </div>
    );
}

function selectedSourceLabels(artifact = {}, content = {}) {
    const refs = Array.isArray(content.sourceRefs) ? content.sourceRefs : [];
    if (refs.length > 0) return refs.map(sourceRefLabel);
    const source = artifact.source || content.source;
    if (source?.page) return [sourceRefLabel(source)];
    return ['No source page'];
}

function selectedArtifactMarkdown(artifact = {}) {
    const content = artifactContent(artifact);
    const lines = [
        `## ${artifactTitle(artifact)}`,
        '',
        `- Type: ${artifactTypeLabel(artifact.type)}`,
        `- Verification: ${artifact.verificationStatus || 'unverified'}`,
        `- Source: ${selectedSourceLabels(artifact, content).join(', ')}`,
    ];

    if (content.selectionText) lines.push('', '> ' + content.selectionText);
    if (content.sectionTitle) lines.push('', `Section: ${content.sectionTitle}`);
    if (content.question) lines.push('', `Question: ${content.question}`);
    if (content.summary) lines.push('', content.summary);
    if (content.explanation) lines.push('', content.explanation);
    if (content.answer) lines.push('', content.answer);
    if (Array.isArray(content.keyPoints) && content.keyPoints.length > 0) {
        lines.push('', 'Key points:', ...content.keyPoints.map((point) => `- ${point}`));
    }
    if (Array.isArray(content.claims) && content.claims.length > 0) {
        lines.push('', 'Claims:', ...content.claims.map((claim) => `- ${claim.text || claim}`));
    }
    if (content.userNote) lines.push('', `Note: ${content.userNote}`);

    return lines.join('\n');
}

function selectedArtifactsMarkdown(artifacts = []) {
    return [
        '# Selected VibeCards',
        '',
        ...artifacts.map(selectedArtifactMarkdown),
        '',
    ].join('\n');
}

function obsidianSourceLabel(sourceRef = {}, documentId) {
    const page = sourceRef.page || '?';
    const linkedDocumentId = sourceRef.documentId || documentId || 'document';
    const paragraph = sourceRef.paragraphId ? ` · \`${sourceRef.paragraphId}\`` : '';
    return `[[${linkedDocumentId}#P${page}]]${paragraph}`;
}

function obsidianSourceLabels(artifact = {}, content = {}, documentId) {
    const refs = Array.isArray(content.sourceRefs) ? content.sourceRefs : [];
    if (refs.length > 0) return refs.map((sourceRef) => obsidianSourceLabel(sourceRef, documentId));
    const source = artifact.source || content.source;
    if (source?.page) return [obsidianSourceLabel(source, documentId)];
    return ['No source page'];
}

function selectedArtifactObsidianMarkdown(artifact = {}, documentId) {
    const content = artifactContent(artifact);
    const lines = [
        `## ${artifactTitle(artifact)}`,
        '',
        `- Type: ${artifactTypeLabel(artifact.type)}`,
        `- Verification: ${artifact.verificationStatus || 'unverified'}`,
        `- Source: ${obsidianSourceLabels(artifact, content, documentId).join(', ')}`,
        `- Tags: #vibereader/${artifact.type || 'artifact'}`,
    ];

    if (content.selectionText) {
        lines.push('', '> [!quote]', ...content.selectionText.split('\n').map((line) => `> ${line}`));
    }
    if (content.sectionTitle) lines.push('', `Section: [[${content.sectionTitle}]]`);
    if (content.question) lines.push('', `Question: ${content.question}`);
    if (content.summary) lines.push('', content.summary);
    if (content.explanation) lines.push('', content.explanation);
    if (content.answer) lines.push('', content.answer);
    if (Array.isArray(content.keyPoints) && content.keyPoints.length > 0) {
        lines.push('', 'Key points:', ...content.keyPoints.map((point) => `- ${point}`));
    }
    if (Array.isArray(content.claims) && content.claims.length > 0) {
        lines.push('', 'Claims:', ...content.claims.map((claim) => `- ${claim.text || claim}`));
    }
    if (content.userNote) lines.push('', `> [!note]`, `> ${content.userNote}`);

    return lines.join('\n');
}

function selectedArtifactsObsidianMarkdown(artifacts = [], documentId) {
    return [
        '---',
        'type: vibereader_vibecard_export',
        `document_id: ${documentId || 'document'}`,
        `card_count: ${artifacts.length}`,
        'tags:',
        '  - vibereader',
        '  - vibecard',
        '  - selected-export',
        '---',
        '',
        '# Selected VibeCards',
        '',
        ...artifacts.map((artifact) => selectedArtifactObsidianMarkdown(artifact, documentId)),
        '',
    ].join('\n');
}

function downloadTextFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function filenameSlug(value) {
    const withoutExtension = String(value || 'document')
        .trim()
        .replace(/\.[^/.\\]+$/, '');
    return withoutExtension
        .toLowerCase()
        .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
        .replace(/^-+|-+$/g, '') || 'document';
}

function exportDateLabel(timestamp) {
    const numericTimestamp = Number(timestamp);
    const date = Number.isFinite(numericTimestamp) ? new Date(numericTimestamp) : new Date();
    return date.toISOString().slice(0, 10);
}

function exportFilename(baseName, extension, suffix = '', timestamp) {
    const date = exportDateLabel(timestamp);
    const suffixPart = suffix ? `-${filenameSlug(suffix)}` : '';
    return `vibereader-${filenameSlug(baseName)}${suffixPart}-${date}.${extension}`;
}

export function LensCard({
    artifact,
    selected = false,
    onSelectedChange,
    onNavigateToSource,
    onArtifactUpdated,
    onArtifactDeleted,
}) {
    const content = artifactContent(artifact);
    const [isEditing, setIsEditing] = useState(false);
    const [draftNote, setDraftNote] = useState(content.userNote || '');
    const claims = Array.isArray(content.claims) ? content.claims : [];
    const keyPoints = Array.isArray(content.keyPoints) ? content.keyPoints : [];
    const sourceRefs = Array.isArray(content.sourceRefs) ? content.sourceRefs : [];
    const fallbackSource = artifact.source || content.source;
    const visibleSourceRefs = sourceRefs.length > 0 ? sourceRefs : (fallbackSource ? [fallbackSource] : []);
    const navigateSourceLabel = visibleSourceRefs.length > 0 ? sourceRefLabel(visibleSourceRefs[0]) : '';
    const visibleTitle = content.title || artifactTitle(artifact);
    const shouldShowTitle = visibleTitle && visibleTitle !== artifactTypeLabel(artifact.type)
        && (content.sourceText || content.aiContent);
    const handleDragStart = useCallback((event) => {
        const payload = createDragInjectPayload({
            text: artifactDragText(artifact, content),
            page: firstSourcePage(artifact, content),
            source: 'vibecard',
        });
        writeDragInjectData(event.dataTransfer, payload);
    }, [artifact, content]);
    const handleStartEdit = useCallback(() => {
        setDraftNote(content.userNote || '');
        setIsEditing(true);
    }, [content.userNote]);
    const handleSaveEdit = useCallback(() => {
        onArtifactUpdated?.(artifact, {
            currentContent: {
                ...content,
                userNote: draftNote,
            },
        });
        setIsEditing(false);
    }, [artifact, content, draftNote, onArtifactUpdated]);
    const handleDelete = useCallback(() => {
        if (window.confirm('删除这张卡片？')) {
            onArtifactDeleted?.(artifact);
        }
    }, [artifact, onArtifactDeleted]);

    return (
        <article className="artifact-card" data-artifact-id={artifact.id} draggable onDragStart={handleDragStart}>
            <div className="artifact-card-header">
                <div className="artifact-card-title">
                    <Checkbox
                        checked={selected}
                        aria-label={`选择卡片 ${artifactTitle(artifact)}`}
                        onChange={(event) => onSelectedChange?.(artifact.id, event.target.checked)}
                    />
                    <strong>{artifactTypeLabel(artifact.type)}</strong>
                </div>
                <Tag color={artifact.verificationStatus === 'grounded' ? 'green' : 'gold'}>
                    {verificationStatusLabel(artifact.verificationStatus)}
                </Tag>
            </div>
            {shouldShowTitle && (
                <h3 className="artifact-card-goal">{visibleTitle}</h3>
            )}
            {content.sourceText && (
                <blockquote className="artifact-selection">{content.sourceText}</blockquote>
            )}
            {content.aiContent && (
                <ArtifactMarkdown content={content.aiContent} />
            )}
            {content.selectionText && (
                <blockquote className="artifact-selection">{content.selectionText}</blockquote>
            )}
            {content.explanation && (
                <ArtifactMarkdown content={content.explanation} />
            )}
            {artifact.type === 'explain_card' && content.question && (
                <div className="artifact-question">
                    <span>问题</span>
                    <p>{content.question}</p>
                </div>
            )}
            {artifact.type === 'explain_card' && content.answer && (
                <ArtifactMarkdown content={content.answer} />
            )}
            {artifact.type === 'concept_card' && content.sectionTitle && (
                <div className="artifact-question">
                    <span>章节</span>
                    <p>{content.sectionTitle}</p>
                </div>
            )}
            {artifact.type === 'concept_card' && content.summary && (
                <ArtifactMarkdown content={content.summary} />
            )}
            {artifact.type === 'concept_card' && keyPoints.length > 0 && (
                <ul className="artifact-claims">
                    {keyPoints.map((keyPoint, index) => (
                        <li key={`${artifact.id}-point-${index}`}>
                            <span>{keyPoint}</span>
                        </li>
                    ))}
                </ul>
            )}
            {artifact.type === 'reading_note' && content.title && (
                <div className="artifact-question">
                    <span>笔记</span>
                    <p>{content.title}</p>
                </div>
            )}
            {artifact.type === 'reading_note' && content.body && (
                <ArtifactMarkdown content={content.body} />
            )}
            {visibleSourceRefs.length > 0 && (
                <div className="artifact-source-refs">
                    {visibleSourceRefs.map((sourceRef, index) => (
                        <Tag key={sourceRef.paragraphId || `${artifact.id}-source-${index}`} color="blue">
                            {sourceRefLabel(sourceRef)}
                        </Tag>
                    ))}
                </div>
            )}
            {claims.length > 0 && (
                <ul className="artifact-claims">
                    {claims.map((claim, index) => (
                        <li key={`${artifact.id}-claim-${index}`}>
                            <span>{claim.text}</span>
                            <span className="artifact-claim-tags">
                                {claim.inference ? (
                                    <Tag color="orange">inference</Tag>
                                ) : (claim.sourceSpanIds || []).map((spanId) => (
                                    <Tag key={spanId} color="blue">{spanId}</Tag>
                                ))}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {content.userNote && !isEditing && (
                <div className="artifact-user-note">
                    <span>备注</span>
                    <ArtifactMarkdown content={content.userNote} />
                </div>
            )}
            {isEditing && (
                <div className="artifact-edit-form">
                    <label htmlFor={`artifact-note-${artifact.id}`}>卡片备注</label>
                    <Input.TextArea
                        id={`artifact-note-${artifact.id}`}
                        value={draftNote}
                        rows={3}
                        onChange={(event) => setDraftNote(event.target.value)}
                    />
                </div>
            )}
            <div className="artifact-card-footer">
                <Button
                    size="small"
                    icon={<FileSearchOutlined />}
                    aria-label={navigateSourceLabel ? `回到原文 ${navigateSourceLabel}` : '回到原文'}
                    title={navigateSourceLabel ? `回到原文 ${navigateSourceLabel}` : '回到原文'}
                    onClick={() => onNavigateToSource?.(artifact)}
                >
                    回到原文
                </Button>
                {isEditing ? (
                    <>
                        <Button
                            size="small"
                            icon={<SaveOutlined />}
                            onClick={handleSaveEdit}
                        >
                            保存
                        </Button>
                        <Button
                            size="small"
                            icon={<CloseOutlined />}
                            onClick={() => setIsEditing(false)}
                        >
                            取消
                        </Button>
                    </>
                ) : (
                    <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={handleStartEdit}
                    >
                        编辑
                    </Button>
                )}
                <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={handleDelete}
                >
                    删除
                </Button>
            </div>
        </article>
    );
}

export function ArtifactPanel({
    documentId,
    documentName,
    artifacts = [],
    onNavigateToSource,
    onArtifactUpdated,
    onArtifactDeleted,
    onReadingNoteImported,
}) {
    const [exportPreview, setExportPreview] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [importPanelOpen, setImportPanelOpen] = useState(false);
    const [importJson, setImportJson] = useState('');
    const [importing, setImporting] = useState(false);
    const [selectedArtifactIds, setSelectedArtifactIds] = useState(() => new Set());
    const [selectedExportMarkdown, setSelectedExportMarkdown] = useState('');
    const [selectedObsidianMarkdown, setSelectedObsidianMarkdown] = useState('');

    const selectedArtifacts = artifacts.filter((artifact) => selectedArtifactIds.has(artifact.id));
    const exportBaseName = documentName || documentId || 'document';

    useEffect(() => {
        const handleNavigateArtifact = (event) => {
            const artifactId = event?.detail?.artifactId;
            if (!artifactId) return;

            window.setTimeout(() => {
                const target = Array.from(document.querySelectorAll('[data-artifact-id]'))
                    .find((element) => element.getAttribute('data-artifact-id') === String(artifactId));
                if (!target) {
                    antMessage.warning('未找到这条记忆卡片');
                    return;
                }

                target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
                target.classList.add('artifact-pulse-highlight');
                window.setTimeout(() => {
                    target.classList.remove('artifact-pulse-highlight');
                }, 3000);
            }, 0);
        };

        window.addEventListener('vibereader:navigate-artifact', handleNavigateArtifact);
        return () => window.removeEventListener('vibereader:navigate-artifact', handleNavigateArtifact);
    }, []);

    const handleSelectedChange = useCallback((artifactId, checked) => {
        setSelectedArtifactIds((current) => {
            const next = new Set(current);
            if (checked) next.add(artifactId);
            else next.delete(artifactId);
            return next;
        });
    }, []);

    const handlePreviewExport = useCallback(async () => {
        if (!documentId) {
            antMessage.warning('请先打开文档');
            return;
        }

        setExporting(true);
        try {
            const result = await exportPersistentReadingNote(documentId);
            if (!result) {
                antMessage.warning('当前运行环境暂不支持本地导出预览');
                return;
            }
            setExportPreview(result);
        } catch (error) {
            antMessage.error(error?.message || '导出预览失败');
        } finally {
            setExporting(false);
        }
    }, [documentId]);

    const handleDownloadMarkdown = useCallback(() => {
        if (!exportPreview?.markdown) return;
        downloadTextFile(
            exportFilename(exportBaseName, 'md', '', exportPreview.exportedAt),
            exportPreview.markdown,
            'text/markdown;charset=utf-8'
        );
    }, [exportBaseName, exportPreview]);

    const handleDownloadJson = useCallback(() => {
        if (!exportPreview?.json) return;
        downloadTextFile(
            exportFilename(exportBaseName, 'json', '', exportPreview.exportedAt),
            exportPreview.json,
            'application/json;charset=utf-8'
        );
    }, [exportBaseName, exportPreview]);

    const handleImportFile = useCallback(async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            setImportJson(text);
        } catch (error) {
            antMessage.error(error?.message || '读取 JSON 文件失败');
        } finally {
            event.target.value = '';
        }
    }, []);

    const handleImportJson = useCallback(async () => {
        const json = importJson.trim();
        if (!json) {
            antMessage.warning('请先粘贴或选择 Reading Note JSON');
            return;
        }

        setImporting(true);
        try {
            const result = await importPersistentReadingNoteJson(json);
            if (!result) {
                antMessage.warning('当前运行环境暂不支持本地 JSON 导入');
                return;
            }
            antMessage.success('阅读笔记 JSON 已导入');
            setImportJson('');
            setImportPanelOpen(false);
            onReadingNoteImported?.(result);
        } catch (error) {
            antMessage.error(error?.message || '导入 Reading Note JSON 失败');
        } finally {
            setImporting(false);
        }
    }, [importJson, onReadingNoteImported]);

    const handlePreviewSelectedExport = useCallback(() => {
        if (selectedArtifacts.length === 0) {
            setSelectedExportMarkdown('');
            antMessage.warning('请先选择要导出的卡片');
            return;
        }
        setSelectedExportMarkdown(selectedArtifactsMarkdown(selectedArtifacts));
    }, [selectedArtifacts]);

    const handlePreviewSelectedObsidianExport = useCallback(() => {
        if (selectedArtifacts.length === 0) {
            setSelectedObsidianMarkdown('');
            antMessage.warning('请先选择要导出的卡片');
            return;
        }
        setSelectedObsidianMarkdown(selectedArtifactsObsidianMarkdown(selectedArtifacts, documentId));
    }, [documentId, selectedArtifacts]);

    const handleDownloadSelectedMarkdown = useCallback(() => {
        if (!selectedExportMarkdown) return;
        downloadTextFile(
            exportFilename(exportBaseName, 'md', 'selected-vibecards'),
            selectedExportMarkdown,
            'text/markdown;charset=utf-8'
        );
    }, [exportBaseName, selectedExportMarkdown]);

    const handleDownloadSelectedObsidianMarkdown = useCallback(() => {
        if (!selectedObsidianMarkdown) return;
        downloadTextFile(
            exportFilename(exportBaseName, 'md', 'selected-vibecards-obsidian'),
            selectedObsidianMarkdown,
            'text/markdown;charset=utf-8'
        );
    }, [exportBaseName, selectedObsidianMarkdown]);

    return (
        <div className="artifact-panel">
            <div className="artifact-panel-toolbar">
                <Button
                    size="small"
                    icon={<FileTextOutlined />}
                    loading={exporting}
                    onClick={handlePreviewExport}
                >
                    预览导出
                </Button>
                {exportPreview && (
                    <>
                        <Button
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={handleDownloadMarkdown}
                        >
                            下载 Markdown
                        </Button>
                        <Button
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={handleDownloadJson}
                        >
                            下载 JSON
                        </Button>
                    </>
                )}
                <Button
                    size="small"
                    icon={<UploadOutlined />}
                    onClick={() => setImportPanelOpen((current) => !current)}
                >
                    导入 JSON
                </Button>
                <Button
                    size="small"
                    icon={<FileTextOutlined />}
                    disabled={artifacts.length === 0}
                    onClick={handlePreviewSelectedExport}
                >
                    导出所选
                </Button>
                {selectedExportMarkdown && (
                    <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={handleDownloadSelectedMarkdown}
                    >
                        下载 Markdown
                    </Button>
                )}
                <Button
                    size="small"
                    icon={<FileTextOutlined />}
                    disabled={artifacts.length === 0}
                    onClick={handlePreviewSelectedObsidianExport}
                >
                    Obsidian
                </Button>
                {selectedObsidianMarkdown && (
                    <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={handleDownloadSelectedObsidianMarkdown}
                    >
                        下载 Obsidian Markdown
                    </Button>
                )}
            </div>

            {importPanelOpen && (
                <div className="artifact-import-panel">
                    <Input.TextArea
                        aria-label="Reading Note JSON"
                        rows={4}
                        value={importJson}
                        placeholder="粘贴导出的阅读笔记 JSON"
                        onChange={(event) => setImportJson(event.target.value)}
                    />
                    <div className="artifact-import-actions">
                        <label className="artifact-import-file">
                            <UploadOutlined />
                            <span>选择 JSON 文件</span>
                            <input
                                aria-label="Reading Note JSON file"
                                type="file"
                                accept=".json,application/json"
                                onChange={handleImportFile}
                            />
                        </label>
                        <Button
                            size="small"
                            type="primary"
                            loading={importing}
                            onClick={handleImportJson}
                        >
                            导入阅读笔记
                        </Button>
                    </div>
                </div>
            )}

            {exporting && (
                <div className="artifact-export-loading">
                    <Spin size="small" />
                </div>
            )}

            {exportPreview?.markdown && (
                <pre className="artifact-export-preview">{exportPreview.markdown}</pre>
            )}

            {selectedExportMarkdown && (
                <pre className="artifact-export-preview">{selectedExportMarkdown}</pre>
            )}

            {selectedObsidianMarkdown && (
                <pre className="artifact-export-preview">{selectedObsidianMarkdown}</pre>
            )}

            {!artifacts.length ? (
                <div className="artifact-panel-empty">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有保存的阅读卡片" />
                </div>
            ) : (
                artifacts.map((artifact) => (
                    <LensCard
                        key={artifact.id}
                        artifact={artifact}
                        selected={selectedArtifactIds.has(artifact.id)}
                        onSelectedChange={handleSelectedChange}
                        onNavigateToSource={onNavigateToSource}
                        onArtifactUpdated={onArtifactUpdated}
                        onArtifactDeleted={onArtifactDeleted}
                    />
                ))
            )}
        </div>
    );
}

export default ArtifactPanel;
