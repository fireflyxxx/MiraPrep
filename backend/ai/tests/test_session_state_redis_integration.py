"""真实 Redis 集成测试；本地 Redis 不可用时跳过，不影响纯单测。"""

import asyncio
from datetime import UTC, datetime, timedelta
import os
from uuid import uuid4

import pytest
from conftest import redis_client as _redis
from langchain_core.runnables import RunnableLambda
from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from redis.exceptions import RedisError
from redisvl.exceptions import RedisVLError

from app.schemas.interview import AgentDecision, InterviewSessionState, PendingAudioFrame
from app.services.interview_graph import build_interview_graph
from app.services.session_state import RedisSessionStateStore, ReplayGapError

pytestmark = pytest.mark.usefixtures("require_redis")


@pytest.mark.asyncio
async def test_redis_store_persists_state_and_assigns_atomic_event_sequences() -> None:
    redis = _redis()
    try:
        session_id = 9_000_000_000 + uuid4().int % 1_000_000_000
        store = RedisSessionStateStore(redis, ttl_seconds=60)
        state = InterviewSessionState(
            sessionId=session_id,
            durationMin=15,
            interviewerStyle="professional",
            accessTokenHash="a" * 64,
            config={
                "jobDirection": "backend",
                "difficulty": "medium",
                "types": ["technical"],
                "durationMin": 15,
                "interviewerStyle": "professional",
            },
            resume={"parsedJson": {"skills": ["FastAPI"]}},
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
        # 开发机 Redis 是共享的，真实面试在跑时会有别的 session，只断言自己在册。
        assert session_id in await store.session_ids()
        events = await asyncio.gather(
            *(store.append_event(session_id, "token", {"text": str(index)}) for index in range(20))
        )

        assert sorted(event.seq for event in events) == list(range(1, 21))
        assert (await store.get(session_id)).sessionId == session_id
        assert [event.seq for event in await store.events_after(session_id, 10)] == list(
            range(11, 21)
        )
        state.followUpCount = 2
        state.pendingAudioFrames = [
            PendingAudioFrame(
                audioSeq=1,
                chunk="cGVyc2lzdGVkLWF1ZGlv",
                format="pcm16/16k",
            )
        ]
        combined = await store.append_event_and_save(
            state,
            "phase_change",
            {"from": "SELF_INTRO", "to": "RESUME_DEEP_DIVE"},
        )
        assert combined.seq == 21
        reloaded = await store.get(session_id)
        assert reloaded.followUpCount == 2
        assert reloaded.pendingAudioFrames == state.pendingAudioFrames

        terminal = await store.finalize(state, "completed")
        assert terminal.seq == 22
        assert terminal.type == "interview_end"
        assert (await store.get(session_id)).status == "ENDED"
        # 结束后本会话必须从维护集合里摘掉；同上，不假设 Redis 里没有别人。
        assert session_id not in await store.session_ids()
    finally:
        await redis.delete(*RedisSessionStateStore._keys(session_id))
        await redis.srem("miraprep:interview:active", session_id)
        await redis.aclose()


@pytest.mark.asyncio
async def test_redis_lock_renews_while_a_long_llm_turn_is_running() -> None:
    redis = _redis()
    try:
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
        await redis.delete(f"miraprep:interview:{session_id}:lock")
        await redis.aclose()


@pytest.mark.asyncio
async def test_redis_store_reports_replay_gap_after_old_events_are_trimmed() -> None:
    redis = _redis()
    try:
        session_id = 9_000_000_000 + uuid4().int % 1_000_000_000
        store = RedisSessionStateStore(redis, ttl_seconds=60, event_limit=3)
        state = InterviewSessionState(
            sessionId=session_id,
            durationMin=15,
            interviewerStyle="professional",
            accessTokenHash="a" * 64,
            config={
                "jobDirection": "backend",
                "difficulty": "medium",
                "types": ["technical"],
                "durationMin": 15,
                "interviewerStyle": "professional",
            },
            resume={"parsedJson": {"skills": ["FastAPI"]}},
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
    try:
        first_saver = AsyncRedisSaver(redis_url=redis_url, ttl={"default_ttl": 1})
        try:
            await first_saver.asetup()
        except (RedisError, RedisVLError):
            # redisvl 会把 "unknown command FT.INFO" 包成 RedisSearchError，它不是 RedisError。
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
        keys = [key async for key in redis.scan_iter(match=f"*{thread_id}*")]
        if keys:
            await redis.delete(*keys)
        await redis.aclose()
