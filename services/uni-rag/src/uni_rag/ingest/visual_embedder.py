"""Visual embedder: encodes page screenshots into vector embeddings.

Uses sentence-transformers CLIP models for zero-shot image-text embedding.
Model: clip-ViT-B-32 (openai/clip-vit-base-patch32) — 512-dim, multilingual-friendly,
no extra dependencies beyond sentence-transformers (already in project deps).

Optional dependency: if sentence-transformers is not installed, the embedder falls back
to a no-op mode and the visual RAG channel is silently skipped.
"""
from __future__ import annotations
import logging
from pathlib import Path
from functools import lru_cache

logger = logging.getLogger(__name__)

try:
    from sentence_transformers import SentenceTransformer

    _ST_AVAILABLE = True
except ImportError:
    _ST_AVAILABLE = False

# Default model: CLIP ViT-B/32, 512-dim, good balance of speed and quality.
# Alternative for stronger quality (but slower): clip-ViT-L-14 (768-dim).
# All models are hosted on HuggingFace and cache locally on first load.
DEFAULT_MODEL = "clip-ViT-B-32"


class VisualEmbedder:
    """Encode page screenshots (PNG bytes) into normalized embeddings.

    Lazy-loads the model on first call. Subsequent calls reuse the singleton.
    """

    def __init__(self, model_name: str = DEFAULT_MODEL):
        self.model_name = model_name
        self._model = None

    def _ensure_model(self) -> None:
        if self._model is None:
            if not _ST_AVAILABLE:
                raise RuntimeError(
                    "sentence-transformers is not installed. "
                    "Install it with: pip install sentence-transformers"
                )
            logger.info("Loading visual embedder model: %s", self.model_name)
            self._model = SentenceTransformer(self.model_name)
            self.dim = self._model.get_sentence_embedding_dimension()
            logger.info("Visual embedder ready. dim=%d", self.dim)

    @property
    def available(self) -> bool:
        return _ST_AVAILABLE

    def embed_image(self, image_path: Path) -> list[float]:
        """Encode a single image file into a normalized embedding vector.

        Args:
            image_path: Path to PNG/JPG image of a page screenshot.

        Returns:
            List of floats (normalized embedding).
        """
        self._ensure_model()
        vec = self._model.encode(
            str(image_path),
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        # encode returns a 2D array (1, dim) for single input
        if hasattr(vec, "shape") and len(vec.shape) == 2 and vec.shape[0] == 1:
            vec = vec[0]
        return vec.tolist()

    def embed_images(self, image_paths: list[Path]) -> list[list[float]]:
        """Batch encode multiple images. Processes in batches of 8 to control memory.

        Args:
            image_paths: List of Path objects pointing to image files.

        Returns:
            List of embedding vectors (one per image).
        """
        self._ensure_model()
        results: list[list[float]] = []
        for i in range(0, len(image_paths), 8):
            batch = image_paths[i : i + 8]
            arr = self._model.encode(
                [str(p) for p in batch],
                normalize_embeddings=True,
                show_progress_bar=False,
            )
            if hasattr(arr, "shape") and len(arr.shape) == 2:
                for row in arr:
                    results.append(row.tolist())
            else:
                for v in arr:
                    results.append(v if isinstance(v, list) else v.tolist())
        return results

    def embed_text(self, text: str) -> list[float]:
        """Encode a text query into the same CLIP embedding space."""
        self._ensure_model()
        vec = self._model.encode(
            text,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        if hasattr(vec, "shape") and len(vec.shape) == 2 and vec.shape[0] == 1:
            vec = vec[0]
        return vec.tolist()


@lru_cache(maxsize=1)
def get_visual_embedder() -> VisualEmbedder | None:
    """Singleton accessor. Returns None if sentence-transformers is unavailable."""
    if not _ST_AVAILABLE:
        logger.warning("sentence-transformers not available; visual RAG disabled")
        return None
    return VisualEmbedder()
