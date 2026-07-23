"""T-105 Redis 批改队列真实集成测试。"""

from __future__ import annotations

import asyncio
import os
from uuid import uuid4

import pytest
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.services.grading import RedisGradingJobStore


def _redis() -> Redis:
    return Redis(
        host=os.getenv("MIRAPREP_TEST_REDIS_HOST", "localhost"),
        port=int(os.getenv("MIRAPREP_TEST_REDIS_PORT", "6379")),
        decode_responses=True,
        socket_connect_timeout=0.5,
        socket_timeout=1,
    )


def _isolated_store(redis: Redis, namespace: str) -> RedisGradingJobStore:
    class IsolatedRedisGradingJobStore(RedisGradingJobStore):
        _QUEUE_KEY = f"miraprep:test:grading:{namespace}:queue"
        _PROCESSING_KEY = f"miraprep:test:grading:{namespace}:processing"
        _DEAD_LETTER_KEY = f"miraprep:test:grading:{namespace}:dead-letter"
        _JOB_PREFIX = f"miraprep:test:grading:{namespace}:job:"

    return IsolatedRedisGradingJobStore(redis)


async def _cleanup(redis: Redis, store: RedisGradingJobStore, session_id: int) -> None:
    await redis.delete(
        store._QUEUE_KEY,
        store._PROCESSING_KEY,
        store._DEAD_LETTER_KEY,
        store._job_key(session_id),
    )


@pytest.mark.asyncio
async def test_redis_grading_store_atomically_deduplicates_and_requeues() -> None:
    redis = _redis()
    namespace = uuid4().hex
    session_id = 9_100_000_000 + uuid4().int % 1_000_000_000
    store = _isolated_store(redis, namespace)
    payload = {
        "stage": "grading",
        "gradingAttempts": 0,
        "requestHash": "same-request",
        "request": {"sessionId": session_id, "summary": "中文负载"},
    }
    stored_payload = {**payload, "revision": 1}
    try:
        try:
            await redis.ping()
        except RedisError:
            pytest.skip("local Redis is not available")

        results = await asyncio.gather(*(store.enqueue(session_id, payload) for _ in range(10)))

        assert results.count(True) == 1
        assert await redis.llen(store._QUEUE_KEY) == 1
        assert await store.claim() == (session_id, stored_payload)
        assert await redis.llen(store._PROCESSING_KEY) == 1

        retry_payload = {**stored_payload, "gradingAttempts": 1}
        assert await store.release(session_id, retry_payload, 1)
        assert await redis.llen(store._PROCESSING_KEY) == 0
        assert await redis.llen(store._QUEUE_KEY) == 1
        assert await store.claim() == (session_id, retry_payload)

        assert await store.complete(session_id, 1)
        assert await redis.exists(store._job_key(session_id)) == 0
        assert await redis.llen(store._PROCESSING_KEY) == 0
    finally:
        await _cleanup(redis, store, session_id)
        await redis.aclose()


@pytest.mark.asyncio
async def test_redis_grading_store_recovers_claimed_job_after_restart() -> None:
    redis = _redis()
    namespace = uuid4().hex
    session_id = 9_200_000_000 + uuid4().int % 1_000_000_000
    first_store = _isolated_store(redis, namespace)
    payload = {
        "stage": "delivery",
        "requestHash": "delivery-request",
        "callbackPath": f"/interviews/{session_id}/grade-result",
        "callbackPayload": {"grade": "A", "totalScore": 85},
    }
    stored_payload = {**payload, "revision": 1}
    try:
        try:
            await redis.ping()
        except RedisError:
            pytest.skip("local Redis is not available")

        assert await first_store.enqueue(session_id, payload) is True
        assert await first_store.claim() == (session_id, stored_payload)
        assert await first_store.persist_inflight(session_id, stored_payload, 1)
        assert await redis.llen(first_store._PROCESSING_KEY) == 1

        restarted_store = _isolated_store(redis, namespace)
        await restarted_store.recover_inflight()

        assert await redis.llen(restarted_store._PROCESSING_KEY) == 0
        assert await restarted_store.claim() == (session_id, stored_payload)
        await restarted_store.complete(session_id, 1)
    finally:
        await _cleanup(redis, first_store, session_id)
        await redis.aclose()


@pytest.mark.asyncio
async def test_redis_grading_store_new_revision_supersedes_inflight_request() -> None:
    redis = _redis()
    namespace = uuid4().hex
    session_id = 9_300_000_000 + uuid4().int % 1_000_000_000
    store = _isolated_store(redis, namespace)
    partial = {
        "stage": "grading",
        "requestHash": "partial",
        "request": {"sessionId": session_id, "partial": True},
    }
    complete = {
        "stage": "grading",
        "requestHash": "complete",
        "request": {"sessionId": session_id, "partial": False},
    }
    try:
        try:
            await redis.ping()
        except RedisError:
            pytest.skip("local Redis is not available")

        assert await store.enqueue(session_id, partial)
        claimed = await store.claim()
        assert claimed is not None
        _, old_job = claimed
        assert old_job["revision"] == 1

        assert await store.enqueue(session_id, complete)
        assert not await store.persist_inflight(session_id, old_job, 1)
        assert not await store.release(session_id, old_job, 1)

        claimed = await store.claim()
        assert claimed is not None
        _, latest_job = claimed
        assert latest_job["revision"] == 2
        assert latest_job["request"]["partial"] is False
        await store.complete(session_id, 2)
    finally:
        await _cleanup(redis, store, session_id)
        await redis.aclose()


@pytest.mark.asyncio
async def test_redis_grading_store_moves_exhausted_delivery_to_dead_letter() -> None:
    redis = _redis()
    namespace = uuid4().hex
    session_id = 9_400_000_000 + uuid4().int % 1_000_000_000
    store = _isolated_store(redis, namespace)
    payload = {
        "stage": "delivery",
        "requestHash": "failed-delivery",
        "deliveryAttempts": 5,
        "callbackPayload": {"grade": "A"},
    }
    try:
        try:
            await redis.ping()
        except RedisError:
            pytest.skip("local Redis is not available")

        assert await store.enqueue(session_id, payload)
        claimed = await store.claim()
        assert claimed is not None
        _, job = claimed
        assert await store.dead_letter(session_id, job, 1)

        assert await redis.exists(store._job_key(session_id)) == 0
        assert await redis.llen(store._DEAD_LETTER_KEY) == 1
    finally:
        await _cleanup(redis, store, session_id)
        await redis.aclose()
