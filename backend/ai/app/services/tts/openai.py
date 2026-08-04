from __future__ import annotations

from collections.abc import AsyncIterator

import httpx


class OpenAiTtsProvider:
    """Sentence-level streaming adapter for the OpenAI speech endpoint."""

    audio_format = "pcm16/24k"

    def __init__(
        self,
        *,
        api_key: str,
        model: str = "gpt-4o-mini-tts",
        voice: str = "cedar",
        base_url: str = "https://api.openai.com/v1",
        client: httpx.AsyncClient | None = None,
        chunk_bytes: int = 12_000,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._voice = voice
        self._base_url = base_url.rstrip("/")
        self._client = client or httpx.AsyncClient(timeout=httpx.Timeout(30, read=60))
        self._chunk_bytes = chunk_bytes

    async def synthesize(self, text: str) -> AsyncIterator[bytes]:
        async with self._client.stream(
            "POST",
            f"{self._base_url}/audio/speech",
            headers={"Authorization": f"Bearer {self._api_key}"},
            json={
                "model": self._model,
                "voice": self._voice,
                "input": text,
                "response_format": "pcm",
                "stream_format": "audio",
            },
        ) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes(chunk_size=self._chunk_bytes):
                if chunk:
                    yield chunk

    async def aclose(self) -> None:
        await self._client.aclose()
