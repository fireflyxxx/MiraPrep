import httpx
import pytest

from app.clients.business import BusinessCallbackClient
from app.clients.llm import LlmClient
from app.config import Settings


class FakeMessages:
    async def create(self, **kwargs):  # type: ignore[no-untyped-def]
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
    messages = FakeMessages()


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
