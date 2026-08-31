"""CitationVerifier: semantic similarity between claims and chunks."""
from __future__ import annotations

import numpy as np

from uni_rag.config import load_settings
from uni_rag.ingest.embedder import get_embedder


class CitationVerifier:
    """Use BGE-M3 embeddings + cosine similarity to verify citations."""

    def __init__(self, threshold: float = 0.45):
        self.threshold = threshold
        self.embedder = get_embedder()

    def verify(self, claim_text: str, chunk_text: str) -> float:
        """Return cosine similarity between claim and chunk embeddings.

        Args:
            claim_text: The claim to verify.
            chunk_text: The cited chunk text.

        Returns:
            float in [0.0, 1.0]. Returns 0.0 if either input is empty.
        """
        if not claim_text or not chunk_text:
            return 0.0

        claim_vec = np.array(self.embedder.embed([claim_text])[0])
        chunk_vec = np.array(self.embedder.embed([chunk_text])[0])

        norm_claim = np.linalg.norm(claim_vec)
        norm_chunk = np.linalg.norm(chunk_vec)
        if norm_claim == 0.0 or norm_chunk == 0.0:
            return 0.0

        return float(np.dot(claim_vec, chunk_vec) / (norm_claim * norm_chunk))
