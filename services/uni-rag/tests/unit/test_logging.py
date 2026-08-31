"""Tests for logging setup."""
import logging
from uni_rag.logging_setup import setup_logging, get_logger


def test_setup_logging_idempotent():
    setup_logging(level="INFO")
    setup_logging(level="INFO")
    logger = get_logger("test")
    assert logger.level <= logging.INFO


def test_get_logger_returns_named():
    logger = get_logger("foo.bar")
    assert logger.name == "foo.bar"
