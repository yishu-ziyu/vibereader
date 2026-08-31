//! R3：API Key 安全存储（macOS Keychain）。
//!
//! - service 固定为 "com.vibereader.apikeys"；
//! - account（keyring 的 user）= 模型配置 id（config.id）；
//! - 前端通过 storage_set_api_key / storage_get_api_key / storage_delete_api_key
//!   三个命令访问本模块；localStorage 中只保留 apiKey 空占位，不落盘明文。

use crate::core::error::{StorageError, StorageResult};

/// Keychain service 名固定，account = 模型配置 id
const KEYCHAIN_SERVICE: &str = "com.vibereader.apikeys";

/// 把 keyring 错误映射为带明确提示的 StorageError（如无钥匙串访问权限时）
fn keychain_error(action: &str, error: &keyring::Error) -> StorageError {
    StorageError::Keychain(format!(
        "{action} failed: {error}. 请检查应用是否有 macOS 钥匙串（Keychain）访问权限。"
    ))
}

#[derive(Debug, Default, Clone, Copy)]
pub struct ApiKeyStore;

impl ApiKeyStore {
    pub fn new() -> Self {
        Self
    }

    fn entry(&self, config_id: &str) -> StorageResult<keyring::Entry> {
        if config_id.trim().is_empty() {
            return Err(StorageError::Validation(
                "config_id is required for keychain api key".to_string(),
            ));
        }
        keyring::Entry::new(KEYCHAIN_SERVICE, config_id)
            .map_err(|error| keychain_error("create keychain entry", &error))
    }

    /// 写入（覆盖）某模型配置的 apiKey。空 key 不允许入库，清空请走 delete。
    pub fn set(&self, config_id: &str, api_key: &str) -> StorageResult<()> {
        if api_key.trim().is_empty() {
            return Err(StorageError::Validation(
                "api_key must not be empty; use delete instead".to_string(),
            ));
        }
        let entry = self.entry(config_id)?;
        entry
            .set_password(api_key)
            .map_err(|error| keychain_error("save api key", &error))
    }

    /// 读取某模型配置的 apiKey；无条目返回 None（不算错误）。
    pub fn get(&self, config_id: &str) -> StorageResult<Option<String>> {
        let entry = self.entry(config_id)?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(keychain_error("read api key", &error)),
        }
    }

    /// 删除某模型配置的 apiKey 条目；无条目视为幂等成功。
    pub fn delete(&self, config_id: &str) -> StorageResult<()> {
        let entry = self.entry(config_id)?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(keychain_error("delete api key", &error)),
        }
    }
}
