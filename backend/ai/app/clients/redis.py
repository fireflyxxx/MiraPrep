from functools import lru_cache

from redis.asyncio import Redis

from app.config import get_settings


@lru_cache
def get_redis() -> Redis:
    """Create the Redis adapter lazily; later session tasks own its data model."""

    settings = get_settings()
    return Redis(host=settings.redis_host, port=settings.redis_port, decode_responses=True)
