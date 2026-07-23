"""T-105 结构化批改、确定性聚合与 Redis 可靠任务队列。"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
import json
import logging
from typing import Any, Protocol

from langchain_core.messages import SystemMessage
from langchain_core.prompts import ChatPromptTemplate

from app.clients.business import BusinessCallbackClient
from app.clients.llm import LlmClient
from app.prompts.grading import (
    GRADING_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
    build_question_prompt,
    build_summary_prompt,
)
from app.schemas.grading import (
    DimensionScores,
    GradingReport,
    GradingRequest,
    QuestionReview,
    SummaryReview,
)

logger = logging.getLogger("miraprep.ai.grading")

_DIMENSIONS = (
    "professionalKnowledge",
    "projectDepth",
    "communicationLogic",
    "adaptability",
    "jobFit",
)
_FOCUS_KEYWORDS = {
    "professionalKnowledge": ("专业", "技术", "知识", "原理", "算法", "编码", "technical"),
    "projectDepth": ("项目", "架构", "设计", "性能", "复盘", "project", "depth"),
    "communicationLogic": ("表达", "逻辑", "结构", "沟通", "communication", "logic"),
    "adaptability": ("应变", "追问", "压力", "问题解决", "adaptability"),
    "jobFit": ("岗位", "匹配", "业务", "动机", "协作", "job", "fit"),
}
_PHASE_FALLBACK = {
    "SELF_INTRO": ("communicationLogic", "jobFit"),
    "RESUME_DEEP_DIVE": ("projectDepth",),
    "DOMAIN_ASSESSMENT": ("professionalKnowledge",),
    "BEHAVIORAL": ("adaptability", "jobFit"),
    "CANDIDATE_QA": ("communicationLogic", "jobFit"),
    "CLOSING": ("communicationLogic",),
}
_TYPE_WEIGHTS = {
    "technical": {
        "professionalKnowledge": Decimal("0.35"),
        "projectDepth": Decimal("0.30"),
        "communicationLogic": Decimal("0.15"),
        "adaptability": Decimal("0.10"),
        "jobFit": Decimal("0.10"),
    },
    "hr": {
        "professionalKnowledge": Decimal("0.10"),
        "projectDepth": Decimal("0.15"),
        "communicationLogic": Decimal("0.30"),
        "adaptability": Decimal("0.25"),
        "jobFit": Decimal("0.20"),
    },
}


def _round_score(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def grade_for_score(score: int) -> str:
    if score >= 90:
        return "S"
    if score >= 80:
        return "A"
    if score >= 70:
        return "B"
    if score >= 60:
        return "C"
    return "D"


def _dimensions_for_question(focus_points: list[str], phase: str) -> set[str]:
    normalized = " ".join(focus_points).casefold()
    matched = {
        dimension
        for dimension, keywords in _FOCUS_KEYWORDS.items()
        if any(keyword.casefold() in normalized for keyword in keywords)
    }
    return matched or set(_PHASE_FALLBACK.get(phase.upper(), _DIMENSIONS))


def _weights_for_types(interview_types: list[str]) -> dict[str, Decimal]:
    profiles = []
    for interview_type in interview_types:
        normalized = interview_type.strip().lower()
        profiles.append(
            _TYPE_WEIGHTS["hr"]
            if normalized in {"hr", "behavioral", "behavioural"}
            else _TYPE_WEIGHTS["technical"]
        )
    count = Decimal(len(profiles))
    return {
        dimension: sum(profile[dimension] for profile in profiles) / count
        for dimension in _DIMENSIONS
    }


def aggregate_scores(
    request: GradingRequest, reviews: list[QuestionReview]
) -> tuple[DimensionScores, int]:
    """按考察点聚合五维；未覆盖维度用已答题均分作中性回填。"""

    review_by_id = {review.questionId: review for review in reviews}
    if set(review_by_id) != {question.questionId for question in request.transcript}:
        raise ValueError("question review ids do not match transcript")

    buckets: dict[str, list[int]] = {dimension: [] for dimension in _DIMENSIONS}
    all_scores: list[int] = []
    for question in request.transcript:
        score = review_by_id[question.questionId].score
        all_scores.append(score)
        for dimension in _dimensions_for_question(question.focusPoints, question.phase):
            buckets[dimension].append(score)

    overall = Decimal(sum(all_scores)) / Decimal(len(all_scores))
    values = {
        dimension: _round_score(
            Decimal(sum(scores)) / Decimal(len(scores)) * 10 if scores else overall * 10
        )
        for dimension, scores in buckets.items()
    }
    dimensions = DimensionScores.model_validate(values)
    weights = _weights_for_types(request.config.types)
    total = _round_score(
        sum(Decimal(getattr(dimensions, key)) * weight for key, weight in weights.items())
    )
    return dimensions, total


def _build_chain(model: Any, system_prompt: str, schema: type[Any]) -> Any:
    chat_model = getattr(model, "chat_model", model)
    prompt = ChatPromptTemplate.from_messages(
        [SystemMessage(content=system_prompt), ("human", "{grading_data}")]
    )
    return prompt | chat_model.with_structured_output(schema)


class GradingService:
    def __init__(self, llm: LlmClient) -> None:
        self._llm = llm

    async def grade(self, request: GradingRequest) -> GradingReport:
        question_chain = _build_chain(self._llm, GRADING_SYSTEM_PROMPT, QuestionReview)
        reviews = await question_chain.abatch(
            [
                {"grading_data": build_question_prompt(request, question)}
                for question in request.transcript
            ],
            config={"max_concurrency": 4},
        )
        if len(reviews) != len(request.transcript):
            raise ValueError("llm returned incomplete question reviews")

        transcript_by_id = {item.questionId: item for item in request.transcript}
        if {review.questionId for review in reviews} != set(transcript_by_id):
            raise ValueError("llm question ids do not match transcript")
        normalized_reviews: list[QuestionReview] = []
        for review in reviews:
            normalized_reviews.append(
                review.model_copy(
                    update={
                        "followUpChain": transcript_by_id[review.questionId].followUps,
                    }
                )
            )

        dimensions, total = aggregate_scores(request, normalized_reviews)
        grade = grade_for_score(total)
        summary = await _build_chain(self._llm, SUMMARY_SYSTEM_PROMPT, SummaryReview).ainvoke(
            {
                "grading_data": build_summary_prompt(
                    request,
                    question_reviews=[item.model_dump(mode="json") for item in normalized_reviews],
                    dimension_scores=dimensions.model_dump(mode="json"),
                    total_score=total,
                    grade=grade,
                )
            }
        )
        return GradingReport(
            grade=grade,
            totalScore=total,
            dimensionScores=dimensions,
            summary=summary.summary,
            highlights=summary.highlights,
            weaknesses=summary.weaknesses,
            partial=request.partial,
            questionReviews=normalized_reviews,
        )

    async def aclose(self) -> None:
        await self._llm.aclose()


class GradingJobStore(Protocol):
    async def enqueue(self, session_id: int, payload: dict[str, Any]) -> bool: ...

    async def claim(self) -> tuple[int, dict[str, Any]] | None: ...

    async def persist_inflight(
        self, session_id: int, payload: dict[str, Any], expected_revision: int
    ) -> bool: ...

    async def release(
        self, session_id: int, payload: dict[str, Any], expected_revision: int
    ) -> bool: ...

    async def complete(self, session_id: int, expected_revision: int) -> bool: ...

    async def dead_letter(
        self, session_id: int, payload: dict[str, Any], expected_revision: int
    ) -> bool: ...


class RedisGradingJobStore:
    """Redis list + job document：原子认领任务，进程退出后可恢复处理中任务。"""

    _QUEUE_KEY = "miraprep:grading:queue"
    _PROCESSING_KEY = "miraprep:grading:processing"
    _DEAD_LETTER_KEY = "miraprep:grading:dead-letter"
    _JOB_PREFIX = "miraprep:grading:job:"
    _ENQUEUE_SCRIPT = """
    local incoming = cjson.decode(ARGV[1])
    local current_raw = redis.call('GET', KEYS[1])
    if current_raw then
        local current = cjson.decode(current_raw)
        if current.requestHash == incoming.requestHash then return 0 end
        incoming.revision = (current.revision or 0) + 1
        redis.call('SET', KEYS[1], cjson.encode(incoming))
        return 1
    end
    incoming.revision = 1
    redis.call('SET', KEYS[1], cjson.encode(incoming))
    redis.call('LPUSH', KEYS[2], ARGV[2])
    return 1
    """
    _PERSIST_SCRIPT = """
    local current_raw = redis.call('GET', KEYS[1])
    if not current_raw then return 0 end
    local current = cjson.decode(current_raw)
    if tonumber(current.revision) ~= tonumber(ARGV[2]) then return 0 end
    redis.call('SET', KEYS[1], ARGV[1])
    return 1
    """
    _RELEASE_SCRIPT = """
    local current_raw = redis.call('GET', KEYS[1])
    local matched = 0
    if current_raw then
        local current = cjson.decode(current_raw)
        if tonumber(current.revision) == tonumber(ARGV[3]) then
            redis.call('SET', KEYS[1], ARGV[1])
            matched = 1
        end
    end
    redis.call('LREM', KEYS[2], 0, ARGV[2])
    redis.call('LREM', KEYS[3], 0, ARGV[2])
    if redis.call('EXISTS', KEYS[1]) == 1 then
        redis.call('LPUSH', KEYS[3], ARGV[2])
    end
    return matched
    """
    _COMPLETE_SCRIPT = """
    local current_raw = redis.call('GET', KEYS[1])
    if current_raw then
        local current = cjson.decode(current_raw)
        if tonumber(current.revision) == tonumber(ARGV[2]) then
            redis.call('DEL', KEYS[1])
            redis.call('LREM', KEYS[2], 0, ARGV[1])
            redis.call('LREM', KEYS[3], 0, ARGV[1])
            return 1
        end
    end
    redis.call('LREM', KEYS[2], 0, ARGV[1])
    redis.call('LREM', KEYS[3], 0, ARGV[1])
    if redis.call('EXISTS', KEYS[1]) == 1 then
        redis.call('LPUSH', KEYS[3], ARGV[1])
    end
    return 0
    """
    _DEAD_LETTER_SCRIPT = """
    local current_raw = redis.call('GET', KEYS[1])
    if current_raw then
        local current = cjson.decode(current_raw)
        if tonumber(current.revision) == tonumber(ARGV[3]) then
            redis.call('RPUSH', KEYS[4], ARGV[1])
            redis.call('DEL', KEYS[1])
            redis.call('LREM', KEYS[2], 0, ARGV[2])
            redis.call('LREM', KEYS[3], 0, ARGV[2])
            return 1
        end
    end
    redis.call('LREM', KEYS[2], 0, ARGV[2])
    redis.call('LREM', KEYS[3], 0, ARGV[2])
    if redis.call('EXISTS', KEYS[1]) == 1 then
        redis.call('LPUSH', KEYS[3], ARGV[2])
    end
    return 0
    """

    def __init__(self, redis: Any) -> None:
        self._redis = redis

    def _job_key(self, session_id: int) -> str:
        return f"{self._JOB_PREFIX}{session_id}"

    async def enqueue(self, session_id: int, payload: dict[str, Any]) -> bool:
        created = await self._redis.eval(
            self._ENQUEUE_SCRIPT,
            2,
            self._job_key(session_id),
            self._QUEUE_KEY,
            json.dumps(payload, ensure_ascii=False),
            str(session_id),
        )
        return bool(created)

    async def claim(self) -> tuple[int, dict[str, Any]] | None:
        session_id = await self._redis.rpoplpush(self._QUEUE_KEY, self._PROCESSING_KEY)
        if session_id is None:
            return None
        raw = await self._redis.get(self._job_key(int(session_id)))
        if raw is None:
            await self._redis.lrem(self._PROCESSING_KEY, 1, session_id)
            return None
        return int(session_id), json.loads(raw)

    async def persist_inflight(
        self, session_id: int, payload: dict[str, Any], expected_revision: int
    ) -> bool:
        persisted = await self._redis.eval(
            self._PERSIST_SCRIPT,
            1,
            self._job_key(session_id),
            json.dumps(payload, ensure_ascii=False),
            expected_revision,
        )
        return bool(persisted)

    async def release(
        self, session_id: int, payload: dict[str, Any], expected_revision: int
    ) -> bool:
        matched = await self._redis.eval(
            self._RELEASE_SCRIPT,
            3,
            self._job_key(session_id),
            self._PROCESSING_KEY,
            self._QUEUE_KEY,
            json.dumps(payload, ensure_ascii=False),
            str(session_id),
            expected_revision,
        )
        return bool(matched)

    async def complete(self, session_id: int, expected_revision: int) -> bool:
        completed = await self._redis.eval(
            self._COMPLETE_SCRIPT,
            3,
            self._job_key(session_id),
            self._PROCESSING_KEY,
            self._QUEUE_KEY,
            str(session_id),
            expected_revision,
        )
        return bool(completed)

    async def dead_letter(
        self, session_id: int, payload: dict[str, Any], expected_revision: int
    ) -> bool:
        moved = await self._redis.eval(
            self._DEAD_LETTER_SCRIPT,
            4,
            self._job_key(session_id),
            self._PROCESSING_KEY,
            self._QUEUE_KEY,
            self._DEAD_LETTER_KEY,
            json.dumps(payload, ensure_ascii=False),
            str(session_id),
            expected_revision,
        )
        return bool(moved)

    async def recover_inflight(self) -> None:
        while await self._redis.rpoplpush(self._PROCESSING_KEY, self._QUEUE_KEY) is not None:
            pass


class GradingTaskQueue:
    """持久化任务状态；模型重试与回调重试彼此独立。"""

    def __init__(
        self,
        *,
        store: GradingJobStore,
        grading_service_factory: Callable[[], Any],
        callback_factory: Callable[[], BusinessCallbackClient],
        max_grading_attempts: int = 3,
        max_delivery_attempts: int = 5,
        retry_backoff_seconds: float = 0.25,
    ) -> None:
        self._store = store
        self._grading_service_factory = grading_service_factory
        self._callback_factory = callback_factory
        self._max_grading_attempts = max_grading_attempts
        self._max_delivery_attempts = max_delivery_attempts
        self._retry_backoff_seconds = retry_backoff_seconds
        self._grading_service: Any | None = None

    async def enqueue(self, request: GradingRequest) -> bool:
        request_payload = request.model_dump(mode="json")
        request_json = json.dumps(
            request_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        return await self._store.enqueue(
            request.sessionId,
            {
                "stage": "grading",
                "gradingAttempts": 0,
                "deliveryAttempts": 0,
                "requestHash": sha256(request_json.encode()).hexdigest(),
                "request": request_payload,
            },
        )

    async def recover_inflight(self) -> None:
        recover = getattr(self._store, "recover_inflight", None)
        if recover is not None:
            await recover()

    async def run_once(self) -> bool:
        claimed = await self._store.claim()
        if claimed is None:
            return False
        session_id, job = claimed

        if job["stage"] == "grading":
            job = await self._run_grading(session_id, job)
            if job is None:
                return True
            if not await self._store.persist_inflight(session_id, job, job["revision"]):
                await self._store.release(session_id, job, job["revision"])
                return True
        await self._deliver(session_id, job)
        return True

    async def _run_grading(self, session_id: int, job: dict[str, Any]) -> dict[str, Any] | None:
        if self._grading_service is None:
            self._grading_service = self._grading_service_factory()
        job["gradingAttempts"] += 1
        try:
            report = await self._grading_service.grade(
                GradingRequest.model_validate(job["request"])
            )
            job.update(
                {
                    "stage": "delivery",
                    "callbackPath": f"/interviews/{session_id}/grade-result",
                    "callbackPayload": report.model_dump(mode="json"),
                }
            )
            return job
        except Exception:
            logger.exception(
                "grading attempt failed",
                extra={"session_id": session_id, "attempt": job["gradingAttempts"]},
            )
            if job["gradingAttempts"] < self._max_grading_attempts:
                await self._reschedule(session_id, job, job["revision"])
                return None
            job.update(
                {
                    "stage": "delivery",
                    "callbackPath": f"/interviews/{session_id}/grade-failed",
                    "callbackPayload": {
                        "errorCode": "GRADING_RETRIES_EXHAUSTED",
                        "errorMessage": "grading failed after retries",
                    },
                }
            )
            return job

    async def _deliver(self, session_id: int, job: dict[str, Any]) -> None:
        revision = job["revision"]
        job["deliveryAttempts"] = job.get("deliveryAttempts", 0) + 1
        if not await self._store.persist_inflight(session_id, job, revision):
            await self._store.release(session_id, job, revision)
            return
        callback = self._callback_factory()
        delivered = False
        try:
            delivered = await callback.callback(
                path=job["callbackPath"], json=job["callbackPayload"]
            )
        except Exception:
            logger.exception("grading callback raised", extra={"session_id": session_id})
        finally:
            try:
                await callback.aclose()
            except Exception:
                logger.exception(
                    "grading callback client close failed", extra={"session_id": session_id}
                )
        if delivered:
            await self._store.complete(session_id, revision)
        elif job["deliveryAttempts"] >= self._max_delivery_attempts:
            await self._store.dead_letter(session_id, job, revision)
            logger.error(
                "grading callback moved to dead letter",
                extra={"session_id": session_id, "attempts": job["deliveryAttempts"]},
            )
        else:
            await self._reschedule(session_id, job, revision)

    async def _reschedule(
        self, session_id: int, job: dict[str, Any], expected_revision: int
    ) -> None:
        if self._retry_backoff_seconds:
            await asyncio.sleep(self._retry_backoff_seconds)
        await self._store.release(session_id, job, expected_revision)

    async def aclose(self) -> None:
        if self._grading_service is None:
            return
        try:
            await self._grading_service.aclose()
        except Exception:
            logger.exception("grading model close failed")
