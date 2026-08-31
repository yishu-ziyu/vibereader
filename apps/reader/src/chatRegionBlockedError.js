/**
 * 上游（Gemini / OpenRouter 等）返回地域限制类错误时，统一给用户看的短文案。
 */
export const CHAT_REGION_BLOCKED_HINT =
    '该模型不支持该区域，请使用中国以外的VPN代理';

/**
 * 英文 API 常见：User location is not supported / not available in your region。
 * 使用 \\b 避免误伤含 "location" 子串的无关词（如某些库名）。
 */
export function isLikelyChatRegionBlockedError(text) {
    if (!text || typeof text !== 'string') return false;
    const s = text.toLowerCase();
    return /\bregion\b/.test(s) || /\blocation\b/.test(s);
}

/** 若为地域限制则替换为友好中文，否则返回原始字符串 */
export function userFacingChatApiErrorText(raw) {
    const s = raw == null ? '' : String(raw);
    if (isLikelyChatRegionBlockedError(s)) return CHAT_REGION_BLOCKED_HINT;
    return s;
}
