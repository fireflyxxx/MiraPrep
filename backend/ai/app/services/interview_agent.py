"""T-040 面试官状态机、动态决策、SSE 事件与结束编排。"""

from __future__ import annotations

import asyncio
import base64
from collections import Counter
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import json
import logging
import re
from time import monotonic
from typing import Any, Protocol

from langchain_core.messages import SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from langgraph.checkpoint.memory import MemorySaver
from pydantic import ValidationError
from redis.exceptions import RedisError

from app.clients.business import BusinessCallbackClient
from app.clients.llm import LlmClient
from app.clients.redis import get_redis
from app.config import get_settings
from app.prompts.interviewer import (
    DECISION_SYSTEM_PROMPT,
    INTERVIEWER_SYSTEM_PROMPT,
    build_decision_prompt,
    build_reply_prompt,
)
from app.prompts.next_question import build_user_prompt as build_next_question_prompt
from app.schemas.interview import (
    AgentAction,
    AgentDecision,
    ConversationMessage,
    ConversationRole,
    InterviewAnswerRequest,
    InterviewSessionState,
    InterviewStartRequest,
    InterviewStatus,
    RuntimeInterviewPhase,
    RuntimeQuestion,
)
from app.schemas.outline import InterviewPhase
from app.services.next_question import (
    FALLBACK_QUESTIONS,
    build_next_question_chain,
    next_phase,
)
from app.services.outline import build_phase_budget
from app.services.session_state import (
    RedisSessionStateStore,
    SessionAlreadyExistsError,
    SessionStateStore,
    ensure_checkpointer_setup,
    get_interview_checkpointer,
)
from app.services.interview_graph import build_interview_graph
from app.services.tts.base import TtsProvider
from app.services.tts.sentence import SentenceChunker, split_sentences

logger = logging.getLogger("miraprep.ai.interview")

_LIVE_SCORING_PATTERN = re.compile(
    r"(得分|分数|满分|评分|评级|答对|答错|正确|错误|不准确|"
    r"标准答案|答案是|答得.{0,3}(很好|不错|很差)|通过了?面试|面试.{0,4}失败)",
    re.IGNORECASE,
)
_QUESTION_MARK = re.compile(r"[?？]")
# 追问偶尔会退化成「面试官把答案讲完」：没有问号 + 长篇大论。
# 只卡这两个条件同时成立的情况——「请结合一个项目具体说明。」这类祈使式短追问必须放行。
_ESSAY_REPLY_CHARS = 80
_FOLLOW_UP_QUESTION_FALLBACK = "能再结合一个你自己经历过的具体例子说明一下吗？"
# 扫描每 2s 一轮：连续 30 次拿不到锁 ≈ 一分钟没松手，正常作答轮次不会这么久。
_MAINTENANCE_TIMEOUT_SECONDS = 5
_MAINTENANCE_STUCK_STREAK = 30


class MessageSink(Protocol):
    async def publish(self, session_id: int, message: dict[str, Any]) -> bool: ...


class QuestionSink(Protocol):
    async def append(self, session_id: int, question: dict[str, Any]) -> dict[str, Any] | None: ...


class GradingTrigger(Protocol):
    async def trigger(
        self,
        session_id: int,
        transcript: list[dict[str, Any]],
        reason: str,
        request_id: str,
    ) -> None: ...


class BusinessMessageSink:
    """把完整消息交给 T-103 的 Spring 内部写入接口。"""

    def __init__(self, callback: BusinessCallbackClient) -> None:
        self._callback = callback

    async def publish(self, session_id: int, message: dict[str, Any]) -> bool:
        delivered = await self._callback.callback(
            path=f"/interviews/{session_id}/messages", json=message
        )
        if not delivered:
            logger.error(
                "interview message callback exhausted retries", extra={"session_id": session_id}
            )
        return delivered

    async def aclose(self) -> None:
        await self._callback.aclose()


class BusinessQuestionSink:
    """动态出题后落库到 Spring，拿回 questionId 与 order。"""

    def __init__(self, callback: BusinessCallbackClient) -> None:
        self._callback = callback

    async def append(self, session_id: int, question: dict[str, Any]) -> dict[str, Any] | None:
        return await self._callback.callback_json(
            path=f"/interviews/{session_id}/questions", json=question
        )


class BusinessGradingTrigger:
    """通知业务服务从持久化事实组装 T-105 批改请求。"""

    def __init__(self, callback: BusinessCallbackClient) -> None:
        self._callback = callback

    async def trigger(
        self,
        session_id: int,
        transcript: list[dict[str, Any]],
        reason: str,
        request_id: str,
    ) -> None:
        delivered = await self._callback.callback(
            path=f"/interviews/{session_id}/grading-request",
            json={"reason": reason, "requestId": request_id},
        )
        if not delivered:
            raise RuntimeError("business grading request callback exhausted retries")


class QuestionMismatchError(ValueError):
    pass


class RuntimeAuthorizationError(PermissionError):
    pass


class SessionEndingError(RuntimeError):
    pass


@dataclass(frozen=True)
class GraphTurnResult:
    decision: AgentDecision
    route: str
    follow_up_depth: int


class InterviewAgentService:
    def __init__(
        self,
        *,
        store: SessionStateStore,
        llm: Any,
        message_sink: MessageSink,
        grading_trigger: GradingTrigger,
        question_sink: QuestionSink | None = None,
        clock: Callable[[], datetime] | None = None,
        checkpointer: Any | None = None,
        tts: TtsProvider | None = None,
    ) -> None:
        self._store = store
        self._llm = llm
        self._message_sink = message_sink
        self._grading_trigger = grading_trigger
        self._question_sink = question_sink
        self._clock = clock or (lambda: datetime.now(UTC))
        self._checkpointer = checkpointer or MemorySaver()
        self._tts = tts
        self._maintenance_timeouts: dict[int, int] = {}
        self._interview_graph = None
        if llm is not None:
            self._interview_graph = build_interview_graph(
                _build_decision_chain(llm),
                checkpointer=self._checkpointer,
            )

    async def start(self, session_id: int, body: InterviewStartRequest) -> None:
        async with self._store.lock(session_id):
            now = self._clock()
            state = InterviewSessionState(
                sessionId=session_id,
                durationMin=body.durationMin,
                interviewerStyle=body.interviewerStyle,
                accessTokenHash=self._hash_access_token(body.accessToken),
                config=body.config,
                resume=body.resume,
                questions=sorted(body.questions, key=lambda question: question.order),
                startedAt=now,
                deadlineAt=now + timedelta(minutes=body.durationMin),
            )
            try:
                await self._store.create(state)
            except SessionAlreadyExistsError:
                state = await self._store.get(session_id)
                await self._recover_pending_interviewer_message(state)
                await self._flush_message_outbox(state)
                if state.currentQuestionIndex is not None:
                    return

            # 初始化中断后可重试：已有开场消息时只补首题，避免重复问候。
            if not state.history:
                await self._emit_interviewer_message(
                    state,
                    "你好，我是本次模拟面试官。接下来我会按阶段提问，请结合真实经历作答。",
                    question=None,
                )
            first_index = self._first_interview_question_index(state.questions)
            await self._move_to_question(state, first_index)

    async def answer(self, session_id: int, body: InterviewAnswerRequest) -> None:
        async with self._store.lock(session_id):
            state = await self._store.get(session_id)
            await self._recover_pending_interviewer_message(state)
            await self._flush_message_outbox(state)
            if body.answerId in state.processedAnswerIds:
                return
            if state.status is InterviewStatus.ENDED:
                return
            if state.pendingFinishReason is not None:
                raise SessionEndingError("interview is finishing")
            question = self._current_question(state)
            if body.questionId is not None and str(body.questionId) != str(question.questionId):
                raise QuestionMismatchError("answer questionId does not match active question")

            answer = body.content.strip()
            active_prompt = self._active_interviewer_prompt(state, question)
            state.processedAnswerIds = (state.processedAnswerIds + [body.answerId])[-100:]
            await self._record_message(
                state,
                role=ConversationRole.CANDIDATE,
                content=answer or "[沉默]",
                question=question,
            )

            if await self._enforce_deadline_locked(state):
                return

            if state.phase is RuntimeInterviewPhase.CANDIDATE_QA:
                await self._answer_candidate_question_and_close(state, answer)
                return

            if not answer:
                if state.followUpCount >= 3:
                    await self._advance(state)
                    return
                state.followUpCount += 1
                await self._store.save(state)
                await self._emit_interviewer_message(
                    state,
                    "没关系，可以先从背景、你采取的行动和最终结果三个部分开始回答。",
                    question=question,
                )
                return

            turn = await self._run_decision_graph(
                state,
                question,
                answer,
                active_prompt=active_prompt,
            )
            if turn.route == "terminate":
                await self._emit_decision_reply(state, question, turn.decision)
                await self._finish(state, "inappropriate_content")
                return

            if turn.route in {"follow_up", "hint", "redirect", "clarify"}:
                state.followUpCount = turn.follow_up_depth
                await self._store.save(state)
                await self._emit_decision_reply(state, question, turn.decision)
                return

            await self._advance(state)

    async def end(self, session_id: int, reason: str) -> None:
        async with self._store.lock(session_id):
            state = await self._store.get(session_id)
            await self._recover_pending_interviewer_message(state)
            await self._flush_message_outbox(state)
            if state.status is InterviewStatus.ENDED:
                return
            if state.pendingFinishReason is not None:
                await self._finish(state, state.pendingFinishReason)
                return
            closing_index = await self._ensure_phase_question(state, InterviewPhase.CLOSING)
            if closing_index is None:
                await self._finish(state, reason)
                return
            await self._move_to_question(state, closing_index, finish_reason=reason)
            if state.status is not InterviewStatus.ENDED:
                await self._finish(state, reason)

    async def ensure_session(self, session_id: int) -> None:
        await self._store.get(session_id)

    async def ensure_replay(self, session_id: int, after_seq: int) -> None:
        await self._store.events_after(session_id, after_seq)

    async def authorize(self, session_id: int, access_token: str) -> None:
        state = await self._store.get(session_id)
        if not hmac.compare_digest(
            state.accessTokenHash,
            self._hash_access_token(access_token),
        ):
            raise RuntimeAuthorizationError("invalid interview runtime token")

    async def set_voice(self, session_id: int, enabled: bool) -> None:
        """Persist the client voice preference and speak the current question on first enable."""

        async with self._store.lock(session_id):
            state = await self._store.get(session_id)
            state.voiceEnabled = enabled
            await self._store.save(state)
            if not enabled or self._tts is None:
                return
            for index in range(len(state.history) - 1, -1, -1):
                message = state.history[index]
                message_seq = index + 1
                if message.role is not ConversationRole.INTERVIEWER:
                    continue
                if message_seq in state.spokenMessageSeqs:
                    return
                question = next(
                    (
                        item
                        for item in state.questions
                        if message.questionId is not None
                        and str(item.questionId) == str(message.questionId)
                    ),
                    None,
                )
                if await self._emit_tts_text(
                    state,
                    message.content,
                    question=question,
                    message_seq=message_seq,
                ):
                    state.spokenMessageSeqs = (state.spokenMessageSeqs + [message_seq])[-100:]
                    await self._store.save(state)
                return

    async def enforce_deadline(self, session_id: int) -> bool:
        async with self._store.lock(session_id):
            state = await self._store.get(session_id)
            await self._recover_pending_interviewer_message(state, flush_outbox=False)
            advanced = await self._enforce_deadline_locked(state)
            await self._flush_message_outbox(state)
            return advanced

    async def run_maintenance_once(self) -> None:
        semaphore = asyncio.Semaphore(16)

        async def maintain(session_id: int) -> None:
            async with semaphore:
                try:
                    async with asyncio.timeout(_MAINTENANCE_TIMEOUT_SECONDS):
                        await self._maintain_session(session_id)
                    self._maintenance_timeouts.pop(session_id, None)
                except TimeoutError:
                    # 一次 LLM 轮次会占着会话锁十几秒，扫描每 2s 一轮，超时是常态而非故障。
                    # 只有连续超时到明显不可能是「正在作答」时才算真的卡死。
                    streak = self._maintenance_timeouts.get(session_id, 0) + 1
                    self._maintenance_timeouts[session_id] = streak
                    log = logger.warning if streak >= _MAINTENANCE_STUCK_STREAK else logger.debug
                    log(
                        "interview maintenance timed out",
                        extra={"session_id": session_id, "streak": streak},
                    )
                except Exception:
                    logger.exception(
                        "interview maintenance failed", extra={"session_id": session_id}
                    )

        session_ids = await self._store.session_ids()
        self._maintenance_timeouts = {
            session_id: streak
            for session_id, streak in self._maintenance_timeouts.items()
            if session_id in set(session_ids)
        }
        await asyncio.gather(*(maintain(session_id) for session_id in session_ids))

    async def _maintain_session(self, session_id: int) -> None:
        async with self._store.lock(session_id):
            state = await self._store.get(session_id)
            await self._recover_pending_interviewer_message(state, flush_outbox=False)
            if state.pendingFinishReason is not None and not state.gradingCompleted:
                await self._finish(state, state.pendingFinishReason)
            elif state.status is InterviewStatus.ACTIVE:
                await self._enforce_deadline_locked(state)
            await self._flush_message_outbox(state)

    async def stream_events(self, session_id: int, after_seq: int) -> AsyncIterator[str]:
        cursor = after_seq
        try:
            while True:
                events = await self._store.wait_for_events(session_id, cursor, timeout=15.0)
                if not events:
                    try:
                        if await self.enforce_deadline(session_id):
                            continue
                    except TimeoutError:
                        # Answer generation owns the same session lock. A busy lock is
                        # expected here and must not tear down an otherwise healthy SSE
                        # connection while the next interviewer turn is being prepared.
                        logger.debug(
                            "interview heartbeat skipped deadline check while session is busy",
                            extra={"session_id": session_id},
                        )
                    state = await self._store.get(session_id)
                    if state.status is InterviewStatus.ENDED:
                        return
                    yield ": heartbeat\n\n"
                    continue
                for event in events:
                    cursor = event.seq
                    data = event.model_dump_json()
                    yield f"id: {event.seq}\nevent: {event.type}\ndata: {data}\n\n"
                    if event.type == "interview_end":
                        return
        finally:
            await self.aclose()

    async def _run_decision_graph(
        self,
        state: InterviewSessionState,
        question: RuntimeQuestion,
        answer: str,
        *,
        active_prompt: str | None = None,
    ) -> GraphTurnResult:
        decision_prompt = build_decision_prompt(
            answer=answer,
            question=active_prompt or question.text,
            focus_points=question.focusPoints,
            interviewer_style=state.interviewerStyle,
            follow_up_count=state.followUpCount,
        )
        try:
            if self._interview_graph is None:
                raise RuntimeError("interview graph is unavailable")
            await ensure_checkpointer_setup(self._checkpointer)
            graph_input = {
                "session_id": str(state.sessionId),
                "phase": state.phase.value,
                "questions": [question.model_dump(mode="json") for question in state.questions],
                "current_question_index": state.currentQuestionIndex or 0,
                "follow_up_depth": state.followUpCount,
                "messages": [message.model_dump(mode="json") for message in state.history],
                "answer": answer,
                "decision_prompt": decision_prompt,
            }
            result = await self._interview_graph.ainvoke(
                graph_input,
                config={"configurable": {"thread_id": str(state.sessionId)}},
            )
            route = str(result["route"])
            if route not in {
                "follow_up",
                "hint",
                "redirect",
                "clarify",
                "next_question",
                "terminate",
            }:
                raise ValueError(f"unsupported interview graph route: {route}")
            follow_up_depth = int(result.get("follow_up_depth", 0))
            if not 0 <= follow_up_depth <= 3:
                raise ValueError("interview graph follow-up depth is out of range")
            return GraphTurnResult(
                decision=AgentDecision.model_validate(result["decision"]),
                route=route,
                follow_up_depth=follow_up_depth,
            )
        except RedisError:
            logger.exception(
                "interview graph checkpoint failed",
                extra={"session_id": state.sessionId},
            )
            raise
        except Exception:
            logger.warning(
                "invalid interview decision; advancing safely",
                extra={"session_id": state.sessionId},
            )
            return GraphTurnResult(
                decision=AgentDecision(action=AgentAction.NEXT_QUESTION),
                route="next_question",
                follow_up_depth=0,
            )

    @staticmethod
    def _active_interviewer_prompt(
        state: InterviewSessionState,
        question: RuntimeQuestion,
    ) -> str:
        for message in reversed(state.history):
            if message.role is ConversationRole.INTERVIEWER and str(message.questionId) == str(
                question.questionId
            ):
                return message.content
        return question.text

    async def _emit_decision_reply(
        self,
        state: InterviewSessionState,
        question: RuntimeQuestion,
        decision: AgentDecision,
    ) -> None:
        if decision.action in {
            AgentAction.REDIRECT,
            AgentAction.CLARIFY,
            AgentAction.TERMINATE,
        }:
            await self._emit_interviewer_message(
                state,
                self._safe_fallback(decision.action),
                question=question,
                incremental=True,
            )
            return
        prompt = build_reply_prompt(
            history=[message.model_dump(mode="json") for message in state.history],
            question=question.text,
            interviewer_style=state.interviewerStyle,
            action=decision.action.value,
            response_instruction=decision.responseInstruction,
        )
        safety_window = 32
        buffer = ""
        emitted: list[str] = []
        unsafe = False
        received_chars = 0
        message_seq = state.messageSeq + 1
        sentence_chunker = (
            SentenceChunker() if state.voiceEnabled and self._tts is not None else None
        )
        sentence_index = 0
        spoken = False
        tts_failed = False

        async def emit_text(text: str) -> None:
            nonlocal sentence_index, spoken, tts_failed
            await self._emit_token_text(state, text, question)
            if sentence_chunker is None or tts_failed:
                return
            for sentence in sentence_chunker.push(text):
                try:
                    spoken = (
                        await self._emit_tts_sentence(
                            state,
                            sentence,
                            question=question,
                            message_seq=message_seq,
                            sentence_index=sentence_index,
                        )
                        or spoken
                    )
                    sentence_index += 1
                except Exception as exc:
                    tts_failed = True
                    logger.exception("tts synthesis failed", extra={"session_id": state.sessionId})
                    await self._store.append_event(
                        state.sessionId,
                        "error",
                        {"code": "tts_failed", "message": str(exc)},
                    )

        try:
            async for chunk in self._llm.stream(
                messages=[{"role": "user", "content": prompt}],
                system=INTERVIEWER_SYSTEM_PROMPT,
            ):
                remaining = 2_000 - received_chars
                if remaining <= 0:
                    break
                chunk = chunk[:remaining]
                received_chars += len(chunk)
                buffer += chunk
                if _LIVE_SCORING_PATTERN.search(buffer):
                    unsafe = True
                    break
                flush_length = max(0, len(buffer) - safety_window)
                if flush_length:
                    safe_prefix = buffer[:flush_length]
                    buffer = buffer[flush_length:]
                    emitted.append(safe_prefix)
                    await emit_text(safe_prefix)
        except Exception:
            logger.exception(
                "interviewer reply generation failed", extra={"session_id": state.sessionId}
            )
            unsafe = True

        if not unsafe and buffer:
            emitted.append(buffer)
            await emit_text(buffer)

        if unsafe or not emitted:
            fallback = self._safe_fallback(decision.action)
            emitted.append(fallback)
            await emit_text(fallback)
        elif decision.action in {AgentAction.FOLLOW_UP, AgentAction.HINT} and self._reads_as_answer(
            "".join(emitted)
        ):
            # 模型偶尔会顺着上文替候选人把答案写完；已经流出去的收不回，至少补一个问题收口。
            logger.warning(
                "interviewer follow-up read as an answer, appending a question",
                extra={"session_id": state.sessionId, "action": decision.action.value},
            )
            emitted.append(_FOLLOW_UP_QUESTION_FALLBACK)
            await emit_text(_FOLLOW_UP_QUESTION_FALLBACK)

        if sentence_chunker is not None and not tts_failed:
            for sentence in sentence_chunker.flush():
                try:
                    spoken = (
                        await self._emit_tts_sentence(
                            state,
                            sentence,
                            question=question,
                            message_seq=message_seq,
                            sentence_index=sentence_index,
                        )
                        or spoken
                    )
                    sentence_index += 1
                except Exception as exc:
                    logger.exception("tts synthesis failed", extra={"session_id": state.sessionId})
                    await self._store.append_event(
                        state.sessionId,
                        "error",
                        {"code": "tts_failed", "message": str(exc)},
                    )
                    break
        if spoken:
            state.spokenMessageSeqs = (state.spokenMessageSeqs + [message_seq])[-100:]

        await self._record_message(
            state,
            role=ConversationRole.INTERVIEWER,
            content="".join(emitted),
            question=question,
        )

    @staticmethod
    def _reads_as_answer(reply: str) -> bool:
        """长篇且不含问号的追问，基本就是模型自问自答了。"""

        return len(reply) > _ESSAY_REPLY_CHARS and not _QUESTION_MARK.search(reply)

    @staticmethod
    def _safe_fallback(action: AgentAction) -> str:
        if action is AgentAction.REDIRECT:
            return "我们先请回到刚才的问题，请结合你的真实经历继续回答。"
        if action is AgentAction.CLARIFY:
            return "我可以澄清题意，但不会直接给出答案。请按你的理解继续作答。"
        if action is AgentAction.TERMINATE:
            return "我们不会继续这个话题，本次面试到此结束。"
        if action is AgentAction.HINT:
            return "可以先说明背景和目标，再讲你的具体行动与结果。"
        return "请再结合一个具体例子展开说明。"

    async def _advance(self, state: InterviewSessionState) -> None:
        if state.currentQuestionIndex is None:
            next_index = self._first_interview_question_index(state.questions)
        else:
            next_index = state.currentQuestionIndex + 1
        if next_index >= len(state.questions):
            phase = self._plan_next_phase(state)
            if phase is None or await self._append_generated_question(state, phase) is None:
                await self._finish(state, "completed")
                return
        await self._move_to_question(state, next_index)

    def _plan_next_phase(self, state: InterviewSessionState) -> InterviewPhase | None:
        """按阶段预算决定下一题归属；超时被强推后不回头补前面欠的题。"""

        budget = build_phase_budget(state.durationMin, state.config.types)
        asked = Counter(question.phase for question in state.questions)
        current = None
        if state.phase.value != RuntimeInterviewPhase.GREETING.value:
            current = InterviewPhase(state.phase.value)
        return next_phase(budget, asked, current)

    async def _ensure_phase_question(
        self, state: InterviewSessionState, phase: InterviewPhase
    ) -> int | None:
        """返回该阶段题目的下标；动态出题下 CANDIDATE_QA/CLOSING 可能还没生成。"""

        for index, question in enumerate(state.questions):
            if question.phase is phase:
                return index
        question = await self._append_generated_question(state, phase)
        return None if question is None else len(state.questions) - 1

    async def _append_generated_question(
        self, state: InterviewSessionState, phase: InterviewPhase
    ) -> RuntimeQuestion | None:
        """现场生成一道题，落库拿到 questionId 后追加到会话状态。"""

        if self._question_sink is None:
            logger.error(
                "no question sink configured, cannot generate next question",
                extra={"session_id": state.sessionId, "phase": phase.value},
            )
            return None

        remaining = max(30, int((state.deadlineAt - self._clock()).total_seconds()) or 30)
        prompt = build_next_question_prompt(
            target_phase=phase.value,
            config=state.config.model_dump(mode="json"),
            resume=state.resume.parsedJson,
            asked_questions=[question.text for question in state.questions],
            history=[
                {"role": message.role.value, "content": message.content}
                for message in state.history[-8:]
            ],
            remaining_seconds=remaining,
        )
        try:
            generated = await build_next_question_chain(self._llm).ainvoke(
                {"interview_data": prompt}
            )
        except Exception:
            # 一次出题失败不该终止面试，用该阶段的确定性兜底题继续。
            logger.exception(
                "next question generation failed, falling back",
                extra={"session_id": state.sessionId, "phase": phase.value},
            )
            generated = FALLBACK_QUESTIONS[phase]

        persisted = await self._question_sink.append(
            state.sessionId,
            {
                "phase": phase.value,
                "text": generated.text,
                "focusPoints": generated.focusPoints,
                "suggestedSeconds": generated.suggestedSeconds,
            },
        )
        if persisted is None:
            logger.error(
                "next question could not be persisted",
                extra={"session_id": state.sessionId, "phase": phase.value},
            )
            return None

        try:
            question = RuntimeQuestion(
                questionId=persisted["questionId"],
                phase=phase,
                text=generated.text,
                focusPoints=generated.focusPoints,
                order=persisted["order"],
            )
        except ValidationError:
            logger.warning(
                "generated question rejected by runtime schema",
                extra={"session_id": state.sessionId, "phase": phase.value},
            )
            return None
        state.questions.append(question)
        return question

    async def _move_to_question(
        self,
        state: InterviewSessionState,
        index: int,
        *,
        finish_reason: str | None = None,
    ) -> None:
        question = state.questions[index]
        old_phase = state.phase
        new_phase = RuntimeInterviewPhase(question.phase.value)
        state.currentQuestionIndex = index
        state.followUpCount = 0
        state.phase = new_phase
        state.pendingInterviewerMessage = ConversationMessage(
            role=ConversationRole.INTERVIEWER,
            content="",
            phase=new_phase,
            questionId=question.questionId,
        )
        state.pendingInterviewerTargetText = question.text
        if new_phase is RuntimeInterviewPhase.CANDIDATE_QA and state.candidateQaDeadlineAt is None:
            state.candidateQaDeadlineAt = self._clock() + timedelta(minutes=1)
        if old_phase is not new_phase:
            await self._store.append_event_and_save(
                state,
                "phase_change",
                {"from": old_phase.value, "to": new_phase.value},
            )
        else:
            await self._store.save(state)
        await self._emit_interviewer_message(state, question.text, question=question)
        if finish_reason is not None or new_phase is RuntimeInterviewPhase.CLOSING:
            await self._finish(state, finish_reason or "completed")

    async def _answer_candidate_question_and_close(
        self, state: InterviewSessionState, answer: str
    ) -> None:
        question = self._current_question(state)
        decision = AgentDecision(
            action=AgentAction.NEXT_QUESTION,
            responseInstruction=(
                "简短回答候选人关于岗位或流程的问题；若其不是问题，礼貌说明。不要泄露考题答案。"
            ),
        )
        await self._emit_decision_reply(state, question, decision)
        await self._advance(state)

    async def _finish(self, state: InterviewSessionState, reason: str) -> None:
        if state.status is InterviewStatus.ENDED:
            return
        state.pendingFinishReason = reason
        if state.gradingRequestId is None:
            state.gradingRequestId = f"interview:{state.sessionId}:grading"
        if state.pendingGradingTranscript is None:
            state.pendingGradingTranscript = [
                message.model_dump(mode="json") for message in state.history
            ]
        if state.gradingNextAttemptAt is not None and self._clock() < state.gradingNextAttemptAt:
            await self._store.save(state)
            return
        transcript = state.pendingGradingTranscript
        try:
            await self._store.save(state)
            await self._grading_trigger.trigger(
                state.sessionId,
                transcript,
                reason,
                state.gradingRequestId,
            )
        except Exception:
            logger.exception("grading trigger failed", extra={"session_id": state.sessionId})
            state.gradingAttempts += 1
            state.gradingNextAttemptAt = self._clock() + timedelta(
                seconds=min(2**state.gradingAttempts, 60)
            )
            await self._store.save(state)
            await self._store.append_event(
                state.sessionId,
                "error",
                {"message": "grading trigger failed", "recoverable": True},
            )
            return
        state.gradingCompleted = True
        state.gradingNextAttemptAt = None
        state.pendingFinishReason = None
        await self._store.finalize(state, reason)

    async def _enforce_deadline_locked(self, state: InterviewSessionState) -> bool:
        if state.status is InterviewStatus.ENDED:
            return False
        now = self._clock()
        if (
            state.phase not in {RuntimeInterviewPhase.CANDIDATE_QA, RuntimeInterviewPhase.CLOSING}
            and now >= state.deadlineAt
        ):
            index = await self._ensure_phase_question(state, InterviewPhase.CANDIDATE_QA)
            if index is None:
                await self._finish(state, "timeout")
                return True
            await self._move_to_question(state, index)
            return True
        if (
            state.phase is RuntimeInterviewPhase.CANDIDATE_QA
            and state.candidateQaDeadlineAt is not None
            and now >= state.candidateQaDeadlineAt
        ):
            index = await self._ensure_phase_question(state, InterviewPhase.CLOSING)
            if index is None:
                await self._finish(state, "timeout")
                return True
            await self._move_to_question(state, index, finish_reason="timeout")
            return True
        return False

    async def _emit_interviewer_message(
        self,
        state: InterviewSessionState,
        content: str,
        *,
        question: RuntimeQuestion | None,
        incremental: bool = False,
    ) -> None:
        message_seq = state.messageSeq + 1
        if state.voiceEnabled and self._tts is not None:
            _, spoken = await asyncio.gather(
                self._emit_token_text(state, content, question, incremental=incremental),
                self._emit_tts_text(
                    state,
                    content,
                    question=question,
                    message_seq=message_seq,
                ),
            )
            if spoken:
                state.spokenMessageSeqs = (state.spokenMessageSeqs + [message_seq])[-100:]
        else:
            await self._emit_token_text(state, content, question, incremental=incremental)
        await self._record_message(
            state,
            role=ConversationRole.INTERVIEWER,
            content=content,
            question=question,
        )

    async def _emit_token_text(
        self,
        state: InterviewSessionState,
        content: str,
        question: RuntimeQuestion | None,
        *,
        incremental: bool = True,
    ) -> None:
        chunks = (
            [content[index : index + 8] for index in range(0, len(content), 8)]
            if incremental
            else [content]
        )
        if state.pendingInterviewerMessage is None:
            state.pendingInterviewerMessage = ConversationMessage(
                role=ConversationRole.INTERVIEWER,
                content="",
                phase=state.phase,
                questionId=question.questionId if question else None,
            )
        for index, chunk in enumerate(chunks):
            state.pendingInterviewerMessage.content += chunk
            await self._store.append_event_and_save(
                state,
                "token",
                {
                    "text": chunk,
                    "questionId": question.questionId if question else None,
                    "phase": state.phase.value,
                    "messageEnd": index == len(chunks) - 1,
                },
            )

    async def _emit_tts_text(
        self,
        state: InterviewSessionState,
        content: str,
        *,
        question: RuntimeQuestion | None,
        message_seq: int,
    ) -> bool:
        if self._tts is None:
            return False
        try:
            for sentence_index, sentence in enumerate(split_sentences(content)):
                if not await self._emit_tts_sentence(
                    state,
                    sentence,
                    question=question,
                    message_seq=message_seq,
                    sentence_index=sentence_index,
                ):
                    return False
            return True
        except Exception as exc:
            logger.exception("tts synthesis failed", extra={"session_id": state.sessionId})
            await self._store.append_event(
                state.sessionId,
                "error",
                {"code": "tts_failed", "message": str(exc)},
            )
            return False

    async def _emit_tts_sentence(
        self,
        state: InterviewSessionState,
        sentence: str,
        *,
        question: RuntimeQuestion | None,
        message_seq: int,
        sentence_index: int,
    ) -> bool:
        assert self._tts is not None
        started = monotonic()
        frame_index = 0
        first_latency_ms: int | None = None
        async for chunk in self._tts.synthesize(sentence):
            latency_ms = round((monotonic() - started) * 1000)
            if first_latency_ms is None:
                first_latency_ms = latency_ms
            await self._append_audio_event(
                state,
                chunk,
                question=question,
                message_seq=message_seq,
                sentence_index=sentence_index,
                frame_index=frame_index,
                is_final=False,
                latency_ms=latency_ms,
            )
            frame_index += 1
        if first_latency_ms is None:
            return False
        await self._append_audio_event(
            state,
            b"",
            question=question,
            message_seq=message_seq,
            sentence_index=sentence_index,
            frame_index=frame_index,
            is_final=True,
            latency_ms=first_latency_ms,
        )
        if first_latency_ms >= 1_500:
            logger.warning(
                "tts first audio exceeded target",
                extra={"session_id": state.sessionId, "latency_ms": first_latency_ms},
            )
        return True

    async def _append_audio_event(
        self,
        state: InterviewSessionState,
        chunk: bytes,
        *,
        question: RuntimeQuestion | None,
        message_seq: int,
        sentence_index: int,
        frame_index: int,
        is_final: bool,
        latency_ms: int,
    ) -> None:
        await self._store.append_event(
            state.sessionId,
            "audio",
            {
                "chunk": base64.b64encode(chunk).decode("ascii"),
                "format": self._tts.audio_format if self._tts is not None else "unknown",
                "forQuestionId": question.questionId if question else None,
                "forMessageSeq": message_seq,
                "sentenceIndex": sentence_index,
                "frameIndex": frame_index,
                "isFinal": is_final,
                "latencyMs": latency_ms,
            },
        )

    async def _record_message(
        self,
        state: InterviewSessionState,
        *,
        role: ConversationRole,
        content: str,
        question: RuntimeQuestion | None,
        flush_outbox: bool = True,
    ) -> None:
        if role is ConversationRole.INTERVIEWER and state.pendingInterviewerMessage is not None:
            content = state.pendingInterviewerMessage.content
            state.pendingInterviewerMessage = None
            state.pendingInterviewerTargetText = None
        state.messageSeq += 1
        message = ConversationMessage(
            role=role,
            content=content,
            phase=state.phase,
            questionId=question.questionId if question else None,
        )
        state.history.append(message)
        payload = {"seq": state.messageSeq, **message.model_dump(mode="json")}
        state.pendingMessageDeliveries.append(payload)
        await self._store.save(state)
        if flush_outbox:
            await self._flush_message_outbox(state)

    async def _flush_message_outbox(self, state: InterviewSessionState) -> None:
        while state.pendingMessageDeliveries:
            if (
                state.messageDeliveryNextAttemptAt is not None
                and self._clock() < state.messageDeliveryNextAttemptAt
            ):
                return
            message = state.pendingMessageDeliveries[0]
            try:
                delivered = await self._message_sink.publish(state.sessionId, message)
            except Exception:
                logger.exception("message sync failed", extra={"session_id": state.sessionId})
                state.messageDeliveryAttempts += 1
                state.messageDeliveryNextAttemptAt = self._clock() + timedelta(
                    seconds=min(2**state.messageDeliveryAttempts, 60)
                )
                await self._store.save(state)
                return
            if not delivered:
                state.messageDeliveryAttempts += 1
                state.messageDeliveryNextAttemptAt = self._clock() + timedelta(
                    seconds=min(2**state.messageDeliveryAttempts, 60)
                )
                await self._store.save(state)
                return
            state.pendingMessageDeliveries.pop(0)
            state.messageDeliveryAttempts = 0
            state.messageDeliveryNextAttemptAt = None
            await self._store.save(state)

    async def _recover_pending_interviewer_message(
        self, state: InterviewSessionState, *, flush_outbox: bool = True
    ) -> None:
        pending = state.pendingInterviewerMessage
        if pending is None:
            return
        if state.pendingInterviewerTargetText is not None:
            target = state.pendingInterviewerTargetText
            if not target.startswith(pending.content):
                state.pendingInterviewerTargetText = None
            else:
                remaining = target[len(pending.content) :]
                question = None
                if pending.questionId is not None:
                    question = next(
                        (
                            item
                            for item in state.questions
                            if str(item.questionId) == str(pending.questionId)
                        ),
                        None,
                    )
                if remaining:
                    await self._emit_token_text(state, remaining, question, incremental=False)
                await self._record_message(
                    state,
                    role=ConversationRole.INTERVIEWER,
                    content=target,
                    question=question,
                    flush_outbox=flush_outbox,
                )
                return
        if not pending.content:
            state.pendingInterviewerMessage = None
            await self._store.save(state)
            return
        state.pendingInterviewerMessage = None
        state.messageSeq += 1
        state.history.append(pending)
        state.pendingMessageDeliveries.append(
            {"seq": state.messageSeq, **pending.model_dump(mode="json")}
        )
        await self._store.save(state)
        if flush_outbox:
            await self._flush_message_outbox(state)

    @staticmethod
    def _current_question(state: InterviewSessionState) -> RuntimeQuestion:
        if state.currentQuestionIndex is None:
            raise RuntimeError("interview has no active question")
        return state.questions[state.currentQuestionIndex]

    @staticmethod
    def _first_interview_question_index(questions: list[RuntimeQuestion]) -> int:
        for index, question in enumerate(questions):
            if question.phase.value not in {"CANDIDATE_QA", "CLOSING"}:
                return index
        return 0

    @staticmethod
    def _hash_access_token(access_token: str) -> str:
        return hashlib.sha256(access_token.encode("utf-8")).hexdigest()

    async def aclose(self) -> None:
        for resource in (self._message_sink, self._llm, self._tts):
            close = getattr(resource, "aclose", None)
            if close is not None:
                try:
                    await close()
                except Exception:
                    logger.exception("interview resource close failed")


def _strip_json_fence(raw: str) -> str:
    cleaned = raw.strip()
    if not cleaned.startswith("```"):
        return cleaned
    cleaned = cleaned.strip("`").strip()
    if cleaned.lower().startswith("json"):
        cleaned = cleaned[4:].strip()
    return cleaned


def _build_decision_chain(llm: Any) -> Any:
    """Use native LangChain structured output; keep old injected test doubles runnable."""

    chat_model = getattr(llm, "chat_model", None)
    if chat_model is not None:
        prompt = ChatPromptTemplate.from_messages(
            [
                SystemMessage(content=DECISION_SYSTEM_PROMPT),
                ("human", "{decision_prompt}"),
            ]
        )
        return prompt | chat_model.with_structured_output(AgentDecision)

    async def invoke_legacy(inputs: dict[str, Any]) -> AgentDecision:
        raw = await llm.complete(
            messages=[{"role": "user", "content": inputs["decision_prompt"]}],
            system=DECISION_SYSTEM_PROMPT,
        )
        return AgentDecision.model_validate(json.loads(_strip_json_fence(raw)))

    return RunnableLambda(invoke_legacy)


def build_interview_agent_service() -> InterviewAgentService:
    settings = get_settings()
    callback = BusinessCallbackClient(settings)
    from app.services.speech import build_tts_provider

    return InterviewAgentService(
        store=RedisSessionStateStore(get_redis()),
        # 与 routers/internal.py 一致：thinking 模式不兼容 with_structured_output 的
        # tool_choice，而且会把推理内容混进决策 JSON。
        llm=LlmClient(settings, thinking={"type": "disabled"}),
        message_sink=BusinessMessageSink(callback),
        grading_trigger=BusinessGradingTrigger(callback),
        question_sink=BusinessQuestionSink(callback),
        checkpointer=get_interview_checkpointer(),
        tts=build_tts_provider(settings),
    )


def build_interview_event_stream_service() -> InterviewAgentService:
    settings = get_settings()
    callback = BusinessCallbackClient(settings)
    return InterviewAgentService(
        store=RedisSessionStateStore(get_redis()),
        llm=None,
        message_sink=BusinessMessageSink(callback),
        grading_trigger=BusinessGradingTrigger(callback),
        question_sink=BusinessQuestionSink(callback),
    )
