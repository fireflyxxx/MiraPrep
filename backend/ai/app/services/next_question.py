"""运行时动态出题：阶段推进由代码按预算决定，题目内容交给模型。"""

from __future__ import annotations

from collections import Counter
from typing import Any

from langchain_core.messages import SystemMessage
from langchain_core.prompts import ChatPromptTemplate

from app.prompts.next_question import SYSTEM_PROMPT
from app.schemas.interview import GeneratedQuestion
from app.schemas.outline import InterviewPhase


def next_phase(
    budget: dict[InterviewPhase, int],
    asked: Counter[InterviewPhase] | dict[InterviewPhase, int],
    current: InterviewPhase | None,
    *,
    skip_current: bool = False,
) -> InterviewPhase | None:
    """
    返回下一题应属的阶段，全部预算用完返回 None（面试可以收尾）。

    只向后看：超时被强制推进到 CANDIDATE_QA 之后，不能再回头补前面欠的题。
    """

    phases = list(InterviewPhase)
    start = phases.index(current) + int(skip_current) if current is not None else 0
    for phase in phases[start:]:
        if asked.get(phase, 0) < budget.get(phase, 0):
            return phase
    return None


# 出题模型不可用时的确定性兜底：面试可以问得平庸，但不能因为一次调用失败就中断。
FALLBACK_QUESTIONS: dict[InterviewPhase, GeneratedQuestion] = {
    InterviewPhase.SELF_INTRO: GeneratedQuestion(
        text="请做一个自我介绍，重点说明与目标岗位最相关的一段经历。",
        focusPoints=["表达逻辑"],
        suggestedSeconds=120,
    ),
    InterviewPhase.RESUME_DEEP_DIVE: GeneratedQuestion(
        text="请挑一个你最有把握的项目，讲讲你的具体职责、遇到的难点和最终结果。",
        focusPoints=["项目深度"],
        suggestedSeconds=180,
    ),
    InterviewPhase.DOMAIN_ASSESSMENT: GeneratedQuestion(
        text="请结合目标岗位，说明你最熟悉的一项技术的原理与适用边界。",
        focusPoints=["专业知识"],
        suggestedSeconds=150,
    ),
    InterviewPhase.BEHAVIORAL: GeneratedQuestion(
        text="请讲一次你和同事在方案上产生分歧的经历，你是怎么推进的？",
        focusPoints=["临场应变"],
        suggestedSeconds=150,
    ),
    InterviewPhase.CANDIDATE_QA: GeneratedQuestion(
        text="面试到这里，你有什么想了解的吗？岗位、团队或技术方向都可以。",
        focusPoints=["岗位匹配"],
        suggestedSeconds=90,
    ),
    InterviewPhase.CLOSING: GeneratedQuestion(
        text="感谢你的参与，面试到这里就结束了，评估结果稍后会生成。",
        focusPoints=["收尾"],
        suggestedSeconds=60,
    ),
}


def build_next_question_chain(model: Any) -> Any:
    """单题生成链；阶段作为数据传入，模型不决定阶段。"""

    chat_model = getattr(model, "chat_model", model)
    prompt = ChatPromptTemplate.from_messages(
        [SystemMessage(content=SYSTEM_PROMPT), ("human", "{interview_data}")]
    )
    return prompt | chat_model.with_structured_output(GeneratedQuestion)
