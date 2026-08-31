import pytest
from uni_rag.ingest.embedder import Embedder


@pytest.fixture(scope="module")
def embedder():
    return Embedder()


def test_embedder_dim(embedder):
    assert embedder.dim > 0
    assert embedder.dim in (768, 1024, 1536, 3072)  # 常见 embedding 维度


def test_embed_returns_vectors(embedder):
    vecs = embedder.embed(["hello world", "你好世界"])
    assert len(vecs) == 2
    assert len(vecs[0]) == embedder.dim
    # 中文和英文都能 embed
    assert any(abs(v) > 0.01 for v in vecs[1])


def test_similar_texts_have_high_similarity(embedder):
    vecs = embedder.embed(["machine learning", "deep learning", "pizza recipe"])
    import numpy as np
    a, b, c = [np.array(v) for v in vecs]
    sim_ab = a @ b / (np.linalg.norm(a) * np.linalg.norm(b))
    sim_ac = a @ c / (np.linalg.norm(a) * np.linalg.norm(c))
    assert sim_ab > sim_ac
