from uni_rag.ingest.chunker import chunk_document, Chunk


SAMPLE = """# Chapter 1: Intro

First paragraph of intro.

## Section 1.1

Content of section 1.1. It has multiple sentences. They all belong here.

## Section 1.2

Content of section 1.2. More content follows.

# Chapter 2: Methods

Methods chapter content here.
"""


def test_chunk_splits_on_headers():
    chunks = chunk_document(SAMPLE, source_id="x")
    assert len(chunks) >= 3
    titles = [c.section_title for c in chunks if c.section_title]
    assert any("Chapter 1" in t for t in titles)
    assert any("Chapter 2" in t for t in titles)


def test_chunks_have_offsets():
    chunks = chunk_document(SAMPLE, source_id="x")
    for c in chunks:
        assert c.text.strip()
        assert c.start_offset >= 0
        assert c.end_offset > c.start_offset
        assert c.source_id == "x"


def test_long_section_splits_by_size():
    long_text = "Sentence. " * 500  # 5000 chars
    chunks = chunk_document(long_text, source_id="y", max_chars=1000)
    assert all(len(c.text) <= 1200 for c in chunks)  # 允许一点溢出
    assert len(chunks) >= 5
