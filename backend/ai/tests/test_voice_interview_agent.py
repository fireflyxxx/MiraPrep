from __future__ import annotations

import asyncio
import base64
from collections.abc import AsyncIterator
from importlib import import_module

import pytest

from app.services.session_state import InMemorySessionStateStore
from app.schemas.interview import AgentAction, AgentDecision
from tests.test_interview_agent_service import (
    RecordingMessageSink,
    ScriptedLlm,
    _start_request,
)


class RecordingTtsProvider:
    audio_format = "pcm16/24k"

    def __init__(self) -> None:
        self.texts: list[str] = []

    async def synthesize(self, text: str) -> AsyncIterator[bytes]:
        self.texts.append(text)
        yield f"audio:{text}".encode()

    async def aclose(self) -> None:
        return None


class NoopGradingTrigger:
    async def trigger(self, *_args, **_kwargs) -> None:  # type: ignore[no-untyped-def]
        return None


@pytest.mark.asyncio
async def test_enabling_voice_speaks_current_question_by_sentence_and_persists_audio_events() -> (
    None
):
    module = import_module("app.services.interview_agent")
    store = InMemorySessionStateStore()
    tts = RecordingTtsProvider()
    service = module.InterviewAgentService(
        store=store,
        llm=ScriptedLlm(),
        message_sink=RecordingMessageSink(),
        grading_trigger=NoopGradingTrigger(),
        tts=tts,
    )
    await service.start(40, _start_request())

    await service.set_voice(40, True)

    events = await store.events_after(40, 0)
    audio = [event for event in events if event.type == "audio"]
    assert tts.texts[-1] == "请简要介绍自己。"
    assert audio[-1].payload["forQuestionId"] == "q1"
    assert audio[-1].payload["format"] == "pcm16/24k"
    assert audio[-1].payload["isFinal"] is True


@pytest.mark.asyncio
async def test_muted_voice_never_calls_tts_for_new_interviewer_output() -> None:
    module = import_module("app.services.interview_agent")
    store = InMemorySessionStateStore()
    tts = RecordingTtsProvider()
    service = module.InterviewAgentService(
        store=store,
        llm=ScriptedLlm(),
        message_sink=RecordingMessageSink(),
        grading_trigger=NoopGradingTrigger(),
        tts=tts,
    )
    await service.start(40, _start_request())
    await service.set_voice(40, False)

    await service._emit_interviewer_message(  # noqa: SLF001 - verifies the output pipeline
        await store.get(40),
        "第一句。第二句！",
        question=None,
    )

    assert tts.texts == []


def test_sentence_splitter_emits_complete_sentences_and_flushes_tail() -> None:
    from app.services.tts.sentence import SentenceChunker

    chunker = SentenceChunker()

    assert chunker.push("第一句。第二") == ["第一句。"]
    assert chunker.push("句！还没结束") == ["第二句！"]
    assert chunker.flush() == ["还没结束"]


@pytest.mark.asyncio
async def test_tts_forwards_first_audio_chunk_without_waiting_for_the_second() -> None:
    module = import_module("app.services.interview_agent")

    class SlowSecondChunkTts(RecordingTtsProvider):
        async def synthesize(self, text: str) -> AsyncIterator[bytes]:
            self.texts.append(text)
            yield b"first"
            await asyncio.sleep(0.05)
            yield b"second"

    store = InMemorySessionStateStore()
    tts = SlowSecondChunkTts()
    service = module.InterviewAgentService(
        store=store,
        llm=ScriptedLlm(),
        message_sink=RecordingMessageSink(),
        grading_trigger=NoopGradingTrigger(),
        tts=tts,
    )
    await service.start(40, _start_request())
    before = len(await store.events_after(40, 0))

    await service.set_voice(40, True)

    audio = [event for event in (await store.events_after(40, 0))[before:] if event.type == "audio"]
    assert audio[0].payload["latencyMs"] < 25
    assert base64.b64decode(audio[0].payload["chunk"]) == b"first"
    assert audio[-1].payload["isFinal"] is True


@pytest.mark.asyncio
async def test_streamed_dynamic_reply_is_spoken_by_sentence() -> None:
    module = import_module("app.services.interview_agent")
    store = InMemorySessionStateStore()
    tts = RecordingTtsProvider()
    service = module.InterviewAgentService(
        store=store,
        llm=ScriptedLlm(replies=["请先说明背景。再说明你采取的行动。"]),
        message_sink=RecordingMessageSink(),
        grading_trigger=NoopGradingTrigger(),
        tts=tts,
    )
    await service.start(40, _start_request())
    await service.set_voice(40, True)
    tts.texts.clear()
    state = await store.get(40)

    await service._emit_decision_reply(  # noqa: SLF001 - verifies streamed output pipeline
        state,
        state.questions[0],
        AgentDecision(action=AgentAction.FOLLOW_UP),
    )

    assert tts.texts == ["请先说明背景。", "再说明你采取的行动。"]
    audio = [event for event in await store.events_after(40, 0) if event.type == "audio"]
    assert any(event.payload.get("forMessageSeq") == state.messageSeq for event in audio)
