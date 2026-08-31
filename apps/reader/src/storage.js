/**
 * 浏览器存储封装
 * 替代 Zotero.Prefs 和 Zotero.VibeDB.AIChats
 */

import {
    deletePersistentConversation,
    isPersistentStorageAvailable,
    listPersistentConversations,
    loadPersistentConversation,
    savePersistentConversation,
} from './services/persistentStorage';
import { normalizeModelConfigList } from './modelConfigMigration';

const LS_PREFIX = 'ai-chat.';
const DB_NAME = 'ai-chat-db';
const DB_VERSION = 1;

// ========== localStorage 封装（替代 Zotero.Prefs） ==========

export function getPref(key, defaultValue = null) {
    try {
        const raw = localStorage.getItem(LS_PREFIX + key);
        if (raw === null) return defaultValue;
        return JSON.parse(raw);
    } catch (_) {
        return defaultValue;
    }
}

export function setPref(key, value) {
    try {
        localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.error('[Storage] Failed to set pref:', key, e);
        return false;
    }
}

// ========== IndexedDB 封装（替代 Zotero.VibeDB.AIChats） ==========

let dbPromise = null;

function getDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('conversations')) {
                const store = db.createObjectStore('conversations', { keyPath: 'sessionId' });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
        };
    });
    return dbPromise;
}

/**
 * 从消息列表中提取会话标题
 * @param {Array} messages
 * @returns {string}
 */
function extractTitleFromMessages(messages) {
    if (!Array.isArray(messages)) return '';
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (!firstUserMsg) return '';
    const text = typeof firstUserMsg.content === 'string' ? firstUserMsg.content : '';
    // 去除 Markdown 标记、换行、多余空格
    const clean = text.replace(/[#*`\[\]()]/g, '').replace(/\s+/g, ' ').trim();
    return clean.slice(0, 30) || '';
}

/**
 * 保存会话消息
 * @param {string} sessionId
 * @param {Array} messages
 */
export async function saveConversation(sessionId, messages) {
    if (isPersistentStorageAvailable()) {
        await savePersistentConversation(sessionId, messages);
        return true;
    }

    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('conversations', 'readwrite');
        const store = tx.objectStore('conversations');
        const request = store.put({
            sessionId,
            messages,
            updatedAt: Date.now(),
            title: extractTitleFromMessages(messages)
        });
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 加载会话消息
 * @param {string} sessionId
 * @returns {Array|null}
 */
export async function loadConversation(sessionId) {
    if (isPersistentStorageAvailable()) {
        const record = await loadPersistentConversation(sessionId);
        if (!record?.messagesJson) return null;
        try {
            return JSON.parse(record.messagesJson);
        } catch (error) {
            console.error('[Storage] Failed to parse persistent conversation:', sessionId, error);
            return null;
        }
    }

    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('conversations', 'readonly');
        const store = tx.objectStore('conversations');
        const request = store.get(sessionId);
        request.onsuccess = () => {
            const result = request.result;
            resolve(result ? result.messages : null);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * 删除会话
 * @param {string} sessionId
 */
export async function deleteConversation(sessionId) {
    if (isPersistentStorageAvailable()) {
        return deletePersistentConversation(sessionId);
    }

    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('conversations', 'readwrite');
        const store = tx.objectStore('conversations');
        const request = store.delete(sessionId);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 获取所有会话列表（不含消息内容，仅元数据）
 * @returns {Array<{sessionId, updatedAt, messageCount}>}
 */
export async function listConversations() {
    if (isPersistentStorageAvailable()) {
        return listPersistentConversations();
    }

    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('conversations', 'readonly');
        const store = tx.objectStore('conversations');
        const request = store.openCursor();
        const results = [];
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const { sessionId, updatedAt, messages, title } = cursor.value;
                results.push({
                    sessionId,
                    updatedAt,
                    messageCount: Array.isArray(messages) ? messages.length : 0,
                    title: title || ''
                });
                cursor.continue();
            } else {
                // 按 updatedAt 倒序排列
                results.sort((a, b) => b.updatedAt - a.updatedAt);
                resolve(results);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

// ========== 模型配置专用 API ==========

const CONFIG_KEY = 'modelConfigs';
const SELECTED_CONFIG_KEY = 'selectedConfigId';

export function getModelConfigs() {
    const configs = getPref(CONFIG_KEY, []);
    const normalized = normalizeModelConfigList(configs);
    if (JSON.stringify(configs) !== JSON.stringify(normalized)) {
        setPref(CONFIG_KEY, normalized);
    }
    return normalized;
}

export function saveModelConfigs(configs) {
    return setPref(CONFIG_KEY, normalizeModelConfigList(configs));
}

export function getSelectedConfigId() {
    return getPref(SELECTED_CONFIG_KEY, null);
}

export function setSelectedConfigId(id) {
    return setPref(SELECTED_CONFIG_KEY, id);
}

// ========== 字体缩放 ==========

export function getFontScale() {
    return getPref('fontScale', 1.0);
}

export function setFontScale(value) {
    return setPref('fontScale', value);
}
