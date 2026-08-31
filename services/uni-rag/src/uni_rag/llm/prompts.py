"""RAG prompt templates."""


BASE_RULES = """回答学生问题时必须遵循以下规则：

1. 只使用 <context> 中提供的资料回答，不要编造。
2. 每条事实后必须用 [chunk_id] 标注来源，chunk_id 是 <context> 里每段的 ID。
3. 如果 <context> 里没有相关信息，明确说"未找到相关资料"，不要硬答。
4. 引用格式示例：“监督学习使用标注数据 [abc123:100]。”"""

STYLE_OVERLAYS: dict[str, str] = {
    "academic": "你是一个严谨的学术助手。用严谨、学术化的语言回答，适当引用文献。",
    "casual": "你是一个友好的学习助手。用通俗易懂的日常语言回答，像跟朋友聊天一样自然。",
    "concise": "你是一个简洁的助手。用2-3句话概括要点，用分点列出关键结论。",
}


def get_system_prompt(style: str = "academic") -> str:
    """Build a system prompt by combining BASE_RULES with a style overlay."""
    overlay = STYLE_OVERLAYS.get(style, STYLE_OVERLAYS["academic"])
    return f"{overlay}\n\n{BASE_RULES}\n\n5. 用中文回答，除非问题是英文。"


# Backward-compatible alias — default academic style produces the same output as the old prompt.
SYSTEM_PROMPT: str = get_system_prompt("academic")


USER_PROMPT_TEMPLATE = """<context>
{context}
</context>

问题：{question}

请给出带引用的答案。"""


def build_user_prompt(question: str, chunks: list[dict]) -> str:
    """Format chunks as <context> for the LLM."""
    parts = []
    for c in chunks:
        cid = c["id"]
        text = c.get("document") or c.get("text") or ""
        meta = c.get("metadata", {})
        src = meta.get("source", "unknown")
        section = meta.get("section", "")
        parts.append(f"[{cid}] (来源: {src}, 章节: {section})\n{text}\n")
    return USER_PROMPT_TEMPLATE.format(
        context="\n".join(parts),
        question=question,
    )


MODE_PROMPTS: dict[str, str] = {
    "translate": "你是专业翻译。将<context>中的内容翻译成简洁的英文摘要，保留关键概念和定义。只输出翻译结果，不要额外解释。",
    "flashcards": "你是学习卡片生成专家。根据<context>内容生成学习闪卡。每张闪卡有一个问题(question)和答案(answer)。输出JSON数组格式：[{\"question\":\"...\",\"answer\":\"...\"}]，至少5张。只输出JSON，不要其他内容。",
    "quiz": "你是测验出题专家。根据<context>内容生成选择题。输出JSON数组格式：[{\"question\":\"...\",\"options\":[\"A:...\",\"B:...\",\"C:...\",\"D:...\"],\"answer\":\"A\"}]，至少3道。只输出JSON，不要其他内容。",
    "graph": "你是知识图谱专家。根据<context>内容提取核心概念和关系。输出JSON格式：{\"nodes\":[{\"id\":\"概念名\",\"label\":\"简短描述\"}],\"edges\":[{\"from\":\"概念A\",\"to\":\"概念B\"}]}。至少5个节点。只输出JSON，不要其他内容。",
}


def get_mode_system_prompt(mode: str, style: str = "academic") -> str:
    """Build system prompt for a specific generation mode."""
    if mode not in MODE_PROMPTS:
        return get_system_prompt(style)
    base = MODE_PROMPTS[mode]
    return f"{base}\n\n5. 用中文回答，除非问题明确要求英文。"
