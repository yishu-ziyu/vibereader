import { invoke } from '@tauri-apps/api/core';
import { isPersistentStorageAvailable } from './services/persistentStorage';

// R3：API Key 安全存储封装（macOS Keychain）。
// - 桌面端（Tauri）：apiKey 一律通过 storage_set/get/delete_api_key 命令写入
//   macOS Keychain（Rust keyring crate，service = "com.vibereader.apikeys"，
//   account = 模型配置 id）。
// - localStorage（ai-chat.modelConfigs / zustand persist）中的 apiKey 字段一律
//   置空占位，不落盘明文；运行时内存态（zustand / 表单）保留完整 key。
// - 非 Tauri 运行时（Vite dev server 调试）：Keychain 不可用，所有函数安全
//   no-op（返回 null/false），并只告警一次。

let hasWarnedUnavailable = false;

function warnUnavailableOnce() {
    if (hasWarnedUnavailable) return;
    hasWarnedUnavailable = true;
    console.warn(
        '[apiKeyStore] Tauri runtime unavailable; API keys stay in memory only (dev-server mode).'
    );
}

/** 把某条配置的 apiKey 写入 Keychain。失败（含无钥匙串权限）返回 false 并告警。 */
export async function setStoredApiKey(configId, apiKey) {
    const id = String(configId || '').trim();
    const key = String(apiKey || '');
    if (!id || !key.trim()) return false;
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return false;
    }
    try {
        await invoke('storage_set_api_key', { configId: id, apiKey: key });
        return true;
    } catch (error) {
        console.warn('[apiKeyStore] Failed to save API key to Keychain:', error?.message || error);
        return false;
    }
}

/** 从 Keychain 读取 apiKey；无条目或失败返回 null（失败时告警）。 */
export async function getStoredApiKey(configId) {
    const id = String(configId || '').trim();
    if (!id) return null;
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return null;
    }
    try {
        const key = await invoke('storage_get_api_key', { configId: id });
        return typeof key === 'string' && key.length > 0 ? key : null;
    } catch (error) {
        console.warn('[apiKeyStore] Failed to read API key from Keychain:', error?.message || error);
        return null;
    }
}

/** 删除 Keychain 中的 apiKey 条目（幂等：无条目也算成功）。 */
export async function deleteStoredApiKey(configId) {
    const id = String(configId || '').trim();
    if (!id) return false;
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        return false;
    }
    try {
        await invoke('storage_delete_api_key', { configId: id });
        return true;
    } catch (error) {
        console.warn('[apiKeyStore] Failed to delete API key from Keychain:', error?.message || error);
        return false;
    }
}

// ========== 纯函数（可单测） ==========

/**
 * 判断配置是否带有非空明文 apiKey。
 */
export function hasPlaintextApiKey(config) {
    return Boolean(config && typeof config === 'object' && String(config.apiKey || '').trim());
}

/**
 * 去除单个对象落盘时的明文 apiKey（置空占位，字段结构保留）。
 * 兼容两种形态：裸 config（含 apiKey 字段）与 selectedModel 包装（key 藏在 .config 里）。
 */
export function stripApiKeyForDurableStorage(config) {
    if (!config || typeof config !== 'object') return config;
    if (config.config && typeof config.config === 'object') {
        return { ...config, config: { ...config.config, apiKey: '' } };
    }
    return { ...config, apiKey: '' };
}

/**
 * 配置列表落盘前的统一脱敏：apiKey 字段一律置空。
 */
export function sanitizeModelConfigsForStorage(configs) {
    if (!Array.isArray(configs)) return [];
    return configs.map((config) => (config && typeof config === 'object'
        ? stripApiKeyForDurableStorage(config)
        : config));
}

/**
 * 根据上一次「Keychain 背书」的配置 id 列表与本次保存的配置列表，计算 Keychain 增量：
 * - 新列表中带明文 key 的配置 → 写入（覆盖）；
 * - 上次带 key、但本次已从列表中移除的配置 → 删除对应条目。
 *
 * 注意：不根据「列表里 apiKey 为空」判断删除 —— 编辑器保存时会携带其他配置的
 * 空占位（明文只在 Keychain），无法区分"用户清空"与"key 本就不在落盘数据里"；
 * 编辑器侧保存前会先从 Keychain 回填表单 key，用户主动清空 key 等价于删除配置。
 *
 * @param {string[]} previousKeyedConfigIds 上次保存后记录的、Keychain 中有对应条目的配置 id
 * @param {Array<object>} nextConfigs 本次保存的完整配置列表（内存态，可含明文 key）
 * @returns {{ sets: Array<{configId: string, apiKey: string}>, deletes: string[], keyedIds: string[] }}
 *   keyedIds 为本次同步完成后 Keychain 中应有条目的配置 id（供持久化跟踪，非敏感）
 */
export function computeApiKeySyncPlan(previousKeyedConfigIds, nextConfigs) {
    const prevKeyed = Array.isArray(previousKeyedConfigIds)
        ? previousKeyedConfigIds.filter((configId) => typeof configId === 'string' && configId)
        : [];
    const nextList = Array.isArray(nextConfigs)
        ? nextConfigs.filter((config) => config && typeof config === 'object')
        : [];
    const nextIds = new Set(nextList.filter((config) => config?.id).map((config) => config.id));

    const sets = nextList
        .filter((config) => config?.id && hasPlaintextApiKey(config))
        .map((config) => ({ configId: config.id, apiKey: String(config.apiKey).trim() }));
    const deletes = prevKeyed.filter((configId) => !nextIds.has(configId));
    const keptKeyed = prevKeyed.filter((configId) => nextIds.has(configId));
    const keyedIds = Array.from(new Set([...keptKeyed, ...sets.map((item) => item.configId)]));
    return { sets, deletes, keyedIds };
}

// ========== 异步编排 ==========

/**
 * 保存模型配置时同步 Keychain：写入新 key、删除被移除配置的 key。
 * 由 storage.saveModelConfigs 以 fire-and-forget 方式调用。
 */
export async function syncApiKeysWithKeychain(previousKeyedConfigIds, nextConfigs) {
    if (!isPersistentStorageAvailable()) {
        warnUnavailableOnce();
        const fallback = computeApiKeySyncPlan(previousKeyedConfigIds, nextConfigs);
        return { sets: 0, deletes: 0, keyedIds: fallback.keyedIds };
    }
    const { sets, deletes, keyedIds } = computeApiKeySyncPlan(previousKeyedConfigIds, nextConfigs);
    await Promise.all([
        ...sets.map((item) => setStoredApiKey(item.configId, item.apiKey)),
        ...deletes.map((configId) => deleteStoredApiKey(configId)),
    ]);
    return { sets: sets.length, deletes: deletes.length, keyedIds };
}

/**
 * 一次性迁移：把 localStorage 残留的明文 apiKey 逐个写入 Keychain，
 * 返回脱敏后的配置列表（apiKey 置空）与迁移数量。非 Tauri 运行时
 * 无法写 Keychain，明文直接丢弃（dev-only，不维护网页形态）。
 */
export async function migrateLegacyPlaintextApiKeys(configs) {
    const list = Array.isArray(configs)
        ? configs.filter((config) => config && typeof config === 'object')
        : [];
    const legacy = list.filter(hasPlaintextApiKey);
    if (legacy.length === 0) {
        return { migratedCount: 0, sanitizedConfigs: sanitizeModelConfigsForStorage(list) };
    }

    let migratedCount = 0;
    if (isPersistentStorageAvailable()) {
        for (const config of legacy) {
            const ok = await setStoredApiKey(config.id, String(config.apiKey).trim());
            if (ok) migratedCount += 1;
        }
    } else {
        warnUnavailableOnce();
    }
    return { migratedCount, sanitizedConfigs: sanitizeModelConfigsForStorage(list) };
}

/**
 * 启动/读取配置时：对 apiKey 为空占位的 config，异步从 Keychain 拉回填充
 * 内存态。拉取失败保持空占位（内部已告警）。
 */
export async function hydrateModelConfigsFromKeychain(configs) {
    const list = Array.isArray(configs)
        ? configs.filter((config) => config && typeof config === 'object')
        : [];
    return Promise.all(list.map(async (config) => {
        if (String(config.apiKey || '').trim()) return config;
        if (!config.id) return config;
        const apiKey = await getStoredApiKey(config.id);
        return apiKey ? { ...config, apiKey } : config;
    }));
}
