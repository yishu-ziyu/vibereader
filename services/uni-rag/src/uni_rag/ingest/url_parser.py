"""Convert LinkExtractionResult to ParsedDocument for the ingest pipeline."""
from __future__ import annotations
from uni_rag.ingest.parsers import ParsedDocument
from uni_rag.ingest.link_extractors import LinkExtractionResult


def parse_url_result(result: LinkExtractionResult) -> ParsedDocument:
    """将链接提取结果包装为 ParsedDocument，复用现有切块和索引逻辑。"""
    text = f"# {result.title}\n\n{result.text}"
    return ParsedDocument(
        text=text,
        format="url",
        source_path=result.source_url,
        pages=None,
    )
