"""Centralized logging setup."""
from __future__ import annotations
import logging
import sys

_configured = False


def setup_logging(level: str = "INFO") -> None:
    global _configured
    root = logging.getLogger()
    if _configured:
        root.setLevel(level)
        return
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    ))
    root.addHandler(handler)
    root.setLevel(level)
    _configured = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
