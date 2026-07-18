"""T-040 Redis 会话态与断线续传语义。"""

import gc
from importlib import import_module
import weakref

import pytest


def _state(session_id: int = 40):  # type: ignore[no-untyped-def]
    schemas = import_module("app.schemas.interview")
    return schemas.InterviewSessionState(
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
        phase="GREETING",
        startedAt="2026-07-18T00:00:00Z",
        deadlineAt="2026-07-18T00:15:00Z",
    )


@pytest.mark.asyncio
async def test_store_round_trips_state_and_rejects_duplicate_create() -> None:
    state_module = import_module("app.services.session_state")
    store = state_module.InMemorySessionStateStore()
    state = _state()

    await store.create(state)
    loaded = await store.get(40)

    assert loaded == state
    loaded.followUpCount = 2
    await store.save(loaded)
    assert (await store.get(40)).followUpCount == 2
    with pytest.raises(state_module.SessionAlreadyExistsError):
        await store.create(state)


@pytest.mark.asyncio
async def test_store_assigns_monotonic_seq_and_replays_only_missing_events() -> None:
    state_module = import_module("app.services.session_state")
    store = state_module.InMemorySessionStateStore()
    await store.create(_state())

    first = await store.append_event(40, "token", {"text": "你"})
    second = await store.append_event(40, "token", {"text": "好"})
    third = await store.append_event(40, "phase_change", {"from": "GREETING", "to": "SELF_INTRO"})

    assert [first.seq, second.seq, third.seq] == [1, 2, 3]
    replay = await store.events_after(40, after_seq=1)
    assert [event.seq for event in replay] == [2, 3]
    assert replay[1].payload == {"from": "GREETING", "to": "SELF_INTRO"}


@pytest.mark.asyncio
async def test_store_raises_for_unknown_session_instead_of_creating_ghost_events() -> None:
    state_module = import_module("app.services.session_state")
    store = state_module.InMemorySessionStateStore()

    with pytest.raises(state_module.SessionNotFoundError):
        await store.get(404)
    with pytest.raises(state_module.SessionNotFoundError):
        await store.append_event(404, "token", {"text": "ghost"})


@pytest.mark.asyncio
async def test_finalized_session_is_removed_from_maintenance_candidates() -> None:
    state_module = import_module("app.services.session_state")
    store = state_module.InMemorySessionStateStore()
    state = _state()
    await store.create(state)

    assert await store.session_ids() == [40]
    await store.finalize(state, "completed")

    assert await store.session_ids() == []


@pytest.mark.asyncio
async def test_redis_session_ids_uses_active_set_and_prunes_stale_members() -> None:
    state_module = import_module("app.services.session_state")

    class FakeRedis:
        def __init__(self) -> None:
            self.removed: tuple[object, ...] | None = None

        async def smembers(self, key: str) -> set[str]:
            assert key == "miraprep:interview:active"
            return {"40", "stale", "41"}

        async def mget(self, keys: list[str]) -> list[str | None]:
            assert keys == [
                "miraprep:interview:40:state",
                "miraprep:interview:41:state",
            ]
            return ["{}", None]

        async def srem(self, key: str, *members: object) -> None:
            assert key == "miraprep:interview:active"
            self.removed = members

        async def scan_iter(self, *args, **kwargs):  # type: ignore[no-untyped-def]
            raise AssertionError("maintenance must not scan the shared Redis keyspace")
            yield ""  # pragma: no cover

    redis = FakeRedis()
    store = state_module.RedisSessionStateStore(redis)

    assert await store.session_ids() == [40]
    assert set(redis.removed or ()) == {"stale", "41"}


@pytest.mark.asyncio
async def test_checkpointer_setup_registry_does_not_retain_collected_instances() -> None:
    state_module = import_module("app.services.session_state")
    state_module._READY_CHECKPOINTERS.clear()

    class Checkpointer:
        def __init__(self) -> None:
            self.setup_calls = 0

        async def asetup(self) -> None:
            self.setup_calls += 1

    checkpointer = Checkpointer()
    await state_module.ensure_checkpointer_setup(checkpointer)
    await state_module.ensure_checkpointer_setup(checkpointer)
    assert checkpointer.setup_calls == 1
    reference = weakref.ref(checkpointer)

    del checkpointer
    gc.collect()

    assert reference() is None
    assert len(state_module._READY_CHECKPOINTERS) == 0
