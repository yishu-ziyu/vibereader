/**
 * 会话与模型配置的持久化封装。
 * R2 存储单轨化：产品只做桌面客户端（Tauri）。会话持久化唯一路径是
 * persistentStorage（Tauri → SQLite）；原浏览器 IndexedDB 回退（ai-chat-db）
 * 已删除，非 Tauri 运行时为安全 no-op（dev server 下 UI 可启动不报错）。
 * R3：模型配置中的 apiKey 不再落盘 —— localStorage 只存空占位结构，
 * 明文统一进 macOS Keychain（见 ./apiKeyStore）。
 */

import {
    deletePersistentConversation,
    listPersistentConversations,
    loadPersistentConversation,
    savePersistentConversation,
} from './services/persistentStorage';
import {
    migrateLegacyPlaintextApiKeys,
    sanitizeModelConfigsForStorage,
    syncApiKeysWithKeychain,
} from './apiKeyStore';
import { normalizeModelConfigList } from './modelConfigMigration';

const LS_PREFIX = 'ai-chat.';

// ========== localStorage 封装（仅存非敏感 UI 偏好与模型配置结构） ==========

function getPref(key, defaultValue = null) {
    try {
        const raw = localStorage.getItem(LS_PREFIX + key);
        if (raw === null) return defaultValue;
        return JSON.parse(raw);
    } catch (_) {
        return defaultValue;
    }
}

function setPref(key, value) {
    try {
        localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.error('[Storage] Failed to set pref:', key, e);
        return false;
    }
}

// ========== 会话持久化（Tauri SQLite；非 Tauri 安全 no-op） ==========

/**
 * 保存会话消息
 * @param {string} sessionId
 * @param {Array} messages
 */
export async function saveConversation(sessionId, messages) {
    await savePersistentConversation(sessionId, messages);
    return true;
}

/**
 * 加载会话消息
 * @param {string} sessionId
 * @returns {Array|null}
 */
export async function loadConversation(sessionId) {
    const record = await loadPersistentConversation(sessionId);
    if (!record?.messagesJson) return null;
    try {
        return JSON.parse(record.messagesJson);
    } catch (error) {
        console.error('[Storage] Failed to parse persistent conversation:', sessionId, error);
        return null;
    }
}

/**
 * 删除会话
 * @param {string} sessionId
 */
export async function deleteConversation(sessionId) {
    return deletePersistentConversation(sessionId);
}

/**
 * 获取所有会话列表（不含消息内容，仅元数据）
 * @returns {Array<{sessionId, updatedAt, messageCount}>}
 */
export async function listConversations() {
    return listPersistentConversations();
}

// ========== 模型配置专用 API ==========

const CONFIG_KEY = 'modelConfigs';
const SELECTED_CONFIG_KEY = 'selectedConfigId';
// R3：记录 Keychain 中有对应 apiKey 条目的配置 id（仅 id 列表，非敏感），
// 供保存时做差量删除（配置被删除 → 同步删 Keychain 条目）。
const KEYED_CONFIG_IDS_KEY = 'modelConfigsWithKeychainKey';

function getKeyedConfigIds() {
    const ids = getPref(KEYED_CONFIG_IDS_KEY, []);
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id) : [];
}

export function getModelConfigs() {
    const configs = getPref(CONFIG_KEY, []);
    const normalized = normalizeModelConfigList(configs);
    if (JSON.stringify(configs) !== JSON.stringify(normalized)) {
        setPref(CONFIG_KEY, normalized);
    }
    return normalized;
}

/**
 * 保存模型配置列表。R3：apiKey 一律不落盘 —— localStorage 中置空占位，
 * 明文经 storage_set_api_key 写入 Keychain；配置被删除时按 keyed id 列表
 * 差量同步删除 Keychain 条目（fire-and-forget，不阻塞 UI）。
 */
export function saveModelConfigs(configs) {
    const normalized = normalizeModelConfigList(configs);
    syncApiKeysWithKeychain(getKeyedConfigIds(), normalized)
        .then(({ keyedIds }) => setPref(KEYED_CONFIG_IDS_KEY, keyedIds))
        .catch(() => {});
    return setPref(CONFIG_KEY, sanitizeModelConfigsForStorage(normalized));
}

export function getSelectedConfigId() {
    return getPref(SELECTED_CONFIG_KEY, null);
}

export function setSelectedConfigId(id) {
    return setPref(SELECTED_CONFIG_KEY, id);
}

/**
 * R3 启动引导（fire-and-forget）：一次性迁移 —— 检测 localStorage 中任何
 * config 的 apiKey 非空 → 逐个写入 Keychain → 落盘清空该字段，并记录
 * 迁移数量。迁移逻辑在 src/apiKeyStore.js 中实现（可单测）。
 *
 * @returns {Promise<number>} 成功迁入 Keychain 的 key 数量
 */
export async function bootstrapModelApiKeys() {
    const stored = getPref(CONFIG_KEY, []);
    const legacyKeyedIds = Array.isArray(stored)
        ? stored
            .filter((config) => config && typeof config === 'object' && String(config.apiKey || '').trim())
            .map((config) => config.id)
            .filter(Boolean)
        : [];
    if (legacyKeyedIds.length === 0) return 0;

    const { migratedCount, sanitizedConfigs } = await migrateLegacyPlaintextApiKeys(stored);
    setPref(CONFIG_KEY, sanitizedConfigs);
    // 迁移后的配置 id 计入「Keychain 背书」列表，保证后续删除配置时能清理条目
    setPref(KEYED_CONFIG_IDS_KEY, Array.from(new Set([...getKeyedConfigIds(), ...legacyKeyedIds])));
    console.info(
        `[Storage] Migrated ${migratedCount} plaintext API key(s) from localStorage into macOS Keychain.`
    );
    return migratedCount;
}

// ========== 字体缩放 ==========

export function getFontScale() {
    return getPref('fontScale', 1.0);
}

export function setFontScale(value) {
    return setPref('fontScale', value);
}
