"""Tests for config loading."""
import pytest
from uni_rag.config import Settings, load_settings


def test_load_settings_reads_minimax():
    settings = load_settings()
    assert settings.llm_base_url.startswith("http")
    assert settings.llm_api_key != ""
    assert settings.llm_model != ""


def test_data_dir_defaults():
    settings = load_settings()
    assert settings.data_dir.exists()


def test_data_dir_override(monkeypatch, tmp_path):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    from uni_rag import config as config_module
    config_module._settings = None
    settings = config_module.load_settings()
    assert settings.data_dir == tmp_path
    # restore
    config_module._settings = None


def test_max_session_messages_default():
    """默认 max_session_messages=20，避免长对话把 LLM context 打爆。"""
    from uni_rag.config import load_settings
    s = load_settings()
    assert s.max_session_messages == 20


def test_max_session_messages_override(monkeypatch):
    """UNI_RAG_MAX_SESSION_MESSAGES env var 可覆盖默认值。"""
    monkeypatch.setenv("UNI_RAG_MAX_SESSION_MESSAGES", "5")
    import uni_rag.config as cfg
    cfg._settings = None
    s = cfg.load_settings()
    assert s.max_session_messages == 5
    cfg._settings = None


def test_kb_db_path_default():
    from uni_rag.config import load_settings
    s = load_settings()
    assert s.kb_db_path == s.data_dir / "kbs.db"


def test_kb_dir_creates_and_lives_under_data_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    import uni_rag.config as cfg
    cfg._settings = None
    s = cfg.load_settings()
    assert s.kb_dir == tmp_path / "kbs"
    assert s.kb_dir.exists()
    cfg._settings = None
