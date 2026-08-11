from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import suppress
import json
from time import monotonic
from typing import Any
from urllib.parse import urlencode

from websockets.asyncio.client import connect

from app.services.asr.base import AsrResult, AsrStream

_KEEPALIVE_INTERVAL_SECONDS = 4.0


class DeepgramAsrProvider:
    """Deepgram live transcription adapter for raw 16-bit/16 kHz mono PCM."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str = "nova-3",
        language: str = "zh-CN",
        endpoint: str = "wss://api.deepgram.com/v1/listen",
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._language = language
        self._endpoint = endpoint

    async def open_stream(self, audio_format: str) -> AsrStream:
        if audio_format != "pcm16/16k":
            raise ValueError("Deepgram ASR requires pcm16/16k audio")
        query = urlencode(
            {
                "model": self._model,
                "language": self._language,
                "encoding": "linear16",
                "sample_rate": 16000,
                "channels": 1,
                "interim_results": "true",
                "smart_format": "true",
                "endpointing": 300,
            }
        )
        websocket = await connect(
            f"{self._endpoint}?{query}",
            additional_headers={"Authorization": f"Token {self._api_key}"},
        )
        return DeepgramAsrStream(websocket)


class DeepgramAsrStream:
    def __init__(self, websocket: Any) -> None:
        self._websocket = websocket
        self._committed = ""
        self._send_lock = asyncio.Lock()
        self._last_send_at = monotonic()
        self._keepalive_task = asyncio.create_task(self._keep_idle_connection_alive())

    async def send_audio(self, chunk: bytes) -> None:
        await self._send(chunk)

    async def finalize(self) -> None:
        await self._send('{"type":"Finalize"}')

    async def _send(self, message: bytes | str) -> None:
        async with self._send_lock:
            await self._websocket.send(message)
            self._last_send_at = monotonic()

    async def _keep_idle_connection_alive(self) -> None:
        try:
            while True:
                await asyncio.sleep(_KEEPALIVE_INTERVAL_SECONDS)
                if monotonic() - self._last_send_at >= _KEEPALIVE_INTERVAL_SECONDS:
                    await self._send('{"type":"KeepAlive"}')
        except asyncio.CancelledError:
            raise
        except Exception:
            # results() 会把连接关闭交给上层重连；保活任务自身不能泄漏未取回异常。
            return

    async def results(self) -> AsyncIterator[AsrResult]:
        async for raw in self._websocket:
            if not isinstance(raw, str):
                continue
            message = json.loads(raw)
            if message.get("type") != "Results":
                continue
            alternatives = message.get("channel", {}).get("alternatives", [])
            transcript = alternatives[0].get("transcript", "").strip() if alternatives else ""
            if not transcript:
                continue
            if message.get("is_final"):
                self._committed = _join_transcript(self._committed, transcript)
                text = self._committed
            else:
                text = _join_transcript(self._committed, transcript)
            yield AsrResult(
                text=text,
                is_final=bool(message.get("speech_final") or message.get("from_finalize")),
            )

    async def aclose(self) -> None:
        self._keepalive_task.cancel()
        with suppress(asyncio.CancelledError):
            await self._keepalive_task
        await self._websocket.close()


def _join_transcript(left: str, right: str) -> str:
    if not left:
        return right
    if not right:
        return left
    separator = " " if left[-1].isascii() and right[0].isascii() else ""
    return f"{left}{separator}{right}"
