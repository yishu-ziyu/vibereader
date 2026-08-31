import React, { useRef, useEffect, useCallback, useState, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Bubble } from '@ant-design/x';
import { Button, Flex, message as antMessage, Spin, Modal, Segmented, Slider, Tabs } from 'antd';
import { FontSizeOutlined, DeleteOutlined, PlusOutlined, FilePdfOutlined, FolderOpenOutlined, MenuFoldOutlined, MenuUnfoldOutlined, CommentOutlined, FileTextOutlined, BookOutlined, ThunderboltOutlined, CompassOutlined, SettingOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import ChatInput from './ChatInput';
import aiService from './aiService';
import { MULTIMODAL_UNSUPPORTED_CODE } from './multimodalApiError';
import { buildChatHardFailureBubbleContent } from './chatHardFailureContent';
import { buildUserFriendlyErrorContent, classifyAiError } from './aiError';
import { validateRunnableModelConfig } from './modelConfigGuard';
import { t, formatCustomModelLabel } from './i18n';
import MarkdownRenderer from './MarkdownRenderer';
import { extractTextFromPDF } from './pdfService';
import { fileToDocument, fileToDocumentWithContent, openTauriDocument, SUPPORTED_DOCUMENT_EXTENSIONS } from './services/documentService';
import { createArtifact, deleteArtifact, listArtifactsForDocument, updateArtifact } from './services/artifactService';
import {
    exportPersistentReadingNote,
    initializePersistentStorage,
    listPersistentDocuments,
    loadPersistentDocumentContent,
    savePersistentDocument,
    savePersistentDocumentContent,
} from './services/persistentStorage';
import { isVisionCapableByModelName } from './modelPresets';
import {
    buildReadingAgentTask,
    createReadingTools,
    generateLensCardArtifact,
    getReadingAgentSkill,
    listReadingAgentSkills,
    retryReadingAgentTask,
    runReadingAgentTask,
} from './agent';
import { runDeepReadPipeline } from './agent/multiAgent';
import { filterAllowedTools } from './agent/permissions';
import { resolveReadingAgentModel } from './agent/modelFactory';
import {
    createReadingAgentOptions as createReadingAgentOptionsCore,
    RUNNABLE_READING_AGENT_TYPES,
    runnableReadingAgentSkills as listRunnableReadingAgentSkills,
} from './agent/readingAgentOptions';
import { getExperienceStore } from './agent/experienceSingleton';
import {
    formatDocumentQaChatContent,
    isAgentDocumentQaEnabled,
    runDocumentQaFromChat,
    setAgentDocumentQaEnabled,
    shouldRunDocumentQaFromChat,
} from './agent/documentQaChat';
import { buildIndexedRetrievalContext, groundSourceRefsForDocument, indexDocumentSourceSpans } from './services/sourceIndexService';
import { createUniRagHttpAdapter, DEFAULT_UNI_RAG_BASE_URL } from './services/ragEngineAdapter';
import {
    KNOWLEDGE_INGEST_TASK_TYPE,
    isDocumentKnowledgeQueryReady,
    loadDocumentKnowledgeLink,
    refreshDocumentKnowledgeLinkFromStore,
    startDocumentKnowledgeIngest,
} from './services/documentKnowledgeService';
import {
    canIngestSavedMemoryArtifact,
    startSavedMemoryIngest,
} from './services/savedMemoryService';
import {
    saveConversation, loadConversation, listConversations, deleteConversation,
    getFontScale, setFontScale, getModelConfigs, getSelectedConfigId,
    bootstrapModelApiKeys
} from './storage';
import { useConversationStore, useDocumentStore, useModelStore, usePdfStore, useProgressStore, useUIStore, hydrateSelectedModelApiKey } from './store';
import { useVibeStore } from './store';
import { PdfViewer } from './PdfViewer';
import { DocumentReader } from './DocumentReader';
import {
    createDragInjectDraftId,
    DRAG_INJECT_EFFECT,
    formatDragInjectQuote,
    hasDragInjectData,
    readDragInjectData,
} from './dragInject';
import './styles.css';
import viberoIconPng from '../icons/vibero.png';
import { OnboardingOverlay } from './onboarding/OnboardingOverlay';
import { HelpGuide } from './help/HelpGuide';
import { ModelConfigModal } from './model-config/ModelConfigModal';

// Lazy-load AI panel components to reduce initial bundle size
const SummaryPanel = React.lazy(() => import('./SummaryPanel').then(m => ({ default: m.SummaryPanel })));
const FlashcardDeck = React.lazy(() => import('./FlashcardDeck').then(m => ({ default: m.FlashcardDeck })));
const ThinkingTreePanel = React.lazy(() => import('./ThinkingTreePanel').then(m => ({ default: m.ThinkingTreePanel })));
const AttentionNavigatorPanel = React.lazy(() => import('./AttentionNavigatorPanel').then(m => ({ default: m.AttentionNavigatorPanel })));
const ArtifactPanel = React.lazy(() => import('./ArtifactPanel').then(m => ({ default: m.ArtifactPanel })));
const TaskStatusPanel = React.lazy(() => import('./TaskStatusPanel').then(m => ({ default: m.TaskStatusPanel })));
// 可提取文本持久化的文档类型：pdf 的提取文本同样写入 document_contents，
// 供「最近文档」恢复问答上下文（原版渲染仍需重新打开本地文件）。
const READABLE_DOCUMENT_KINDS = ['markdown', 'text', 'html', 'pdf'];

/** Wire product agent options through the mocked `./agent` barrel (WorkspaceLayout tests). */
function createReadingAgentOptions(taskType, document, adapters = {}) {
    return createReadingAgentOptionsCore(taskType, document, {
        ...adapters,
        getReadingAgentSkill,
        createReadingTools,
        resolveReadingAgentModel,
        filterAllowedTools,
    });
}

function runnableReadingAgentSkills(options = {}) {
    return listRunnableReadingAgentSkills({
        ...options,
        listReadingAgentSkills,
    });
}

/** Simple fallback for lazy-loaded panels */
function PanelFallback() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Spin size="small" />
        </div>
    );
}

/** 附图仅 data URL */
function chatImageDataUrl(img) {
    return img && typeof img.base64 === 'string' && img.base64 ? img.base64 : '';
}

function isExplicitDocumentContext(text = '') {
    return /^\s*(Based on the following|基于以下)/i.test(String(text));
}

function messageTextWithRetrievalContext(text, retrievalContext) {
    if (!retrievalContext?.prompt) return text;
    return `${String(text || '').trim()}\n\n${retrievalContext.prompt}`;
}

function sourceRefSnippet(sourceRef = {}, maxLength = 96) {
    const normalized = String(sourceRef.text || sourceRef.sourceText || sourceRef.selectedText || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function sourceRefVisibleLabel(sourceRef = {}) {
    if (isMemorySourceRef(sourceRef)) {
        return sourceRef.label || '记忆';
    }
    const label = sourceRef.label || `P${sourceRef.page || 1}`;
    const precision = sourceRef.grounding?.precision;
    if (precision === 'page') return `${label} · 页级`;
    if (precision === 'document') return `${label} · 文档级`;
    return label;
}

function isMemorySourceRef(sourceRef = {}) {
    return sourceRef.evidenceType === 'memory' ||
        sourceRef.sourceType === 'saved_memory' ||
        Boolean(sourceRef.artifactId || sourceRef.memoryId);
}

function groundAssistantSourceRefsForDocument(sourceRefs = [], document = {}) {
    const refs = Array.isArray(sourceRefs) ? sourceRefs.filter(Boolean) : [];
    const documentRefs = refs.filter((sourceRef) => !isMemorySourceRef(sourceRef));
    const groundedDocumentRefs = groundSourceRefsForDocument(documentRefs, document);
    let groundedIndex = 0;

    return refs.map((sourceRef) => {
        if (isMemorySourceRef(sourceRef)) return sourceRef;
        const grounded = groundedDocumentRefs[groundedIndex];
        groundedIndex += 1;
        return grounded || sourceRef;
    });
}

function messagePlainText(content = '') {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter((part) => part?.type === 'text' && typeof part.text === 'string')
            .map((part) => part.text)
            .join('\n');
    }
    return '';
}

function answerCardTitle(question = '') {
    const normalized = String(question || '').replace(/\s+/g, ' ').trim() || '未绑定问题';
    return `AI 回答：${normalized.length > 60 ? `${normalized.slice(0, 57)}...` : normalized}`;
}

function ragEngineStatusText(health) {
    if (!health || health.status === 'checking') return '知识引擎：检查中';
    if (health.available) return '知识引擎：UniRAG';
    return '知识引擎：本地检索';
}

function ragEngineStatusTitle(health) {
    if (!health || health.status === 'checking') {
        return `正在检查 UniRAG：${DEFAULT_UNI_RAG_BASE_URL}`;
    }
    if (health.available) {
        return `UniRAG 已连接：${health.baseUrl || DEFAULT_UNI_RAG_BASE_URL}`;
    }
    return `UniRAG 不可用，已使用本地检索。${health.error || ''}`.trim();
}

function knowledgeIngestStatusText(status) {
    if (!status || status.status === 'idle') return '知识入库：未开始';
    if (status.status === 'checking') return '知识入库：等待检查';
    if (status.status === 'fallback') return '知识入库：等待 UniRAG';
    if (status.status === 'queued') return '知识入库：排队中';
    if (status.status === 'running') return `知识入库：${Math.max(1, Math.min(99, Number(status.percent || 1)))}%`;
    if (status.status === 'completed') return '知识入库：已完成';
    if (status.status === 'failed') return '知识入库：失败';
    return `知识入库：${status.status}`;
}

function knowledgeIngestStatusTitle(status) {
    if (!status || status.status === 'idle') return '当前文档尚未送入 UniRAG';
    if (status.status === 'fallback') return 'UniRAG 不可用，当前文档暂未入库';
    if (status.status === 'completed') {
        const filename = status.result?.filename || status.link?.uniRagFilename || '';
        return `当前文档已进入知识引擎${filename ? `：${filename}` : ''}`;
    }
    if (status.status === 'failed') return status.error || status.message || '知识入库失败';
    return status.message || '当前文档正在进入知识引擎';
}

function knowledgeIngestStatusColor(status) {
    if (status?.status === 'completed') {
        return { color: '#237804', background: '#f6ffed', border: '#b7eb8f' };
    }
    if (status?.status === 'failed') {
        return { color: '#a8071a', background: '#fff1f0', border: '#ffa39e' };
    }
    if (['queued', 'running'].includes(status?.status)) {
        return { color: '#0958d9', background: '#e6f4ff', border: '#91caff' };
    }
    return { color: '#8c6d1f', background: '#fffbe6', border: '#ffe58f' };
}

function savedMemoryStatusText(status) {
    if (!status || status.status === 'idle') return '记忆沉淀：未开始';
    if (status.status === 'fallback') return '记忆沉淀：等待 UniRAG';
    if (status.status === 'queued') return '记忆沉淀：排队中';
    if (status.status === 'running') return `记忆沉淀：${Math.max(1, Math.min(99, Number(status.percent || 1)))}%`;
    if (status.status === 'completed') return '记忆沉淀：已完成';
    if (status.status === 'failed') return '记忆沉淀：失败';
    return `记忆沉淀：${status.status}`;
}

function savedMemoryStatusTitle(status) {
    if (!status || status.status === 'idle') return '尚未沉淀用户保存的卡片或笔记';
    const artifactTitle = status.artifactTitle ? `：${status.artifactTitle}` : '';
    if (status.status === 'fallback') return `UniRAG 不可用，已保存在本地${artifactTitle}`;
    if (status.status === 'completed') return `用户确认内容已进入知识记忆${artifactTitle}`;
    if (status.status === 'failed') return status.error || status.message || '记忆沉淀失败';
    return status.message || `正在沉淀用户确认内容${artifactTitle}`;
}

function savedMemoryStatusColor(status) {
    if (status?.status === 'completed') {
        return { color: '#237804', background: '#f6ffed', border: '#b7eb8f' };
    }
    if (status?.status === 'failed') {
        return { color: '#a8071a', background: '#fff1f0', border: '#ffa39e' };
    }
    if (['queued', 'running'].includes(status?.status)) {
        return { color: '#0958d9', background: '#e6f4ff', border: '#91caff' };
    }
    return { color: '#8c6d1f', background: '#fffbe6', border: '#ffe58f' };
}

function artifactMemoryTitle(artifact = {}) {
    return artifact.goal || artifact.title || artifact.currentContent?.title || artifact.originalContent?.title || artifact.type || 'Saved memory';
}

function findSectionForPage(sections = [], page = 1) {
    if (!Array.isArray(sections) || sections.length === 0) return null;
    const pageNumber = Number(page) || 1;
    return sections.find((section, index) => {
        const nextSection = sections[index + 1];
        const pageStart = Number(section.pageStart) || 1;
        const inferredEnd = nextSection?.pageStart ? Number(nextSection.pageStart) - 1 : Infinity;
        const pageEnd = Number(section.pageEnd) || inferredEnd;
        return pageNumber >= pageStart && pageNumber <= pageEnd;
    }) || null;
}

function studentMessageForAgentEvent(event = {}) {
    if (event.type === 'tool') {
        return `调用工具 ${event.toolName || 'tool'}（第 ${event.iteration || '?'} 轮）`;
    }
    if (event.type === 'model') {
        const responseType = event.response?.type;
        if (responseType === 'final') {
            return `模型给出最终回答（第 ${event.iteration || '?'} 轮）`;
        }
        if (responseType === 'tool_call') {
            const multi = event.response?.toolCalls || event.response?.tool_calls;
            const name = Array.isArray(multi) && multi.length > 0
                ? multi.map((item) => item.toolName || item.name || 'tool').join(', ')
                : (event.response?.toolName || event.response?.name || 'tool');
            return `模型决定调用 ${name}（第 ${event.iteration || '?'} 轮）`;
        }
        return `模型思考中（第 ${event.iteration || '?'} 轮）`;
    }
    if (event.type === 'final') {
        return 'Agent 完成';
    }
    if (event.type === 'error') {
        return `出错：${event.error || event.status || 'unknown'}`;
    }
    return event.summary || event.type || 'Agent 运行中';
}

function progressStageForAgentEvent(event = {}) {
    if (event.type === 'final') return 'alignment';
    if (event.type === 'error') return 'repair';
    if (event.type === 'tool') return 'render';
    if (event.type === 'model' && event.response?.type === 'final') return 'alignment';
    return 'render';
}

function emitAgentProgressEvent(event = {}) {
    const progress = useProgressStore.getState();
    progress.emitEvent({
        stage: progressStageForAgentEvent(event),
        studentMessage: studentMessageForAgentEvent(event),
        technicalMessage: event.summary || studentMessageForAgentEvent(event),
        severity: event.type === 'error' ? 'error' : 'info',
        attempt: event.iteration,
        metadata: {
            agent: 'reading-agent',
            type: event.type,
            toolName: event.toolName || event.response?.toolName || event.response?.name || undefined,
            iteration: event.iteration,
        },
    });
}

function taskResultContent(task = {}) {
    const result = task.result && typeof task.result === 'object' ? task.result : {};
    return String(result.content || result.summary || result.text || '').trim();
}

function taskResultTitle(task = {}) {
    return task.title || task.type || 'Reading task result';
}

function taskResultSourceRefs(task = {}) {
    const result = task.result && typeof task.result === 'object' ? task.result : {};
    return Array.isArray(result.sourceRefs) ? result.sourceRefs.filter(Boolean) : [];
}

function cardInputToArtifact(cardInput = {}, document = {}) {
    const documentId = cardInput.documentId || document.id;
    const source = cardInput.source || {
        documentId,
        page: cardInput.page || null,
        paragraphId: cardInput.paragraphId || null,
        selectedText: cardInput.sourceText || '',
        sourceType: 'agent-card-generation',
    };
    const content = {
        title: cardInput.title || 'VibeCard',
        type: cardInput.type || 'concept',
        sourceText: cardInput.sourceText || '',
        aiContent: cardInput.aiContent || '',
        userNote: cardInput.userNote || '',
        tags: cardInput.tags || [],
        source,
    };

    return {
        id: cardInput.id,
        documentId,
        type: cardInput.type || 'concept',
        goal: cardInput.title || 'VibeCard',
        sourceSpanIds: [cardInput.paragraphId || source.paragraphId].filter(Boolean),
        source,
        originalContent: content,
        currentContent: content,
        tags: cardInput.tags || [],
        verificationStatus: cardInput.verificationStatus || (
            source?.selectedText && (source?.page || source?.paragraphId) ? 'grounded' : 'ungrounded'
        ),
    };
}

/** 系统提示 */
const SYSTEM_PROMPT = `你是 AI 助手，专门帮助用户阅读和理解学术论文。请用简洁、专业的语言回答问题。

格式要求：
1. 使用 Markdown 格式输出。
2. 数学公式必须用分隔符包裹才能渲染；禁止在正文里裸写 LaTeX。
   - 行内：用单个美元符包裹，如 $\\mathbf{p}_i$、$w_k$。
   - 块级：独占一行时用双美元符包裹整段。
   - 也可使用 \\(...\\) 作行内、\\[...\\] 作块级。
3. LaTeX 须语法正确：花括号与命令须配对。
4. 多行复杂公式可使用 ${'```'}math 围栏代码块。
5. 普通代码使用 ${'```'}语言名 围栏。

网页内容：
用户可以通过「网页工具」按钮粘贴 URL，系统会自动获取网页正文并插入到对话中。如果用户消息包含网页内容（带有 Source: URL 标识），请基于该内容回答问题，并引用来源。`;

/** 生成会话 ID */
function generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// VibeReader Logo
const vibeReaderLogo = (
    <img src={viberoIconPng} width="40" height="40" alt="Logo" />
);

// 定义 roles 配置
const roles = {
    assistant: {
        placement: 'start',
        variant: 'shadow',
        loadingRender: () => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20, color: '#262626' }}>...</span>
                <span style={{ fontSize: 14, color: '#666' }}>正在思考...</span>
            </div>
        ),
    },
    user: {
        placement: 'end',
        variant: 'shadow',
    },
};

function AssistantSourceRefs({ sourceRefs = [], onNavigate }) {
    if (!Array.isArray(sourceRefs) || sourceRefs.length === 0) return null;
    const documentRefs = sourceRefs.filter((sourceRef) => !isMemorySourceRef(sourceRef));
    const memoryRefs = sourceRefs.filter(isMemorySourceRef);
    const groups = [
        { key: 'document', label: '原文依据', refs: documentRefs },
        { key: 'memory', label: '我的记忆', refs: memoryRefs },
    ].filter((group) => group.refs.length > 0);

    return (
        <div className="assistant-source-refs">
            {groups.map((group) => (
                <React.Fragment key={group.key}>
                    <span className="assistant-source-refs-label">{group.label}</span>
                    {group.refs.map((sourceRef, index) => {
                        const label = sourceRefVisibleLabel(sourceRef);
                        const snippet = sourceRefSnippet(sourceRef);
                        const memoryTitle = sourceRef.memoryTitle || sourceRef.artifactTitle || '';
                        const precision = sourceRef.grounding?.precision;
                        const precisionTitle = isMemorySourceRef(sourceRef)
                            ? '保存过的阅读记忆'
                            : precision === 'page'
                                ? '页级依据，未匹配到具体段落'
                                : precision === 'document'
                                    ? '文档级依据，未匹配到具体页段'
                                    : '段落级依据';
                        const titleBody = memoryTitle || snippet;
                        const title = titleBody ? `${label}: ${titleBody}（${precisionTitle}）` : `${label}（${precisionTitle}）`;
                        const ariaPrefix = isMemorySourceRef(sourceRef) ? '打开我的记忆' : '打开原文依据';
                        return (
                            <button
                                key={sourceRef.id || sourceRef.chunkId || `${sourceRef.documentId}-${sourceRef.page}-${index}`}
                                type="button"
                                className={`assistant-source-ref-button${isMemorySourceRef(sourceRef) ? ' memory' : ''}`}
                                aria-label={titleBody ? `${ariaPrefix} ${label}: ${titleBody}` : `${ariaPrefix} ${label}`}
                                title={title}
                                onClick={() => onNavigate?.(sourceRef)}
                            >
                                {label}
                            </button>
                        );
                    })}
                </React.Fragment>
            ))}
        </div>
    );
}

export function App() {
    // Zustand stores
    const { messages, loading, sessions, currentSessionId, historyLoaded, setMessages, setLoading, setSessions, setCurrentSessionId, setHistoryLoaded } = useConversationStore();
    const { selectedModel, visionCapable, selectModel } = useModelStore();
    const { pdfText, pdfPages, pdfParsing, clearPdf, startParsing, finishParsing, failParsing, setPdfFile } = usePdfStore();
    const {
        fontScale,
        showFontSlider,
        sidebarCollapsed,
        rightToolTab,
        workspaceSplitRatio,
        setFontScale: setFontScaleState,
        setShowFontSlider,
        setSidebarCollapsed,
        setActiveToolTab,
        setRightToolTab,
        setWorkspaceSplitRatio,
    } = useUIStore();
    const { documents, addDocument, setActiveDocument, setDocuments, currentDocument } = useDocumentStore();
    const { vibeData } = useVibeStore();

    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const fileInputRef = useRef(null);
    const currentSessionIdRef = useRef(currentSessionId);
    const currentDocumentRef = useRef(currentDocument);
    const knowledgeIngestAttemptsRef = useRef(new Set());
    const abortControllerRef = useRef(null);
    const [dragInjectActive, setDragInjectActive] = useState(false);
    const [pendingDragInjection, setPendingDragInjection] = useState(null);
    const [selectedParagraphId, setSelectedParagraphId] = useState(null);
    const [activeReaderPage, setActiveReaderPage] = useState(1);
    const [chatContextMode, setChatContextMode] = useState('relevant');
    // Optional Chat → knowledge_qa tool loop. Default OFF (env/localStorage opt-in).
    const [agentChatQaEnabled, setAgentChatQaEnabled] = useState(() => isAgentDocumentQaEnabled());
    const [insights, setInsights] = useState([]);
    const [artifacts, setArtifacts] = useState([]);
    const [showModelConfig, setShowModelConfig] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(true);
    const [modelConfigsVersion, setModelConfigsVersion] = useState(0);
    const [showHelpGuide, setShowHelpGuide] = useState(false);
    const [ragEngineHealth, setRagEngineHealth] = useState({ status: 'checking' });
    const [knowledgeIngestStatus, setKnowledgeIngestStatus] = useState({ status: 'idle' });
    const [savedMemoryIngestStatus, setSavedMemoryIngestStatus] = useState({ status: 'idle' });
    const activeSection = findSectionForPage(vibeData?.sections || currentDocument?.vibeData?.sections, activeReaderPage);

    useEffect(() => {
        currentDocumentRef.current = currentDocument;
    }, [currentDocument]);

    useEffect(() => {
        let cancelled = false;
        const adapter = createUniRagHttpAdapter();

        const checkUniRagHealth = async () => {
            const health = await adapter.health();
            if (!cancelled) {
                setRagEngineHealth(health.available ? health : { ...health, status: 'fallback' });
            }
        };

        checkUniRagHealth();
        const intervalId = window.setInterval(checkUniRagHealth, 30000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, []);

    useEffect(() => {
        if (!currentDocument?.id) {
            setKnowledgeIngestStatus({ status: 'idle' });
            return undefined;
        }

        if (ragEngineHealth?.status === 'checking') {
            setKnowledgeIngestStatus({
                status: 'checking',
                documentId: currentDocument.id,
                message: '正在检查 UniRAG',
            });
            return undefined;
        }

        if (!ragEngineHealth?.available) {
            setKnowledgeIngestStatus({
                status: 'fallback',
                documentId: currentDocument.id,
                message: ragEngineHealth?.error || 'UniRAG 不可用',
            });
            return undefined;
        }

        // D4：Tauri 下从 SQLite 对齐该文档的入库链接到同步缓存（fire-and-forget，浏览器回退为空操作）
        void refreshDocumentKnowledgeLinkFromStore(currentDocument.id).catch(() => null);

        const existingLink = loadDocumentKnowledgeLink(currentDocument.id);
        if (
            existingLink?.status === 'completed' &&
            knowledgeIngestAttemptsRef.current.has(currentDocument.id)
        ) {
            setKnowledgeIngestStatus({
                status: 'completed',
                documentId: currentDocument.id,
                percent: 100,
                message: existingLink.message || '已进入知识引擎',
                link: existingLink,
                result: {
                    sourceId: existingLink.uniRagSourceId,
                    filename: existingLink.uniRagFilename,
                },
            });
            return undefined;
        }

        if (knowledgeIngestAttemptsRef.current.has(currentDocument.id)) {
            if (existingLink) {
                setKnowledgeIngestStatus({
                    status: existingLink.status || 'running',
                    documentId: currentDocument.id,
                    percent: existingLink.percent || 0,
                    message: existingLink.message || '',
                    error: existingLink.error || null,
                    link: existingLink,
                });
            }
            return undefined;
        }

        let cancelled = false;
        knowledgeIngestAttemptsRef.current.add(currentDocument.id);
        const adapter = createUniRagHttpAdapter();

        startDocumentKnowledgeIngest({
            document: currentDocument,
            adapter,
            onStatus: (status) => {
                if (cancelled || currentDocumentRef.current?.id !== currentDocument.id) return;
                setKnowledgeIngestStatus(status);
            },
            shouldContinue: () => !cancelled && currentDocumentRef.current?.id === currentDocument.id,
        }).catch((error) => {
            if (cancelled || currentDocumentRef.current?.id !== currentDocument.id) return;
            setKnowledgeIngestStatus({
                status: 'failed',
                documentId: currentDocument.id,
                percent: 100,
                message: '知识入库失败',
                error: error?.message || String(error),
            });
        });

        return () => {
            cancelled = true;
        };
    }, [currentDocument?.id, currentDocument, ragEngineHealth?.available, ragEngineHealth?.status, ragEngineHealth?.error]);

    useEffect(() => {
        let cancelled = false;

        initializePersistentStorage()
            .then(async () => {
                const persistentDocuments = await listPersistentDocuments();
                if (cancelled) return;
                setDocuments(persistentDocuments.map((document) => ({
                    ...document,
                    isRecentOnly: true,
                })));
            })
            .catch((error) => {
                console.warn('[App] Persistent storage initialization skipped:', error);
            });

        return () => {
            cancelled = true;
        };
    }, [setDocuments]);

    // R3：启动时执行一次 API Key 引导 ——
    // 1) 一次性迁移：localStorage 中残留明文 apiKey 的旧配置 → 写入 Keychain → 落盘清空；
    // 2) 从 Keychain 异步回填当前选中模型的 key 到 zustand 内存态（fire-and-forget）。
    useEffect(() => {
        bootstrapModelApiKeys().catch((error) => {
            console.warn('[App] API key migration skipped:', error);
        });
        hydrateSelectedModelApiKey().catch((error) => {
            console.warn('[App] API key hydrate skipped:', error);
        });
    }, []);

    useEffect(() => {
        currentSessionIdRef.current = currentSessionId;
    }, [currentSessionId]);

    useEffect(() => {
        if (['mindmap', 'tasks', 'summary'].includes(rightToolTab)) {
            setRightToolTab('navigator');
        }
    }, [rightToolTab, setRightToolTab]);

    useEffect(() => {
        let cancelled = false;
        if (!currentDocument?.id) {
            setArtifacts([]);
            return;
        }

        listArtifactsForDocument(currentDocument.id).then((items) => {
            if (!cancelled) setArtifacts(items);
        });

        return () => {
            cancelled = true;
        };
    }, [currentDocument?.id]);

    useEffect(() => {
        if (!currentDocument?.id) return undefined;

        const handleArtifactsUpdated = (event) => {
            const updatedDocumentId = event?.detail?.documentId || null;
            if (updatedDocumentId && updatedDocumentId !== currentDocument.id) return;
            listArtifactsForDocument(currentDocument.id).then(setArtifacts);
        };

        window.addEventListener('vibereader:artifacts-updated', handleArtifactsUpdated);
        return () => {
            window.removeEventListener('vibereader:artifacts-updated', handleArtifactsUpdated);
        };
    }, [currentDocument?.id]);

    // 初始化：加载会话列表
    useEffect(() => {
        const init = async () => {
            const list = await listConversations();
            setSessions(list);
            if (list.length > 0) {
                const first = list[0];
                setCurrentSessionId(first.sessionId);
                const msgs = await loadConversation(first.sessionId);
                if (msgs) setMessages(msgs);
            } else {
                const newId = generateSessionId();
                setCurrentSessionId(newId);
                setMessages([]);
            }
            setHistoryLoaded(true);
        };
        init();
    }, []);

    // 自动滚动到底部
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // 获取当前 AI 服务实例（必须放在使用它的 useEffect 之前，避免 TDZ 错误）
    const getCurrentService = useCallback((validatedConfig = null) => {
        const config = validatedConfig || selectedModel.config;
        if (!config) return null;
        const apiType = config.apiType || (config.apiFormat === 'anthropic' ? 'anthropic-compatible' : 'openai-compatible');
        aiService.setConfig({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            model: config.model || config.modelName,
            apiType,
            authType: config.authType,
            requiresApiKey: config.requiresApiKey,
        });
        return aiService;
    }, [selectedModel]);

    // Synchronize reader stores with the active document to enforce multi-document isolation
    useEffect(() => {
        setInsights([]);
        setSelectedParagraphId(null);
        setActiveReaderPage(1);
        if (!currentDocument) {
            clearPdf();
            useVibeStore.getState().clearVibeData();
            const service = getCurrentService();
            if (service) {
                service.clearHistory();
                service.setPaperContext('');
            }
            return;
        }

        // Clear active window selections
        window.getSelection()?.removeAllRanges();

        // Restore PDF file/text/pages states
        if (currentDocument.kind === 'pdf') {
            const file = currentDocument.pdfFile || null;
            const text = currentDocument.pdfText || '';
            const pages = currentDocument.pdfPages || 0;
            const vibeData = currentDocument.vibeData || null;

            setPdfFile(file);
            finishParsing(text, pages);

            if (vibeData) {
                useVibeStore.setState({
                    vibeData,
                    parsing: false,
                    selectedSectionId: vibeData.sections[0]?.id || null,
                    parseError: null
                });
            } else if (text) {
                useVibeStore.getState().parsePdfText(text);
            } else {
                useVibeStore.getState().clearVibeData();
            }

            const service = getCurrentService();
            if (service) {
                service.clearHistory();
                service.setPaperContext('');
            }
        } else {
            // Markdown, Text, HTML
            const text = currentDocument.contentText || '';
            const vibeData = currentDocument.vibeData || null;

            setPdfFile(null);
            finishParsing(text, 1);

            if (vibeData) {
                useVibeStore.setState({
                    vibeData,
                    parsing: false,
                    selectedSectionId: vibeData.sections[0]?.id || null,
                    parseError: null
                });
            } else {
                useVibeStore.getState().parsePdfText(text);
            }

            const service = getCurrentService();
            if (service) {
                service.clearHistory();
                service.setPaperContext('');
            }
        }
    }, [currentDocument, setPdfFile, finishParsing, clearPdf, getCurrentService]);

    // 保存消息到持久层（Tauri → SQLite；非 Tauri 运行时为安全 no-op）
    const persistMessages = useCallback(async (msgs) => {
        const sid = currentSessionIdRef.current;
        if (!sid) return;
        await saveConversation(sid, msgs);
        const list = await listConversations();
        setSessions(list);
    }, [setSessions]);

    // 字体大小调整
    const handleFontScaleChange = (value) => {
        setFontScaleState(value);
        setFontScale(value);
    };

    // 模型切换
    const handleModelChange = (model) => {
        selectModel(model);
    };

    const recordDocumentOpened = useCallback((document) => {
        savePersistentDocument(document).catch((error) => {
            console.warn('[App] Failed to persist opened document:', error);
        });
        if (document?.id && READABLE_DOCUMENT_KINDS.includes(document.kind) && document.contentText) {
            savePersistentDocumentContent(document.id, document.contentText, {
                sourceType: document.kind,
                createdAt: document.openedAt,
                updatedAt: document.updatedAt || Date.now(),
            }).catch((error) => {
                console.warn('[App] Failed to persist document content:', error);
            });
        }
        indexDocumentSourceSpans(document).catch((error) => {
            console.warn('[App] Failed to index opened document:', error);
        });
    }, []);

    const createAgentVibeCard = useCallback(async (cardInput) => {
        const saved = await createArtifact(cardInputToArtifact(cardInput, currentDocument));
        setArtifacts((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
        setRightToolTab('artifacts');
        return saved;
    }, [currentDocument, setRightToolTab]);

    /** Adapter for export_note tool: same storage path as ArtifactPanel Preview Export. */
    const exportAgentNote = useCallback(async ({ documentId, template, format } = {}) => {
        const id = documentId || currentDocument?.id;
        if (!id) {
            throw new Error('export_note requires a documentId');
        }

        const result = await exportPersistentReadingNote(id);
        if (!result) {
            throw new Error('Reading note export is unavailable in this environment');
        }

        const resolvedFormat = format === 'json' ? 'json' : (format || 'markdown');
        const extension = resolvedFormat === 'json' ? 'json' : 'md';
        const exportedAt = result.exportedAt || null;
        const filename = exportedAt
            ? `reading-note-${id}-${exportedAt}.${extension}`
            : `reading-note-${id}.${extension}`;

        setRightToolTab('artifacts');

        return {
            documentId: id,
            template: template || 'default',
            format: resolvedFormat,
            filename,
            path: filename,
            exportedAt,
            exportType: result.exportType || 'reading_note',
            schemaVersion: result.schemaVersion ?? null,
            // Keep tool payload bounded; full bodies live in storage / Notes panel re-export.
            hasMarkdown: Boolean(result.markdown),
            hasJson: Boolean(result.json),
            status: 'exported',
        };
    }, [currentDocument, setRightToolTab]);

    const runReadingAgentByType = useCallback((taskType) => {
        if (!currentDocument?.id) return Promise.resolve(null);

        return new Promise((resolve) => {
            const validation = validateRunnableModelConfig(selectedModel?.config);
            const experienceStore = getExperienceStore();
            const agentOptions = createReadingAgentOptions(taskType, currentDocument, {
                createVibeCard: createAgentVibeCard,
                exportNote: exportAgentNote,
                useLlm: validation.ok,
                modelConfig: validation.ok ? validation.config : null,
                uniRagAvailable: ragEngineHealth?.available === true,
                experienceStore,
            });
            if (!agentOptions) {
                resolve(null);
                return;
            }

            const progress = useProgressStore.getState();
            progress.startJob('精读 Agent 启动...');
            progress.emitEvent({
                stage: 'queued',
                studentMessage: '精读任务已创建，开始运行 Agent。',
                technicalMessage: `reading-agent start type=${taskType}`,
                metadata: { agent: 'reading-agent', type: 'start', taskType },
            });

            runReadingAgentTask({
                task: buildReadingAgentTask(taskType, currentDocument, { goal: agentOptions.goal }),
                agentOptions,
                experienceStore,
                onEvent: emitAgentProgressEvent,
            }).then((result) => {
                if (result?.status === 'succeeded') {
                    progress.finishJob(result);
                } else {
                    progress.failJob(
                        {
                            code: result?.agentResult?.status || 'AGENT_FAILED',
                            message: result?.errorMessage || 'Reading agent failed',
                        },
                        result?.errorMessage || '精读任务失败，请查看任务面板。',
                    );
                }
                if (taskType === 'card_generation_agent') {
                    // 结构化判定（D7）：从 create_vibecard 工具调用记录聚合，不再匹配最终文案
                    const cardsCreated = Number(result?.toolOutcome?.vibecardsCreated) || 0;
                    if (result?.status === 'succeeded' && cardsCreated >= 3) {
                        antMessage.success('已创建 3 张 VibeCard');
                    } else if (result?.status === 'succeeded' && cardsCreated === 0) {
                        antMessage.warning('来源不足，未创建 VibeCard');
                    }
                }
                if (taskType === 'note_export_agent' && result?.status === 'succeeded') {
                    // 结构化判定（D7）：export_note 工具是否真正成功
                    if (result?.toolOutcome?.noteExported === true) {
                        antMessage.success('阅读笔记已导出（见 Notes 面板可下载）');
                    } else {
                        antMessage.warning('笔记已组装，但未调用导出工具');
                    }
                }
                resolve(result);
            }).catch((error) => {
                console.warn('[App] Failed to start reading agent:', error);
                progress.failJob(
                    { code: 'AGENT_START_FAILED', message: error?.message || String(error) },
                    '精读任务启动失败',
                );
                antMessage.error('精读任务启动失败');
                resolve(null);
            });
        });
    }, [createAgentVibeCard, currentDocument, exportAgentNote, ragEngineHealth?.available, selectedModel]);

    const handleStartAgentTask = useCallback((taskType) => {
        if (!currentDocument?.id) return;

        if (taskType === 'card_generation_agent') {
            Modal.confirm({
                title: '生成阅读卡片',
                content: '此任务会为当前文档创建至少 3 张带原文依据的阅读卡片。确认后会写入本地卡片库。',
                okText: '生成卡片',
                cancelText: '取消',
                onOk: () => runReadingAgentByType(taskType),
            });
            return;
        }

        if (taskType === 'note_export_agent') {
            Modal.confirm({
                title: '导出阅读笔记',
                content: '此任务会从本地存储导出当前文档的阅读笔记（Markdown/JSON）。确认后执行导出。',
                okText: '导出笔记',
                cancelText: '取消',
                onOk: () => runReadingAgentByType(taskType),
            });
            return;
        }

        runReadingAgentByType(taskType);
    }, [currentDocument, runReadingAgentByType]);

    const handleStartDeepRead = useCallback(() => {
        if (!currentDocument?.id) {
            antMessage.warning('请先打开一篇文档');
            return;
        }

        setRightToolTab('navigator');
        antMessage.loading({ content: '正在启动精读流程...', key: 'deep-read', duration: 1.2 });

        void (async () => {
            const validation = validateRunnableModelConfig(selectedModel?.config);
            const experienceStore = getExperienceStore();
            const adapters = {
                createVibeCard: createAgentVibeCard,
                exportNote: exportAgentNote,
                useLlm: validation.ok,
                modelConfig: validation.ok ? validation.config : null,
                uniRagAvailable: ragEngineHealth?.available === true,
                experienceStore,
            };

            const phase1Skills = ['paper_overview_agent', 'attention_agent'];
            // Critic is read-only and has a local model; always enable after cards (LLM when useLlm).
            const enableCritic = true;
            const allSkills = [
                ...phase1Skills,
                'card_generation_agent',
                ...(enableCritic ? ['critic_agent'] : []),
            ];
            const optionsBySkill = {};
            for (const skillType of allSkills) {
                const opts = createReadingAgentOptions(skillType, currentDocument, adapters);
                if (opts) optionsBySkill[skillType] = opts;
            }

            if (!optionsBySkill.paper_overview_agent || !optionsBySkill.attention_agent) {
                antMessage.error({ content: '精读流程无法启动：缺少 Agent 配置', key: 'deep-read' });
                return;
            }

            let activeSkillType = null;
            const createModelForSkill = (skillType) => {
                activeSkillType = skillType;
                return optionsBySkill[skillType]?.model;
            };

            const permissionsBySkill = Object.fromEntries(
                Object.entries(optionsBySkill).map(([skillType, opts]) => [skillType, opts.permissions]),
            );

            const progress = useProgressStore.getState();
            progress.startJob('精读流程启动...');
            progress.emitEvent({
                stage: 'queued',
                studentMessage: '精读流程已创建，按总览 → 路线 → 卡片依次运行。',
                technicalMessage: 'deep-read pipeline start',
                metadata: { agent: 'deep-read', type: 'start' },
            });

            const runAgent = async (agentOpts = {}) => {
                const skillType = activeSkillType;
                const base = optionsBySkill[skillType] || {};
                const goal = agentOpts.goal || base.goal || '';
                try {
                    // Forward product grounding from createReadingAgentOptions
                    // (llm → warn by default). Pipeline agentOpts may override.
                    const groundingMode = agentOpts.groundingMode ?? base.groundingMode;
                    const groundingGate = agentOpts.groundingGate ?? base.groundingGate;
                    const requireSourceRefsForClaims = agentOpts.requireSourceRefsForClaims
                        ?? base.requireSourceRefsForClaims;
                    const includeObservability = agentOpts.includeObservability
                        ?? base.includeObservability;
                    const result = await runReadingAgentTask({
                        task: buildReadingAgentTask(skillType, currentDocument, { goal }),
                        agentOptions: {
                            goal,
                            model: agentOpts.model || base.model,
                            tools: base.tools || agentOpts.tools || {},
                            permissions: agentOpts.permissions || base.permissions,
                            maxIterations: agentOpts.maxIterations || base.maxIterations,
                            timeoutMs: agentOpts.timeoutMs || base.timeoutMs,
                            ...(base.lessonsPrompt ? { lessonsPrompt: base.lessonsPrompt } : {}),
                            ...(groundingMode != null ? { groundingMode } : {}),
                            ...(groundingGate != null ? { groundingGate } : {}),
                            ...(requireSourceRefsForClaims != null
                                ? { requireSourceRefsForClaims }
                                : {}),
                            ...(includeObservability != null
                                ? { includeObservability }
                                : {}),
                        },
                        experienceStore,
                        onEvent: emitAgentProgressEvent,
                    });

                    if (skillType === 'card_generation_agent') {
                        // 结构化判定（D7）：与 runReadingAgentByType 一致，基于工具调用记录聚合
                        const cardsCreated = Number(result?.toolOutcome?.vibecardsCreated) || 0;
                        if (result?.status === 'succeeded' && cardsCreated >= 3) {
                            antMessage.success('已创建 3 张 VibeCard');
                        } else if (result?.status === 'succeeded' && cardsCreated === 0) {
                            antMessage.warning('来源不足，未创建 VibeCard');
                        }
                    }

                    if (result?.agentResult) {
                        return result.agentResult;
                    }
                    if (result?.status === 'succeeded') {
                        return {
                            status: 'completed',
                            content: result?.task?.result?.content || '',
                            sourceRefs: result?.task?.result?.sourceRefs || [],
                            artifacts: [],
                            artifact: null,
                            trace: [],
                            iterations: 1,
                        };
                    }
                    return {
                        status: result?.agentResult?.status || 'error',
                        content: '',
                        sourceRefs: [],
                        artifacts: [],
                        artifact: null,
                        error: result?.errorMessage || 'Reading agent failed',
                        trace: [],
                        iterations: 0,
                    };
                } catch (error) {
                    return {
                        status: 'error',
                        content: '',
                        sourceRefs: [],
                        artifacts: [],
                        artifact: null,
                        error: error?.message || String(error),
                        iterations: 0,
                        trace: [],
                    };
                }
            };

            const onStep = (step) => {
                progress.emitEvent({
                    stage: step.status === 'completed' ? 'tool_result' : 'error',
                    studentMessage: step.status === 'completed'
                        ? `精读步骤完成：${step.skill}`
                        : `精读步骤失败：${step.skill}`,
                    technicalMessage: `deep-read step=${step.skill} status=${step.status}`,
                    severity: step.status === 'completed' ? 'info' : 'error',
                    metadata: {
                        agent: 'deep-read',
                        type: 'step',
                        skill: step.skill,
                        status: step.status,
                    },
                });
            };

            try {
                // Phase 1: overview → attention with prior-step goal injection.
                const phase1 = await runDeepReadPipeline({
                    document: currentDocument,
                    skills: phase1Skills,
                    createModelForSkill,
                    tools: {},
                    permissionsBySkill,
                    runAgent,
                    onStep,
                });

                // Same HITL gate as single-skill Create VibeCard: do not auto-write.
                await new Promise((resolve) => {
                    Modal.confirm({
                        title: '精读：生成阅读卡片？',
                        content: '概览与注意力路线已启动。是否继续为当前文档创建至少 3 张带原文依据的阅读卡片？确认后会写入本地卡片库。',
                        okText: '生成卡片',
                        cancelText: '跳过卡片',
                        onOk: async () => {
                            if (!optionsBySkill.card_generation_agent) {
                                resolve(null);
                                return;
                            }
                            const priorStepSummaries = (phase1.steps || [])
                                .filter((step) => step.status === 'completed' && step.content)
                                .map((step) => `[${step.skill}]\n${step.content}`);
                            // Critic runs inside the pipeline after cards; no extra Modal (read-only).
                            await runDeepReadPipeline({
                                document: currentDocument,
                                skills: ['card_generation_agent'],
                                createModelForSkill,
                                tools: optionsBySkill.card_generation_agent.tools || {},
                                permissionsBySkill,
                                priorStepSummaries,
                                runAgent,
                                onStep,
                                enableCritic: enableCritic && Boolean(optionsBySkill.critic_agent),
                            });
                            resolve(true);
                        },
                        onCancel: () => resolve(null),
                    });
                });

                if (phase1.status === 'failed') {
                    progress.failJob(
                        { code: 'DEEP_READ_FAILED', message: 'Deep-read pipeline failed' },
                        '精读流程失败，请查看任务面板。',
                    );
                    antMessage.error({ content: '精读流程失败：请查看任务面板。', key: 'deep-read' });
                } else {
                    progress.finishJob(phase1);
                    antMessage.success({
                        content: '精读流程已完成：结果在任务、路线与卡片中查看。',
                        key: 'deep-read',
                    });
                }
            } catch (error) {
                console.warn('[App] Deep-read pipeline failed:', error);
                progress.failJob(
                    { code: 'DEEP_READ_FAILED', message: error?.message || String(error) },
                    '精读流程启动失败',
                );
                antMessage.error({ content: '精读流程启动失败', key: 'deep-read' });
            }
        })();
    }, [
        createAgentVibeCard,
        currentDocument,
        exportAgentNote,
        ragEngineHealth?.available,
        selectedModel,
        setRightToolTab,
    ]);

    const handleRetryTask = useCallback((task) => {
        if (!currentDocument?.id || task?.documentId !== currentDocument.id) return;
        if (task.type === 'source_index') {
            indexDocumentSourceSpans(currentDocument).catch((error) => {
                console.warn('[App] Failed to retry source indexing:', error);
            });
            return;
        }
        if (task.type === KNOWLEDGE_INGEST_TASK_TYPE) {
            knowledgeIngestAttemptsRef.current.delete(currentDocument.id);
            setKnowledgeIngestStatus({
                status: 'queued',
                documentId: currentDocument.id,
                percent: 1,
                message: '正在重新送入知识引擎',
            });
            startDocumentKnowledgeIngest({
                document: currentDocument,
                adapter: createUniRagHttpAdapter(),
                onStatus: (status) => {
                    if (currentDocumentRef.current?.id !== currentDocument.id) return;
                    setKnowledgeIngestStatus(status);
                },
                shouldContinue: () => currentDocumentRef.current?.id === currentDocument.id,
            }).catch((error) => {
                if (currentDocumentRef.current?.id !== currentDocument.id) return;
                setKnowledgeIngestStatus({
                    status: 'failed',
                    documentId: currentDocument.id,
                    percent: 100,
                    message: '知识入库失败',
                    error: error?.message || String(error),
                });
            });
            return;
        }

        if (RUNNABLE_READING_AGENT_TYPES.has(task.type)) {
            const validation = validateRunnableModelConfig(selectedModel?.config);
            const experienceStore = getExperienceStore();
            const agentOptions = createReadingAgentOptions(task.type, currentDocument, {
                createVibeCard: createAgentVibeCard,
                exportNote: exportAgentNote,
                useLlm: validation.ok,
                modelConfig: validation.ok ? validation.config : null,
                uniRagAvailable: ragEngineHealth?.available === true,
                experienceStore,
            });
            if (!agentOptions) return;

            const progress = useProgressStore.getState();
            progress.startJob('重试精读 Agent...');
            progress.emitEvent({
                stage: 'queued',
                studentMessage: '正在重试精读任务。',
                technicalMessage: `reading-agent retry type=${task.type}`,
                metadata: { agent: 'reading-agent', type: 'retry', taskType: task.type },
            });

            retryReadingAgentTask(task, {
                agentOptions,
                experienceStore,
                onEvent: emitAgentProgressEvent,
            }).then((result) => {
                if (result?.status === 'succeeded') {
                    progress.finishJob(result);
                } else {
                    progress.failJob(
                        {
                            code: result?.agentResult?.status || 'AGENT_FAILED',
                            message: result?.errorMessage || 'Reading agent failed',
                        },
                        result?.errorMessage || '精读任务失败，请查看任务面板。',
                    );
                }
            }).catch((error) => {
                console.warn('[App] Failed to retry reading agent:', error);
                progress.failJob(
                    { code: 'AGENT_RETRY_FAILED', message: error?.message || String(error) },
                    '精读任务重试失败',
                );
            });
            return;
        }

        if (String(task.type || '').endsWith('_agent')) {
            retryReadingAgentTask(task).catch((error) => {
                console.warn('[App] Failed to retry agent task:', error);
            });
        }
    }, [createAgentVibeCard, currentDocument, exportAgentNote, ragEngineHealth?.available, selectedModel]);

    const enqueueSavedArtifactMemory = useCallback((artifact) => {
        const targetDocument = currentDocumentRef.current || currentDocument;
        if (!artifact?.id || !targetDocument?.id) return;
        const normalizedArtifact = {
            ...artifact,
            documentId: artifact.documentId || targetDocument.id,
        };
        if (!canIngestSavedMemoryArtifact(normalizedArtifact)) return;

        const artifactTitle = artifactMemoryTitle(normalizedArtifact);
        if (!ragEngineHealth?.available) {
            setSavedMemoryIngestStatus({
                status: 'fallback',
                percent: 0,
                artifactId: normalizedArtifact.id,
                artifactTitle,
                documentId: targetDocument.id,
                message: ragEngineHealth?.error || 'UniRAG 不可用，已保存在本地',
            });
            return;
        }

        startSavedMemoryIngest({
            artifact: normalizedArtifact,
            document: targetDocument,
            adapter: createUniRagHttpAdapter(),
            onStatus: (status) => {
                if (currentDocumentRef.current?.id !== targetDocument.id) return;
                setSavedMemoryIngestStatus({
                    ...status,
                    artifactTitle,
                });
            },
            shouldContinue: () => currentDocumentRef.current?.id === targetDocument.id,
        }).catch((error) => {
            if (currentDocumentRef.current?.id !== targetDocument.id) return;
            setSavedMemoryIngestStatus({
                status: 'failed',
                percent: 100,
                artifactId: normalizedArtifact.id,
                artifactTitle,
                documentId: targetDocument.id,
                message: '记忆沉淀失败',
                error: error?.message || String(error),
            });
            console.warn('[App] Saved memory ingest failed:', error);
        });
    }, [currentDocument, ragEngineHealth?.available, ragEngineHealth?.error]);

    // PDF 上传处理
    const handlePdfUpload = useCallback(async (file, preparedDocument = null) => {
        const document = preparedDocument || fileToDocument(file);
        if (!document || document.kind !== 'pdf') {
            antMessage.error(t('ai-chat-pdf-only', null, '请打开 PDF 文件。'));
            return;
        }

        startParsing();
        try {
            const { text, pages } = await extractTextFromPDF(file);
            
            // Get the viewer bytes set by extractTextFromPDF
            const pdfFileBytes = usePdfStore.getState().pdfFile;

            // Generate VIBE data
            useVibeStore.getState().parsePdfText(text);
            const vibeData = useVibeStore.getState().vibeData;

            const docWithContent = {
                ...document,
                pdfText: text,
                pdfPages: pages,
                contentText: text,
                pdfFile: pdfFileBytes,
                vibeData,
            };

            addDocument(docWithContent);
            recordDocumentOpened(docWithContent);
            finishParsing(text, pages);
            setActiveToolTab('pdf');
            setRightToolTab('navigator');
            antMessage.success(t('ai-chat-pdf-parsed', { pages }));
        } catch (error) {
            console.error('[App] PDF parsing failed:', error);
            antMessage.error(t('ai-chat-pdf-parse-failed'));
            failParsing();
        }
    }, [addDocument, finishParsing, recordDocumentOpened, setActiveToolTab, setRightToolTab, startParsing, failParsing]);

    const handleReadableDocument = useCallback((document) => {
        if (!document || !READABLE_DOCUMENT_KINDS.includes(document.kind)) {
            antMessage.error(t('ai-chat-document-open-invalid', null, '请选择支持的文件。'));
            return;
        }

        useVibeStore.getState().parsePdfText(document.contentText || '');
        const vibeData = useVibeStore.getState().vibeData;

        const docWithContent = {
            ...document,
            pdfFile: null,
            pdfText: document.contentText || '',
            pdfPages: 1,
            vibeData,
            // 恢复的 PDF 没有二进制，标记为文本模式，工作区将以 DocumentReader 展示提取文本
            ...(document.kind === 'pdf' ? { textMode: true } : {}),
        };

        addDocument(docWithContent);
        recordDocumentOpened(docWithContent);
        setPdfFile(null);
        finishParsing(document.contentText || '', 1);
        setActiveToolTab('pdf');
        setRightToolTab('navigator');
        if (document.kind === 'pdf') {
            // 恢复的 PDF：提取文本已可用于问答/检索，原版渲染需重新打开本地文件
            antMessage.info('内容已恢复（可问答），重新打开本地文件可恢复原版渲染。');
            return;
        }
        antMessage.success(t('ai-chat-document-opened', { name: document.name }, '文档已打开'));
    }, [addDocument, finishParsing, recordDocumentOpened, setActiveToolTab, setPdfFile, setRightToolTab]);

    const handleRecentDocumentClick = useCallback(async (document) => {
        if (!document?.isRecentOnly) {
            setActiveDocument(document.id);
            return;
        }

        if (!READABLE_DOCUMENT_KINDS.includes(document.kind)) {
            antMessage.info('请重新打开本地文件以恢复阅读内容。');
            return;
        }

        try {
            const contentRecord = await loadPersistentDocumentContent(document.id);
            if (!contentRecord?.contentText) {
                antMessage.info('请重新打开本地文件以恢复阅读内容。');
                return;
            }

            handleReadableDocument({
                ...document,
                isRecentOnly: false,
                contentText: contentRecord.contentText,
                sourceType: contentRecord.sourceType,
                updatedAt: contentRecord.updatedAt || document.updatedAt,
            });
        } catch (error) {
            console.warn('[App] Failed to restore recent document content:', error);
            antMessage.error('恢复最近文档失败，请重新打开本地文件。');
        }
    }, [handleReadableDocument, setActiveDocument]);

    const handleDocumentFile = useCallback(async (file) => {
        if (!file) return;
        const document = fileToDocument(file);
        if (document?.kind === 'pdf') {
            await handlePdfUpload(file, document);
            return;
        }
        const textDocument = await fileToDocumentWithContent(file);
        handleReadableDocument(textDocument);
    }, [handlePdfUpload, handleReadableDocument]);

    const handleDocumentDrop = useCallback((e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleDocumentFile(file);
    }, [handleDocumentFile]);

    const handleOpenDocument = useCallback(async () => {
        try {
            const result = await openTauriDocument();

            if (result.status === 'unsupported') {
                fileInputRef.current?.click();
                return;
            }

            if (result.status === 'cancelled') {
                return;
            }

            if (result.status === 'invalid') {
                antMessage.warning(result.message || t('ai-chat-document-open-invalid', null, '请选择支持的文件。'));
                return;
            }

            const { document } = result;
            if (!document) return;

            if (document.kind === 'pdf') {
                await handlePdfUpload(document.file, document);
                return;
            }

            handleReadableDocument(document);
        } catch (error) {
            console.error('[App] Failed to open document:', error);
            antMessage.error(t('ai-chat-document-open-failed', null, '打开文件失败，请重试或使用拖拽上传。'));
        }
    }, [handlePdfUpload, handleReadableDocument]);

    // 发送消息
    const handleSubmit = useCallback(async (text, images) => {
        if ((!text || !text.trim()) && (!images || images.length === 0)) return;

        const validation = validateRunnableModelConfig(selectedModel?.config);
        if (!validation.ok) {
            antMessage.error(validation.message);
            return;
        }

        const service = getCurrentService(validation.config);
        if (!service) {
            antMessage.error(t('vibe-ai-chat-prompt-configure-custom-first'));
            return;
        }

        const sendImages = (images || []).filter((img) => chatImageDataUrl(img));
        // Optional tool-loop document QA (flag default OFF). When ON, skip retrieval
        // injection: knowledge_qa_agent uses document tools itself.
        const useAgentDocumentQa = shouldRunDocumentQaFromChat({
            enabled: agentChatQaEnabled,
            document: currentDocument,
            question: text,
            images: sendImages,
        });
        const retrievalContext = !useAgentDocumentQa
            && currentDocument
            && sendImages.length === 0
            && !isExplicitDocumentContext(text)
            ? await buildIndexedRetrievalContext({
                document: currentDocument,
                query: text,
                mode: chatContextMode,
                page: activeReaderPage,
                section: activeSection,
                paragraphId: selectedParagraphId,
            })
            : null;
        const outboundText = messageTextWithRetrievalContext(text, retrievalContext);
        const retrievalSourceRefs = retrievalContext?.sourceRefs || [];

        // 论文上下文已准备好，添加用户消息
        const userMessage = {
            id: Date.now(),
            role: 'user',
            content: text,
            images: images || [],
            typing: false,
            timestamp: Date.now()
        };

        // 构建消息内容：支持文本和图片的多模态格式
        let messageContent = outboundText;
        if (sendImages.length > 0) {
            messageContent = [{ type: 'text', text: outboundText }];
            sendImages.forEach((img) => {
                messageContent.push({
                    type: 'image_url',
                    image_url: { url: chatImageDataUrl(img) },
                });
            });
        }

        // 创建 AI 消息占位符
        const aiMessageId = Date.now() + 1;
        const aiMessage = {
            id: aiMessageId,
            role: 'assistant',
            content: '',
            sourceRefs: retrievalSourceRefs,
            typing: true,
            timestamp: Date.now()
        };

        setLoading(true);
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        setMessages(prev => [...prev, userMessage, aiMessage]);

        const canUseUniRagQuery = Boolean(
            currentDocument?.id &&
            sendImages.length === 0 &&
            !isExplicitDocumentContext(text) &&
            ragEngineHealth?.available &&
            isDocumentKnowledgeQueryReady(currentDocument.id)
        );

        const finishAssistantMessage = (patch) => {
            setMessages(prev => {
                const updated = prev.map(msg =>
                    msg.id === aiMessageId
                        ? {
                            ...msg,
                            ...patch,
                            typing: false,
                            timestamp: Date.now(),
                        }
                        : msg
                );
                persistMessages(updated);
                return updated;
            });
            setLoading(false);
            if (abortControllerRef.current === abortController) {
                abortControllerRef.current = null;
            }
        };

        const tryUniRagQuery = async () => {
            if (!canUseUniRagQuery) return false;
            const adapter = createUniRagHttpAdapter();
            const result = await adapter.query({
                question: text,
                sessionId: currentSessionIdRef.current,
                topK: 5,
                includeMemory: true,
                memoryTopK: 3,
                providerKey: validation.config.providerKey,
                provider: validation.config.providerKey,
                apiKey: validation.config.apiKey,
                mode: 'chat',
            });

            finishAssistantMessage({
                content: result.answer,
                sourceRefs: groundAssistantSourceRefsForDocument(result.sourceRefs || [], currentDocument),
                ragEngine: result.ragEngine,
            });
            return true;
        };

        // 请求硬失败时统一处理
        const performChat = async () => {
            try {
                // Opt-in agent path: tool-loop knowledge_qa (same adapters as deep-read).
                // Failures fall through to UniRAG / stream chat so chat never hard-breaks.
                if (useAgentDocumentQa) {
                    try {
                        const qaResult = await runDocumentQaFromChat(
                            currentDocument,
                            text,
                            validation.config,
                            {
                                skipGate: true,
                                createOptions: (taskType, doc, adapters) => (
                                    createReadingAgentOptions(taskType, doc, adapters)
                                ),
                                useLlm: true,
                                uniRagAvailable: ragEngineHealth?.available === true,
                                experienceStore: getExperienceStore(),
                                createVibeCard: createAgentVibeCard,
                                exportNote: exportAgentNote,
                                abortSignal: abortController.signal,
                                onEvent: emitAgentProgressEvent,
                            },
                        );
                        if (abortController.signal.aborted) {
                            finishAssistantMessage({
                                content: '',
                                sourceRefs: [],
                            });
                            return;
                        }
                        finishAssistantMessage({
                            content: formatDocumentQaChatContent(qaResult),
                            sourceRefs: groundAssistantSourceRefsForDocument(
                                qaResult.sourceRefs || [],
                                currentDocument,
                            ),
                            agentQa: true,
                            skillType: qaResult.skillType,
                        });
                        return;
                    } catch (agentQaError) {
                        if (abortController.signal.aborted || agentQaError?.name === 'AbortError') {
                            finishAssistantMessage({
                                content: '',
                                sourceRefs: [],
                            });
                            return;
                        }
                        console.warn(
                            '[App] Agent document QA failed; falling back to UniRAG/chat:',
                            agentQaError,
                        );
                    }
                }

                try {
                    const answeredByUniRag = await tryUniRagQuery();
                    if (answeredByUniRag) return;
                } catch (uniRagError) {
                    console.warn('[App] UniRAG query failed; falling back to local retrieval chat:', uniRagError);
                }

                await service.chatStream(
                    messageContent,
                    ({ done, content, fullMessage, thinking, fullThinking, hasThinking, interrupted, aborted, error, errorCode, errorTitle, errorAction, aiError }) => {
                        if (!done && (content || thinking)) {
                            setMessages(prev => prev.map(msg =>
                                msg.id === aiMessageId
                                    ? { ...msg, content: fullMessage, thinking: fullThinking, hasThinking, typing: true }
                                    : msg
                            ));
                        } else if (done) {
                            let finalContent = fullMessage;
                            const isMmRejected = interrupted && errorCode === MULTIMODAL_UNSUPPORTED_CODE;
                            const streamFailedHard = interrupted && !!error && !aborted && !isMmRejected;

                            if (interrupted) {
                                if (isMmRejected) {
                                    finalContent = t('vibe-ai-chat-multimodal-not-supported', {
                                        model: selectedModel.label,
                                    });
                                } else if (streamFailedHard) {
                                    if (aiError) {
                                        finalContent = buildUserFriendlyErrorContent(aiError);
                                    } else {
                                        finalContent = buildChatHardFailureBubbleContent(String(error), {
                                            modelLabel: selectedModel.label,
                                            multimodalRejectedCode: errorCode,
                                        });
                                    }
                                }
                            }

                            const finalMsg = {
                                id: aiMessageId,
                                role: 'assistant',
                                content: finalContent,
                                thinking: fullThinking,
                                hasThinking,
                                sourceRefs: retrievalSourceRefs,
                                typing: false,
                                timestamp: Date.now()
                            };

                            setMessages(prev => {
                                const updated = prev.map(msg =>
                                    msg.id === aiMessageId ? finalMsg : msg
                                );
                                persistMessages(updated);
                                return updated;
                            });
                            setLoading(false);
                            if (abortControllerRef.current === abortController) {
                                abortControllerRef.current = null;
                            }
                        }
                    },
                    { systemPrompt: SYSTEM_PROMPT, signal: abortController.signal }
                );
            } catch (error) {
                console.error('[App] Chat error:', error);
                if (abortController.signal.aborted || error?.name === 'AbortError') {
                    setMessages(prev => {
                        const updated = prev.map(msg =>
                            msg.id === aiMessageId
                                ? { ...msg, sourceRefs: retrievalSourceRefs, typing: false, timestamp: Date.now() }
                                : msg
                        );
                        persistMessages(updated);
                        return updated;
                    });
                    setLoading(false);
                    if (abortControllerRef.current === abortController) {
                        abortControllerRef.current = null;
                    }
                    return;
                }
                // 兜底：将未预料的错误显示在气泡中，而不是删除消息
                const fallbackError = buildUserFriendlyErrorContent(
                    classifyAiError(null, error.message, error)
                );
                setMessages(prev => {
                    const updated = prev.map(msg =>
                        msg.id === aiMessageId
                            ? { ...msg, content: fallbackError, sourceRefs: retrievalSourceRefs, typing: false, timestamp: Date.now() }
                            : msg
                    );
                    persistMessages(updated);
                    return updated;
                });
                setLoading(false);
                if (abortControllerRef.current === abortController) {
                    abortControllerRef.current = null;
                }
            }
        };

        performChat();
    }, [
        activeReaderPage,
        activeSection,
        agentChatQaEnabled,
        chatContextMode,
        createAgentVibeCard,
        currentDocument,
        exportAgentNote,
        getCurrentService,
        ragEngineHealth?.available,
        selectedModel,
        persistMessages,
        selectedParagraphId,
    ]);

    const handleStopGenerating = useCallback(() => {
        abortControllerRef.current?.abort();
    }, []);

    // 从 PDF 段落注入到聊天
    const handleInjectPdfText = useCallback((text) => {
        if (!text) return;
        const prefix = t('ai-chat-pdf-context-prefix', null, 'Based on the following paper content:\n');
        setRightToolTab('chat');
        handleSubmit(prefix + text, []);
    }, [handleSubmit, setRightToolTab]);

    const handleInjectDocumentText = useCallback((text) => {
        if (!text) return;
        const prefix = t('ai-chat-document-context-prefix', null, 'Based on the following document content:\n');
        setRightToolTab('chat');
        handleSubmit(prefix + text, []);
    }, [handleSubmit, setRightToolTab]);

    const handleGenerateLensCard = useCallback(async (selection) => {
        if (!selection?.text?.trim()) return;
        if (!currentDocument?.id || currentDocument.kind !== 'pdf') {
            antMessage.warning('请先打开 PDF 文档');
            return;
        }

        const validation = validateRunnableModelConfig(selectedModel?.config);
        if (!validation.ok) {
            antMessage.error(validation.message);
            return;
        }

        const service = getCurrentService(validation.config);
        if (!service) {
            antMessage.error(t('vibe-ai-chat-prompt-configure-custom-first'));
            return;
        }

        const hideLoading = antMessage.loading('正在生成阅读卡片...', 0);
        try {
            const generateText = async (prompt) => {
                let finalText = '';
                let finalError = '';
                await service.chatStream(
                    prompt,
                    ({ done, fullMessage, error }) => {
                        if (!done) return;
                        finalText = fullMessage || '';
                        finalError = error || '';
                    },
                    { includeHistory: false, systemPrompt: SYSTEM_PROMPT }
                );
                if (finalError) throw new Error(finalError);
                return finalText;
            };

            const artifact = await generateLensCardArtifact({
                selection: {
                    ...selection,
                    documentId: currentDocument.id,
                    sourceType: 'pdf-selection',
                },
                document: currentDocument,
                modelId: selectedModel?.label || validation.config.model,
                generateText,
            });
            const saved = await createArtifact(artifact);
            enqueueSavedArtifactMemory(saved);
            setArtifacts((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
            setRightToolTab('artifacts');
            antMessage.success('已生成阅读卡片');
        } catch (error) {
            console.error('[App] Failed to generate Lens Card:', error);
            antMessage.error(error?.message || '生成阅读卡片失败');
        } finally {
            hideLoading();
        }
    }, [currentDocument, enqueueSavedArtifactMemory, getCurrentService, selectedModel, setRightToolTab]);

    const handleArtifactCreated = useCallback((artifact) => {
        if (!artifact?.id) return;
        enqueueSavedArtifactMemory(artifact);
        setArtifacts((items) => [artifact, ...items.filter((item) => item.id !== artifact.id)]);
        setRightToolTab('artifacts');
    }, [enqueueSavedArtifactMemory, setRightToolTab]);

    const handleArtifactUpdated = useCallback(async (artifact, patch) => {
        if (!artifact?.id) return;
        try {
            const updated = await updateArtifact(artifact.id, {
                ...patch,
                documentId: artifact.documentId || currentDocument?.id,
            });
            if (!updated) {
                antMessage.warning('没有找到要更新的卡片');
                return;
            }
            setArtifacts((items) => items.map((item) => (item.id === updated.id ? updated : item)));
            antMessage.success('卡片已更新');
        } catch (error) {
            console.error('[App] Failed to update artifact:', error);
            antMessage.error(error?.message || '更新卡片失败');
        }
    }, [currentDocument?.id]);

    const handleArtifactDeleted = useCallback(async (artifact) => {
        if (!artifact?.id) return;
        try {
            await deleteArtifact(artifact.id);
            setArtifacts((items) => items.filter((item) => item.id !== artifact.id));
            antMessage.success('卡片已删除');
        } catch (error) {
            console.error('[App] Failed to delete artifact:', error);
            antMessage.error(error?.message || '删除卡片失败');
        }
    }, []);

    const handleReadingNoteImported = useCallback(async (result) => {
        try {
            const persistentDocuments = await listPersistentDocuments();
            setDocuments(persistentDocuments.map((document) => ({
                ...document,
                isRecentOnly: true,
            })));

            const importedDocumentId = result?.document?.id;
            if (importedDocumentId && importedDocumentId === currentDocument?.id) {
                setArtifacts(await listArtifactsForDocument(importedDocumentId));
            }
        } catch (error) {
            console.warn('[App] Failed to refresh after reading note import:', error);
        }
    }, [currentDocument?.id, setDocuments]);

    const handleSaveTaskResult = useCallback(async (task) => {
        if (!currentDocument?.id || task?.documentId !== currentDocument.id) return;
        const body = taskResultContent(task);
        if (!body) {
            antMessage.warning('任务没有可保存的结果');
            return;
        }

        const title = taskResultTitle(task);
        const sourceRefs = taskResultSourceRefs(task);
        const firstSource = sourceRefs[0] || null;
        const content = {
            title,
            body,
            taskId: task.id,
            taskType: task.type,
            sourceRefs,
        };

        try {
            const saved = await createArtifact({
                documentId: currentDocument.id,
                type: 'reading_note',
                goal: title,
                sourceSpanIds: sourceRefs.map((sourceRef) => sourceRef.paragraphId).filter(Boolean),
                source: {
                    ...(firstSource || {}),
                    documentId: currentDocument.id,
                    taskId: task.id,
                    sourceType: 'agent-task',
                },
                originalContent: content,
                currentContent: content,
                verificationStatus: sourceRefs.length > 0 ? 'grounded' : 'ungrounded',
            });
            enqueueSavedArtifactMemory(saved);
            setArtifacts((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
            setRightToolTab('artifacts');
            antMessage.success('已保存到 Notes');
        } catch (error) {
            console.error('[App] Failed to save task result:', error);
            antMessage.error(error?.message || '保存任务结果失败');
        }
    }, [currentDocument?.id, enqueueSavedArtifactMemory, setRightToolTab]);

    const handleSaveAssistantAnswerCard = useCallback(async (assistantMessage) => {
        if (!assistantMessage?.content?.trim()) return;
        const documentId = currentDocument?.id || assistantMessage.sourceRefs?.[0]?.documentId;
        if (!documentId) {
            antMessage.warning('请先打开文档');
            return;
        }

        const assistantIndex = messages.findIndex((message) => message.id === assistantMessage.id);
        const previousUserMessage = assistantIndex >= 0
            ? messages.slice(0, assistantIndex).reverse().find((message) => message.role === 'user')
            : null;
        const question = messagePlainText(previousUserMessage?.content || '');
        const sourceRefs = Array.isArray(assistantMessage.sourceRefs) ? assistantMessage.sourceRefs : [];
        const firstSource = sourceRefs[0] || null;
        const content = {
            question,
            answer: assistantMessage.content,
            sourceRefs,
        };

        try {
            const saved = await createArtifact({
                documentId,
                type: 'explain_card',
                goal: answerCardTitle(question),
                sourceSpanIds: sourceRefs.map((sourceRef) => sourceRef.paragraphId).filter(Boolean),
                ...(firstSource ? { source: { ...firstSource, sourceType: 'assistant-answer' } } : {}),
                originalContent: content,
                currentContent: content,
                verificationStatus: sourceRefs.length > 0 ? 'grounded' : 'ungrounded',
            });
            enqueueSavedArtifactMemory(saved);
            setArtifacts((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
            setRightToolTab('artifacts');
            antMessage.success('已保存为阅读卡片');
        } catch (error) {
            console.error('[App] Failed to save assistant answer card:', error);
            antMessage.error(error?.message || '保存回答卡片失败');
        }
    }, [currentDocument?.id, enqueueSavedArtifactMemory, messages, setRightToolTab]);

    const handleNavigateArtifactSource = useCallback((artifact) => {
        const content = artifact?.currentContent || artifact?.originalContent || {};
        const firstSourceRef = Array.isArray(content.sourceRefs) ? content.sourceRefs.find(Boolean) : null;
        const source = artifact?.source || content.source || artifact?.originalContent?.source || firstSourceRef;
        if (!source) {
            antMessage.warning('这张卡片没有可回跳的来源');
            return;
        }

        if (source.paragraphId) {
            window.dispatchEvent(new CustomEvent('vibereader:navigate-paragraph', {
                detail: {
                    paragraphId: source.paragraphId,
                    page: source.page,
                    documentId: source.documentId || artifact?.documentId,
                    text: source.text || source.sourceText || source.selectedText || content.selectionText || '',
                },
            }));
            return;
        }

        window.dispatchEvent(new CustomEvent('vibereader:navigate-source-span', {
            detail: source,
        }));
    }, []);

    const handleNavigateSourceRef = useCallback((sourceRef) => {
        const navigateRawSourceRef = (targetSourceRef) => {
            if (!targetSourceRef) return;
            if (targetSourceRef.paragraphId) {
                window.dispatchEvent(new CustomEvent('vibereader:navigate-paragraph', {
                    detail: {
                        paragraphId: targetSourceRef.paragraphId,
                        page: targetSourceRef.page,
                        documentId: targetSourceRef.documentId,
                        text: targetSourceRef.text || targetSourceRef.sourceText || targetSourceRef.selectedText || '',
                    },
                }));
                return;
            }

            window.dispatchEvent(new CustomEvent('vibereader:navigate-source-span', {
                detail: targetSourceRef,
            }));
        };

        if (!sourceRef) return;
        if (isMemorySourceRef(sourceRef)) {
            if (sourceRef.artifactId) {
                setRightToolTab('artifacts');
                window.setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('vibereader:navigate-artifact', {
                        detail: {
                            artifactId: sourceRef.artifactId,
                            memoryId: sourceRef.memoryId,
                            sourceRef,
                        },
                    }));
                }, 0);
                return;
            }

            const firstSourceRef = Array.isArray(sourceRef.sourceRefs) ? sourceRef.sourceRefs.find(Boolean) : null;
            if (firstSourceRef) {
                navigateRawSourceRef(firstSourceRef);
                return;
            }
        }

        navigateRawSourceRef(sourceRef);
    }, [setRightToolTab]);

    // 从 Summary / MindMap 向 AI 提问
    const handleAskAI = useCallback((question) => {
        if (!question) return;
        handleSubmit(question, []);
    }, [handleSubmit]);

    const handleNavigateToParagraph = useCallback((paragraphId) => {
        if (!paragraphId) return;
        window.dispatchEvent(new CustomEvent('vibereader:navigate-paragraph', {
            detail: { paragraphId },
        }));
    }, []);

    // Listen for paragraph selections from PdfViewer to sync with the left Skim Map.
    useEffect(() => {
        const handleSelectParagraph = (event) => {
            const paragraphId = event.detail?.paragraphId;
            if (!paragraphId) return;
            setSelectedParagraphId(paragraphId);
        };
        window.addEventListener('vibereader:select-paragraph', handleSelectParagraph);
        return () => window.removeEventListener('vibereader:select-paragraph', handleSelectParagraph);
    }, []);

    const handleAiPaneDragEnter = useCallback((event) => {
        if (!hasDragInjectData(event.dataTransfer)) return;
        event.preventDefault();
        setDragInjectActive(true);
    }, []);

    const handleAiPaneDragOver = useCallback((event) => {
        if (!hasDragInjectData(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = DRAG_INJECT_EFFECT;
        setDragInjectActive(true);
    }, []);

    const handleAiPaneDragLeave = useCallback((event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget && event.currentTarget.contains(nextTarget)) return;
        setDragInjectActive(false);
    }, []);

    const handleAiPaneDrop = useCallback((event) => {
        const payload = readDragInjectData(event.dataTransfer);
        setDragInjectActive(false);
        if (!payload) return;

        event.preventDefault();
        event.stopPropagation();
        setRightToolTab('chat');
        setPendingDragInjection({
            id: createDragInjectDraftId(),
            text: formatDragInjectQuote(payload),
        });
    }, [setRightToolTab]);

    const handleChatInputDragInjectHandled = useCallback(() => {
        setDragInjectActive(false);
    }, []);

    const modelConfigValidation = validateRunnableModelConfig(selectedModel?.config);
    const modelConfigReady = modelConfigValidation.ok;
    const modelConfigButtonLabel = modelConfigReady
        ? t('ai-chat-model-service-current', { model: formatCustomModelLabel(modelConfigValidation.config.model) })
        : t('ai-chat-model-service-configure');
    const handleOpenModelConfig = useCallback(() => {
        setShowModelConfig(true);
    }, []);

    // 新建会话
    const handleNewSession = useCallback(() => {
        const newId = generateSessionId();
        setCurrentSessionId(newId);
        setMessages([]);
        clearPdf();
        aiService.clearHistory();
    }, []);

    // 切换会话
    const handleSwitchSession = useCallback(async (sessionId) => {
        setCurrentSessionId(sessionId);
        const msgs = await loadConversation(sessionId);
        setMessages(msgs || []);
        // 重建服务历史
        aiService.clearHistory();
        if (msgs) {
            msgs.forEach(msg => {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    // 简化：只重建文本历史，图片不重建
                    const content = typeof msg.content === 'string' ? msg.content : '';
                    if (content) {
                        aiService.addMessage(msg.role, content);
                    }
                }
            });
        }
    }, []);

    // 删除会话
    const handleDeleteSession = useCallback(async (sessionId) => {
        await deleteConversation(sessionId);
        const list = await listConversations();
        setSessions(list);
        if (sessionId === currentSessionIdRef.current) {
            if (list.length > 0) {
                await handleSwitchSession(list[0].sessionId);
            } else {
                handleNewSession();
            }
        }
    }, [handleSwitchSession, handleNewSession, setSessions]);

    // 清空当前会话
    const handleClearHistory = useCallback(() => {
        Modal.confirm({
            title: t('ai-chat-confirm-clear'),
            content: t('ai-chat-clear-body'),
            okText: '确认',
            cancelText: t('general-cancel'),
            onOk: async () => {
                aiService.clearHistory();
                setMessages([]);
                if (currentSessionIdRef.current) {
                    await saveConversation(currentSessionIdRef.current, []);
                }
                antMessage.success(t('ai-chat-cleared'));
            }
        });
    }, [setMessages]);

    // 渲染用户消息内容
    const renderUserMessageContent = useCallback((msg) => {
        return (
            <div>
                <div>{msg.content}</div>
                {msg.images && msg.images.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {msg.images.map((img, idx) => (
                            <img
                                key={idx}
                                src={chatImageDataUrl(img)}
                                alt={img.name || ''}
                                style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8 }}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }, []);

    const handleWorkspaceDividerMouseDown = useCallback((event) => {
        event.preventDefault();
        const container = event.currentTarget.parentElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();

        const handleMouseMove = (moveEvent) => {
            const nextRatio = (moveEvent.clientX - rect.left) / rect.width;
            setWorkspaceSplitRatio(nextRatio);
        };

        const stopDragging = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', stopDragging);
            document.body.classList.remove('workspace-resizing');
        };

        document.body.classList.add('workspace-resizing');
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopDragging);
    }, [setWorkspaceSplitRatio]);

    // 获取会话标题
    const getSessionTitle = useCallback((session) => {
        if (!session) return t('ai-chat-empty-session');
        if (session.title) return session.title;
        return `Session ${session.sessionId.slice(-6)}`;
    }, []);

    if (!historyLoaded) {
        return (
            <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <>
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            {/* 侧边栏 */}
            {!sidebarCollapsed && (
                <div style={{
                    width: 260,
                    borderRight: '1px solid #e0e0e0',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#f5f5f5'
                }}>
                    {/* Logo 区域 */}
                    <div style={{ padding: '16px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {vibeReaderLogo}
                        <span style={{ fontSize: 16, fontWeight: 600 }}>VibeReader Dev</span>
                    </div>

                    {/* 新会话按钮 */}
                    <div style={{ padding: '8px 12px' }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleNewSession} block>
                            {t('ai-chat-new-session')}
                        </Button>
                    </div>

                    {/* PDF 上传 */}
                    <div style={{ padding: '0 12px 12px' }}>
                        <div
                            onClick={handleOpenDocument}
                            onDrop={handleDocumentDrop}
                            onDragOver={(e) => e.preventDefault()}
                            style={{
                                border: '2px dashed #d9d9d9',
                                borderRadius: 6,
                                padding: 12,
                                textAlign: 'center',
                                cursor: 'pointer',
                                background: '#fff'
                            }}
                        >
                            <FilePdfOutlined style={{ fontSize: 24, color: currentDocument ? '#52c41a' : '#999' }} />
                            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                {pdfParsing
                                    ? t('ai-chat-pdf-parsing')
                                    : currentDocument
                                        ? `${currentDocument.name}`
                                        : t('ai-chat-pdf-upload-drag')
                                }
                            </div>
                            <Button
                                type="link"
                                size="small"
                                icon={<FolderOpenOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDocument();
                                }}
                                style={{ padding: 0, height: 22, marginTop: 4 }}
                            >
                                {t('ai-chat-open-local-file', null, '打开文件')}
                            </Button>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={SUPPORTED_DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleDocumentFile(file);
                                e.target.value = '';
                            }}
                        />
                    </div>

                    {documents.length > 0 && (
                        <div style={{ padding: '0 12px 12px' }}>
                            <div style={{ fontSize: 12, color: '#999', marginBottom: 8, fontWeight: 500 }}>
                                最近文档
                            </div>
                            {documents.slice(0, 5).map((document) => (
                                <button
                                    key={document.id}
                                    type="button"
                                    onClick={() => handleRecentDocumentClick(document)}
                                    title={document.path || document.name}
                                    style={{
                                        width: '100%',
                                        padding: '8px 10px',
                                        border: 'none',
                                        borderRadius: 6,
                                        marginBottom: 4,
                                        cursor: 'pointer',
                                        background: document.id === currentDocument?.id ? '#e6f4ff' : 'transparent',
                                        color: '#262626',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 8,
                                        textAlign: 'left',
                                    }}
                                >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                                        {document.name}
                                    </span>
                                    <span style={{ color: '#999', fontSize: 11, textTransform: 'uppercase', flexShrink: 0 }}>
                                        {document.kind}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* 会话列表 */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
                        <div style={{ fontSize: 12, color: '#999', marginBottom: 8, fontWeight: 500 }}>
                            {t('ai-chat-session-list')}
                        </div>
                        {sessions.map(session => (
                            <div
                                key={session.sessionId}
                                onClick={() => handleSwitchSession(session.sessionId)}
                                style={{
                                    padding: '8px 10px',
                                    borderRadius: 6,
                                    marginBottom: 4,
                                    cursor: 'pointer',
                                    background: session.sessionId === currentSessionId ? '#e6e6e6' : 'transparent',
                                    fontSize: 13,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                    {getSessionTitle(session)}
                                </span>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<DeleteOutlined />}
                                    onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.sessionId); }}
                                    style={{ padding: '0 4px', opacity: 0.5 }}
                                />
                            </div>
                        ))}
                    </div>

                    {/* 底部：帮助 + 模型配置 */}
                    <div style={{
                        padding: '8px 12px',
                        borderTop: '1px solid var(--fill-quinary)',
                        display: 'flex',
                        gap: 4,
                    }}>
                        <Button
                            type="text"
                            size="small"
                            icon={<QuestionCircleOutlined />}
                            onClick={() => setShowHelpGuide(true)}
                            style={{ flex: 1, justifyContent: 'center' }}
                            title="使用指南"
                        >
                            指南
                        </Button>
                        <Button
                            type="text"
                            size="small"
                            icon={<SettingOutlined />}
                            onClick={() => setShowModelConfig(true)}
                            style={{ flex: 1, justifyContent: 'center' }}
                            title="配置模型服务"
                        >
                            配置
                        </Button>
                    </div>
                </div>
            )}

            {/* 主区域 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* 头部：三段式（左文档标识 / 中主行动 / 右次级） */}
            <div className="vr-topbar">
                {/* 左：文档标识 —— 弱存在 */}
                <div className="vr-topbar-doc">
                    <Button
                        type="text"
                        size="small"
                        icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        style={{ marginRight: 4 }}
                    />
                    <div className="vr-topbar-doc-glyph">📄</div>
                    <div style={{ minWidth: 0 }}>
                        <div className="vr-topbar-doc-name">{currentDocument?.name || '工作台'}</div>
                        <div className="vr-topbar-doc-sub">
                            {currentDocument?.id
                                ? `${knowledgeIngestStatusText(knowledgeIngestStatus)} · ${ragEngineStatusText(ragEngineHealth)}`
                                : '未打开文档'}
                        </div>
                    </div>
                </div>

                {/* 中：主行动 —— 唯一焦点 */}
                <Button
                    className="vr-topbar-primary"
                    size="small"
                    icon={<ThunderboltOutlined />}
                    disabled={!currentDocument?.id}
                    onClick={handleStartDeepRead}
                    title="生成论文总览、阅读路线和带原文依据的阅读卡片"
                >
                    开始精读
                </Button>

                {/* 右：次级操作 + 状态 */}
                <div className="vr-topbar-actions">
                    {currentDocument?.id && (() => {
                        const colors = knowledgeIngestStatusColor(knowledgeIngestStatus);
                        return (
                            <span
                                title={knowledgeIngestStatusTitle(knowledgeIngestStatus)}
                                style={{
                                    color: colors.color,
                                    background: colors.background,
                                    border: `1px solid ${colors.border}`,
                                    borderRadius: 6,
                                    padding: '3px 8px',
                                    fontSize: 12,
                                    lineHeight: '18px',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {knowledgeIngestStatusText(knowledgeIngestStatus)}
                            </span>
                        );
                    })()}
                    {currentDocument?.id && savedMemoryIngestStatus?.status !== 'idle' && (() => {
                        const colors = savedMemoryStatusColor(savedMemoryIngestStatus);
                        return (
                            <span
                                title={savedMemoryStatusTitle(savedMemoryIngestStatus)}
                                style={{
                                    color: colors.color,
                                    background: colors.background,
                                    border: `1px solid ${colors.border}`,
                                    borderRadius: 6,
                                    padding: '3px 8px',
                                    fontSize: 12,
                                    lineHeight: '18px',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {savedMemoryStatusText(savedMemoryIngestStatus)}
                            </span>
                        );
                    })()}
                    <span
                        title={ragEngineStatusTitle(ragEngineHealth)}
                        style={{
                            color: ragEngineHealth?.available ? '#237804' : '#8c6d1f',
                            background: ragEngineHealth?.available ? '#f6ffed' : '#fffbe6',
                            border: `1px solid ${ragEngineHealth?.available ? '#b7eb8f' : '#ffe58f'}`,
                            borderRadius: 6,
                            padding: '3px 8px',
                            fontSize: 12,
                            lineHeight: '18px',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {ragEngineStatusText(ragEngineHealth)}
                    </span>
                    <Button
                        className="vr-ghost"
                        type="text"
                        size="small"
                        icon={<SettingOutlined />}
                        onClick={handleOpenModelConfig}
                        title={modelConfigButtonLabel}
                        style={{ maxWidth: 320, minWidth: 0 }}
                    >
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {modelConfigButtonLabel}
                        </span>
                    </Button>
                    {rightToolTab === 'chat' && (
                        <>
                            <Button
                                className="vr-ghost"
                                type="text"
                                icon={<FontSizeOutlined />}
                                onClick={() => setShowFontSlider(!showFontSlider)}
                            />
                            {showFontSlider && (
                                <div style={{ width: 120 }}>
                                    <Slider
                                        min={0.8}
                                        max={1.5}
                                        step={0.1}
                                        value={fontScale}
                                        onChange={handleFontScaleChange}
                                    />
                                </div>
                            )}
                            <Button
                                className="vr-ghost"
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={handleClearHistory}
                            >
                                {t('ai-chat-clear-history')}
                            </Button>
                        </>
                    )}
                </div>
            </div>

                <div className="workspace-body">
                    <div
                        className="workspace-reading-surface"
                        style={{ flexBasis: `${workspaceSplitRatio * 100}%` }}
                    >
                        <aside
                            className="workspace-skim-map-pane"
                            role="complementary"
                            aria-label="阅读地图"
                        >
                            <Suspense fallback={<PanelFallback />}>
                                <ThinkingTreePanel
                                    documentId={currentDocument?.id}
                                    title="阅读地图"
                                    generateLabel="生成阅读地图"
                                    progressText="正在生成文档阅读地图..."
                                    onAskAI={handleAskAI}
                                    onNavigateToParagraph={handleNavigateToParagraph}
                                    activeParagraphId={selectedParagraphId}
                                    style={{ flex: 1 }}
                                />
                            </Suspense>
                        </aside>

                        <section className="workspace-reader-pane">
                            <div className="workspace-pane-header">
                                <span><FileTextOutlined /> {currentDocument?.name || 'Reader'}</span>
                                <span className="workspace-pane-meta">
                                    {currentDocument?.kind === 'pdf' && pdfText
                                        ? t('ai-chat-pdf-parsed', { pages: pdfPages })
                                        : currentDocument?.kind || t('ai-chat-pdf-upload-drag')}
                                </span>
                            </div>
                            <div className="workspace-pane-content">
                                {currentDocument && (currentDocument.kind !== 'pdf' || currentDocument.textMode) ? (
                                    // 恢复的 PDF（textMode，无二进制）以文本模式展示提取内容
                                    <DocumentReader document={currentDocument} onInject={handleInjectDocumentText} style={{ flex: 1, minHeight: 0 }} />
                                ) : (
                                    <PdfViewer
                                        onInject={handleInjectPdfText}
                                        onGenerateLensCard={handleGenerateLensCard}
                                        onPageChange={setActiveReaderPage}
                                        documentId={currentDocument?.id}
                                        insights={insights}
                                        style={{ flex: 1, minHeight: 0 }}
                                    />
                                )}
                            </div>
                        </section>
                    </div>

                    <div
                        className="workspace-divider"
                        role="separator"
                        aria-orientation="vertical"
                        onMouseDown={handleWorkspaceDividerMouseDown}
                    />

                    <section
                        className={`workspace-ai-pane${dragInjectActive ? ' drag-over' : ''}`}
                        onDragEnter={handleAiPaneDragEnter}
                        onDragLeave={handleAiPaneDragLeave}
                        onDragOver={handleAiPaneDragOver}
                        onDrop={handleAiPaneDrop}
                    >
                        <Tabs
                            activeKey={rightToolTab}
                            onChange={setRightToolTab}
                            size="small"
                            className="workspace-ai-tabs"
                            items={[
                                { key: 'navigator', label: <span><CompassOutlined /> 阅读路线</span> },
                                { key: 'flashcard', label: <span><BookOutlined /> {t('ai-chat-tab-cards')}</span> },
                                { key: 'artifacts', label: <span><FileTextOutlined /> {t('ai-chat-tab-notes')}</span> },
                                { key: 'chat', label: <span><CommentOutlined /> {t('ai-chat-tab-chat')}</span> },
                            ]}
                        />

                        <div className="workspace-ai-content">
                            {rightToolTab === 'chat' && (
                                <div className="workspace-chat-context-bar">
                                    <span className="workspace-chat-context-label">上下文</span>
                                    <Segmented
                                        size="small"
                                        aria-label="Chat context"
                                        value={chatContextMode}
                                        onChange={setChatContextMode}
                                        options={[
                                            { label: '相关片段', value: 'relevant' },
                                            { label: '当前页', value: 'page' },
                                            { label: '当前章节', value: 'section', disabled: !activeSection },
                                            { label: '选中段落', value: 'paragraph', disabled: !selectedParagraphId },
                                        ]}
                                    />
                                    <span className="workspace-chat-context-label" title="可选：用文档工具循环回答（默认关）">问答</span>
                                    <Segmented
                                        size="small"
                                        aria-label="Agent document QA"
                                        value={agentChatQaEnabled ? 'agent' : 'direct'}
                                        onChange={(value) => {
                                            const next = value === 'agent';
                                            setAgentDocumentQaEnabled(next);
                                            setAgentChatQaEnabled(next);
                                        }}
                                        options={[
                                            { label: '直连', value: 'direct' },
                                            {
                                                label: '工具',
                                                value: 'agent',
                                                disabled: !currentDocument?.id,
                                            },
                                        ]}
                                    />
                                    <span className="workspace-chat-context-page">
                                        P{activeReaderPage || 1}{activeSection?.title ? ` · ${activeSection.title}` : ''}
                                    </span>
                                </div>
                            )}

                            {rightToolTab === 'chat' && (
                                <div
                                    ref={messagesContainerRef}
                                    className="workspace-messages"
                                >
                                    {messages.length === 0 && (
                                        <div className="workspace-empty-chat">
                                            {vibeReaderLogo}
                                            <div style={{ marginTop: 16, fontSize: 16 }}>
                                                {t('ai-chat-empty-session')}
                                            </div>
                                        </div>
                                    )}
                                    {messages.map((msg) => (
                                        <div key={msg.id} style={{ marginBottom: 16, fontSize: `${14 * fontScale}px` }}>
                                            <Bubble
                                                placement={roles[msg.role]?.placement || 'start'}
                                                variant={roles[msg.role]?.variant || 'shadow'}
                                                loading={msg.typing}
                                                loadingRender={msg.role === 'assistant' ? roles.assistant.loadingRender : undefined}
                                                content={
                                                    msg.role === 'assistant' ? (
                                                        <div>
                                                            {msg.hasThinking && msg.thinking && (
                                                                <details style={{ marginBottom: 8, fontSize: `${12 * fontScale}px` }}>
                                                                    <summary style={{ color: '#888', cursor: 'pointer', userSelect: 'none' }}>
                                                                        {t('ai-chat-thinking', null, 'Thinking')} ({msg.thinking.length})
                                                                    </summary>
                                                                    <div style={{
                                                                        padding: 8,
                                                                        background: '#f8f9fa',
                                                                        borderRadius: 4,
                                                                        color: '#666',
                                                                        marginTop: 4,
                                                                        whiteSpace: 'pre-wrap',
                                                                        lineHeight: 1.5,
                                                                        maxHeight: 300,
                                                                        overflow: 'auto',
                                                                    }}>
                                                                        {msg.thinking}
                                                                    </div>
                                                                </details>
                                                            )}
                                                            <MarkdownRenderer content={msg.content} onExplainCode={handleAskAI} />
                                                            <AssistantSourceRefs
                                                                sourceRefs={msg.sourceRefs}
                                                                onNavigate={handleNavigateSourceRef}
                                                            />
                                                            {!msg.typing && msg.content && (
                                                                <div className="assistant-message-actions">
                                                                    <Button
                                                                        size="small"
                                                                        type="text"
                                                                        onClick={() => handleSaveAssistantAnswerCard(msg)}
                                                                    >
                                                                        保存回答卡片
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        renderUserMessageContent(msg)
                                                    )
                                                }
                                            />
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                            )}
                            {rightToolTab === 'summary' && (
                                <Suspense fallback={<PanelFallback />}>
                                    <SummaryPanel
                                        documentId={currentDocument?.id}
                                        onAskAI={handleAskAI}
                                        onArtifactCreated={handleArtifactCreated}
                                        style={{ flex: 1 }}
                                    />
                                </Suspense>
                            )}
                            {rightToolTab === 'flashcard' && (
                                <Suspense fallback={<PanelFallback />}>
                                    <FlashcardDeck documentId={currentDocument?.id} style={{ flex: 1 }} />
                                </Suspense>
                            )}
                            {rightToolTab === 'navigator' && (
                                <div className="workspace-deep-read-panel">
                                    <Suspense fallback={<PanelFallback />}>
                                        <AttentionNavigatorPanel
                                            documentId={currentDocument?.id}
                                            onNavigateToParagraph={handleNavigateToParagraph}
                                            onInsightsChange={setInsights}
                                            onArtifactCreated={handleArtifactCreated}
                                            onAskAI={handleAskAI}
                                            onStartDeepRead={handleStartDeepRead}
                                            style={{ flex: '1 1 auto' }}
                                        />
                                    </Suspense>
                                    <Suspense fallback={<PanelFallback />}>
                                        <TaskStatusPanel
                                            agentSkills={runnableReadingAgentSkills({
                                                useLlm: validateRunnableModelConfig(selectedModel?.config).ok,
                                            })}
                                            compact
                                            documentId={currentDocument?.id}
                                            onRetryTask={handleRetryTask}
                                            onStartAgentTask={handleStartAgentTask}
                                            onSaveTaskResult={handleSaveTaskResult}
                                            style={{ flex: '0 0 auto' }}
                                        />
                                    </Suspense>
                                </div>
                            )}
                            {rightToolTab === 'artifacts' && (
                                <Suspense fallback={<PanelFallback />}>
                                    <ArtifactPanel
                                        documentId={currentDocument?.id}
                                        documentName={currentDocument?.name}
                                        artifacts={artifacts}
                                        onNavigateToSource={handleNavigateArtifactSource}
                                        onArtifactUpdated={handleArtifactUpdated}
                                        onArtifactDeleted={handleArtifactDeleted}
                                        onReadingNoteImported={handleReadingNoteImported}
                                    />
                                </Suspense>
                            )}
                        </div>

                        {rightToolTab === 'chat' && (
                            <div className="workspace-input">
                                <ChatInput
                                    currentModel={selectedModel}
                                    onModelChange={handleModelChange}
                                    onSubmit={handleSubmit}
                                    onStop={handleStopGenerating}
                                    loading={loading}
                                    visionCapable={visionCapable}
                                    pendingInjection={pendingDragInjection}
                                    onDragInjectHandled={handleChatInputDragInjectHandled}
                                />
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>

        <OnboardingOverlay onDismiss={() => setShowOnboarding(false)} />
        <HelpGuide open={showHelpGuide} onClose={() => setShowHelpGuide(false)} />
        <ModelConfigModal open={showModelConfig} onClose={() => setShowModelConfig(false)} onSaved={() => setModelConfigsVersion(v => v + 1)} />
        </>
    );
}

const rootElement = document.getElementById('root');
if (rootElement && import.meta.env.MODE !== 'test') {
    const root = createRoot(rootElement);
    root.render(<App />);
}
