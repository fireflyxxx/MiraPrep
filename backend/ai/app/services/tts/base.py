from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol


class TtsProvider(Protocol):
    audio_format: str

    def synthesize(self, text: str) -> AsyncIterator[bytes]: ...

    async def aclose(self) -> None: ...
