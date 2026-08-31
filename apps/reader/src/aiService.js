/**
 * 统一 AI 服务（OpenAI + Anthropic 双协议）
 */

import { enhanceErrorWithMultimodalHint } from './multimodalApiError';
import { classifyAiError, extractErrorFromResponse } from './aiError';
import { resolveTemperatureForCustomModel } from './customChatTemperature';
import {
    inlineHttpsImageUrlsInOpenAIParts,
    fetchHttpsImageAsDataUrl,
} from './clientImageDataUrl';
import { normalizeBaseUrl } from './modelPresets';
import { resolveAiEndpointForRuntime } from './aiEndpoint';
import { isTauriRuntime } from './services/documentService';
import { tauriChatStream } from './tauriHttp';

// ==================== OpenAI 协议工具 ====================

/** @param {unknown} userMessage */
function normalizeOpenAIMultimodalContent(userMessage) {
    if (!Array.isArray(userMessage)) return userMessage;
    return userMessage.map((part) => {
        if (!part || typeof part !== 'object') return part;
        if (part.type === 'text') {
            return { type: 'text', text: part.text ?? '' };
        }
        if (part.type === 'image_url' && part.image_url) {
            const iu = part.image_url;
            const url = typeof iu === 'string' ? iu : iu.url;
            if (!url) return part;
            const detail = typeof iu === 'object' && iu.detail ? iu.detail : undefined;
            return {
                type: 'image_url',
                image_url: detail ? { url, detail } : { url },
            };
        }
        return part;
    });
}

// ==================== Anthropic 协议工具 ====================

function contentToText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        const textPart = content.find((p) => p.type === 'text');
        if (textPart?.text) return textPart.text;
        return JSON.stringify(content);
    }
    return String(content ?? '');
}

function storedToOpenAIParts(stored) {
    if (stored === null || stored === undefined) return [];
    if (typeof stored === 'string') return stored ? [{ type: 'text', text: stored }] : [];
    if (Array.isArray(stored)) return stored;
    return [{ type: 'text', text: String(stored) }];
}

function mergeStoredUserContents(a, b) {
    const pa = storedToOpenAIParts(a);
    const pb = storedToOpenAIParts(b);
    return [...pa, { type: 'text', text: '\n\n' }, ...pb];
}

function mergeHistoryContentForRole(role, prevStored, nextStored) {
    if (role === 'assistant') {
        const a = typeof prevStored === 'string' ? prevStored : contentToText(prevStored);
        const b = typeof nextStored === 'string' ? nextStored : contentToText(nextStored);
        return `${a}\n\n${b}`;
    }
    return mergeStoredUserContents(prevStored, nextStored);
}

function dataUrlToAnthropicImageBlock(dataUrl) {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
    if (!m) return null;
    return {
        type: 'image',
        source: {
            type: 'base64',
            media_type: m[1] || 'image/png',
            data: m[2].replace(/\s/g, ''),
        },
    };
}

async function openAIPartsToAnthropicBlocksAsync(parts) {
    const blocks = [];
    if (!Array.isArray(parts)) return blocks;
    for (const part of parts) {
        if (part.type === 'text') {
            const t = part.text ?? '';
            if (t) blocks.push({ type: 'text', text: t });
        } else if (part.type === 'image_url' && part.image_url) {
            const iu = part.image_url;
            const url = typeof iu === 'string' ? iu : iu.url;
            if (!url) continue;
            if (url.startsWith('data:')) {
                const block = dataUrlToAnthropicImageBlock(url);
                if (block) blocks.push(block);
            } else if (/^https?:\/\//i.test(url)) {
                try {
                    const dataUrl = await fetchHttpsImageAsDataUrl(url);
                    const block = dataUrlToAnthropicImageBlock(dataUrl);
                    if (block) blocks.push(block);
                } catch (e) {
                    const hint = e?.message || String(e);
                    throw new Error(
                        `图片 URL 无法在客户端加载（Anthropic 类接口通常要求 Base64）。${hint}`
                    );
                }
            } else {
                blocks.push({ type: 'image', source: { type: 'url', url } });
            }
        }
    }
    return blocks;
}

function collapseAnthropicBlocks(blocks) {
    if (!blocks || blocks.length === 0) return '';
    if (blocks.every((b) => b.type === 'text')) {
        return blocks.map((b) => b.text).join('');
    }
    return blocks;
}

async function storedToAnthropicApiContentAsync(stored) {
    if (typeof stored === 'string') return stored;
    if (Array.isArray(stored)) {
        if (stored.length && stored[0].type === 'image' && stored[0].source) {
            return collapseAnthropicBlocks(stored);
        }
        const blocks = await openAIPartsToAnthropicBlocksAsync(stored);
        return collapseAnthropicBlocks(blocks);
    }
    return String(stored ?? '');
}

// ==================== URL 格式化 ====================

function formatOpenAIUrl(baseUrl) {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) return '';
    // 如果已经是完整路径
    if (normalized.endsWith('/chat/completions')) return normalized;
    if (normalized.endsWith('/messages')) {
        // 用户可能把 anthropic endpoint 传给了 openai，做保守处理
        return normalized.replace(/\/messages$/, '/chat/completions');
    }
    return `${normalized}/chat/completions`;
}

function formatAnthropicUrl(baseUrl) {
    let url = baseUrl.trim().replace(/\/+$/, '');
    if (url.endsWith('/messages')) return url;
    if (/\/v\d+$/.test(url)) return `${url}/messages`;
    if (/\/v\d+\//.test(url)) return url.replace(/(\/v\d+\/).*$/, '$1messages');
    return `${url}/v1/messages`;
}

// ==================== SSE 解析器 ====================

/**
 * 自动检测 SSE 格式并解析
 * 支持 Anthropic/MiniMax 的 thinking_delta（推理链）和 text_delta
 * @param {string} dataStr
 * @returns {{type: 'openai' | 'anthropic-text' | 'anthropic-thinking' | 'unknown', content: string}}
 */
function detectAndParseSSE(dataStr) {
    try {
        const data = JSON.parse(dataStr);
        // Anthropic 格式 - thinking_delta（M2.7 等模型的推理链）
        if (data.type === 'content_block_delta' && data.delta?.type === 'thinking_delta' && data.delta.thinking) {
            return { type: 'anthropic-thinking', content: data.delta.thinking };
        }
        // Anthropic 格式 - text_delta（正式回复）
        if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta' && data.delta.text) {
            return { type: 'anthropic-text', content: data.delta.text };
        }
        // OpenAI 格式
        const delta = data.choices?.[0]?.delta;
        if (typeof delta?.content === 'string') {
            return { type: 'openai', content: delta.content };
        }
        if (Array.isArray(delta?.content)) {
            let piece = '';
            for (const block of delta.content) {
                if (block?.type === 'text' && block.text) piece += block.text;
            }
            if (piece) return { type: 'openai', content: piece };
        }
        return { type: 'unknown', content: '' };
    } catch (_) {
        return { type: 'unknown', content: '' };
    }
}

function isAbortLikeError(error, signal) {
    return Boolean(
        error?.name === 'AbortError' ||
        error?.message === 'Request cancelled' ||
        error === 'Request cancelled' ||
        signal?.aborted
    );
}

// ==================== 统一服务类 ====================

class AIService {
    constructor() {
        this.config = {
            baseUrl: '',
            apiKey: '',
            model: '',
            apiType: 'openai-compatible',
            requiresApiKey: true,
        };
        this.conversationHistory = [];
        this.paperContext = null;
        this.hasPaperContextSet = false;
    }

    setConfig(config) {
        this.config = { ...this.config, ...config };
    }

    clearHistory() {
        this.conversationHistory = [];
        this.paperContext = null;
        this.hasPaperContextSet = false;
    }

    hasPaperContext() {
        return this.hasPaperContextSet;
    }

    setPaperContext(paperMarkdown) {
        if (paperMarkdown && !this.hasPaperContextSet) {
            this.paperContext = paperMarkdown;
            this.hasPaperContextSet = true;
            this.conversationHistory.unshift({
                role: 'system',
                content: `[论文全文 Markdown 开始]\n${paperMarkdown}\n[论文全文 Markdown 结束]`,
            });
        }
    }

    addMessage(role, content) {
        this.conversationHistory.push({ role, content });
    }

    getHistory() {
        return this.conversationHistory;
    }

    setHistory(history) {
        this.conversationHistory = history;
    }

    // ==================== 内部：构建请求体 ====================

    _buildOpenAIBody(systemPrompt, includeHistory, userMessage, temperature) {
        const messages = [];

        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        if (includeHistory && this.conversationHistory.length > 0) {
            for (const m of this.conversationHistory) {
                if (Array.isArray(m.content)) {
                    messages.push({
                        ...m,
                        content: m.content,
                    });
                } else {
                    messages.push(m);
                }
            }
        }

        messages.push({ role: 'user', content: userMessage });

        return {
            model: this.config.model,
            messages,
            stream: true,
            ...(typeof temperature === 'number' ? { temperature } : {}),
        };
    }

    async _buildAnthropicBodyAsync(systemPrompt, includeHistory, userMessage, temperature) {
        const systemParts = [];
        if (systemPrompt) {
            systemParts.push(systemPrompt);
        }

        const rawMessages = [];
        if (includeHistory && this.conversationHistory.length > 0) {
            for (const m of this.conversationHistory) {
                if (m.role === 'system') {
                    systemParts.push(contentToText(m.content));
                } else if (m.role === 'user' || m.role === 'assistant') {
                    rawMessages.push({ role: m.role, content: m.content });
                }
            }
        }

        rawMessages.push({ role: 'user', content: userMessage });

        const merged = [];
        for (const m of rawMessages) {
            if (merged.length && merged[merged.length - 1].role === m.role) {
                merged[merged.length - 1].content = mergeHistoryContentForRole(
                    m.role,
                    merged[merged.length - 1].content,
                    m.content
                );
            } else {
                merged.push({ role: m.role, content: m.content });
            }
        }

        const apiMessages = [];
        for (const m of merged) {
            apiMessages.push({
                role: m.role,
                content: await storedToAnthropicApiContentAsync(m.content),
            });
        }

        const body = {
            model: this.config.model,
            max_tokens: 8192,
            stream: true,
            messages: apiMessages,
        };
        const systemStr = systemParts.filter(Boolean).join('\n\n');
        if (systemStr) {
            body.system = systemStr;
        }
        if (typeof temperature === 'number') {
            body.temperature = temperature;
        }
        return body;
    }

    // ==================== 流式对话 ====================

    async chatStream(userMessage, onChunk, options = {}) {
        const { baseUrl, apiKey, model, apiType } = this.config;
        const { includeHistory = true, signal, systemPrompt, temperature: temperatureOpt } = options;
        const temperature = resolveTemperatureForCustomModel(model, temperatureOpt);

        if (!baseUrl || !model) {
            throw new Error('自定义模型配置不完整，请点击模型菜单右侧的设置图标进行配置。');
        }

        const isAnthropic = apiType === 'anthropic-compatible';
        let fullMessage = '';
        let fullThinking = '';
        let hasThinking = false;

        try {
            let endpoint;
            let body;
            let headers;

            if (isAnthropic) {
                endpoint = formatAnthropicUrl(baseUrl);
                body = await this._buildAnthropicBodyAsync(
                    systemPrompt,
                    includeHistory,
                    userMessage,
                    temperature
                );
                headers = {
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01',
                    ...(apiKey ? { 'x-api-key': apiKey } : {}),
                };
            } else {
                endpoint = formatOpenAIUrl(baseUrl);
                // OpenAI 协议：内联 https 图片
                const historyForRequest = [];
                if (includeHistory && this.conversationHistory.length > 0) {
                    for (const m of this.conversationHistory) {
                        if (Array.isArray(m.content)) {
                            historyForRequest.push({
                                ...m,
                                content: await inlineHttpsImageUrlsInOpenAIParts(
                                    normalizeOpenAIMultimodalContent(m.content)
                                ),
                            });
                        } else {
                            historyForRequest.push(m);
                        }
                    }
                }
                const userContentForRequest = await inlineHttpsImageUrlsInOpenAIParts(
                    normalizeOpenAIMultimodalContent(userMessage)
                );

                body = this._buildOpenAIBody(
                    systemPrompt,
                    false, // history 已手动处理
                    userContentForRequest,
                    temperature
                );
                // 把处理后的历史塞进去（_buildOpenAIBody 里 systemPrompt 已处理，这里替换）
                const finalMessages = [];
                if (systemPrompt) {
                    finalMessages.push({ role: 'system', content: systemPrompt });
                }
                for (const m of historyForRequest) {
                    finalMessages.push(m);
                }
                finalMessages.push({ role: 'user', content: userContentForRequest });
                body.messages = finalMessages;

                // MiMo 使用 api-key 头部认证（非 Bearer）
                const isApiKeyAuth = this.config.authType === 'api-key';
                headers = {
                    'Content-Type': 'application/json',
                    ...(apiKey
                        ? (isApiKeyAuth ? { 'api-key': apiKey } : { Authorization: `Bearer ${apiKey}` })
                        : {}),
                };
            }

            let reader;
            const decoder = new TextDecoder();
            let buffer = '';
            let detectedFormat = null; // 'openai' | 'anthropic-text' | 'anthropic-thinking' | null

            if (isTauriRuntime()) {
                const tauriBody = await tauriChatStream(endpoint, {
                    headers,
                    body: JSON.stringify(body),
                    signal,
                });
                reader = tauriBody.getReader();
            } else {
                const response = await fetch(resolveAiEndpointForRuntime(endpoint), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                    signal,
                });

                if (!response.ok) {
                    const { statusCode, message } = await extractErrorFromResponse(response);
                    const classified = classifyAiError(statusCode, message);
                    const err = new Error(classified.message);
                    err.code = classified.code;
                    err.aiError = classified;
                    enhanceErrorWithMultimodalHint(err, message);
                    throw err;
                }

                reader = response.body.getReader();
            }

            while (true) {
                const { done, value } = await reader.read();
                buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    const dataStr = trimmed.slice(5).trim();
                    if (!dataStr || dataStr === '[DONE]') continue;

                    try {
                        const parsed = detectAndParseSSE(dataStr);
                        if (parsed.type === 'anthropic-thinking' && parsed.content) {
                            fullThinking += parsed.content;
                            hasThinking = true;
                            onChunk({ done: false, content: '', fullMessage, thinking: parsed.content, fullThinking, hasThinking });
                        } else if (parsed.type !== 'unknown' && parsed.content) {
                            if (!detectedFormat) {
                                detectedFormat = parsed.type;
                            }
                            const content = parsed.content;
                            fullMessage += content;
                            onChunk({ done: false, content, fullMessage, thinking: '', fullThinking, hasThinking });
                        }
                    } catch (_) {
                        // 忽略非 JSON 行
                    }
                }

                if (done) break;
            }

            if (includeHistory) {
                this.addMessage('user', userMessage);
                this.addMessage('assistant', fullMessage);
            }
            onChunk({ done: true, fullMessage, fullThinking, hasThinking });
        } catch (error) {
            if (isAbortLikeError(error, signal)) {
                onChunk({
                    done: true,
                    fullMessage: typeof fullMessage === 'string' ? fullMessage : '',
                    fullThinking: typeof fullThinking === 'string' ? fullThinking : '',
                    hasThinking: !!hasThinking,
                    interrupted: true,
                    aborted: true,
                });
                return;
            }
            console.error('[AIService] Error:', error);
            enhanceErrorWithMultimodalHint(error, error?.message);
            const classifiedError = error.aiError || classifyAiError(error.status ?? null, error.message, error);
            onChunk({
                done: true,
                fullMessage: '',
                error: classifiedError.message,
                errorCode: classifiedError.code,
                errorTitle: classifiedError.title,
                errorAction: classifiedError.action,
                aiError: classifiedError,
                interrupted: true,
            });
            // 错误已通过 onChunk 报告给 UI，不再抛出以避免 App.jsx catch 块重复处理
            return;
        }
    }
}

export default new AIService();
