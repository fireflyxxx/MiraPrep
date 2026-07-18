"""Redis-backed T-040 会话临时态和可续传事件日志。"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
import json
from functools import lru_cache
from typing import Any, Protocol
from weakref import WeakSet

from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from redis.asyncio import Redis
from redis.exceptions import LockError, RedisError

from app.schemas.interview import InterviewEvent, InterviewSessionState, InterviewStatus
from app.config import Settings, get_settings


@lru_cache
def get_interview_checkpointer() -> AsyncRedisSaver:
    """Create the shared Redis checkpoint backend for LangGraph threads."""

    settings = get_settings()
    return build_redis_checkpointer(settings)


def build_redis_checkpointer(settings: Settings) -> AsyncRedisSaver:
    redis_url = f"redis://{settings.redis_host}:{settings.redis_port}"
    return AsyncRedisSaver(
        redis_url=redis_url,
        ttl={"default_ttl": 240, "refresh_on_read": True},
    )


_READY_CHECKPOINTERS: WeakSet[Any] = WeakSet()
_CHECKPOINTER_SETUP_LOCK = asyncio.Lock()


async def ensure_checkpointer_setup(checkpointer: Any) -> None:
    """Create RedisJSON/RediSearch indices once before the first graph turn."""

    setup = getattr(checkpointer, "asetup", None)
    if setup is None or checkpointer in _READY_CHECKPOINTERS:
        return
    async with _CHECKPOINTER_SETUP_LOCK:
        if checkpointer in _READY_CHECKPOINTERS:
            return
        await setup()
        _READY_CHECKPOINTERS.add(checkpointer)


class SessionNotFoundError(LookupError):
    pass


class SessionAlreadyExistsError(RuntimeError):
    pass


class ReplayGapError(RuntimeError):
    pass


class SessionStateStore(Protocol):
    async def session_ids(self) -> list[int]: ...

    async def create(self, state: InterviewSessionState) -> None: ...

    async def get(self, session_id: int) -> InterviewSessionState: ...

    async def save(self, state: InterviewSessionState) -> None: ...

    async def append_event(
        self, session_id: int, event_type: str, payload: dict[str, Any]
    ) -> InterviewEvent: ...

    async def append_event_and_save(
        self, state: InterviewSessionState, event_type: str, payload: dict[str, Any]
    ) -> InterviewEvent: ...

    async def events_after(self, session_id: int, after_seq: int) -> list[InterviewEvent]: ...

    async def wait_for_events(
        self, session_id: int, after_seq: int, timeout: float
    ) -> list[InterviewEvent]: ...

    async def finalize(self, state: InterviewSessionState, reason: str) -> InterviewEvent: ...

    def lock(self, session_id: int) -> AsyncIterator[None]: ...


class InMemorySessionStateStore:
    """测试用实现；语义与 Redis 实现一致，不用于生产跨进程共享。"""

    def __init__(self) -> None:
        self._states: dict[int, InterviewSessionState] = {}
        self._events: dict[int, list[InterviewEvent]] = defaultdict(list)
        self._locks: defaultdict[int, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._conditions: defaultdict[int, asyncio.Condition] = defaultdict(asyncio.Condition)

    async def session_ids(self) -> list[int]:
        return [
            session_id
            for session_id, state in self._states.items()
            if state.status is not InterviewStatus.ENDED
        ]

    async def create(self, state: InterviewSessionState) -> None:
        if state.sessionId in self._states:
            raise SessionAlreadyExistsError(f"session {state.sessionId} already exists")
        self._states[state.sessionId] = state.model_copy(deep=True)

    async def get(self, session_id: int) -> InterviewSessionState:
        state = self._states.get(session_id)
        if state is None:
            raise SessionNotFoundError(f"session {session_id} not found")
        return state.model_copy(deep=True)

    async def save(self, state: InterviewSessionState) -> None:
        if state.sessionId not in self._states:
            raise SessionNotFoundError(f"session {state.sessionId} not found")
        self._states[state.sessionId] = state.model_copy(deep=True)

    async def append_event(
        self, session_id: int, event_type: str, payload: dict[str, Any]
    ) -> InterviewEvent:
        if session_id not in self._states:
            raise SessionNotFoundError(f"session {session_id} not found")
        event = InterviewEvent(
            type=event_type, payload=payload, seq=len(self._events[session_id]) + 1
        )
        self._events[session_id].append(event)
        condition = self._conditions[session_id]
        async with condition:
            condition.notify_all()
        return event.model_copy(deep=True)

    async def append_event_and_save(
        self, state: InterviewSessionState, event_type: str, payload: dict[str, Any]
    ) -> InterviewEvent:
        if state.sessionId not in self._states:
            raise SessionNotFoundError(f"session {state.sessionId} not found")
        self._states[state.sessionId] = state.model_copy(deep=True)
        return await self.append_event(state.sessionId, event_type, payload)

    async def events_after(self, session_id: int, after_seq: int) -> list[InterviewEvent]:
        await self.get(session_id)
        return [
            event.model_copy(deep=True)
            for event in self._events[session_id]
            if event.seq > after_seq
        ]

    async def wait_for_events(
        self, session_id: int, after_seq: int, timeout: float
    ) -> list[InterviewEvent]:
        events = await self.events_after(session_id, after_seq)
        if events:
            return events
        condition = self._conditions[session_id]
        async with condition:
            try:
                await asyncio.wait_for(condition.wait(), timeout=timeout)
            except TimeoutError:
                return []
        return await self.events_after(session_id, after_seq)

    async def finalize(self, state: InterviewSessionState, reason: str) -> InterviewEvent:
        if state.sessionId not in self._states:
            raise SessionNotFoundError(f"session {state.sessionId} not found")
        state.status = InterviewStatus.ENDED
        state.endReason = reason
        self._states[state.sessionId] = state.model_copy(deep=True)
        return await self.append_event(state.sessionId, "interview_end", {"reason": reason})

    @asynccontextmanager
    async def lock(self, session_id: int) -> AsyncIterator[None]:
        async with self._locks[session_id]:
            yield


_APPEND_EVENT_SCRIPT = """
if redis.call('EXISTS', KEYS[1]) == 0 then
  return {-1, ''}
end
local seq = redis.call('INCR', KEYS[2])
local event = cjson.encode({type=ARGV[1], payload=cjson.decode(ARGV[2]), seq=seq})
redis.call('RPUSH', KEYS[3], event)
redis.call('LTRIM', KEYS[3], -tonumber(ARGV[3]), -1)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4]))
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4]))
redis.call('EXPIRE', KEYS[3], tonumber(ARGV[4]))
redis.call('PUBLISH', KEYS[4], tostring(seq))
return {seq, event}
"""

_FINALIZE_SCRIPT = """
if redis.call('EXISTS', KEYS[1]) == 0 then
  return {-1, ''}
end
local seq = redis.call('INCR', KEYS[2])
local event = cjson.encode({type='interview_end', payload={reason=ARGV[1]}, seq=seq})
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[4]))
redis.call('RPUSH', KEYS[3], event)
redis.call('LTRIM', KEYS[3], -tonumber(ARGV[3]), -1)
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4]))
redis.call('EXPIRE', KEYS[3], tonumber(ARGV[4]))
redis.call('SREM', KEYS[5], ARGV[5])
redis.call('PUBLISH', KEYS[4], tostring(seq))
return {seq, event}
"""

_APPEND_EVENT_AND_SAVE_SCRIPT = """
if redis.call('EXISTS', KEYS[1]) == 0 then
  return {-1, ''}
end
local seq = redis.call('INCR', KEYS[2])
local event = cjson.encode({type=ARGV[1], payload=cjson.decode(ARGV[2]), seq=seq})
redis.call('SET', KEYS[1], ARGV[3], 'EX', tonumber(ARGV[5]))
redis.call('RPUSH', KEYS[3], event)
redis.call('LTRIM', KEYS[3], -tonumber(ARGV[4]), -1)
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[5]))
redis.call('EXPIRE', KEYS[3], tonumber(ARGV[5]))
redis.call('PUBLISH', KEYS[4], tostring(seq))
return {seq, event}
"""

_ACTIVE_SESSIONS_KEY = "miraprep:interview:active"


class RedisSessionStateStore:
    """生产实现：状态、事件和序号都放 Redis，支持多进程与断线续传。"""

    def __init__(
        self,
        redis: Redis,
        *,
        ttl_seconds: int = 14_400,
        event_limit: int = 4_000,
        lock_timeout_seconds: float = 60,
        lock_blocking_timeout_seconds: float = 5,
        lock_renew_interval_seconds: float = 20,
    ) -> None:
        self._redis = redis
        self._ttl_seconds = ttl_seconds
        self._event_limit = event_limit
        self._lock_timeout_seconds = lock_timeout_seconds
        self._lock_blocking_timeout_seconds = lock_blocking_timeout_seconds
        self._lock_renew_interval_seconds = lock_renew_interval_seconds

    @staticmethod
    def _keys(session_id: int) -> tuple[str, str, str, str]:
        base = f"miraprep:interview:{session_id}"
        return f"{base}:state", f"{base}:seq", f"{base}:events", f"{base}:updates"

    async def session_ids(self) -> list[int]:
        raw_members = await self._redis.smembers(_ACTIVE_SESSIONS_KEY)
        parsed_members: list[tuple[int, Any]] = []
        stale_members: list[Any] = []
        for raw_member in raw_members:
            member = raw_member.decode() if isinstance(raw_member, bytes) else raw_member
            try:
                parsed_members.append((int(member), raw_member))
            except (TypeError, ValueError):
                stale_members.append(raw_member)

        parsed_members.sort(key=lambda item: item[0])
        if parsed_members:
            state_keys = [self._keys(session_id)[0] for session_id, _ in parsed_members]
            states = await self._redis.mget(state_keys)
        else:
            states = []

        active_session_ids: list[int] = []
        for (session_id, raw_member), state in zip(parsed_members, states, strict=True):
            if state is None:
                stale_members.append(raw_member)
            else:
                active_session_ids.append(session_id)
        if stale_members:
            await self._redis.srem(_ACTIVE_SESSIONS_KEY, *stale_members)
        return active_session_ids

    async def create(self, state: InterviewSessionState) -> None:
        state_key, seq_key, events_key, _ = self._keys(state.sessionId)
        created = await self._redis.set(
            state_key,
            state.model_dump_json(),
            ex=self._ttl_seconds,
            nx=True,
        )
        if not created:
            raise SessionAlreadyExistsError(f"session {state.sessionId} already exists")
        async with self._redis.pipeline(transaction=True) as pipeline:
            pipeline.set(seq_key, 0, ex=self._ttl_seconds)
            pipeline.delete(events_key)
            pipeline.sadd(_ACTIVE_SESSIONS_KEY, state.sessionId)
            await pipeline.execute()

    async def get(self, session_id: int) -> InterviewSessionState:
        state_key, _, _, _ = self._keys(session_id)
        raw = await self._redis.get(state_key)
        if raw is None:
            raise SessionNotFoundError(f"session {session_id} not found")
        return InterviewSessionState.model_validate_json(raw)

    async def save(self, state: InterviewSessionState) -> None:
        state_key, _, _, _ = self._keys(state.sessionId)
        saved = await self._redis.set(
            state_key,
            state.model_dump_json(),
            ex=self._ttl_seconds,
            xx=True,
        )
        if not saved:
            raise SessionNotFoundError(f"session {state.sessionId} not found")

    async def append_event(
        self, session_id: int, event_type: str, payload: dict[str, Any]
    ) -> InterviewEvent:
        keys = self._keys(session_id)
        result = await self._redis.eval(
            _APPEND_EVENT_SCRIPT,
            4,
            *keys,
            event_type,
            json.dumps(payload, ensure_ascii=False),
            self._event_limit,
            self._ttl_seconds,
        )
        if int(result[0]) == -1:
            raise SessionNotFoundError(f"session {session_id} not found")
        return InterviewEvent.model_validate_json(result[1])

    async def append_event_and_save(
        self, state: InterviewSessionState, event_type: str, payload: dict[str, Any]
    ) -> InterviewEvent:
        result = await self._redis.eval(
            _APPEND_EVENT_AND_SAVE_SCRIPT,
            4,
            *self._keys(state.sessionId),
            event_type,
            json.dumps(payload, ensure_ascii=False),
            state.model_dump_json(),
            self._event_limit,
            self._ttl_seconds,
        )
        if int(result[0]) == -1:
            raise SessionNotFoundError(f"session {state.sessionId} not found")
        return InterviewEvent.model_validate_json(result[1])

    async def events_after(self, session_id: int, after_seq: int) -> list[InterviewEvent]:
        await self.get(session_id)
        _, _, events_key, _ = self._keys(session_id)
        raw_events = await self._redis.lrange(events_key, 0, -1)
        events = [InterviewEvent.model_validate_json(item) for item in raw_events]
        if events and events[0].seq > after_seq + 1:
            raise ReplayGapError(
                f"events {after_seq + 1}..{events[0].seq - 1} are no longer retained"
            )
        return [event for event in events if event.seq > after_seq]

    async def wait_for_events(
        self, session_id: int, after_seq: int, timeout: float
    ) -> list[InterviewEvent]:
        events = await self.events_after(session_id, after_seq)
        if events:
            return events
        _, _, _, channel = self._keys(session_id)
        pubsub = self._redis.pubsub()
        try:
            await pubsub.subscribe(channel)
            events = await self.events_after(session_id, after_seq)
            if events:
                return events
            await pubsub.get_message(ignore_subscribe_messages=True, timeout=timeout)
            return await self.events_after(session_id, after_seq)
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()

    async def finalize(self, state: InterviewSessionState, reason: str) -> InterviewEvent:
        state.status = InterviewStatus.ENDED
        state.endReason = reason
        result = await self._redis.eval(
            _FINALIZE_SCRIPT,
            5,
            *self._keys(state.sessionId),
            _ACTIVE_SESSIONS_KEY,
            reason,
            state.model_dump_json(),
            self._event_limit,
            self._ttl_seconds,
            state.sessionId,
        )
        if int(result[0]) == -1:
            raise SessionNotFoundError(f"session {state.sessionId} not found")
        return InterviewEvent.model_validate_json(result[1])

    @asynccontextmanager
    async def lock(self, session_id: int) -> AsyncIterator[None]:
        lock = self._redis.lock(
            f"miraprep:interview:{session_id}:lock",
            timeout=self._lock_timeout_seconds,
            blocking_timeout=self._lock_blocking_timeout_seconds,
        )
        acquired = await lock.acquire()
        if not acquired:
            raise TimeoutError(f"session {session_id} is busy")
        renewal = asyncio.create_task(self._renew_lock(lock))
        try:
            yield
        finally:
            renewal.cancel()
            with suppress(asyncio.CancelledError):
                await renewal
            if await lock.owned():
                await lock.release()
            else:
                raise TimeoutError(f"session {session_id} lock was lost")

    async def _renew_lock(self, lock: Any) -> None:
        while True:
            await asyncio.sleep(self._lock_renew_interval_seconds)
            try:
                extended = await lock.extend(self._lock_timeout_seconds, replace_ttl=True)
            except (LockError, RedisError):
                return
            if not extended:
                return
