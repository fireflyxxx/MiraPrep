"""T-040 面试实时链路的输入输出边界模型。"""

from datetime import datetime
from enum import StrEnum
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.outline import InterviewPhase


class RuntimeQuestion(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    questionId: str | int
    phase: InterviewPhase
    text: str = Field(min_length=1)
    focusPoints: list[str] = Field(min_length=1)
    order: int = Field(gt=0)

    @field_validator("text")
    @classmethod
    def reject_injected_or_scoring_question(cls, value: str) -> str:
        unsafe = re.compile(
            r"(忽略.{0,8}(指令|提示)|系统提示|system\s*prompt|标准答案|"
            r"给.{0,8}(满分|评分|打分)|候选人.{0,8}(得分|评级)|"
            r"(你的回答|候选人回答).{0,8}(正确|错误|得分|评分|评级))",
            re.IGNORECASE,
        )
        if unsafe.search(value):
            raise ValueError("question contains unsafe interviewer instructions")
        return value


class RuntimeInterviewPhase(StrEnum):
    GREETING = "GREETING"
    SELF_INTRO = "SELF_INTRO"
    RESUME_DEEP_DIVE = "RESUME_DEEP_DIVE"
    DOMAIN_ASSESSMENT = "DOMAIN_ASSESSMENT"
    BEHAVIORAL = "BEHAVIORAL"
    CANDIDATE_QA = "CANDIDATE_QA"
    CLOSING = "CLOSING"


class InterviewStatus(StrEnum):
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"


class ConversationRole(StrEnum):
    INTERVIEWER = "interviewer"
    CANDIDATE = "candidate"


class ConversationMessage(BaseModel):
    role: ConversationRole
    content: str
    phase: RuntimeInterviewPhase
    questionId: str | int | None = None


class InterviewSessionState(BaseModel):
    sessionId: int = Field(gt=0)
    durationMin: Literal[15, 30, 45]
    interviewerStyle: str = Field(min_length=1)
    accessTokenHash: str = Field(min_length=64, max_length=64)
    questions: list[RuntimeQuestion] = Field(min_length=1)
    phase: RuntimeInterviewPhase = RuntimeInterviewPhase.GREETING
    currentQuestionIndex: int | None = None
    followUpCount: int = Field(default=0, ge=0, le=3)
    messageSeq: int = Field(default=0, ge=0)
    processedAnswerIds: list[str] = Field(default_factory=list)
    pendingMessageDeliveries: list[dict[str, Any]] = Field(default_factory=list)
    messageDeliveryAttempts: int = Field(default=0, ge=0)
    messageDeliveryNextAttemptAt: datetime | None = None
    pendingInterviewerMessage: ConversationMessage | None = None
    pendingInterviewerTargetText: str | None = None
    gradingRequestId: str | None = None
    gradingCompleted: bool = False
    gradingAttempts: int = Field(default=0, ge=0)
    gradingNextAttemptAt: datetime | None = None
    pendingFinishReason: str | None = None
    pendingGradingTranscript: list[dict[str, Any]] | None = None
    history: list[ConversationMessage] = Field(default_factory=list)
    startedAt: datetime
    deadlineAt: datetime
    candidateQaDeadlineAt: datetime | None = None
    status: InterviewStatus = InterviewStatus.ACTIVE
    endReason: str | None = None


class InterviewEvent(BaseModel):
    type: Literal["token", "phase_change", "interview_end", "error"]
    payload: dict[str, Any]
    seq: int = Field(gt=0)


class AgentAction(StrEnum):
    FOLLOW_UP = "FOLLOW_UP"
    HINT = "HINT"
    NEXT_QUESTION = "NEXT_QUESTION"
    REDIRECT = "REDIRECT"
    CLARIFY = "CLARIFY"
    TERMINATE = "TERMINATE"


class AgentDecision(BaseModel):
    action: AgentAction
    responseInstruction: str | None = None
    completeness: Literal["sufficient", "partial", "missing"] | None = None
    depth: Literal["deep", "adequate", "shallow"] | None = None
    authenticity: Literal["consistent", "uncertain"] | None = None


class InterviewStartRequest(BaseModel):
    durationMin: Literal[15, 30, 45]
    interviewerStyle: str = Field(min_length=1)
    accessToken: str = Field(min_length=32, max_length=256)
    questions: list[RuntimeQuestion] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_runtime_outline(self) -> "InterviewStartRequest":
        ids = [str(question.questionId) for question in self.questions]
        if len(ids) != len(set(ids)):
            raise ValueError("questionId values must be unique")

        orders = sorted(question.order for question in self.questions)
        if orders != list(range(1, len(self.questions) + 1)):
            raise ValueError("question order must be contiguous")

        ordered_questions = sorted(self.questions, key=lambda question: question.order)
        phase_order = {phase: index for index, phase in enumerate(InterviewPhase)}
        indexes = [phase_order[question.phase] for question in ordered_questions]
        if indexes != sorted(indexes):
            raise ValueError("question phases must follow the interview state machine")

        phases = {question.phase for question in self.questions}
        required = {
            InterviewPhase.SELF_INTRO,
            InterviewPhase.CANDIDATE_QA,
            InterviewPhase.CLOSING,
        }
        if not required.issubset(phases):
            raise ValueError("outline must include SELF_INTRO, CANDIDATE_QA and CLOSING")
        if ordered_questions[-1].phase is not InterviewPhase.CLOSING:
            raise ValueError("CLOSING must be the final outline question")
        return self


class InterviewAnswerRequest(BaseModel):
    answerId: str = Field(min_length=8, max_length=64)
    content: str = Field(max_length=10_000)
    questionId: str | int | None = None


class AcceptedResponse(BaseModel):
    accepted: bool = True
