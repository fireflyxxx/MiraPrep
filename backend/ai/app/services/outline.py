"""T-031 面试大纲生成服务。"""

from __future__ import annotations

from collections import Counter
import logging
from typing import Any

from langchain_core.exceptions import OutputParserException
from langchain_core.messages import SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from pydantic import ValidationError

from app.clients.business import BusinessCallbackClient
from app.clients.llm import LlmClient
from app.prompts.outline import SYSTEM_PROMPT, build_user_prompt
from app.schemas.outline import InterviewPhase, OutlineRequest, OutlineResult

logger = logging.getLogger("miraprep.ai.outline")

ERROR_LLM_CALL = "llm call failed"
ERROR_LLM_INVALID_JSON = "llm returned invalid json"
ERROR_LLM_SCHEMA_INVALID = "llm output failed schema validation"
ERROR_OUTLINE_INVALID = "llm outline failed business validation"
ERROR_UNEXPECTED = "unexpected internal error"

_TECHNICAL_BUDGETS = {
    15: (1, 1, 1, 1, 1, 1),
    30: (1, 2, 2, 1, 1, 1),
    45: (1, 3, 4, 1, 1, 1),
}
_HR_BUDGETS = {
    15: (1, 1, 1, 1, 1, 1),
    30: (1, 1, 2, 2, 1, 1),
    45: (1, 2, 4, 2, 1, 1),
}


def build_outline_chain(model: Any) -> Any:
    """Build the LCEL outline chain and reserve the T-122 candidate-question slot."""

    chat_model = getattr(model, "chat_model", model)
    prompt = ChatPromptTemplate.from_messages(
        [
            SystemMessage(content=SYSTEM_PROMPT),
            (
                "human",
                "{interview_data}\n\n"
                "以下候选题仅供参考，不得改变 schema 和阶段预算；为空时忽略：\n"
                "<<<CANDIDATE_QUESTIONS_BEGIN>>>\n{candidate_questions}\n"
                "<<<CANDIDATE_QUESTIONS_END>>>",
            ),
        ]
    )
    return prompt | chat_model.with_structured_output(OutlineResult)


def build_phase_budget(duration_min: int, interview_types: list[str]) -> dict[InterviewPhase, int]:
    """根据时长和面试类型生成稳定、可验证的阶段题量。"""

    normalized_types = {item.strip().lower() for item in interview_types}
    budgets = _HR_BUDGETS if normalized_types & {"hr", "behavioral"} else _TECHNICAL_BUDGETS
    counts = budgets[duration_min]
    return dict(zip(InterviewPhase, counts, strict=True))


class OutlineGenerationService:
    """编排大纲生成、校验和业务服务回调。"""

    def __init__(self, llm: LlmClient, callback: BusinessCallbackClient) -> None:
        self._llm = llm
        self._callback = callback

    async def generate_outline(self, request: OutlineRequest) -> None:
        """生成大纲；所有后台失败都收敛为 failed 回调。"""

        try:
            budget = build_phase_budget(request.config.durationMin, request.config.types)
            try:
                result = await build_outline_chain(self._llm).ainvoke(
                    {
                        "interview_data": build_user_prompt(request, budget),
                        "candidate_questions": "",
                    }
                )
            except OutputParserException:
                logger.warning(
                    "outline llm returned invalid json", extra={"session_id": request.sessionId}
                )
                await self._fail(request.sessionId, ERROR_LLM_INVALID_JSON)
                return
            except ValidationError:
                logger.warning(
                    "outline llm schema validation failed",
                    extra={"session_id": request.sessionId},
                )
                await self._fail(request.sessionId, ERROR_LLM_SCHEMA_INVALID)
                return
            except Exception:
                logger.exception("outline llm call failed", extra={"session_id": request.sessionId})
                await self._fail(request.sessionId, ERROR_LLM_CALL)
                return

            try:
                _validate_outline(result, request, budget)
            except _OutlineValidationError:
                logger.warning(
                    "outline business validation failed",
                    extra={"session_id": request.sessionId},
                )
                await self._fail(request.sessionId, ERROR_OUTLINE_INVALID)
                return

            await self._deliver(
                request.sessionId,
                {
                    "status": "ready",
                    "questions": result.model_dump(mode="json")["questions"],
                },
            )
        except Exception:
            logger.exception(
                "outline generation unexpected failure", extra={"session_id": request.sessionId}
            )
            await self._fail(request.sessionId, ERROR_UNEXPECTED)
        finally:
            await self.aclose()

    async def _deliver(self, session_id: int, body: dict[str, Any]) -> None:
        delivered = await self._callback.callback(
            path=f"/interviews/{session_id}/outline-result", json=body
        )
        if not delivered:
            logger.error(
                "outline callback delivery failed after retries", extra={"session_id": session_id}
            )

    async def _fail(self, session_id: int, error: str) -> None:
        await self._deliver(session_id, {"status": "failed", "error": error})

    async def aclose(self) -> None:
        for close in (self._callback.aclose, self._llm.aclose):
            try:
                await close()
            except Exception:
                logger.exception("outline generation client close failed")


def _validate_outline(
    result: OutlineResult,
    request: OutlineRequest,
    budget: dict[InterviewPhase, int],
) -> None:
    questions = result.questions
    orders = [question.order for question in questions]
    if orders != list(range(1, len(questions) + 1)):
        raise _OutlineValidationError("question order must be contiguous")

    actual_counts = Counter(question.phase for question in questions)
    if actual_counts != Counter(budget):
        raise _OutlineValidationError("phase counts do not match budget")

    phase_positions = {phase: index for index, phase in enumerate(InterviewPhase)}
    phase_indexes = [phase_positions[question.phase] for question in questions]
    if phase_indexes != sorted(phase_indexes):
        raise _OutlineValidationError("question phases are out of order")

    total_seconds = sum(question.suggestedSeconds for question in questions)
    if total_seconds > request.config.durationMin * 60:
        raise _OutlineValidationError("suggested duration exceeds interview duration")

    resume_facts = _extract_resume_facts(request.resume.parsedJson)
    if resume_facts:
        deep_dive_text = "\n".join(
            question.text.casefold()
            for question in questions
            if question.phase is InterviewPhase.RESUME_DEEP_DIVE
        )
        if not any(fact.casefold() in deep_dive_text for fact in resume_facts):
            raise _OutlineValidationError("deep-dive questions do not reference resume facts")


def _extract_resume_facts(parsed_resume: dict[str, Any]) -> set[str]:
    facts: set[str] = set()
    skills = parsed_resume.get("skills", [])
    if isinstance(skills, list):
        facts.update(_reliable_resume_facts(skills))
    projects = parsed_resume.get("projects", [])
    if not isinstance(projects, list):
        return facts
    for project in projects:
        if not isinstance(project, dict):
            continue
        name = project.get("name")
        if isinstance(name, str):
            facts.update(_reliable_resume_facts([name]))
        technologies = project.get("tech", [])
        if isinstance(technologies, list):
            facts.update(_reliable_resume_facts(technologies))
    return facts


def _reliable_resume_facts(values: list[Any]) -> set[str]:
    """过滤过短锚点，避免 C/R/Go 等词用子串方式误命中普通题目。"""

    return {value.strip() for value in values if isinstance(value, str) and len(value.strip()) >= 3}


class _OutlineValidationError(Exception):
    """LLM 大纲违反确定性业务规则。"""
