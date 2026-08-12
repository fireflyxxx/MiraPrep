"""T-105 批改请求、模型输出与业务回调 schema。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class GradingConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    jobDirection: str | None = None
    jobTitle: str | None = None
    jdText: str | None = None
    difficulty: str | None = None
    types: list[str] = Field(min_length=1)
    durationMin: int | None = Field(default=None, gt=0)
    customRequirements: str | None = None
    interviewerStyle: str | None = None


class GradingResume(BaseModel):
    parsedJson: dict[str, Any]


class TranscriptQuestion(BaseModel):
    questionId: int = Field(gt=0)
    phase: str = Field(min_length=1)
    focusPoints: list[str] = Field(min_length=1)
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    baselineAnswer: str | None = Field(default=None, min_length=1)
    baselineScore: float | None = Field(default=None, ge=0, le=10)
    baselineFollowUps: list[dict[str, Any]] = Field(default_factory=list)
    followUps: list[dict[str, Any] | str] = Field(default_factory=list)

    @model_validator(mode="after")
    def baseline_score_requires_answer(self) -> TranscriptQuestion:
        if self.baselineScore is not None and self.baselineAnswer is None:
            raise ValueError("baselineScore requires baselineAnswer")
        if self.baselineFollowUps and self.baselineAnswer is None:
            raise ValueError("baselineFollowUps require baselineAnswer")
        return self


class GradingRequest(BaseModel):
    sessionId: int = Field(gt=0)
    config: GradingConfig
    resume: GradingResume
    transcript: list[TranscriptQuestion] = Field(min_length=1)
    partial: bool

    @model_validator(mode="after")
    def question_ids_must_be_unique(self) -> GradingRequest:
        ids = [item.questionId for item in self.transcript]
        if len(ids) != len(set(ids)):
            raise ValueError("transcript questionId values must be unique")
        return self


class FollowUpReview(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    answerSeconds: int | None = Field(default=None, ge=0)
    score: int = Field(ge=0, le=10)
    referenceAnswer: str = Field(min_length=1)
    suggestions: list[str] = Field(min_length=1)


class AnswerComparison(BaseModel):
    improvements: list[str]
    remainingGaps: list[str]
    scoreRationale: str = Field(min_length=1)


class QuestionReview(BaseModel):
    questionId: int = Field(gt=0)
    score: int = Field(ge=0, le=10)
    baselineScore: float | None = Field(default=None, ge=0, le=10)
    comparison: AnswerComparison | None = None
    referenceAnswer: str = Field(min_length=1)
    suggestions: list[str] = Field(min_length=1)
    followUpChain: list[FollowUpReview] = Field(default_factory=list)


class SummaryReview(BaseModel):
    summary: str = Field(min_length=1)
    highlights: list[str] = Field(min_length=1)
    weaknesses: list[str] = Field(min_length=1)


class DimensionScores(BaseModel):
    professionalKnowledge: int = Field(ge=0, le=100)
    projectDepth: int = Field(ge=0, le=100)
    communicationLogic: int = Field(ge=0, le=100)
    adaptability: int = Field(ge=0, le=100)
    jobFit: int = Field(ge=0, le=100)


class GradingReport(BaseModel):
    grade: Literal["S", "A", "B", "C", "D"]
    totalScore: int = Field(ge=0, le=100)
    dimensionScores: DimensionScores
    summary: str = Field(min_length=1)
    highlights: list[str] = Field(min_length=1)
    weaknesses: list[str] = Field(min_length=1)
    partial: bool
    questionReviews: list[QuestionReview] = Field(min_length=1)


class GradingAcceptedResponse(BaseModel):
    accepted: bool = True
