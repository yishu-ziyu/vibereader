//! R3：API Key 的 Keychain 命令层。
//! 这些命令不依赖 StorageState（keyring 是全局能力）；
//! 参数命名遵循 Tauri 约定：Rust snake_case ↔ 前端 camelCase。

use crate::commands::storage::{command_error_from_storage_error, CommandError};
use crate::core::api_key_store::ApiKeyStore;

/// 保存某模型配置的 apiKey 到 macOS Keychain（service = com.vibereader.apikeys）。
#[tauri::command]
pub fn storage_set_api_key(config_id: String, api_key: String) -> Result<(), CommandError> {
    ApiKeyStore::new()
        .set(&config_id, &api_key)
        .map_err(command_error_from_storage_error)
}

/// 读取某模型配置的 apiKey；无条目返回 None（前端拿到 null）。
#[tauri::command]
pub fn storage_get_api_key(config_id: String) -> Result<Option<String>, CommandError> {
    ApiKeyStore::new()
        .get(&config_id)
        .map_err(command_error_from_storage_error)
}

/// 删除某模型配置的 apiKey 条目（幂等）。
#[tauri::command]
pub fn storage_delete_api_key(config_id: String) -> Result<(), CommandError> {
    ApiKeyStore::new()
        .delete(&config_id)
        .map_err(command_error_from_storage_error)
}
