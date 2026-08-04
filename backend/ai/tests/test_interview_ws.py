from __future__ import annotations

import asyncio
import base64
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from importlib import import_module
import time

from fastapi.testclient import TestClient
import pytest
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.routers import interview_ws
from app.schemas.interview import InterviewSessionState
from app.services.asr.base import AsrResult, SpeechProviderConfigurationError
from app.services.interview_ws import VoiceInterviewRuntime
from app.services.session_state import InMemorySessionStateStore
from tests.test_interview_agent_service import _start_request


class FakeAgent:
    def __init__(self, store: InMemorySessionStateStore) -> None:
        self.store = store
        self.answers: list[str] = []
        self.voice: list[bool] = []

    async def authorize(self, session_id: int, access_token: str) -> None:
        assert session_id == 40
        assert access_token == "test-runtime-token-40-at-least-32-chars"

    async def ensure_replay(self, session_id: int, after_seq: int) -> None:
        await self.store.events_after(session_id, after_seq)

    async def set_voice(self, session_id: int, enabled: bool) -> None:
        self.voice.append(enabled)

    async def answer(self, session_id: int, body) -> None:  # type: ignore[no-untyped-def]
        self.answers.append(body.content)
        await self.store.append_event(
            session_id,
            "token",
            {"text": "下一题", "questionId": "q2", "phase": "RESUME_DEEP_DIVE"},
        )

    async def aclose(self) -> None:
        return None


class FakeAsrStream:
    def __init__(self) -> None:
        self.audio: list[bytes] = []
        self.queue: asyncio.Queue[AsrResult | None] = asyncio.Queue()

    async def send_audio(self, chunk: bytes) -> None:
        self.audio.append(chunk)
        await self.queue.put(AsrResult(text="我负责核心模块", is_final=True))

    async def finalize(self) -> None:
        return None

    async def results(self) -> AsyncIterator[AsrResult]:
        while (result := await self.queue.get()) is not None:
            yield result

    async def aclose(self) -> None:
        await self.queue.put(None)


class FakeAsrProvider:
    def __init__(self) -> None:
        self.formats: list[str] = []
        self.stream = FakeAsrStream()

    async def open_stream(self, audio_format: str) -> FakeAsrStream:
        self.formats.append(audio_format)
        return self.stream


class HoldingAsrStream:
    """Accepts audio but deliberately produces no transcription yet."""

    def __init__(self) -> None:
        self.audio: list[bytes] = []
        self.queue: asyncio.Queue[AsrResult | None] = asyncio.Queue()

    async def send_audio(self, chunk: bytes) -> None:
        self.audio.append(chunk)

    async def finalize(self) -> None:
        return None

    async def results(self) -> AsyncIterator[AsrResult]:
        while (result := await self.queue.get()) is not None:
            yield result

    async def aclose(self) -> None:
        await self.queue.put(None)


class HoldingAsrProvider:
    def __init__(self) -> None:
        self.stream = HoldingAsrStream()

    async def open_stream(self, _audio_format: str) -> HoldingAsrStream:
        return self.stream


def make_state() -> InterviewSessionState:
    body = _start_request()
    now = datetime.now(UTC)
    return InterviewSessionState(
        sessionId=40,
        durationMin=body.durationMin,
        interviewerStyle=body.interviewerStyle,
        accessTokenHash="0" * 64,
        config=body.config,
        resume=body.resume,
        questions=body.questions,
        currentQuestionIndex=0,
        startedAt=now,
        deadlineAt=now + timedelta(minutes=15),
    )


@pytest.fixture
def voice_runtime(monkeypatch: pytest.MonkeyPatch):
    store = InMemorySessionStateStore()
    asyncio.run(store.create(make_state()))
    agent = FakeAgent(store)
    asr = FakeAsrProvider()
    runtime = VoiceInterviewRuntime(store=store, agent=agent, asr=asr)
    monkeypatch.setattr(interview_ws, "build_voice_runtime", lambda: runtime)
    return runtime, agent, asr, store


def receive_until(websocket, event_type: str, *, predicate=lambda _payload: True):  # type: ignore[no-untyped-def]
    for _ in range(12):
        event = websocket.receive_json()
        if event["type"] == event_type and predicate(event["payload"]):
            return event
    raise AssertionError(f"did not receive {event_type}")


def test_websocket_audio_transcription_confirmation_and_follow_up(voice_runtime) -> None:  # type: ignore[no-untyped-def]
    _runtime, agent, asr, _store = voice_runtime
    encoded = base64.b64encode(b"pcm-data").decode()

    with TestClient(app).websocket_connect(
        "/ws/interview/40?accessToken=test-runtime-token-40-at-least-32-chars&voice=true"
    ) as websocket:
        websocket.send_json(
            {
                "type": "audio",
                "payload": {
                    "chunk": encoded,
                    "format": "pcm16/16k",
                    "audioSeq": 1,
                },
            }
        )
        final = receive_until(
            websocket,
            "asr_partial",
            predicate=lambda payload: payload.get("isFinal") is True,
        )
        websocket.send_json(
            {
                "type": "asr_confirm",
                "payload": {
                    "answerId": "voice-answer-001",
                    "text": "我编辑后负责核心模块",
                    "questionId": "q1",
                },
            }
        )
        follow_up = receive_until(websocket, "token")

    assert final["payload"]["text"] == "我负责核心模块"
    assert final["payload"]["latencyMs"] < 800
    assert final["seq"] < follow_up["seq"]
    assert agent.answers == ["我编辑后负责核心模块"]
    assert agent.voice == [True]
    assert asr.formats == ["pcm16/16k"]
    assert asr.stream.audio == [b"pcm-data"]


def test_websocket_replays_only_events_after_seq_and_rejects_audio_gaps(voice_runtime) -> None:  # type: ignore[no-untyped-def]
    _runtime, _agent, _asr, store = voice_runtime
    asyncio.run(store.append_event(40, "token", {"text": "old"}))
    second = asyncio.run(store.append_event(40, "token", {"text": "missing"}))

    with TestClient(app).websocket_connect(
        "/ws/interview/40?accessToken=test-runtime-token-40-at-least-32-chars&afterSeq=1"
    ) as websocket:
        replay = websocket.receive_json()
        assert replay["seq"] == second.seq
        websocket.send_json(
            {
                "type": "audio",
                "payload": {
                    "chunk": base64.b64encode(b"gap").decode(),
                    "format": "pcm16/16k",
                    "audioSeq": 2,
                },
            }
        )
        error = receive_until(websocket, "error")

    assert error["payload"]["code"] == "audio_sequence_gap"


def test_websocket_reconnect_deduplicates_acknowledged_audio_and_accepts_next_frame(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = InMemorySessionStateStore()
    asyncio.run(store.create(make_state()))
    built: list[tuple[FakeAgent, FakeAsrProvider]] = []

    def build_runtime() -> VoiceInterviewRuntime:
        agent = FakeAgent(store)
        asr = FakeAsrProvider()
        built.append((agent, asr))
        return VoiceInterviewRuntime(store=store, agent=agent, asr=asr)

    monkeypatch.setattr(interview_ws, "build_voice_runtime", build_runtime)
    encoded = base64.b64encode(b"pcm-data").decode()

    with TestClient(app) as client:
        with client.websocket_connect(
            "/ws/interview/40?accessToken=test-runtime-token-40-at-least-32-chars"
        ) as websocket:
            websocket.send_json(
                {
                    "type": "audio",
                    "payload": {"chunk": encoded, "format": "pcm16/16k", "audioSeq": 1},
                }
            )
            acknowledged = receive_until(
                websocket,
                "asr_partial",
                predicate=lambda payload: payload.get("acceptedAudioSeq") == 1,
            )

        with client.websocket_connect(
            "/ws/interview/40"
            "?accessToken=test-runtime-token-40-at-least-32-chars"
            f"&afterSeq={acknowledged['seq']}"
        ) as websocket:
            websocket.send_json(
                {
                    "type": "audio",
                    "payload": {"chunk": encoded, "format": "pcm16/16k", "audioSeq": 1},
                }
            )
            duplicate = receive_until(
                websocket,
                "asr_partial",
                predicate=lambda payload: payload.get("duplicate") is True,
            )
            websocket.send_json(
                {
                    "type": "audio",
                    "payload": {"chunk": encoded, "format": "pcm16/16k", "audioSeq": 2},
                }
            )
            next_frame = receive_until(
                websocket,
                "asr_partial",
                predicate=lambda payload: payload.get("acceptedAudioSeq") == 2,
            )

    assert duplicate["payload"]["acceptedAudioSeq"] == 1
    assert next_frame["seq"] > duplicate["seq"]
    assert built[0][1].stream.audio == [b"pcm-data"]
    assert built[1][1].stream.audio == [b"pcm-data"]


def test_websocket_reconnect_replays_audio_that_has_not_reached_final_transcription(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = InMemorySessionStateStore()
    asyncio.run(store.create(make_state()))
    built: list[HoldingAsrProvider] = []

    def build_runtime() -> VoiceInterviewRuntime:
        provider = HoldingAsrProvider()
        built.append(provider)
        return VoiceInterviewRuntime(store=store, agent=FakeAgent(store), asr=provider)

    monkeypatch.setattr(interview_ws, "build_voice_runtime", build_runtime)
    encoded = base64.b64encode(b"not-final-yet").decode()

    with TestClient(app) as client:
        with client.websocket_connect(
            "/ws/interview/40?accessToken=test-runtime-token-40-at-least-32-chars"
        ) as websocket:
            websocket.send_json(
                {
                    "type": "audio",
                    "payload": {"chunk": encoded, "format": "pcm16/16k", "audioSeq": 1},
                }
            )
            acknowledged = receive_until(
                websocket,
                "asr_partial",
                predicate=lambda payload: payload.get("acceptedAudioSeq") == 1,
            )

        with client.websocket_connect(
            "/ws/interview/40"
            "?accessToken=test-runtime-token-40-at-least-32-chars"
            f"&afterSeq={acknowledged['seq']}"
        ):
            for _ in range(50):
                if built[1].stream.audio:
                    break
                time.sleep(0.01)

    assert built[0].stream.audio == [b"not-final-yet"]
    assert built[1].stream.audio == [b"not-final-yet"]


def test_final_transcription_clears_persisted_audio_replay_buffer(voice_runtime) -> None:  # type: ignore[no-untyped-def]
    _runtime, _agent, _asr, store = voice_runtime

    with TestClient(app).websocket_connect(
        "/ws/interview/40?accessToken=test-runtime-token-40-at-least-32-chars"
    ) as websocket:
        websocket.send_json(
            {
                "type": "audio",
                "payload": {
                    "chunk": base64.b64encode(b"pcm-data").decode(),
                    "format": "pcm16/16k",
                    "audioSeq": 1,
                },
            }
        )
        receive_until(
            websocket,
            "asr_partial",
            predicate=lambda payload: payload.get("isFinal") is True,
        )

    assert asyncio.run(store.get(40)).pendingAudioFrames == []


@pytest.mark.asyncio
async def test_final_transcription_only_clears_audio_before_finalize_boundary() -> None:
    store = InMemorySessionStateStore()
    await store.create(make_state())
    provider = HoldingAsrProvider()
    runtime = VoiceInterviewRuntime(store=store, agent=FakeAgent(store), asr=provider)

    await runtime._handle_audio(  # noqa: SLF001 - verifies persisted replay boundary
        40,
        runtime_audio_frame(b"first", 1),
    )
    await runtime._dispatch_message(40, {"type": "audio_end", "payload": {}})  # noqa: SLF001
    await runtime._handle_audio(  # noqa: SLF001
        40,
        runtime_audio_frame(b"second", 2),
    )
    await provider.stream.queue.put(AsrResult(text="first answer", is_final=True))
    for _ in range(50):
        state = await store.get(40)
        if state.asrDraftText == "first answer":
            break
        await asyncio.sleep(0.01)

    assert [frame.audioSeq for frame in state.pendingAudioFrames] == [2]
    assert [base64.b64decode(frame.chunk) for frame in state.pendingAudioFrames] == [b"second"]
    assert runtime._asr_task is not None  # noqa: SLF001
    runtime._asr_task.cancel()  # noqa: SLF001
    with pytest.raises(asyncio.CancelledError):
        await runtime._asr_task  # noqa: SLF001


@pytest.mark.asyncio
async def test_pending_audio_replay_buffer_has_a_hard_byte_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = import_module("app.services.interview_ws")
    monkeypatch.setattr(module, "_MAX_PENDING_AUDIO_BYTES", 8)
    store = InMemorySessionStateStore()
    await store.create(make_state())
    runtime = VoiceInterviewRuntime(
        store=store,
        agent=FakeAgent(store),
        asr=HoldingAsrProvider(),
    )

    await runtime._handle_audio(40, runtime_audio_frame(b"12345", 1))  # noqa: SLF001
    await runtime._handle_audio(40, runtime_audio_frame(b"67890", 2))  # noqa: SLF001

    state = await store.get(40)
    assert state.lastAudioSeq == 1
    assert state.pendingAudioBytes == 5
    assert [frame.audioSeq for frame in state.pendingAudioFrames] == [1]
    errors = [event for event in await store.events_after(40, 0) if event.type == "error"]
    assert errors[-1].payload["code"] == "audio_buffer_full"
    assert runtime._asr_task is not None  # noqa: SLF001
    runtime._asr_task.cancel()  # noqa: SLF001
    with pytest.raises(asyncio.CancelledError):
        await runtime._asr_task  # noqa: SLF001


def runtime_audio_frame(chunk: bytes, sequence: int):  # type: ignore[no-untyped-def]
    from app.services.interview_ws import AudioFrame

    return AudioFrame(
        chunk=base64.b64encode(chunk).decode(),
        format="pcm16/16k",
        audioSeq=sequence,
    )


def test_websocket_closes_with_retryable_code_when_provider_is_not_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        interview_ws,
        "build_voice_runtime",
        lambda: (_ for _ in ()).throw(
            SpeechProviderConfigurationError("ASR provider is not configured")
        ),
    )

    with pytest.raises(WebSocketDisconnect) as closed:
        with TestClient(app).websocket_connect(
            "/ws/interview/40?accessToken=test-runtime-token-40-at-least-32-chars"
        ):
            pass

    assert closed.value.code == 1013
