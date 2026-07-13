import asyncio
import logging
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger("miraprep.ai.callback")


class BusinessCallbackClient:
    """Posts AI task results to the business service with bounded retries."""

    def __init__(
        self,
        settings: Settings,
        client: httpx.AsyncClient | None = None,
        backoff_seconds: float = 0.25,
    ) -> None:
        self._settings = settings
        self._client = client or httpx.AsyncClient(timeout=10.0)
        self._owns_client = client is None
        self._backoff_seconds = backoff_seconds

    async def callback(self, path: str, json: dict[str, Any]) -> bool:
        url = f"{self._settings.business_callback_url.rstrip('/')}/{path.lstrip('/')}"
        headers = {"X-Internal-Token": self._settings.internal_token.get_secret_value()}
        for attempt in range(1, 4):
            try:
                response = await self._client.post(url, json=json, headers=headers)
                response.raise_for_status()
                return True
            except httpx.HTTPError:
                logger.warning("business callback failed", extra={"attempt": attempt, "url": url})
                if attempt < 3:
                    await asyncio.sleep(self._backoff_seconds * (2 ** (attempt - 1)))
        return False

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()
