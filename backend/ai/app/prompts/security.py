"""Shared prompt boundary hardening for every untrusted LLM input."""

from __future__ import annotations

import json
import re
from typing import Any

MAX_UNTRUSTED_TEXT_CHARS = 10_000
MAX_SERIALIZED_PROMPT_CHARS = 50_000
MAX_COLLECTION_ITEMS = 100
MAX_NESTING_DEPTH = 8

_UNSAFE_CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def sanitize_untrusted_text(value: str, *, max_chars: int = MAX_UNTRUSTED_TEXT_CHARS) -> str:
    """Remove control characters, neutralize boundary tokens, and cap input length."""

    cleaned = _UNSAFE_CONTROL_CHARACTERS.sub("", value)
    cleaned = cleaned.replace("<<<", "＜＜＜").replace(">>>", "＞＞＞")
    return cleaned[:max_chars]


def sanitize_untrusted_value(value: Any, *, depth: int = 0) -> Any:
    """Recursively sanitize JSON-like values before placing them in a prompt."""

    if depth >= MAX_NESTING_DEPTH:
        return "[TRUNCATED_NESTING]"
    if isinstance(value, str):
        return sanitize_untrusted_text(value)
    if isinstance(value, dict):
        return {
            sanitize_untrusted_text(str(key), max_chars=256): sanitize_untrusted_value(
                child, depth=depth + 1
            )
            for key, child in list(value.items())[:MAX_COLLECTION_ITEMS]
        }
    if isinstance(value, (list, tuple, set)):
        return [
            sanitize_untrusted_value(child, depth=depth + 1)
            for child in list(value)[:MAX_COLLECTION_ITEMS]
        ]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return sanitize_untrusted_text(str(value))


def serialize_untrusted(value: Any) -> str:
    """Return bounded, valid JSON for an explicitly untrusted prompt data block."""

    serialized = json.dumps(sanitize_untrusted_value(value), ensure_ascii=False)
    if len(serialized) <= MAX_SERIALIZED_PROMPT_CHARS:
        return serialized
    return json.dumps(
        {
            "truncated": True,
            "content": serialized[:MAX_SERIALIZED_PROMPT_CHARS],
        },
        ensure_ascii=False,
    )
