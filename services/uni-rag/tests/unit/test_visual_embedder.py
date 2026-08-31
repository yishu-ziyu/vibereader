"""Tests for visual_embedder module."""
from __future__ import annotations
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
import numpy as np

from uni_rag.ingest.visual_embedder import VisualEmbedder, get_visual_embedder, DEFAULT_MODEL


# ── Helpers ────────────────────────────────────────────────────────────────

def _fake_vec(dim: int = 512) -> np.ndarray:
    arr = np.ones(dim, dtype=np.float32)
    return arr / np.linalg.norm(arr)


def _make_mock_model(dim: int = 512):
    mock = MagicMock()
    # sentence-transformers encode returns 2D ndarray even for single item
    def encode_fn(*args, **kwargs):
        # args[0] is the input list/string
        if args and isinstance(args[0], list):
            n = len(args[0])
        else:
            n = 1
        return np.array([_fake_vec(dim) for _ in range(n)])
    mock.encode.side_effect = encode_fn
    mock.get_sentence_embedding_dimension.return_value = dim
    return mock


# ── Availability ───────────────────────────────────────────────────────────

class TestVisualEmbedderAvailability:

    def test_returns_none_when_st_unavailable(self):
        get_visual_embedder.cache_clear()
        with patch("uni_rag.ingest.visual_embedder._ST_AVAILABLE", False):
            result = get_visual_embedder()
            assert result is None

    def test_singleton_caching(self):
        with patch("uni_rag.ingest.visual_embedder._ST_AVAILABLE", True):
            get_visual_embedder.cache_clear()
            a = get_visual_embedder()
            b = get_visual_embedder()
            assert a is b


# ── Init ───────────────────────────────────────────────────────────────────

class TestVisualEmbedderInit:

    def test_default_model(self):
        embedder = VisualEmbedder()
        assert embedder.model_name == DEFAULT_MODEL

    def test_custom_model(self):
        embedder = VisualEmbedder(model_name="clip-ViT-L-14")
        assert embedder.model_name == "clip-ViT-L-14"

    def test_available_true_before_load(self):
        with patch("uni_rag.ingest.visual_embedder._ST_AVAILABLE", True):
            embedder = VisualEmbedder()
            assert embedder.available is True

    def test_available_false_before_load(self):
        with patch("uni_rag.ingest.visual_embedder._ST_AVAILABLE", False):
            embedder = VisualEmbedder()
            assert embedder.available is False


# ── Embedding ──────────────────────────────────────────────────────────────

class TestVisualEmbedderEmbed:

    def test_embed_image_returns_list_of_floats(self):
        with patch("uni_rag.ingest.visual_embedder._ST_AVAILABLE", True):
            embedder = VisualEmbedder()
            embedder._model = _make_mock_model(512)
            result = embedder.embed_image(Path("/fake/test.png"))
            assert isinstance(result, list)
            assert len(result) == 512
            assert all(isinstance(v, float) for v in result)

    def test_embed_image_normalizes_by_default(self):
        with patch("uni_rag.ingest.visual_embedder._ST_AVAILABLE", True):
            embedder = VisualEmbedder()
            mock_model = _make_mock_model(512)
            embedder._model = mock_model
            embedder.embed_image(Path("/fake/test.png"))
            _, kwargs = mock_model.encode.call_args
            assert kwargs.get("normalize_embeddings") is True

    def test_embed_image_path_converted_to_str(self):
        with patch("uni_rag.ingest.visual_embedder._ST_AVAILABLE", True):
            embedder = VisualEmbedder()
            mock_model = _make_mock_model(512)
            embedder._model = mock_model
            embedder.embed_image(Path("/fake/page_0001.png"))
            args, _ = mock_model.encode.call_args
            assert args[0] == "/fake/page_0001.png"

    def test_embed_images_batches_large_inputs(self):
        with patch("uni_rag.ingest.visual_embedder._ST_AVAILABLE", True):
            embedder = VisualEmbedder()
            mock_model = _make_mock_model(512)
            embedder._model = mock_model

            paths = [Path(f"/fake/page_{i:04d}.png") for i in range(1, 16)]
            result = embedder.embed_images(paths)
            assert len(result) == 15
            # batch size = 8, so 15 items = 2 calls
            assert mock_model.encode.call_count == 2

    def test_embed_images_single_call_for_small_input(self):
        with patch("uni_rag.ingest.visual_embedder._ST_AVAILABLE", True):
            embedder = VisualEmbedder()
            mock_model = _make_mock_model(512)
            embedder._model = mock_model

            paths = [Path(f"/fake/page_{i:04d}.png") for i in range(5)]
            embedder.embed_images(paths)
            assert mock_model.encode.call_count == 1

    def test_embed_images_no_progress_bar(self):
        with patch("uni_rag.ingest.visual_embedder._ST_AVAILABLE", True):
            embedder = VisualEmbedder()
            mock_model = _make_mock_model(512)
            embedder._model = mock_model
            embedder.embed_images([Path("/fake/1.png")])
            _, kwargs = mock_model.encode.call_args
            assert kwargs.get("show_progress_bar") is False

    def test_embed_text_returns_list_of_floats(self):
        with patch("uni_rag.ingest.visual_embedder._ST_AVAILABLE", True):
            embedder = VisualEmbedder()
            embedder._model = _make_mock_model(512)
            result = embedder.embed_text("监督学习")
            assert isinstance(result, list)
            assert len(result) == 512
            assert all(isinstance(v, float) for v in result)


# ── Unavailable ────────────────────────────────────────────────────────────

class TestVisualEmbedderUnavailable:

    def test_available_is_false(self):
        with patch("uni_rag.ingest.visual_embedder._ST_AVAILABLE", False):
            embedder = VisualEmbedder()
            assert embedder.available is False
