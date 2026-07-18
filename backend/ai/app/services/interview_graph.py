"""LangGraph core for one interview answer turn (T-101)."""

from __future__ import annotations

from typing import Any, TypedDict

from langchain_core.runnables import Runnable
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph

from app.schemas.interview import AgentAction, AgentDecision


class InterviewGraphState(TypedDict, total=False):
    session_id: str
    phase: str
    questions: list[dict[str, Any]]
    current_question_index: int
    follow_up_depth: int
    messages: list[dict[str, Any]]
    answer: str
    decision_prompt: str
    decision: dict[str, Any]
    route: str
    terminated: bool


def build_interview_graph(
    decision_chain: Runnable[Any, AgentDecision],
    *,
    checkpointer: BaseCheckpointSaver[Any] | None = None,
) -> Any:
    """Compile the explicit answer-evaluation state machine."""

    async def evaluate_answer(state: InterviewGraphState) -> dict[str, Any]:
        decision = await decision_chain.ainvoke(
            {
                "decision_prompt": state.get("decision_prompt", ""),
                "answer": state.get("answer", ""),
                "phase": state.get("phase", ""),
                "messages": state.get("messages", []),
            }
        )
        if not isinstance(decision, AgentDecision):
            decision = AgentDecision.model_validate(decision)
        return {"decision": decision.model_dump(mode="json")}

    def route_after_evaluation(state: InterviewGraphState) -> str:
        decision = AgentDecision.model_validate(state["decision"])
        route = decision.action.value.lower()
        if (
            decision.action
            in {
                AgentAction.FOLLOW_UP,
                AgentAction.HINT,
                AgentAction.REDIRECT,
                AgentAction.CLARIFY,
            }
            and state.get("follow_up_depth", 0) >= 3
        ):
            return "next_question"
        return route

    def keep_question(action: AgentAction):  # type: ignore[no-untyped-def]
        def node(state: InterviewGraphState) -> dict[str, Any]:
            return {
                "route": action.value.lower(),
                "follow_up_depth": state.get("follow_up_depth", 0) + 1,
            }

        return node

    def next_question(state: InterviewGraphState) -> dict[str, Any]:
        questions = state.get("questions", [])
        current = state.get("current_question_index", 0)
        next_index = min(current + 1, max(len(questions) - 1, 0))
        return {
            "route": "next_question",
            "current_question_index": next_index,
            "follow_up_depth": 0,
        }

    def advance_phase(state: InterviewGraphState) -> dict[str, Any]:
        questions = state.get("questions", [])
        index = state.get("current_question_index", 0)
        if questions and 0 <= index < len(questions):
            phase = str(questions[index].get("phase", state.get("phase", "")))
            return {"phase": phase, "route": "next_question"}
        return {"route": "next_question"}

    def terminate(_: InterviewGraphState) -> dict[str, Any]:
        return {"route": "terminate", "terminated": True}

    builder = StateGraph(InterviewGraphState)
    builder.add_node("evaluate_answer", evaluate_answer)
    builder.add_node("follow_up", keep_question(AgentAction.FOLLOW_UP))
    builder.add_node("hint", keep_question(AgentAction.HINT))
    builder.add_node("redirect", keep_question(AgentAction.REDIRECT))
    builder.add_node("clarify", keep_question(AgentAction.CLARIFY))
    builder.add_node("next_question", next_question)
    builder.add_node("advance_phase", advance_phase)
    builder.add_node("terminate", terminate)
    builder.add_edge(START, "evaluate_answer")
    builder.add_conditional_edges(
        "evaluate_answer",
        route_after_evaluation,
        {
            "follow_up": "follow_up",
            "hint": "hint",
            "redirect": "redirect",
            "clarify": "clarify",
            "next_question": "next_question",
            "terminate": "terminate",
        },
    )
    for node in ("follow_up", "hint", "redirect", "clarify", "terminate"):
        builder.add_edge(node, END)
    builder.add_edge("next_question", "advance_phase")
    builder.add_edge("advance_phase", END)
    return builder.compile(checkpointer=checkpointer)
