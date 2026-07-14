from collections.abc import AsyncIterator
from typing import Any

from anthropic import AsyncAnthropic

from app.config import Settings


class LlmClient:
    """Small adapter around the Claude Messages API used by later AI tasks."""

    def __init__(self, settings: Settings, client: Any | None = None) -> None:
        self._settings = settings
        self._owns_client = client is None
        client_options: dict[str, str] = {"api_key": settings.anthropic_api_key.get_secret_value()}
        if settings.anthropic_base_url:
            client_options["base_url"] = settings.anthropic_base_url
        self._client = client or AsyncAnthropic(**client_options)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.close()

    async def complete(
        self,
        messages: list[dict[str, Any]],
        *,
        system: str | None = None,
        model: str | None = None,
    ) -> str:
        request: dict[str, Any] = {
            "model": model or self._settings.anthropic_model,
            "max_tokens": self._settings.anthropic_max_tokens,
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
            "max_tokens": self._settings.anthropic_max_tokens,
            "messages": messages,
            "stream": True,
        }
        if system:
            request["system"] = system
        events = await self._client.messages.create(**request)
        async for event in events:
            if event.type == "content_block_delta" and getattr(event.delta, "text", None):
                yield event.delta.text
