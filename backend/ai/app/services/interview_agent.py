"""T-040 面试官状态机、动态决策、SSE 事件与结束编排。"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import json
import logging
import re
from typing import Any, Protocol

from langchain_core.messages import SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from langgraph.checkpoint.memory import MemorySaver
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
from app.services.session_state import (
    RedisSessionStateStore,
    SessionAlreadyExistsError,
    SessionStateStore,
    ensure_checkpointer_setup,
    get_interview_checkpointer,
)
from app.services.interview_graph import build_interview_graph

logger = logging.getLogger("miraprep.ai.interview")

_LIVE_SCORING_PATTERN = re.compile(
    r"(得分|分数|满分|评分|评级|答对|答错|正确|错误|不准确|"
    r"标准答案|答案是|答得.{0,3}(很好|不错|很差)|通过了?面试|面试.{0,4}失败)",
    re.IGNORECASE,
)


class MessageSink(Protocol):
    async def publish(self, session_id: int, message: dict[str, Any]) -> bool: ...


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
        clock: Callable[[], datetime] | None = None,
        checkpointer: Any | None = None,
    ) -> None:
        self._store = store
        self._llm = llm
        self._message_sink = message_sink
        self._grading_trigger = grading_trigger
        self._clock = clock or (lambda: datetime.now(UTC))
        self._checkpointer = checkpointer or MemorySaver()
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

            turn = await self._run_decision_graph(state, question, answer)
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
            closing_index = self._phase_index(state, "CLOSING")
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
                    async with asyncio.timeout(5):
                        await self._maintain_session(session_id)
                except TimeoutError:
                    logger.warning(
                        "interview maintenance timed out",
                        extra={"session_id": session_id},
                    )
                except Exception:
                    logger.exception(
                        "interview maintenance failed", extra={"session_id": session_id}
                    )

        await asyncio.gather(
            *(maintain(session_id) for session_id in await self._store.session_ids())
        )

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
                    if await self.enforce_deadline(session_id):
                        continue
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
        self, state: InterviewSessionState, question: RuntimeQuestion, answer: str
    ) -> GraphTurnResult:
        decision_prompt = build_decision_prompt(
            answer=answer,
            question=question.text,
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
                    await self._emit_token_text(state, safe_prefix, question)
        except Exception:
            logger.exception(
                "interviewer reply generation failed", extra={"session_id": state.sessionId}
            )
            unsafe = True

        if not unsafe and buffer:
            emitted.append(buffer)
            await self._emit_token_text(state, buffer, question)

        if unsafe or not emitted:
            fallback = self._safe_fallback(decision.action)
            emitted.append(fallback)
            await self._emit_token_text(state, fallback, question)

        await self._record_message(
            state,
            role=ConversationRole.INTERVIEWER,
            content="".join(emitted),
            question=question,
        )

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
            await self._finish(state, "completed")
            return
        await self._move_to_question(state, next_index)

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
            await self._move_to_question(state, self._phase_index(state, "CANDIDATE_QA"))
            return True
        if (
            state.phase is RuntimeInterviewPhase.CANDIDATE_QA
            and state.candidateQaDeadlineAt is not None
            and now >= state.candidateQaDeadlineAt
        ):
            await self._move_to_question(
                state,
                self._phase_index(state, "CLOSING"),
                finish_reason="timeout",
            )
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
        for chunk in chunks:
            state.pendingInterviewerMessage.content += chunk
            await self._store.append_event_and_save(
                state,
                "token",
                {
                    "text": chunk,
                    "questionId": question.questionId if question else None,
                    "phase": state.phase.value,
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
    def _phase_index(state: InterviewSessionState, phase: str) -> int:
        for index, question in enumerate(state.questions):
            if question.phase.value == phase:
                return index
        raise RuntimeError(f"outline missing required phase {phase}")

    @staticmethod
    def _hash_access_token(access_token: str) -> str:
        return hashlib.sha256(access_token.encode("utf-8")).hexdigest()

    async def aclose(self) -> None:
        for resource in (self._message_sink, self._llm):
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
    return InterviewAgentService(
        store=RedisSessionStateStore(get_redis()),
        llm=LlmClient(settings),
        message_sink=BusinessMessageSink(callback),
        grading_trigger=BusinessGradingTrigger(callback),
        checkpointer=get_interview_checkpointer(),
    )


def build_interview_event_stream_service() -> InterviewAgentService:
    settings = get_settings()
    callback = BusinessCallbackClient(settings)
    return InterviewAgentService(
        store=RedisSessionStateStore(get_redis()),
        llm=None,
        message_sink=BusinessMessageSink(callback),
        grading_trigger=BusinessGradingTrigger(callback),
    )
