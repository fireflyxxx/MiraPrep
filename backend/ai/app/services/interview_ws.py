from __future__ import annotations

import asyncio
import base64
import binascii
from collections import deque
from contextlib import suppress
from time import monotonic
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError

from app.schemas.interview import InterviewAnswerRequest, PendingAudioFrame
from app.services.asr.base import AsrProvider, AsrStream
from app.services.session_state import SessionStateStore

_MAX_PENDING_AUDIO_BYTES = 5 * 1024 * 1024


class AudioFrame(BaseModel):
    chunk: str = Field(min_length=1, max_length=180_000)
    format: str
    audioSeq: int = Field(gt=0)


class AsrConfirmation(BaseModel):
    answerId: str = Field(min_length=8, max_length=64)
    text: str | None = Field(default=None, max_length=10_000)
    questionId: str | int | None = None


class VoiceControl(BaseModel):
    enabled: bool


class VoiceInterviewRuntime:
    """Bidirectional WebSocket bridge for persisted events, ASR, and agent answers."""

    def __init__(self, *, store: SessionStateStore, agent: Any, asr: AsrProvider) -> None:
        self._store = store
        self._agent = agent
        self._asr = asr
        self._asr_stream: AsrStream | None = None
        self._asr_task: asyncio.Task[None] | None = None
        self._last_audio_at: float | None = None
        self._last_audio_sent_seq = 0
        self._finalize_audio_boundaries: deque[int] = deque()

    async def run(
        self,
        websocket: WebSocket,
        *,
        session_id: int,
        access_token: str,
        after_seq: int,
        voice_enabled: bool,
    ) -> None:
        tasks: set[asyncio.Task[None]] = set()
        try:
            await self._agent.authorize(session_id, access_token)
            await self._agent.ensure_replay(session_id, after_seq)
            await websocket.accept()
            sender = asyncio.create_task(self._send_events(websocket, session_id, after_seq))
            receiver = asyncio.create_task(self._receive_messages(websocket, session_id))
            asr_monitor = asyncio.create_task(self._monitor_asr_task())
            tasks = {sender, receiver, asr_monitor}

            # Start the sender before synthesis so the first audio frame reaches the browser
            # while the remainder of the utterance is still being generated.
            await self._agent.set_voice(session_id, voice_enabled)
            await self._replay_pending_audio(session_id)
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                exception = task.exception()
                if exception is not None:
                    raise exception
            for task in pending:
                task.cancel()
        finally:
            for task in tasks:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
            if self._asr_task is not None:
                self._asr_task.cancel()
                with suppress(asyncio.CancelledError, Exception):
                    await self._asr_task
            if self._asr_stream is not None:
                with suppress(Exception):
                    await self._asr_stream.aclose()
            with suppress(Exception):
                await self._agent.aclose()

    async def _monitor_asr_task(self) -> None:
        while self._asr_task is None:
            await asyncio.sleep(0.01)
        await asyncio.shield(self._asr_task)

    async def _send_events(self, websocket: WebSocket, session_id: int, after_seq: int) -> None:
        cursor = after_seq
        while True:
            events = await self._store.wait_for_events(session_id, cursor, timeout=1.0)
            if not events:
                state = await self._store.get(session_id)
                if state.status.value == "ENDED":
                    return
                continue
            for event in events:
                await websocket.send_json(event.model_dump(mode="json"))
                cursor = event.seq
                if event.type == "interview_end":
                    return

    async def _receive_messages(self, websocket: WebSocket, session_id: int) -> None:
        try:
            while True:
                message = await websocket.receive_json()
                await self._dispatch_message(session_id, message)
        except WebSocketDisconnect:
            return

    async def _dispatch_message(self, session_id: int, message: Any) -> None:
        if not isinstance(message, dict) or not isinstance(message.get("payload"), dict):
            await self._append_error(session_id, "invalid_message", "invalid WebSocket envelope")
            return
        message_type = message.get("type")
        try:
            if message_type == "audio":
                await self._handle_audio(session_id, AudioFrame.model_validate(message["payload"]))
            elif message_type == "audio_end":
                if self._asr_stream is not None:
                    state = await self._store.get(session_id)
                    self._finalize_audio_boundaries.append(state.lastAudioSeq)
                    await self._asr_stream.finalize()
            elif message_type == "asr_confirm":
                await self._handle_confirmation(
                    session_id, AsrConfirmation.model_validate(message["payload"])
                )
            elif message_type == "voice":
                control = VoiceControl.model_validate(message["payload"])
                await self._agent.set_voice(session_id, control.enabled)
            else:
                await self._append_error(
                    session_id, "unsupported_message", f"unsupported message type: {message_type}"
                )
        except ValidationError as exc:
            await self._append_error(session_id, "invalid_payload", str(exc))
        except (ValueError, binascii.Error) as exc:
            await self._append_error(session_id, "invalid_audio", str(exc))
        except Exception as exc:
            await self._append_error(session_id, "voice_runtime_failed", str(exc))

    async def _handle_audio(self, session_id: int, frame: AudioFrame) -> None:
        if frame.format != "pcm16/16k":
            raise ValueError("audio format must be pcm16/16k")
        chunk = base64.b64decode(frame.chunk, validate=True)
        if not chunk or len(chunk) > 128_000:
            raise ValueError("audio chunk must contain 1..128000 bytes")

        async with self._store.lock(session_id):
            state = await self._store.get(session_id)
            if frame.audioSeq <= state.lastAudioSeq:
                await self._store.append_event(
                    session_id,
                    "asr_partial",
                    {
                        "text": state.asrDraftText,
                        "isFinal": False,
                        "acceptedAudioSeq": state.lastAudioSeq,
                        "duplicate": True,
                    },
                )
                return
            if frame.audioSeq != state.lastAudioSeq + 1:
                await self._store.append_event(
                    session_id,
                    "error",
                    {
                        "code": "audio_sequence_gap",
                        "message": f"expected audioSeq {state.lastAudioSeq + 1}",
                        "expectedAudioSeq": state.lastAudioSeq + 1,
                    },
                )
                return
            if state.pendingAudioBytes + len(chunk) > _MAX_PENDING_AUDIO_BYTES:
                await self._store.append_event(
                    session_id,
                    "error",
                    {
                        "code": "audio_buffer_full",
                        "message": "pending audio replay buffer is full; finalize or reconnect",
                        "acceptedAudioSeq": state.lastAudioSeq,
                    },
                )
                return
            state.lastAudioSeq = frame.audioSeq
            state.pendingAudioBytes += len(chunk)
            state.pendingAudioFrames.append(
                PendingAudioFrame(
                    audioSeq=frame.audioSeq,
                    chunk=frame.chunk,
                    format=frame.format,
                )
            )
            await self._store.append_event_and_save(
                state,
                "asr_partial",
                {
                    "text": state.asrDraftText,
                    "isFinal": False,
                    "acceptedAudioSeq": frame.audioSeq,
                },
            )

        stream = await self._ensure_asr_stream(session_id, frame.format)
        self._last_audio_at = monotonic()
        self._last_audio_sent_seq = frame.audioSeq
        await stream.send_audio(chunk)

    async def _replay_pending_audio(self, session_id: int) -> None:
        state = await self._store.get(session_id)
        if not state.pendingAudioFrames:
            return
        audio_format = state.pendingAudioFrames[0].format
        stream = await self._ensure_asr_stream(session_id, audio_format)
        for frame in state.pendingAudioFrames:
            if frame.format != audio_format:
                raise ValueError("pending audio frames must use one format")
            self._last_audio_at = monotonic()
            self._last_audio_sent_seq = frame.audioSeq
            await stream.send_audio(base64.b64decode(frame.chunk, validate=True))

    async def _ensure_asr_stream(self, session_id: int, audio_format: str) -> AsrStream:
        if self._asr_stream is None:
            self._asr_stream = await self._asr.open_stream(audio_format)
            self._asr_task = asyncio.create_task(self._consume_asr_results(session_id))
        return self._asr_stream

    async def _consume_asr_results(self, session_id: int) -> None:
        assert self._asr_stream is not None
        async for result in self._asr_stream.results():
            latency_ms = (
                round((monotonic() - self._last_audio_at) * 1000)
                if self._last_audio_at is not None
                else None
            )
            async with self._store.lock(session_id):
                state = await self._store.get(session_id)
                state.asrDraftText = result.text
                if result.is_final:
                    committed_audio_seq = (
                        self._finalize_audio_boundaries.popleft()
                        if self._finalize_audio_boundaries
                        else self._last_audio_sent_seq
                    )
                    state.pendingAudioFrames = [
                        frame
                        for frame in state.pendingAudioFrames
                        if frame.audioSeq > committed_audio_seq
                    ]
                    state.pendingAudioBytes = sum(
                        len(base64.b64decode(frame.chunk)) for frame in state.pendingAudioFrames
                    )
                await self._store.append_event_and_save(
                    state,
                    "asr_partial",
                    {
                        "text": result.text,
                        "isFinal": result.is_final,
                        "acceptedAudioSeq": state.lastAudioSeq,
                        "latencyMs": latency_ms,
                    },
                )

    async def _handle_confirmation(self, session_id: int, confirmation: AsrConfirmation) -> None:
        state = await self._store.get(session_id)
        text = confirmation.text if confirmation.text is not None else state.asrDraftText
        if not text.strip():
            raise ValueError("confirmed transcription is empty")
        await self._agent.answer(
            session_id,
            InterviewAnswerRequest(
                answerId=confirmation.answerId,
                content=text,
                questionId=confirmation.questionId,
            ),
        )
        async with self._store.lock(session_id):
            state = await self._store.get(session_id)
            state.asrDraftText = ""
            state.pendingAudioFrames = []
            state.pendingAudioBytes = 0
            await self._store.save(state)

    async def _append_error(self, session_id: int, code: str, message: str) -> None:
        await self._store.append_event(
            session_id,
            "error",
            {"code": code, "message": message},
        )
