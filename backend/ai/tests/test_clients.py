import httpx
import pytest
from langchain_core.messages import AIMessage, AIMessageChunk

from app.clients.business import BusinessCallbackClient
from app.clients.llm import LlmClient
from app.config import Settings
from app.routers import internal as internal_router


class FakeChatModel:
    def __init__(self) -> None:
        self.messages: list[object] = []
        self.closed = False

    async def ainvoke(self, messages):  # type: ignore[no-untyped-def]
        self.messages = messages
        return AIMessage(content="Hello")

    async def astream(self, messages):  # type: ignore[no-untyped-def]
        self.messages = messages
        yield AIMessageChunk(content="Hel")
        yield AIMessageChunk(content="lo")

    async def aclose(self) -> None:
        self.closed = True


def test_settings_accepts_anthropic_compatible_base_url() -> None:
    settings = Settings(anthropic_base_url="https://api.deepseek.com/anthropic")

    assert settings.anthropic_base_url == "https://api.deepseek.com/anthropic"


def test_llm_client_passes_configuration_to_chat_anthropic(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class CapturingChatAnthropic:
        def __init__(self, **kwargs: object) -> None:
            captured.update(kwargs)

    monkeypatch.setattr("app.clients.llm.ChatAnthropic", CapturingChatAnthropic)

    LlmClient(
        Settings(
            anthropic_base_url="https://api.deepseek.com/anthropic",
            anthropic_max_tokens=4096,
        )
    )

    assert captured["base_url"] == "https://api.deepseek.com/anthropic"
    assert captured["max_tokens"] == 4096


def test_llm_client_passes_task_specific_thinking_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class CapturingChatAnthropic:
        def __init__(self, **kwargs: object) -> None:
            captured.update(kwargs)

    monkeypatch.setattr("app.clients.llm.ChatAnthropic", CapturingChatAnthropic)

    LlmClient(Settings(), thinking={"type": "disabled"})

    assert captured["thinking"] == {"type": "disabled"}


def test_structured_output_services_disable_thinking(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    thinking_options: list[object] = []

    class CapturingLlmClient:
        def __init__(self, settings: Settings, **kwargs: object) -> None:
            thinking_options.append(kwargs.get("thinking"))

    class StubCallbackClient:
        def __init__(self, settings: Settings) -> None:
            pass

    monkeypatch.setattr(internal_router, "LlmClient", CapturingLlmClient)
    monkeypatch.setattr(internal_router, "BusinessCallbackClient", StubCallbackClient)

    internal_router._build_service(Settings())
    internal_router._build_outline_service(Settings())

    assert thinking_options == [{"type": "disabled"}, {"type": "disabled"}]


@pytest.mark.asyncio
async def test_llm_client_closes_injected_chat_model() -> None:
    model = FakeChatModel()
    client = LlmClient(Settings(), model=model)

    await client.aclose()

    assert model.closed is True


@pytest.mark.asyncio
async def test_llm_client_does_not_close_langchain_shared_internal_async_client() -> None:
    class RecordingAsyncClient:
        def __init__(self) -> None:
            self.closed = False

        async def close(self) -> None:
            self.closed = True

    class ChatModelWithoutPublicClose:
        def __init__(self) -> None:
            self._async_client = RecordingAsyncClient()

    model = ChatModelWithoutPublicClose()
    client = LlmClient(Settings(), model=model)

    await client.aclose()

    assert model._async_client.closed is False


@pytest.mark.asyncio
async def test_llm_client_returns_text_and_uses_configured_model() -> None:
    client = LlmClient(Settings(), model=FakeChatModel())

    result = await client.complete([{"role": "user", "content": "hello"}])

    assert result == "Hello"


@pytest.mark.asyncio
async def test_llm_client_yields_text_deltas() -> None:
    client = LlmClient(Settings(), model=FakeChatModel())

    result = [token async for token in client.stream([{"role": "user", "content": "hello"}])]

    assert result == ["Hel", "lo"]


@pytest.mark.asyncio
async def test_callback_retries_three_times_before_returning_false() -> None:
    attempts = 0

    async def unavailable(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(503, request=request)

    transport = httpx.MockTransport(unavailable)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = BusinessCallbackClient(Settings(), client=http_client, backoff_seconds=0)
        delivered = await client.callback("/resume/parsed", {"resumeId": "resume-1"})

    assert delivered is False
    assert attempts == 3
