from __future__ import annotations

from collections.abc import AsyncIterator
import json

import httpx
import pytest

from app.config import Settings
from app.services.asr.base import AsrResult
from app.services.asr.deepgram import DeepgramAsrProvider
from app.services.speech import build_asr_provider, build_tts_provider
from app.services.tts.openai import OpenAiTtsProvider


class FakeDeepgramSocket:
    def __init__(self) -> None:
        self.sent: list[bytes | str] = []
        self.messages: AsyncIterator[str] = self._messages()

    async def _messages(self) -> AsyncIterator[str]:
        yield json.dumps(
            {
                "type": "Results",
                "channel": {"alternatives": [{"transcript": "我负责了"}]},
                "is_final": False,
                "speech_final": False,
            }
        )
        yield json.dumps(
            {
                "type": "Results",
                "channel": {"alternatives": [{"transcript": "我负责了"}]},
                "is_final": True,
                "speech_final": False,
            }
        )
        yield json.dumps(
            {
                "type": "Results",
                "channel": {"alternatives": [{"transcript": "核心模块"}]},
                "is_final": True,
                "speech_final": True,
            }
        )

    def __aiter__(self) -> AsyncIterator[str]:
        return self.messages

    async def send(self, message: bytes | str) -> None:
        self.sent.append(message)

    async def close(self) -> None:
        return None


@pytest.mark.asyncio
async def test_deepgram_asr_stream_sends_pcm_and_maps_partial_and_final_results(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    socket = FakeDeepgramSocket()

    async def connect(url: str, *, additional_headers: dict[str, str]):
        assert "encoding=linear16" in url
        assert "sample_rate=16000" in url
        assert "interim_results=true" in url
        assert additional_headers == {"Authorization": "Token dg-test-key"}
        return socket

    monkeypatch.setattr("app.services.asr.deepgram.connect", connect)
    stream = await DeepgramAsrProvider(
        api_key="dg-test-key", model="nova-3", language="zh-CN"
    ).open_stream("pcm16/16k")

    await stream.send_audio(b"\x01\x02")
    results = [result async for result in stream.results()]
    await stream.finalize()

    assert socket.sent[0] == b"\x01\x02"
    assert socket.sent[-1] == '{"type":"Finalize"}'
    assert results == [
        AsrResult(text="我负责了", is_final=False),
        AsrResult(text="我负责了", is_final=False),
        AsrResult(text="我负责了核心模块", is_final=True),
    ]


@pytest.mark.asyncio
async def test_openai_tts_streams_pcm_chunks_without_buffering_the_whole_response() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["authorization"] = request.headers["Authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, content=b"first-second", request=request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OpenAiTtsProvider(
        api_key="openai-test-key",
        model="gpt-4o-mini-tts",
        voice="cedar",
        client=client,
        chunk_bytes=6,
    )

    chunks = [chunk async for chunk in provider.synthesize("请介绍一下你的项目。")]
    await provider.aclose()

    assert chunks == [b"first-", b"second"]
    assert seen == {
        "authorization": "Bearer openai-test-key",
        "body": {
            "model": "gpt-4o-mini-tts",
            "voice": "cedar",
            "input": "请介绍一下你的项目。",
            "response_format": "pcm",
            "stream_format": "audio",
        },
    }


def test_speech_provider_factories_follow_asr_and_tts_configuration() -> None:
    settings = Settings(
        asr_provider="deepgram",
        tts_provider="openai",
        deepgram_api_key="deepgram-secret",
        openai_api_key="openai-secret",
    )

    asr = build_asr_provider(settings)
    tts = build_tts_provider(settings)

    assert isinstance(asr, DeepgramAsrProvider)
    assert isinstance(tts, OpenAiTtsProvider)
