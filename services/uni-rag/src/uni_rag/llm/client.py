"""LLM client wrapping Anthropic SDK for MiniMax M3 and other providers."""
from __future__ import annotations
from anthropic import Anthropic
from uni_rag.config import load_settings


class LLMClient:
    def __init__(self, base_url: str = "", api_key: str = "", model: str = ""):
        s = load_settings()
        self.base_url = base_url or s.llm_base_url
        self.api_key = api_key or s.llm_api_key
        self.model = model or s.llm_model
        self._client = Anthropic(base_url=self.base_url, api_key=self.api_key)
        self._messages: list[dict] = []

    @property
    def messages(self) -> list[dict]:
        return list(self._messages)

    def add_user_message(self, content: str) -> None:
        self._messages.append({"role": "user", "content": content})

    def add_assistant_message(self, content: str) -> None:
        self._messages.append({"role": "assistant", "content": content})

    def clear_messages(self) -> None:
        self._messages.clear()

    def with_api_key(self, api_key: str) -> "LLMClient":
        """Return a copy of this client using a different API key (legacy)."""
        clone = LLMClient.__new__(LLMClient)
        clone.base_url = self.base_url
        clone.api_key = api_key
        clone.model = self.model
        clone._client = Anthropic(base_url=clone.base_url, api_key=clone.api_key)
        clone._messages = list(self._messages)
        return clone

    def with_provider(self, provider_id: str) -> "LLMClient":
        """Return a new client configured for the named provider (minimax/stepfun/local)."""
        s = load_settings()
        entry = s.PROVIDERS.get(provider_id)
        if entry is None:
            raise ValueError(f"Unknown provider: {provider_id}")
        base_url, api_key, model = entry
        return LLMClient(base_url=base_url, api_key=api_key, model=model)

    def complete(self, system: str, max_tokens: int = 1024) -> str:
        """Non-streaming completion. Returns assistant text."""
        resp = self._client.messages.create(
            model=self.model,
            system=system,
            messages=self._messages,
            max_tokens=max_tokens,
        )
        text = ""
        for block in resp.content:
            if hasattr(block, "text"):
                text += block.text
        return text
