import httpx
import pytest

from app.clients.business import BusinessCallbackClient
from app.clients.llm import LlmClient
from app.config import Settings


class FakeMessages:
    def __init__(self) -> None:
        self.last_request: dict[str, object] = {}

    async def create(self, **kwargs):  # type: ignore[no-untyped-def]
        self.last_request = kwargs
        if kwargs.get("stream"):

            async def events():
                yield type(
                    "Event",
                    (),
                    {"type": "content_block_delta", "delta": type("Delta", (), {"text": "Hel"})},
                )()
                yield type(
                    "Event",
                    (),
                    {"type": "content_block_delta", "delta": type("Delta", (), {"text": "lo"})},
                )()

            return events()

        return type(
            "Message",
            (),
            {"content": [type("TextBlock", (), {"type": "text", "text": "Hello"})()]},
        )()


class FakeAnthropicClient:
    def __init__(self) -> None:
        self.messages = FakeMessages()


def test_settings_accepts_anthropic_compatible_base_url() -> None:
    settings = Settings(anthropic_base_url="https://api.deepseek.com/anthropic")

    assert settings.anthropic_base_url == "https://api.deepseek.com/anthropic"


def test_llm_client_passes_configured_base_url_to_sdk(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class CapturingAnthropicClient:
        def __init__(self, **kwargs: object) -> None:
            captured.update(kwargs)

    monkeypatch.setattr("app.clients.llm.AsyncAnthropic", CapturingAnthropicClient)

    LlmClient(Settings(anthropic_base_url="https://api.deepseek.com/anthropic"))

    assert captured["base_url"] == "https://api.deepseek.com/anthropic"


@pytest.mark.asyncio
async def test_llm_client_uses_configured_max_tokens() -> None:
    fake_client = FakeAnthropicClient()
    client = LlmClient(Settings(anthropic_max_tokens=4096), client=fake_client)

    await client.complete([{"role": "user", "content": "hello"}])

    assert fake_client.messages.last_request["max_tokens"] == 4096


@pytest.mark.asyncio
async def test_llm_client_closes_owned_sdk_client(monkeypatch: pytest.MonkeyPatch) -> None:
    class ClosableAnthropicClient:
        closed = False

        def __init__(self, **kwargs: object) -> None:
            return None

        async def close(self) -> None:
            self.closed = True

    monkeypatch.setattr("app.clients.llm.AsyncAnthropic", ClosableAnthropicClient)
    client = LlmClient(Settings())

    await client.aclose()

    assert client._client.closed is True


@pytest.mark.asyncio
async def test_llm_client_returns_text_and_uses_configured_model() -> None:
    client = LlmClient(Settings(), client=FakeAnthropicClient())

    result = await client.complete([{"role": "user", "content": "hello"}])

    assert result == "Hello"


@pytest.mark.asyncio
async def test_llm_client_yields_text_deltas() -> None:
    client = LlmClient(Settings(), client=FakeAnthropicClient())

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
