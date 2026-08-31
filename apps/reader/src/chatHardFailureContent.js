import { MULTIMODAL_UNSUPPORTED_CODE } from './multimodalApiError';
import {
    isLikelyChatRegionBlockedError,
    userFacingChatApiErrorText,
} from './chatRegionBlockedError';
import { t } from './i18n';

function isMultimodalRejectedBranch(raw, multimodalRejectedCode) {
    return (
        multimodalRejectedCode === MULTIMODAL_UNSUPPORTED_CODE ||
        (raw && raw.includes('不支持图片输入'))
    );
}

/**
 * 硬失败时助手气泡正文：catch 与流式 streamFailedHard 共用，避免 Gemini 拼在 fullMessage 里多出一种样式。
 */
export function buildChatHardFailureBubbleContent(rawMsg, { modelLabel, multimodalRejectedCode } = {}) {
    const raw = rawMsg == null ? '' : String(rawMsg);
    const msg = userFacingChatApiErrorText(raw);

    if (isMultimodalRejectedBranch(raw, multimodalRejectedCode)) {
        return t('vibe-ai-chat-multimodal-not-supported', { model: modelLabel });
    }
    if (isLikelyChatRegionBlockedError(raw)) {
        return msg;
    }
    let errorContent = `❌ **发生错误**\n\n${msg}`;
    if (msg.includes('图片无法访问')) {
        errorContent += '\n\n💡 **建议**: 请删除图片后重新上传或截图。';
    } else if (msg.includes('API Key')) {
        errorContent += '\n\n💡 **建议**: 请在设置中检查 API Key 配置。';
    } else if (msg.includes('超限')) {
        errorContent += '\n\n💡 **建议**: 请稍候再试，或者缩短问题内容。';
    } else if (msg.includes('网络')) {
        errorContent += '\n\n💡 **建议**: 请检查网络连接并重试。';
    } else if (msg.includes('超时')) {
        errorContent += '\n\n💡 **建议**: 网络连接不稳定，请重试或稍后再试。';
    } else if (msg.includes('服务器')) {
        errorContent += '\n\n💡 **建议**: 服务器可能在维护中，请稍后再试。';
    }
    return errorContent;
}

/** 与 catch 里 antMessage.error 的 content 规则一致 */
export function buildChatHardFailureToastContent(rawMsg, { modelLabel, multimodalRejectedCode } = {}) {
    const raw = rawMsg == null ? '' : String(rawMsg);
    if (isMultimodalRejectedBranch(raw, multimodalRejectedCode)) {
        return t('vibe-ai-chat-multimodal-not-supported', { model: modelLabel });
    }
    return userFacingChatApiErrorText(raw);
}
