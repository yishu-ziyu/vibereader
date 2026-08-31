/**
 * Tauri 原生 HTTP 流式请求封装
 * 使用 @tauri-apps/plugin-http 绕过浏览器 CORS 限制
 * 保持与浏览器 fetch SSE 解析的接口兼容
 */

import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

function redactSensitiveTokens(text = '') {
    return String(text).replace(/\b(?:sk|rk|ak|api)[-_][A-Za-z0-9_-]{6,}\b/gi, '[redacted]');
}

/**
 * 通过 Tauri 原生 HTTP 发送流式 POST 请求并解析 SSE
 * @param {string} url - 目标 URL（完整 URL，不再经过 Vite proxy）
 * @param {object} options
 * @param {Record<string, string>} options.headers
 * @param {string} options.body - JSON 字符串
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<ReadableStream<Uint8Array>>}
 */
export async function tauriChatStream(url, options = {}) {
    const { headers, body, signal } = options;

    const response = await tauriFetch(url, {
        method: 'POST',
        headers: headers || { 'Content-Type': 'application/json' },
        body,
        signal,
    });

    if (!response.ok) {
        let errorMsg = `API 请求失败: ${response.status}`;
        let backendDetail = '';
        try {
            const errData = await response.json();
            backendDetail =
                errData.error?.message || errData.message || errData.detail || '';
            backendDetail = redactSensitiveTokens(backendDetail);
            if (backendDetail) errorMsg += ` - ${backendDetail}`;
        } catch (_) {
            /* ignore */
        }
        const err = new Error(errorMsg);
        err.status = response.status;
        throw err;
    }

    // tauri-plugin-http 返回的 response.body 是 ReadableStream<Uint8Array>
    if (!response.body) {
        throw new Error('响应体为空，无法读取流');
    }

    return response.body;
}
