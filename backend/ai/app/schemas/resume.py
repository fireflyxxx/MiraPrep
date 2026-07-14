"""Pydantic 输入/输出边界模型 for 简历解析（T-021）。

按 T-021 任务文件 §技术规格 的 schema 定义：
- basics: 姓名 + 可选联系方式
- education / experience / projects: 数组
- skills: 字符串数组
- raw_text_excerpt: 截断原文，供后续追问溯源

设计原则：所有可选字段允许 None；数组字段给空默认值，避免 LLM 漏字段导致整个解析失败。
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ResumeBasics(BaseModel):
    """简历基本信息（联系方式字段都可能缺失）。"""

    name: str | None = Field(default=None, description="候选人姓名")
    email: str | None = Field(default=None, description="邮箱")
    phone: str | None = Field(default=None, description="电话")
    location: str | None = Field(default=None, description="所在地")
    headline: str | None = Field(default=None, description="一句话头衔/求职意向")


class EducationItem(BaseModel):
    school: str = ""
    degree: str | None = None
    major: str | None = None
    start: str | None = Field(default=None, description="开始时间，原始字符串即可")
    end: str | None = Field(default=None, description="结束时间，原始字符串即可")


class ExperienceItem(BaseModel):
    company: str = ""
    title: str | None = None
    start: str | None = None
    end: str | None = None
    highlights: list[str] = Field(default_factory=list, description="工作要点 bullet")


class ProjectItem(BaseModel):
    name: str = ""
    role: str | None = None
    tech: list[str] = Field(default_factory=list)
    description: str | None = None
    highlights: list[str] = Field(default_factory=list)


class ParsedResume(BaseModel):
    """LLM 抽取出的结构化简历。"""

    basics: ResumeBasics
    education: list[EducationItem] = Field(default_factory=list)
    experience: list[ExperienceItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    raw_text_excerpt: str = Field(default="", description="原文截断，便于追问溯源")


class ResumeParseRequest(BaseModel):
    """Spring Boot 调过来的请求体。"""

    resumeId: int
    signedUrl: str
    fileName: str
    mimeType: str


class ResumeParseAcceptedResponse(BaseModel):
    """立即返回的 202 body。"""

    accepted: bool = True
