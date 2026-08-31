//! R3：ApiKeyStore 校验逻辑单测。
//! 只覆盖不触碰真实钥匙串的校验分支（Entry::new 之前的参数校验），
//! 避免测试过程中弹钥匙串授权或污染登录钥匙串。

use vibereader_lib::core::api_key_store::ApiKeyStore;
use vibereader_lib::core::error::StorageError;

#[test]
fn rejects_blank_config_id_on_set() {
    let error = ApiKeyStore::new()
        .set("   ", "sk-test")
        .expect_err("blank config id must be rejected");
    assert!(matches!(error, StorageError::Validation(_)));
}

#[test]
fn rejects_blank_api_key_on_set() {
    let error = ApiKeyStore::new()
        .set("cfg-1", "   ")
        .expect_err("blank api key must be rejected");
    assert!(matches!(error, StorageError::Validation(_)));
}

#[test]
fn rejects_blank_config_id_on_get() {
    let error = ApiKeyStore::new()
        .get("")
        .expect_err("blank config id must be rejected");
    assert!(matches!(error, StorageError::Validation(_)));
}

#[test]
fn rejects_blank_config_id_on_delete() {
    let error = ApiKeyStore::new()
        .delete("  ")
        .expect_err("blank config id must be rejected");
    assert!(matches!(error, StorageError::Validation(_)));
}

#[test]
fn keychain_error_carries_explicit_code() {
    assert_eq!(StorageError::Keychain("boom".to_string()).code(), "keychain_error");
}
