import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createEditor, Editor, Transforms } from 'slate';
import { withHistory } from 'slate-history';
import { Editable, Slate, withReact } from 'slate-react';
import { GlobalOutlined, DownOutlined, SettingOutlined, PlusOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import { Button, Flex, theme, Dropdown, message as antMessage, Modal, Form, Input, Select } from 'antd';
import { t, formatCustomModelLabel, isZhLocale } from './i18n';
import {
    getModelConfigs, saveModelConfigs, getSelectedConfigId, setSelectedConfigId
} from './storage';
import { findPreset, getProviderOptions, getModelOptions } from './modelPresets';
import modelIcon from '../icons/model.svg';
import ImageUploader from './ImageUploader';
import ImagePreview from './ImagePreview';
import { fetchWebContent, formatAsMarkdownBlock } from './browserTool';
import { ChatSubmitControl } from './ChatSubmitControl';
import {
    DRAG_INJECT_EFFECT,
    formatDragInjectQuote,
    hasDragInjectData,
    readDragInjectData,
} from './dragInject';

const MENU_SLOT_PX = 20;
const TOOLBAR_ICON_PX = 18;

function getPresetKey(preset, fallback = '') {
    return preset?.providerKey || preset?.id || fallback || '';
}

function getPresetApiFormat(preset, fallback = 'openai') {
    if (!preset) return fallback;
    if (preset.apiType === 'anthropic-compatible') return 'anthropic';
    if (Array.isArray(preset.apiFormats) && preset.apiFormats.length) return preset.apiFormats[0];
    return fallback;
}

function findPresetForConfig(config) {
    if (!config) return null;
    const byKey = findPreset(config.providerKey || config.presetKey || '');
    if (byKey) return byKey;

    const baseUrl = config.baseUrl || config.baseURL || '';
    const modelName = config.modelName || config.name || '';
    for (const option of getProviderOptions()) {
        const preset = findPreset(option.key);
        if (!preset) continue;
        const modelMatch = preset.models?.some((model) => model.id === modelName || model.name === modelName);
        const baseMatch = baseUrl && preset.baseUrl && baseUrl.includes(preset.baseUrl.replace(/\/v\d+$/, '').replace(/\/$/, ''));
        if (modelMatch && (baseUrl === preset.baseUrl || baseMatch)) return preset;
    }
    return null;
}

// 叶子节点渲染器
const Leaf = ({ attributes, children }) => {
    return <span {...attributes}>{children}</span>;
};

const initialEditorValue = [
    {
        type: 'paragraph',
        children: [{ text: '' }],
    },
];

function ChatInput({ currentModel, onModelChange, onSubmit, onStop, loading, visionCapable, pendingInjection, onDragInjectHandled, configOpenSignal = 0 }) {
    const { token } = theme.useToken();
    const [form] = Form.useForm();
    const [editor] = useState(() => withReact(withHistory(createEditor())));
    const [value, setValue] = useState(initialEditorValue);

    // 模型配置弹窗
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [customConfigs, setCustomConfigs] = useState([]);
    const [editingConfigId, setEditingConfigId] = useState(null);
    const [addFormFlash, setAddFormFlash] = useState(false);
    const [webSearchEnabled, setWebSearchEnabled] = useState(false);

    // 网页内容获取工具
    const [isBrowserModalOpen, setIsBrowserModalOpen] = useState(false);
    const [browserUrl, setBrowserUrl] = useState('');
    const [browserLoading, setBrowserLoading] = useState(false);
    const lastInjectionIdRef = useRef(null);
    const lastConfigOpenSignalRef = useRef(0);

    // 预设选择
    const [selectedPresetKey, setSelectedPresetKey] = useState(null);
    const [configsVersion, setConfigsVersion] = useState(0);

    const apiFormatWatched = Form.useWatch('apiFormat', form);
    const apiFormatForUrlPlaceholder = apiFormatWatched ?? 'openai';
    const modelNameWatched = Form.useWatch('modelName', form);

    const syncFormFromConfig = useCallback((config) => {
        const preset = findPresetForConfig(config);
        const presetKey = getPresetKey(preset, config?.providerKey || config?.presetKey || '');
        setSelectedPresetKey(presetKey || null);
        form.setFieldsValue({
            baseUrl: config?.baseUrl || config?.baseURL || '',
            apiKey: config?.apiKey || '',
            modelName: config?.modelName || config?.name || '',
            apiFormat: getPresetApiFormat(preset, config?.apiFormat || 'openai')
        });
    }, [form]);

    // Re-read when model config modal signals a save or external change
    useEffect(() => {
        if (!configOpenSignal) return;
        setConfigsVersion(v => v + 1);
    }, [configOpenSignal]);

    useEffect(() => {
        const handler = () => setConfigsVersion(v => v + 1);
        window.addEventListener('vibereader:model-configs-changed', handler);
        return () => window.removeEventListener('vibereader:model-configs-changed', handler);
    }, []);

    // 读取所有自定义模型配置
    const getCustomModelConfigs = useCallback(() => {
        try {
            const configs = getModelConfigs();
            return Array.isArray(configs) ? configs : [];
        } catch (e) {
            console.warn('[ChatInput] Failed to get custom model configs:', e);
            return [];
        }
    }, [configsVersion]);

    // 根据 configId 获取单条配置（兼容旧数据 baseURL → baseUrl）
    const getCustomModelConfigById = useCallback((configId) => {
        const configs = getCustomModelConfigs();
        const raw = configs.find(c => c.id === configId) || null;
        if (!raw) return null;
        return { ...raw, baseUrl: raw.baseUrl || raw.baseURL || '' };
    }, [getCustomModelConfigs]);

    // 保存配置列表
    const saveCustomModelConfigs = useCallback((configs) => {
        try {
            saveModelConfigs(configs);
            return true;
        } catch (e) {
            console.error('[ChatInput] Failed to save custom model configs:', e);
            return false;
        }
    }, []);

    // 打开弹窗时：有配置则默认选中当前项或列表第一项并填入表单；无配置则进入「新建」空表
    useEffect(() => {
        if (!isConfigModalOpen) return;
        const list = getCustomModelConfigs();
        setCustomConfigs(list);
        setSelectedPresetKey(null);
        if (!list.length) {
            setEditingConfigId(null);
            form.resetFields();
            form.setFieldsValue({ apiFormat: 'openai' });
            return;
        }
        const prefId = getSelectedConfigId();
        const pick = list.find(c => c.id === prefId) || list[0];
        setEditingConfigId(pick.id);
        syncFormFromConfig(pick);
    }, [isConfigModalOpen, getCustomModelConfigs, form, syncFormFromConfig]);

    useEffect(() => {
        if (!configOpenSignal || configOpenSignal === lastConfigOpenSignalRef.current) return;
        lastConfigOpenSignalRef.current = configOpenSignal;
        setIsConfigModalOpen(true);
    }, [configOpenSignal]);

    const handleSaveConfig = () => {
        form.validateFields().then(values => {
            const wasEditing = !!editingConfigId;
            const { baseUrl, apiKey, modelName, apiFormat } = values;
            const configs = getCustomModelConfigs();
            const configToSave = {
                baseUrl,
                apiKey,
                modelName,
                apiFormat: apiFormat || 'openai',
                providerKey: selectedPresetKey || '',
                requiresApiKey: selectedPreset ? selectedPreset.requiresApiKey !== false : true,
                authType: selectedPreset?.authType || 'bearer',
            };

            if (editingConfigId) {
                const idx = configs.findIndex(c => c.id === editingConfigId);
                if (idx >= 0) {
                    configs[idx] = { ...configs[idx], ...configToSave };
                }
            } else {
                configs.push({
                    id: `custom-${Date.now()}`,
                    ...configToSave
                });
            }

            if (saveCustomModelConfigs(configs)) {
                const editedId = editingConfigId;
                setCustomConfigs(configs);
                const target = wasEditing && editedId
                    ? configs.find(c => c.id === editedId)
                    : configs[configs.length - 1];
                if (target) {
                    setEditingConfigId(target.id);
                    syncFormFromConfig(target);
                } else {
                    setEditingConfigId(null);
                    setSelectedPresetKey(null);
                    form.resetFields();
                    form.setFieldsValue({ apiFormat: 'openai' });
                }
                antMessage.success(t(wasEditing ? 'vibe-ai-chat-config-updated' : 'vibe-ai-chat-config-added'));
                if (onModelChange && configs.length > 0 && target) {
                    setSelectedConfigId(target.id);
                    onModelChange({
                        key: 'custom',
                        label: formatCustomModelLabel(target.modelName),
                        configId: target.id,
                        config: target
                    });
                }
            } else {
                antMessage.error(t('vibe-ai-chat-config-save-failed'));
            }
        });
    };

    const handleDeleteConfig = (config) => {
        const displayName = getConfigDisplayName(config);
        Modal.confirm({
            title: t('vibe-ai-chat-confirm-delete-title'),
            content: t('vibe-ai-chat-confirm-delete-body', { name: displayName }),
            okText: t('vibe-ai-chat-button-delete'),
            cancelText: t('general-cancel'),
            okButtonProps: { danger: true },
            centered: true,
            bodyStyle: { textAlign: 'center' },
            wrapClassName: 'ai-chat-modal',
            zIndex: 10002,
            onOk: () => {
                const idToDelete = config.id;
                const configs = getCustomModelConfigs().filter(c => c.id !== idToDelete);
                if (saveCustomModelConfigs(configs)) {
                    setCustomConfigs(configs);
                    setSelectedConfigId(configs.length > 0 ? configs[0].id : null);
                    if (editingConfigId === idToDelete) {
                        if (configs.length === 0) {
                            setEditingConfigId(null);
                            form.resetFields();
                            form.setFieldsValue({ apiFormat: 'openai' });
                        } else {
                            const next = configs[0];
                            setEditingConfigId(next.id);
                            syncFormFromConfig(next);
                        }
                    }
                    antMessage.success(t('vibe-ai-chat-config-deleted'));
                }
            }
        });
    };

    const handleAddConfig = () => {
        const alreadyOnAddPage = editingConfigId === null;
        setEditingConfigId(null);
        setSelectedPresetKey(null);
        form.resetFields();
        form.setFieldsValue({ apiFormat: 'openai' });
        if (alreadyOnAddPage) {
            setAddFormFlash(false);
            requestAnimationFrame(() => {
                setAddFormFlash(true);
                window.setTimeout(() => setAddFormFlash(false), 550);
            });
        }
    };

    const handleSelectConfigToEdit = (config) => {
        setEditingConfigId(config.id);
        syncFormFromConfig(config);
    };

    // 预设选择处理
    const handlePresetChange = (providerKey) => {
        setSelectedPresetKey(providerKey || null);
        const preset = findPreset(providerKey);
        if (preset) {
            const model = preset.models[0];
            form.setFieldsValue({
                baseUrl: preset.baseUrl,
                modelName: model ? model.id : '',
                apiFormat: getPresetApiFormat(preset),
                authType: preset.authType || 'bearer',
            });
        } else {
            form.setFieldsValue({ modelName: undefined });
        }
    };

    const handlePresetModelChange = (modelId) => {
        if (!selectedPresetKey) return;
        const preset = findPreset(selectedPresetKey);
        if (preset) {
            form.setFieldsValue({
                baseUrl: preset.baseUrl,
                modelName: modelId,
                apiFormat: getPresetApiFormat(preset)
            });
        }
    };

    const getConfigDisplayName = (c) => c.modelName || c.name || t('vibe-ai-chat-unnamed');

    // 图片状态
    const [attachedImages, setAttachedImages] = useState([]);

    const renderLeaf = useCallback((props) => <Leaf {...props} />, []);

    // 提取纯文本
    const extractContent = () => {
        const text = editor.children
            .map((node) => {
                return node.children
                    .map((child) => child.text || '')
                    .join('');
            })
            .join('\n');
        return { text };
    };

    // 检查编辑器是否为空（包括图片）
    const isEditorEmpty = () => {
        const { text } = extractContent();
        return !text.trim() && attachedImages.length === 0;
    };

    const insertDraftText = useCallback((text) => {
        const existingText = Editor.string(editor, []);
        const prefix = existingText.trim() ? '\n\n' : '';
        Transforms.select(editor, Editor.end(editor, []));
        Transforms.insertText(editor, `${prefix}${text}`);
    }, [editor]);

    useEffect(() => {
        if (!pendingInjection?.id || !pendingInjection.text) return;
        if (lastInjectionIdRef.current === pendingInjection.id) return;
        lastInjectionIdRef.current = pendingInjection.id;

        insertDraftText(pendingInjection.text);
    }, [insertDraftText, pendingInjection]);

    const handleDragOver = useCallback((event) => {
        if (!hasDragInjectData(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = DRAG_INJECT_EFFECT;
    }, []);

    const handleDrop = useCallback((event) => {
        const payload = readDragInjectData(event.dataTransfer);
        if (!payload) return;

        event.preventDefault();
        event.stopPropagation();
        insertDraftText(formatDragInjectQuote(payload));
        onDragInjectHandled?.();
    }, [insertDraftText, onDragInjectHandled]);

    // 附图仅本地 base64
    const handleImageSelect = useCallback(async (imageData) => {
        if (!visionCapable) {
            antMessage.warning(
                t('vibe-ai-chat-multimodal-not-supported', {
                    model: currentModel?.label || currentModel?.key || '',
                })
            );
            return;
        }
        setAttachedImages(prev => [...prev, { ...imageData, base64: imageData.base64 }]);
        antMessage.success('已添加图片');
    }, [visionCapable, currentModel?.label, currentModel?.key]);

    // 移除图片
    const handleImageRemove = useCallback((index) => {
        setAttachedImages(prev => prev.filter((_, i) => i !== index));
    }, []);

    /** 从 MIME 取上传用扩展名 */
    const extFromImageMime = useCallback((mime) => {
        if (!mime || !mime.startsWith('image/')) return 'png';
        const sub = mime.slice('image/'.length).toLowerCase();
        if (sub === 'jpeg') return 'jpg';
        return sub.replace(/[^a-z0-9]/g, '') || 'png';
    }, []);

    // Ctrl/Cmd+V 粘贴图片
    const handlePaste = useCallback(
        async (event) => {
            const dt = event.clipboardData;
            if (!dt) return;

            const imageFiles = [];
            const seen = new Set();
            const pushFile = (file) => {
                if (!file || !file.type?.startsWith('image/')) return;
                const key = `${file.size}:${file.type}:${file.lastModified}`;
                if (seen.has(key)) return;
                seen.add(key);
                imageFiles.push(file);
            };

            if (dt.items?.length) {
                for (let i = 0; i < dt.items.length; i++) {
                    const item = dt.items[i];
                    if (item.kind === 'file' && item.type?.startsWith('image/')) {
                        const f = item.getAsFile();
                        pushFile(f);
                    }
                }
            }
            if (dt.files?.length) {
                for (let i = 0; i < dt.files.length; i++) {
                    pushFile(dt.files[i]);
                }
            }

            for (const file of imageFiles) {
                try {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    const base64 = await new Promise((resolve, reject) => {
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                    });
                    await handleImageSelect({
                        name: `clipboard-${Date.now()}.${extFromImageMime(file.type)}`,
                        type: file.type,
                        base64,
                    });
                } catch (e) {
                    console.error('[ChatInput] Paste image error:', e);
                }
            }
        },
        [extFromImageMime, handleImageSelect]
    );

    // 内部提交状态，防止快速重复点击
    const submittingRef = useRef(false);

    // 处理发送
    const handleSubmit = useCallback(async () => {
        if (isEditorEmpty() || loading || submittingRef.current) return;
        submittingRef.current = true;

        try {
            const { text } = extractContent();
            const imagesToSend = [...attachedImages];

            // 立即清空 UI
            Transforms.delete(editor, {
                at: {
                    anchor: Editor.start(editor, []),
                    focus: Editor.end(editor, []),
                },
            });
            setAttachedImages([]);

            onSubmit(text, imagesToSend);
        } catch (e) {
            console.error('[ChatInput] handleSubmit execution failed:', e);
            antMessage.error('发送失败: ' + e.message);
        } finally {
            submittingRef.current = false;
        }
    }, [loading, attachedImages, editor, onSubmit]);

    // 处理键盘事件
    const handleKeyDown = useCallback(
        (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (loading || submittingRef.current || isEditorEmpty()) {
                    return;
                }
                handleSubmit();
            }
        },
        [loading, attachedImages, handleSubmit]
    );

    const handleChange = useCallback(
        (newValue) => {
            setValue(newValue);
        },
        []
    );

    // 获取网页内容并插入编辑器
    const handleBrowserFetch = useCallback(async () => {
        if (!browserUrl.trim() || browserLoading) return;
        setBrowserLoading(true);
        try {
            const content = await fetchWebContent(browserUrl.trim());
            const markdown = formatAsMarkdownBlock(content);

            // 在当前光标位置插入 Markdown 文本
            Transforms.insertText(editor, markdown + '\n\n');

            antMessage.success(t('ai-chat-browser-tool-success'));
            setIsBrowserModalOpen(false);
            setBrowserUrl('');
        } catch (e) {
            antMessage.error(t('ai-chat-browser-tool-failed', { error: e.message }));
        } finally {
            setBrowserLoading(false);
        }
    }, [browserUrl, browserLoading, editor]);

    const iconStyle = {
        fontSize: 18,
        color: token.colorText,
    };

    // 仅自定义模型：配置项 + 管理入口
    const customConfigsList = getCustomModelConfigs();

    const handleModelSelect = ({ key }) => {
        if (key === '__custom_manage__') {
            setIsConfigModalOpen(true);
            return;
        }
        const config = customConfigsList.find(c => c.id === key);
        if (config) {
            setSelectedConfigId(config.id);
            if (onModelChange) {
                onModelChange({
                    key: 'custom',
                    label: formatCustomModelLabel(config.modelName || config.name),
                    configId: config.id,
                    config: {
                        ...config,
                        baseUrl: config.baseUrl || config.baseURL || '',
                    }
                });
            }
        }
    };

    const displayModel = (() => {
        if (currentModel?.key === 'custom' && currentModel?.configId) {
            const cfg = getCustomModelConfigById(currentModel.configId);
            return cfg
                ? formatCustomModelLabel(cfg.modelName || cfg.name)
                : (currentModel?.label || t('vibe-ai-chat-custom-model-fallback'));
        }
        return currentModel?.label || t('vibe-ai-chat-custom-model-fallback');
    })();

    const selectedMenuKey =
        currentModel?.configId || getSelectedConfigId() || customConfigsList[0]?.id || '__custom_manage__';

    const toolbarBrandIcon = (
        <img src={modelIcon} alt="" style={{ width: TOOLBAR_ICON_PX, height: TOOLBAR_ICON_PX, marginRight: 4, objectFit: 'contain' }} />
    );

    const selectableMenuKeysSet = new Set([...customConfigsList.map((c) => c.id), '__custom_manage__']);
    const menuSelectedKeys =
        selectedMenuKey && selectableMenuKeysSet.has(selectedMenuKey) ? [selectedMenuKey] : [];

    const customModelMenuRows = customConfigsList.map((c) => {
        const customLabel = formatCustomModelLabel(c.modelName || c.name);
        return {
            key: c.id,
            label: (
                <Flex align="center" gap={6} style={{ minWidth: 0, maxWidth: 280 }} title={customLabel}>
                    <span
                        style={{
                            width: MENU_SLOT_PX,
                            height: MENU_SLOT_PX,
                            flexShrink: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <img src={modelIcon} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
                    </span>
                    <span
                        style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 12,
                            lineHeight: 1.25,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {customLabel}
                    </span>
                    <span
                        style={{
                            width: 18,
                            flexShrink: 0,
                            textAlign: 'right',
                            fontSize: 12,
                            color: token.colorPrimary,
                        }}
                    >
                        {selectedMenuKey === c.id ? '✓' : ''}
                    </span>
                </Flex>
            ),
            disabled: false,
        };
    });
    const customManageMenuItem = {
        key: '__custom_manage__',
        label: (
            <Flex justify="space-between" align="center" style={{ width: '100%', minWidth: 160 }}>
                <span>{t('vibe-ai-chat-manage-custom-models')}</span>
                <SettingOutlined style={{ fontSize: 14 }} />
            </Flex>
        ),
        disabled: false,
    };

    const dropdownModelItems = [...customModelMenuRows, customManageMenuItem];

    // 预设相关选项
    const providerOptions = getProviderOptions();
    const selectedPreset = selectedPresetKey ? findPreset(selectedPresetKey) : null;
    const presetModelOptions = selectedPreset ? getModelOptions(selectedPresetKey) : [];

    return (
        <div
            style={{
                background: '#ffffff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            className="slate-sender-container"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* 图片预览区域 */}
            <ImagePreview
                images={attachedImages}
                onRemove={handleImageRemove}
            />

            {/* Slate 编辑器区域 */}
            <div style={{ padding: '8px 12px' }}>
                <Slate editor={editor} initialValue={value} onChange={handleChange}>
                    <Editable
                        renderLeaf={renderLeaf}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder={isZhLocale() ? '按 Enter 发送消息，Shift+Enter 换行' : 'Press Enter to send, Shift+Enter for newline'}
                        disabled={loading}
                        style={{
                            minHeight: '36px',
                            maxHeight: '120px',
                            fontSize: '14px',
                            color: '#333',
                            outline: 'none',
                            overflowY: 'auto',
                            lineHeight: '1.5',
                        }}
                    />
                </Slate>
            </div>

            {/* Footer 工具栏 */}
            <div
                style={{
                    padding: '8px 12px',
                    borderTop: '1px solid #f0f0f0',
                }}
            >
                <Flex justify="space-between" align="center" style={{ minWidth: 0, gap: 8 }}>
                    {/* 左侧工具 */}
                    <Flex gap="small" align="center" style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                        {/* 图片上传 */}
                        <ImageUploader
                            onImageSelect={handleImageSelect}
                            iconStyle={iconStyle}
                            disabled={!visionCapable}
                            disabledTitle={t('vibe-ai-chat-multimodal-not-supported', {
                                model: currentModel?.label || currentModel?.key || '',
                            })}
                        />
                        <Button
                            type="text"
                            icon={<GlobalOutlined />}
                            onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                            title="Web Search"
                            className={webSearchEnabled ? 'icon-btn-active' : ''}
                            style={iconStyle}
                        />
                        <Button
                            type="text"
                            icon={<LinkOutlined />}
                            onClick={() => setIsBrowserModalOpen(true)}
                            title={t('ai-chat-browser-tool-title')}
                            style={iconStyle}
                        />
                        <Dropdown
                            placement="bottom"
                            getPopupContainer={(triggerNode) =>
                                (triggerNode?.ownerDocument || document).body
                            }
                            menu={{
                                items: dropdownModelItems,
                                onClick: handleModelSelect,
                                className: 'model-dropdown-menu',
                                selectedKeys: menuSelectedKeys
                            }}
                            trigger={['click']}
                        >
                            <Button
                                type="text"
                                style={{
                                    ...iconStyle,
                                    flexShrink: 1,
                                    minWidth: 0,
                                    maxWidth: '100%',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                }}
                                title={t('vibe-ai-chat-current-model-title', { model: displayModel })}
                            >
                                <span
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        minWidth: 0,
                                        maxWidth: '100%',
                                        flex: 1,
                                    }}
                                >
                                    {toolbarBrandIcon}
                                    <span
                                        style={{
                                            marginRight: 4,
                                            fontSize: 14,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            minWidth: 0,
                                        }}
                                    >
                                        {'模型：'}{displayModel}
                                    </span>
                                </span>
                                <DownOutlined style={{ fontSize: 12, flexShrink: 0 }} />
                            </Button>
                        </Dropdown>
                    </Flex>

                    {/* 右侧工具 */}
                    <Flex align="center" gap="small">
                        <ChatSubmitControl
                            loading={loading}
                            disabled={isEditorEmpty()}
                            onSubmit={handleSubmit}
                            onStop={onStop}
                        />
                    </Flex>
                </Flex>
            </div>

            {/* 自定义模型配置弹窗（多配置管理 + 预设选择） */}
            <Modal
                title={t('vibe-ai-chat-custom-model-settings-title')}
                open={isConfigModalOpen}
                onOk={handleSaveConfig}
                onCancel={() => { setIsConfigModalOpen(false); setEditingConfigId(null); setSelectedPresetKey(null); form.resetFields(); }}
                okText={editingConfigId ? t('vibe-ai-chat-button-update') : t('vibe-ai-chat-button-add')}
                cancelText={t('vibe-ai-chat-button-close')}
                destroyOnHidden
                zIndex={10001}
                centered
                getContainer={false}
                wrapClassName="ai-chat-modal"
                width={620}
            >
                <Flex gap="middle" align="flex-start" style={{ marginBottom: 16 }}>
                    {/* 左侧：已保存配置列表 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 13 }}>{t('vibe-ai-chat-saved-configurations')}</div>
                        <div style={{
                            border: '1px solid #e8e8e8',
                            borderRadius: 6,
                            maxHeight: 180,
                            overflowY: 'auto',
                            background: '#ffffff'
                        }}>
                            {customConfigs.map((c) => (
                                <div
                                    key={c.id}
                                    onClick={() => handleSelectConfigToEdit(c)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '10px 12px',
                                        borderBottom: customConfigs.indexOf(c) < customConfigs.length - 1 ? '1px solid #f0f0f0' : 'none',
                                        cursor: 'pointer',
                                        background: editingConfigId === c.id ? '#f0f0f0' : '#ffffff'
                                    }}
                                >
                                    <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {getConfigDisplayName(c)}
                                    </span>
                                    <Button type="text" size="small" icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); handleDeleteConfig(c); }} className="custom-config-delete-btn" style={{ padding: '0 6px', flexShrink: 0 }} />
                                </div>
                            ))}
                        </div>
                        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddConfig} style={{ marginTop: 8, width: '100%' }}>
                            {t('vibe-ai-chat-add-configuration')}
                        </Button>
                    </div>

                    {/* 右侧：表单编辑区 */}
                    <div
                        className={addFormFlash ? 'custom-config-form-pane custom-config-form-flash' : 'custom-config-form-pane'}
                        style={{ flex: 1.5, minWidth: 0 }}
                    >
                        {/* 预设快速选择 */}
                        <div style={{ marginBottom: 16, padding: 12, background: '#f6f6f6', borderRadius: 6 }}>
                            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>{t('ai-chat-select-preset')}</div>
                            <Flex gap="small" style={{ marginBottom: 8 }}>
                                <Select
                                    style={{ flex: 1 }}
                                    placeholder={t('ai-chat-preset-provider')}
                                    value={selectedPresetKey}
                                    onChange={handlePresetChange}
                                    options={providerOptions.map(p => ({ value: p.key, label: p.label }))}
                                    allowClear
                                />
                                <Select
                                    style={{ flex: 1 }}
                                    placeholder={t('ai-chat-preset-model')}
                                    value={modelNameWatched || undefined}
                                    onChange={handlePresetModelChange}
                                    options={presetModelOptions.map(m => ({ value: m.id, label: m.name }))}
                                    disabled={!selectedPreset}
                                    allowClear
                                />
                            </Flex>
                            {selectedPreset && (
                                <div style={{ fontSize: 12, color: '#666' }}>
                                    <div style={{ marginBottom: 4 }}>
                                        {t('ai-chat-plan-coding')}: {selectedPreset.models.find(m => m.id === modelNameWatched)?.codingPlan
                                            ? t('ai-chat-plan-supported')
                                            : t('ai-chat-plan-unsupported')}
                                        {' | '}
                                        {t('ai-chat-plan-token')}: {selectedPreset.models.find(m => m.id === modelNameWatched)?.tokenPlan
                                            ? t('ai-chat-plan-supported')
                                            : t('ai-chat-plan-unsupported')}
                                    </div>
                                    {selectedPreset.docs.pricing && (
                                        <div>
                                            <a href={selectedPreset.docs.pricing} target="_blank" rel="noopener noreferrer">{t('ai-chat-docs')}</a>
                                            {selectedPreset.notes && <span style={{ marginLeft: 8, color: '#999' }}>{selectedPreset.notes}</span>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
                            <Form.Item
                                name="apiFormat"
                                label={t('vibe-ai-chat-api-format')}
                                rules={[{ required: true }]}
                            >
                                <Select
                                    options={[
                                        { value: 'openai', label: t('vibe-ai-chat-api-format-label-openai') },
                                        { value: 'anthropic', label: t('vibe-ai-chat-api-format-label-anthropic') },
                                    ]}
                                    style={{ width: '100%' }}
                                />
                            </Form.Item>
                            <Form.Item
                                name="baseUrl"
                                label={t('vibe-ai-chat-api-base-url')}
                                tooltip={t('vibe-ai-chat-api-base-url-row-tooltip')}
                                rules={[{ required: true }]}
                            >
                                <Input
                                    placeholder={apiFormatForUrlPlaceholder === 'anthropic'
                                        ? t('vibe-ai-chat-api-base-url-placeholder-anthropic')
                                        : t('vibe-ai-chat-api-base-url-placeholder-openai')
                                    }
                                />
                            </Form.Item>
                            <Form.Item
                                name="apiKey"
                                label={t('vibe-ai-chat-api-key-shared')}
                                tooltip={t('vibe-ai-chat-api-key-tooltip')}
                            >
                                <Input.Password 
                                    placeholder={selectedPreset?.apiKeyPlaceholder || t('vibe-ai-chat-api-key-placeholder')}
                                />
                            </Form.Item>
                            <Form.Item
                                name="modelName"
                                label={t('vibe-ai-chat-model-name')}
                                tooltip={t('vibe-ai-chat-model-name-tooltip')}
                                rules={[{ required: true }]}
                            >
                                <Input placeholder={t('vibe-ai-chat-model-name-placeholder')} />
                            </Form.Item>
                        </Form>
                    </div>
                </Flex>
            </Modal>

            {/* 网页内容获取弹窗 */}
            <Modal
                title={t('ai-chat-browser-tool-title')}
                open={isBrowserModalOpen}
                onOk={handleBrowserFetch}
                onCancel={() => { setIsBrowserModalOpen(false); setBrowserUrl(''); }}
                okText={t('general-cancel') === '取消' ? '获取' : 'Fetch'}
                cancelText={t('general-cancel')}
                confirmLoading={browserLoading}
                destroyOnHidden
            >
                <Input
                    placeholder={t('ai-chat-browser-tool-url-placeholder')}
                    value={browserUrl}
                    onChange={(e) => setBrowserUrl(e.target.value)}
                    onPressEnter={handleBrowserFetch}
                    style={{ marginTop: 8 }}
                />
            </Modal>
        </div>
    );
}

export default ChatInput;
