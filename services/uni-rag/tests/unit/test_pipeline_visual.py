"""Unit tests for IngestPipeline visual search seam."""
from __future__ import annotations

from unittest.mock import MagicMock

from uni_rag.ingest.pipeline import IngestPipeline


def test_visual_search_uses_text_embedding_and_visual_vector():
    pipeline = object.__new__(IngestPipeline)
    pipeline.visual_embedder = MagicMock(available=True)
    pipeline.visual_embedder.embed_text.return_value = [0.1, 0.2]
    pipeline.visual_vector = MagicMock()
    pipeline.visual_vector.query.return_value = [{"id": "page-1"}]

    result = pipeline.visual_search("流程图", top_k=2)

    assert result == [{"id": "page-1"}]
    pipeline.visual_embedder.embed_text.assert_called_once_with("流程图")
    pipeline.visual_vector.query.assert_called_once_with([0.1, 0.2], top_k=2)


def test_visual_search_returns_empty_when_embedder_missing():
    pipeline = object.__new__(IngestPipeline)
    pipeline.visual_embedder = None
    pipeline.visual_vector = MagicMock()

    assert pipeline.visual_search("anything") == []
    pipeline.visual_vector.query.assert_not_called()
