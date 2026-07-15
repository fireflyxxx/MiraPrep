"""T-031 面试大纲生成的 Pydantic 边界模型。"""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


class InterviewPhase(StrEnum):
    """面试大纲的固定阶段，枚举顺序也是执行顺序。"""

    SELF_INTRO = "SELF_INTRO"
    RESUME_DEEP_DIVE = "RESUME_DEEP_DIVE"
    DOMAIN_ASSESSMENT = "DOMAIN_ASSESSMENT"
    BEHAVIORAL = "BEHAVIORAL"
    CANDIDATE_QA = "CANDIDATE_QA"
    CLOSING = "CLOSING"


class OutlineConfig(BaseModel):
    jobDirection: str = Field(min_length=1)
    jobTitle: str | None = None
    jdText: str | None = None
    difficulty: str = Field(min_length=1)
    types: list[str] = Field(min_length=1)
    durationMin: Literal[15, 30, 45]
    customRequirements: str | None = None
    interviewerStyle: str = Field(min_length=1)


class OutlineResume(BaseModel):
    parsedJson: dict[str, Any]


class OutlineRequest(BaseModel):
    sessionId: int = Field(gt=0)
    config: OutlineConfig
    resume: OutlineResume


class OutlineQuestion(BaseModel):
    phase: InterviewPhase
    text: str = Field(min_length=1)
    focusPoints: list[str] = Field(min_length=1)
    order: int = Field(gt=0)
    suggestedSeconds: int = Field(gt=0)


class OutlineResult(BaseModel):
    questions: list[OutlineQuestion] = Field(min_length=1)


class OutlineAcceptedResponse(BaseModel):
    accepted: bool = True
