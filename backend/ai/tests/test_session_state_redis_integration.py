"""真实 Redis 集成测试；本地 Redis 不可用时跳过，不影响纯单测。"""

import asyncio
from datetime import UTC, datetime, timedelta
import os
from uuid import uuid4

import pytest
from langchain_core.runnables import RunnableLambda
from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.schemas.interview import AgentDecision, InterviewSessionState
from app.services.interview_graph import build_interview_graph
from app.services.session_state import RedisSessionStateStore, ReplayGapError


def _redis() -> Redis:
    return Redis(
        host=os.getenv("MIRAPREP_TEST_REDIS_HOST", "localhost"),
        port=int(os.getenv("MIRAPREP_TEST_REDIS_PORT", "6379")),
        decode_responses=True,
        socket_connect_timeout=0.5,
        socket_timeout=1,
    )


@pytest.mark.asyncio
async def test_redis_store_persists_state_and_assigns_atomic_event_sequences() -> None:
    redis = _redis()
    try:
        try:
            await redis.ping()
        except RedisError:
            pytest.skip("local Redis is not available")

        session_id = 9_000_000_000 + uuid4().int % 1_000_000_000
        store = RedisSessionStateStore(redis, ttl_seconds=60)
        state = InterviewSessionState(
            sessionId=session_id,
            durationMin=15,
            interviewerStyle="professional",
            accessTokenHash="a" * 64,
            questions=[
                {
                    "questionId": "q1",
                    "phase": "SELF_INTRO",
                    "text": "请介绍自己。",
                    "focusPoints": ["结构"],
                    "order": 1,
                }
            ],
            startedAt=datetime.now(UTC),
            deadlineAt=datetime.now(UTC) + timedelta(minutes=15),
        )

        await store.create(state)
        assert await store.session_ids() == [session_id]
        events = await asyncio.gather(
            *(store.append_event(session_id, "token", {"text": str(index)}) for index in range(20))
        )

        assert sorted(event.seq for event in events) == list(range(1, 21))
        assert (await store.get(session_id)).sessionId == session_id
        assert [event.seq for event in await store.events_after(session_id, 10)] == list(
            range(11, 21)
        )
        state.followUpCount = 2
        combined = await store.append_event_and_save(
            state,
            "phase_change",
            {"from": "SELF_INTRO", "to": "RESUME_DEEP_DIVE"},
        )
        assert combined.seq == 21
        assert (await store.get(session_id)).followUpCount == 2

        terminal = await store.finalize(state, "completed")
        assert terminal.seq == 22
        assert terminal.type == "interview_end"
        assert (await store.get(session_id)).status == "ENDED"
        assert await store.session_ids() == []
    finally:
        if "session_id" in locals():
            await redis.delete(*RedisSessionStateStore._keys(session_id))
            await redis.srem("miraprep:interview:active", session_id)
        await redis.aclose()


@pytest.mark.asyncio
async def test_redis_lock_renews_while_a_long_llm_turn_is_running() -> None:
    redis = _redis()
    try:
        try:
            await redis.ping()
        except RedisError:
            pytest.skip("local Redis is not available")

        session_id = 9_000_000_000 + uuid4().int % 1_000_000_000
        store = RedisSessionStateStore(
            redis,
            lock_timeout_seconds=0.15,
            lock_renew_interval_seconds=0.04,
        )

        async with store.lock(session_id):
            await asyncio.sleep(0.35)
            assert await redis.pttl(f"miraprep:interview:{session_id}:lock") > 0

        assert await redis.exists(f"miraprep:interview:{session_id}:lock") == 0
    finally:
        if "session_id" in locals():
            await redis.delete(f"miraprep:interview:{session_id}:lock")
        await redis.aclose()


@pytest.mark.asyncio
async def test_redis_store_reports_replay_gap_after_old_events_are_trimmed() -> None:
    redis = _redis()
    try:
        try:
            await redis.ping()
        except RedisError:
            pytest.skip("local Redis is not available")
        session_id = 9_000_000_000 + uuid4().int % 1_000_000_000
        store = RedisSessionStateStore(redis, ttl_seconds=60, event_limit=3)
        state = InterviewSessionState(
            sessionId=session_id,
            durationMin=15,
            interviewerStyle="professional",
            accessTokenHash="a" * 64,
            questions=[
                {
                    "questionId": "q1",
                    "phase": "SELF_INTRO",
                    "text": "请介绍自己。",
                    "focusPoints": ["结构"],
                    "order": 1,
                }
            ],
            startedAt=datetime.now(UTC),
            deadlineAt=datetime.now(UTC) + timedelta(minutes=15),
        )
        await store.create(state)
        for index in range(5):
            await store.append_event(session_id, "token", {"text": str(index)})

        with pytest.raises(ReplayGapError):
            await store.events_after(session_id, 1)
        assert [event.seq for event in await store.events_after(session_id, 3)] == [4, 5]
    finally:
        if "session_id" in locals():
            await redis.delete(*RedisSessionStateStore._keys(session_id))
            await redis.srem("miraprep:interview:active", session_id)
        await redis.aclose()


@pytest.mark.asyncio
async def test_langgraph_checkpoint_survives_saver_reconstruction() -> None:
    host = os.getenv("MIRAPREP_TEST_REDIS_HOST", "localhost")
    port = int(os.getenv("MIRAPREP_TEST_REDIS_PORT", "6379"))
    redis = _redis()
    thread_id = f"checkpoint-{uuid4()}"
    redis_url = f"redis://{host}:{port}"
    redis_available = False
    try:
        try:
            await redis.ping()
            redis_available = True
        except RedisError:
            pytest.skip("local Redis is not available")

        first_saver = AsyncRedisSaver(redis_url=redis_url, ttl={"default_ttl": 1})
        try:
            await first_saver.asetup()
        except RedisError:
            await first_saver._redis.aclose()
            pytest.skip("RedisJSON/RediSearch modules are not available")

        chain = RunnableLambda(lambda _: AgentDecision(action="HINT"))
        first_graph = build_interview_graph(chain, checkpointer=first_saver)
        config = {"configurable": {"thread_id": thread_id}}
        await first_graph.ainvoke(
            {
                "session_id": thread_id,
                "phase": "SELF_INTRO",
                "questions": [],
                "current_question_index": 0,
                "follow_up_depth": 0,
                "messages": [{"role": "candidate", "content": "回答"}],
                "answer": "回答",
            },
            config=config,
        )
        await first_saver._redis.aclose()

        restarted_saver = AsyncRedisSaver(redis_url=redis_url, ttl={"default_ttl": 1})
        await restarted_saver.asetup()
        restarted_graph = build_interview_graph(chain, checkpointer=restarted_saver)
        checkpoint = await restarted_graph.aget_state(config)

        assert checkpoint.values["route"] == "hint"
        assert checkpoint.values["messages"][-1]["content"] == "回答"
        await restarted_saver._redis.aclose()
    finally:
        if redis_available:
            keys = []
            async for key in redis.scan_iter(match=f"*{thread_id}*"):
                keys.append(key)
            if keys:
                await redis.delete(*keys)
        await redis.aclose()
