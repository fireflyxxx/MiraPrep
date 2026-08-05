from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol


class SpeechProviderConfigurationError(RuntimeError):
    """Raised when a configured speech provider cannot be constructed."""


@dataclass(frozen=True)
class AsrResult:
    text: str
    is_final: bool


class AsrStream(Protocol):
    async def send_audio(self, chunk: bytes) -> None: ...

    async def finalize(self) -> None: ...

    def results(self) -> AsyncIterator[AsrResult]: ...

    async def aclose(self) -> None: ...


class AsrProvider(Protocol):
    async def open_stream(self, audio_format: str) -> AsrStream: ...
