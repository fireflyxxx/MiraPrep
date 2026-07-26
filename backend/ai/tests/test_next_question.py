"""运行时动态出题：阶段推进由预算决定，题目在需要时才生成并落库。"""

from collections import Counter
from importlib import import_module
from typing import Any

import pytest

from app.schemas.interview import GeneratedQuestion, InterviewStartRequest
from app.schemas.outline import InterviewPhase
from app.services.next_question import FALLBACK_QUESTIONS, next_phase
from app.services.session_state import InMemorySessionStateStore

_BUDGET = {
    InterviewPhase.SELF_INTRO: 1,
    InterviewPhase.RESUME_DEEP_DIVE: 2,
    InterviewPhase.DOMAIN_ASSESSMENT: 1,
    InterviewPhase.BEHAVIORAL: 0,
    InterviewPhase.CANDIDATE_QA: 1,
    InterviewPhase.CLOSING: 1,
}


def test_next_phase_stays_in_phase_until_its_budget_is_used() -> None:
    asked = Counter({InterviewPhase.SELF_INTRO: 1, InterviewPhase.RESUME_DEEP_DIVE: 1})

    assert (
        next_phase(_BUDGET, asked, InterviewPhase.RESUME_DEEP_DIVE)
        is InterviewPhase.RESUME_DEEP_DIVE
    )


def test_next_phase_skips_phases_with_zero_budget() -> None:
    asked = Counter(
        {
            InterviewPhase.SELF_INTRO: 1,
            InterviewPhase.RESUME_DEEP_DIVE: 2,
            InterviewPhase.DOMAIN_ASSESSMENT: 1,
        }
    )

    assert (
        next_phase(_BUDGET, asked, InterviewPhase.DOMAIN_ASSESSMENT) is InterviewPhase.CANDIDATE_QA
    )


def test_next_phase_never_goes_back_after_a_forced_jump() -> None:
    """超时被强推到 CANDIDATE_QA 后，不能回头补前面欠的深挖题。"""

    asked = Counter({InterviewPhase.SELF_INTRO: 1, InterviewPhase.CANDIDATE_QA: 1})

    assert next_phase(_BUDGET, asked, InterviewPhase.CANDIDATE_QA) is InterviewPhase.CLOSING


def test_next_phase_returns_none_when_every_budget_is_used() -> None:
    asked = Counter(
        {
            InterviewPhase.SELF_INTRO: 1,
            InterviewPhase.RESUME_DEEP_DIVE: 2,
            InterviewPhase.DOMAIN_ASSESSMENT: 1,
            InterviewPhase.CANDIDATE_QA: 1,
            InterviewPhase.CLOSING: 1,
        }
    )

    assert next_phase(_BUDGET, asked, InterviewPhase.CLOSING) is None


def _start_request() -> InterviewStartRequest:
    """运行时只拿到开场题，后续题目必须由它自己生成。"""

    return InterviewStartRequest.model_validate(
        {
            "durationMin": 15,
            "interviewerStyle": "professional",
            "accessToken": "test-runtime-token-77-at-least-32-chars",
            "config": {
                "jobDirection": "backend",
                "difficulty": "medium",
                "types": ["technical"],
                "durationMin": 15,
                "interviewerStyle": "professional",
            },
            "resume": {"parsedJson": {"skills": ["FastAPI"]}},
            "questions": [
                {
                    "questionId": 901,
                    "phase": "SELF_INTRO",
                    "text": "请做一个自我介绍。",
                    "focusPoints": ["表达逻辑"],
                    "order": 1,
                }
            ],
        }
    )


class RecordingQuestionSink:
    def __init__(self, fail: bool = False) -> None:
        self.calls: list[dict[str, Any]] = []
        self.fail = fail
        self._next_id = 902

    async def append(self, session_id: int, question: dict[str, Any]) -> dict[str, Any] | None:
        self.calls.append({"sessionId": session_id, **question})
        if self.fail:
            return None
        question_id = self._next_id
        self._next_id += 1
        return {"questionId": question_id, "order": len(self.calls) + 1}


class StubMessageSink:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []

    async def publish(self, session_id: int, message: dict[str, Any]) -> bool:
        self.messages.append(message)
        return True


class StubGradingTrigger:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def trigger(
        self,
        session_id: int,
        transcript: list[dict[str, Any]],
        reason: str,
        request_id: str,
    ) -> None:
        self.calls.append(reason)


class StubLlm:
    """只回答「换下一题」，出题链由 monkeypatch 接管。"""

    async def complete(self, messages: list[dict[str, Any]], *, system: str | None = None) -> str:
        return '{"action":"NEXT_QUESTION"}'

    async def stream(
        self, messages: list[dict[str, Any]], *, system: str | None = None
    ):  # type: ignore[no-untyped-def]
        yield "我们继续。"

    async def aclose(self) -> None:
        return None


def _service(question_sink: RecordingQuestionSink):  # type: ignore[no-untyped-def]
    module = import_module("app.services.interview_agent")
    store = InMemorySessionStateStore()
    service = module.InterviewAgentService(
        store=store,
        llm=StubLlm(),
        message_sink=StubMessageSink(),
        grading_trigger=StubGradingTrigger(),
        question_sink=question_sink,
    )
    return module, service, store


def _patch_generator(monkeypatch: pytest.MonkeyPatch, *, fail: bool = False) -> None:
    class Chain:
        async def ainvoke(self, _inputs: dict[str, Any]) -> GeneratedQuestion:
            if fail:
                raise RuntimeError("provider unavailable")
            return GeneratedQuestion(
                text="请讲讲你在 FastAPI 项目里的具体职责。",
                focusPoints=["项目深度"],
                suggestedSeconds=120,
            )

    monkeypatch.setattr(
        "app.services.interview_agent.build_next_question_chain", lambda _llm: Chain()
    )


@pytest.mark.asyncio
async def test_runtime_generates_and_persists_the_next_question(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sink = RecordingQuestionSink()
    _, service, store = _service(sink)
    _patch_generator(monkeypatch)

    await service.start(77, _start_request())
    await service.answer(
        77,
        import_module("app.schemas.interview").InterviewAnswerRequest(
            answerId="answer-0001", content="我是三年经验的后端工程师。"
        ),
    )

    state = await store.get(77)
    # 启动时只有开场题，第二题是运行时生成的，questionId 来自 Spring 落库结果。
    assert len(state.questions) == 2
    assert state.questions[1].questionId == 902
    assert state.questions[1].phase is InterviewPhase.RESUME_DEEP_DIVE
    assert sink.calls[0]["phase"] == "RESUME_DEEP_DIVE"
    assert sink.calls[0]["suggestedSeconds"] == 120


@pytest.mark.asyncio
async def test_generation_failure_falls_back_instead_of_ending_the_interview(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sink = RecordingQuestionSink()
    _, service, store = _service(sink)
    _patch_generator(monkeypatch, fail=True)

    await service.start(78, _start_request())
    await service.answer(
        78,
        import_module("app.schemas.interview").InterviewAnswerRequest(
            answerId="answer-0002", content="我是三年经验的后端工程师。"
        ),
    )

    state = await store.get(78)
    fallback = FALLBACK_QUESTIONS[InterviewPhase.RESUME_DEEP_DIVE]
    assert state.status.value == "ACTIVE"
    assert state.questions[1].text == fallback.text


@pytest.mark.asyncio
async def test_persistence_failure_ends_the_interview_instead_of_asking_a_ghost_question(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sink = RecordingQuestionSink(fail=True)
    _, service, store = _service(sink)
    _patch_generator(monkeypatch)

    await service.start(79, _start_request())
    await service.answer(
        79,
        import_module("app.schemas.interview").InterviewAnswerRequest(
            answerId="answer-0003", content="我是三年经验的后端工程师。"
        ),
    )

    state = await store.get(79)
    # 题目没落库就没有 questionId，报告会缺这一题，所以宁可收尾。
    assert len(state.questions) == 1
    assert state.status.value == "ENDED"
