"""Tests for adaptive style system in prompts."""
import pytest
from uni_rag.llm.prompts import get_system_prompt


def test_get_system_prompt_academic():
    """学术风格应包含 "学术助手" 关键词。"""
    result = get_system_prompt("academic")
    assert "学术助手" in result


def test_get_system_prompt_casual():
    """日常风格不应包含 "学术助手"。"""
    result = get_system_prompt("casual")
    assert "学术助手" not in result


def test_get_system_prompt_concise():
    """简洁风格应包含 "简洁" 或 "简短" 关键词。"""
    result = get_system_prompt("concise")
    assert "简洁" in result or "简短" in result


# 以下两种引号写法都可以，picklable 就够了
ACADEMIC_CITATION_KEYWORDS = ["context", "引用", "标注"]
CASUAL_CITATION_KEYWORDS = ["context", "引用", "标注"]
CONCISE_CITATION_KEYWORDS = ["context", "引用", "标注"]


def test_base_rules_in_all_styles():
    """所有风格 prompt 都必须包含引用/来源标注相关关键词。"""
    for style in ("academic", "casual", "concise"):
        prompt = get_system_prompt(style)
        assert any(kw in prompt for kw in ("context", "引用", "标注")), (
            f"Style '{style}' is missing citation-related keywords"
        )


def test_get_system_prompt_unknown_falls_back():
    """未知风格应返回学术默认 prompt。"""
    result = get_system_prompt("unknown_style")
    assert "学术助手" in result
