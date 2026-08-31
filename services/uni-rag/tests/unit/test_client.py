"""Tests for the Anthropic SDK → MiniMax M3 LLM client."""
import pytest
from uni_rag.llm.client import LLMClient


def test_client_builds():
    c = LLMClient()
    assert c.model
    assert c.api_key
    assert c.base_url


def test_messages_property():
    c = LLMClient()
    c.add_user_message("hi")
    c.add_assistant_message("hello")
    msgs = c.messages
    assert msgs[0]["role"] == "user"
    assert msgs[1]["role"] == "assistant"


def test_clear_messages_empties_buffer():
    c = LLMClient()
    c.add_user_message("hi")
    c.add_assistant_message("hello")
    assert len(c.messages) == 2
    c.clear_messages()
    assert c.messages == []


# ── provider 切换测试 ──


def test_with_provider_stepfun():
    """with_provider('stepfun') 应返回配置了 stepfun 端点的新 client。"""
    c = LLMClient()
    s = __import__("uni_rag.config", fromlist=["load_settings"]).load_settings()
    stepfun_c = c.with_provider("stepfun")
    assert stepfun_c.base_url == s.stepfun_base_url
    assert stepfun_c.model == s.stepfun_model
    # 原实例不变
    assert c.base_url == s.llm_base_url


def test_with_provider_local():
    """with_provider('local') 应返回配置了 local proxy 的新 client。"""
    c = LLMClient()
    s = __import__("uni_rag.config", fromlist=["load_settings"]).load_settings()
    local_c = c.with_provider("local")
    assert local_c.base_url == s.cli_proxy_base_url
    assert local_c.model == s.cli_proxy_model


def test_with_provider_unknown_raises():
    """未知 provider 应抛 ValueError。"""
    c = LLMClient()
    with pytest.raises(ValueError, match="Unknown provider"):
        c.with_provider("nonexistent")


def test_with_api_key_creates_copy():
    """with_api_key 应返回新实例，不改原实例。"""
    c = LLMClient()
    original_key = c.api_key
    clone = c.with_api_key("new-key")
    assert clone.api_key == "new-key"
    assert c.api_key == original_key  # 原实例不变
    assert clone.base_url == c.base_url  # 其他属性继承


def test_with_api_key_preserves_messages():
    """with_api_key 应继承原实例的消息历史。"""
    c = LLMClient()
    c.add_user_message("hello")
    clone = c.with_api_key("new-key")
    assert len(clone.messages) == 1
    assert clone.messages[0]["content"] == "hello"
