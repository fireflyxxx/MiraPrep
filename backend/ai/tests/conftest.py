import os

import pytest
from redis.asyncio import Redis
from redis.exceptions import RedisError

os.environ.update(
    {
        "ANTHROPIC_API_KEY": "test-api-key",
        "ANTHROPIC_MODEL": "deepseek-v4-flash",
        "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
        "BUSINESS_CALLBACK_URL": "http://business.test/api/v1/internal",
        "INTERNAL_TOKEN": "test-internal-token",
        "REDIS_HOST": "localhost",
        "REDIS_PORT": "6379",
        "ASR_PROVIDER": "not-configured",
        "TTS_PROVIDER": "not-configured",
        "CORS_ORIGINS": "http://localhost:3000",
    }
)


def redis_client() -> Redis:
    return Redis(
        host=os.getenv("MIRAPREP_TEST_REDIS_HOST", "localhost"),
        port=int(os.getenv("MIRAPREP_TEST_REDIS_PORT", "6379")),
        decode_responses=True,
        socket_connect_timeout=0.5,
        socket_timeout=1,
    )


_redis_up: bool | None = None


@pytest.fixture
async def require_redis() -> None:
    """Redis 不可用时在测试体外跳过，避免 finally 里的清理 I/O 把 skip 变成 failure。"""
    global _redis_up  # ponytail: 探测一次就够，省下每个用例一次连接超时
    if _redis_up is None:
        redis = redis_client()
        try:
            await redis.ping()
            _redis_up = True
        except RedisError:
            _redis_up = False
        finally:
            await redis.aclose()
    if not _redis_up:
        pytest.skip("local Redis is not available")
