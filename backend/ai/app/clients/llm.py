"""LangChain-based Claude model factory and compatibility adapter."""

from __future__ import annotations

from collections.abc import AsyncIterator
import inspect
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from app.config import Settings, get_settings


def get_chat_model(
    model: str | None = None,
    *,
    settings: Settings | None = None,
    thinking: dict[str, Any] | None = None,
) -> ChatAnthropic:
    """Build the shared LangChain Anthropic chat model from MiraPrep settings."""

    resolved = settings or get_settings()
    options: dict[str, Any] = {
        "api_key": resolved.anthropic_api_key.get_secret_value(),
        "model": model or resolved.anthropic_model,
        "max_tokens": resolved.anthropic_max_tokens,
    }
    if resolved.anthropic_base_url:
        options["base_url"] = resolved.anthropic_base_url
    if thinking is not None:
        options["thinking"] = thinking
    return ChatAnthropic(**options)


def _to_langchain_messages(messages: list[dict[str, Any]], system: str | None) -> list[BaseMessage]:
    converted: list[BaseMessage] = []
    if system:
        converted.append(SystemMessage(content=system))
    for message in messages:
        role = message.get("role")
        content = message.get("content", "")
        if role == "assistant":
            converted.append(AIMessage(content=content))
        else:
            converted.append(HumanMessage(content=content))
    return converted


def _message_text(message: Any) -> str:
    text = getattr(message, "text", None)
    if isinstance(text, str):
        return text
    content = getattr(message, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        )
    return str(content)


class LlmClient:
    """Keep T-003's small API while all calls go through a LangChain chat model."""

    def __init__(
        self,
        settings: Settings,
        model: Any | None = None,
        *,
        thinking: dict[str, Any] | None = None,
    ) -> None:
        self._settings = settings
        self._model = model or get_chat_model(settings=settings, thinking=thinking)

    @property
    def chat_model(self) -> Any:
        return self._model

    def with_structured_output(self, schema: type[Any]) -> Any:
        return self._model.with_structured_output(schema)

    async def aclose(self) -> None:
        close = getattr(self._model, "aclose", None)
        if close is not None:
            result = close()
            if inspect.isawaitable(result):
                await result

    async def complete(
        self,
        messages: list[dict[str, Any]],
        *,
        system: str | None = None,
        model: str | None = None,
    ) -> str:
        chat_model = (
            self._model if model is None else get_chat_model(model, settings=self._settings)
        )
        response = await chat_model.ainvoke(_to_langchain_messages(messages, system))
        return _message_text(response)

    async def stream(
        self,
        messages: list[dict[str, Any]],
        *,
        system: str | None = None,
        model: str | None = None,
    ) -> AsyncIterator[str]:
        chat_model = (
            self._model if model is None else get_chat_model(model, settings=self._settings)
        )
        async for chunk in chat_model.astream(_to_langchain_messages(messages, system)):
            text = _message_text(chunk)
            if text:
                yield text
