from collections.abc import AsyncIterator
from typing import Any

from anthropic import AsyncAnthropic

from app.config import Settings


class LlmClient:
    """Small adapter around the Claude Messages API used by later AI tasks."""

    def __init__(self, settings: Settings, client: Any | None = None) -> None:
        self._settings = settings
        self._client = client or AsyncAnthropic(
            api_key=settings.anthropic_api_key.get_secret_value()
        )

    async def complete(
        self,
        messages: list[dict[str, Any]],
        *,
        system: str | None = None,
        model: str | None = None,
    ) -> str:
        request: dict[str, Any] = {
            "model": model or self._settings.anthropic_model,
            "max_tokens": 1024,
            "messages": messages,
        }
        if system:
            request["system"] = system
        response = await self._client.messages.create(**request)
        return "".join(block.text for block in response.content if block.type == "text")

    async def stream(
        self,
        messages: list[dict[str, Any]],
        *,
        system: str | None = None,
        model: str | None = None,
    ) -> AsyncIterator[str]:
        request: dict[str, Any] = {
            "model": model or self._settings.anthropic_model,
            "max_tokens": 1024,
            "messages": messages,
            "stream": True,
        }
        if system:
            request["system"] = system
        events = await self._client.messages.create(**request)
        async for event in events:
            if event.type == "content_block_delta" and getattr(event.delta, "text", None):
                yield event.delta.text
