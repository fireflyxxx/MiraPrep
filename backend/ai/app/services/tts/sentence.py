from __future__ import annotations

import re

_SENTENCE_END = re.compile(r"[。！？!?；;\n]+")


class SentenceChunker:
    """Incrementally cut streamed text at sentence boundaries without losing punctuation."""

    def __init__(self) -> None:
        self._buffer = ""

    def push(self, text: str) -> list[str]:
        self._buffer += text
        sentences: list[str] = []
        consumed = 0
        for match in _SENTENCE_END.finditer(self._buffer):
            end = match.end()
            sentence = self._buffer[consumed:end].strip()
            if sentence:
                sentences.append(sentence)
            consumed = end
        self._buffer = self._buffer[consumed:]
        return sentences

    def flush(self) -> list[str]:
        tail = self._buffer.strip()
        self._buffer = ""
        return [tail] if tail else []


def split_sentences(text: str) -> list[str]:
    chunker = SentenceChunker()
    return [*chunker.push(text), *chunker.flush()]
