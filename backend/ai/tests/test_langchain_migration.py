"""T-101 LangChain/LangGraph 迁移的框架级契约测试。"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.runnables import RunnableLambda
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.redis.aio import AsyncRedisSaver

from app.config import Settings
from app.schemas.interview import AgentAction, AgentDecision
from app.schemas.outline import OutlineResult
from app.schemas.resume import ParsedResume


class FakeChatModel:
    """只实现本任务会用到的 LangChain chat model 协议。"""

    def __init__(self) -> None:
        self.invocations: list[Any] = []

    async def ainvoke(self, messages: Any) -> AIMessage:
        self.invocations.append(messages)
        return AIMessage(content="Hello")

    async def astream(self, messages: Any) -> AsyncIterator[AIMessageChunk]:
        self.invocations.append(messages)
        yield AIMessageChunk(content="Hel")
        yield AIMessageChunk(content="lo")

    def with_structured_output(self, schema: type[Any]) -> RunnableLambda:
        if schema is ParsedResume:
            return RunnableLambda(lambda _: ParsedResume(basics={}))
        if schema is OutlineResult:
            return RunnableLambda(
                lambda _: OutlineResult(
                    questions=[
                        {
                            "phase": "SELF_INTRO",
                            "text": "请介绍自己。",
                            "focusPoints": ["表达结构"],
                            "order": 1,
                            "suggestedSeconds": 60,
                        }
                    ]
                )
            )
        if schema is AgentDecision:
            return RunnableLambda(
                lambda _: AgentDecision(
                    action=AgentAction.FOLLOW_UP,
                    responseInstruction="追问项目细节",
                )
            )
        raise AssertionError(f"unexpected schema: {schema}")


def test_get_chat_model_maps_miraprep_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.clients import llm as llm_module

    captured: dict[str, Any] = {}

    class CapturingChatAnthropic:
        def __init__(self, **kwargs: Any) -> None:
            captured.update(kwargs)

    monkeypatch.setattr(llm_module, "ChatAnthropic", CapturingChatAnthropic)
    settings = Settings(
        anthropic_api_key="test-key",
        anthropic_base_url="https://example.test/anthropic",
        anthropic_model="claude-test",
        anthropic_max_tokens=2048,
    )

    model = llm_module.get_chat_model(settings=settings)

    assert isinstance(model, CapturingChatAnthropic)
    assert captured == {
        "api_key": "test-key",
        "base_url": "https://example.test/anthropic",
        "model": "claude-test",
        "max_tokens": 2048,
    }


@pytest.mark.asyncio
async def test_llm_client_uses_langchain_async_invoke_and_stream() -> None:
    from app.clients.llm import LlmClient

    model = FakeChatModel()
    client = LlmClient(Settings(), model=model)

    completed = await client.complete(
        [{"role": "user", "content": "hello"}], system="system instructions"
    )
    streamed = [
        token
        async for token in client.stream(
            [{"role": "user", "content": "hello"}], system="system instructions"
        )
    ]

    assert completed == "Hello"
    assert streamed == ["Hel", "lo"]
    assert len(model.invocations) == 2


@pytest.mark.asyncio
async def test_resume_and_outline_chains_return_pydantic_models() -> None:
    from app.services.outline import build_outline_chain
    from app.services.resume_parse import build_resume_chain

    model = FakeChatModel()

    resume = await build_resume_chain(model).ainvoke({"resume_text": "MiraPrep"})
    outline = await build_outline_chain(model).ainvoke(
        {"interview_data": "{}", "candidate_questions": ""}
    )

    assert isinstance(resume, ParsedResume)
    assert isinstance(outline, OutlineResult)


@pytest.mark.asyncio
async def test_interview_state_graph_has_required_nodes_and_caps_follow_up_depth() -> None:
    from app.services.interview_graph import build_interview_graph

    decision_chain = RunnableLambda(
        lambda _: AgentDecision(
            action=AgentAction.FOLLOW_UP,
            responseInstruction="继续追问",
        )
    )
    graph = build_interview_graph(decision_chain, checkpointer=MemorySaver())
    node_names = set(graph.get_graph().nodes)

    assert {
        "evaluate_answer",
        "follow_up",
        "hint",
        "redirect",
        "clarify",
        "next_question",
        "advance_phase",
        "terminate",
    } <= node_names

    result = await graph.ainvoke(
        {
            "session_id": "40",
            "phase": "SELF_INTRO",
            "questions": [],
            "current_question_index": 0,
            "follow_up_depth": 3,
            "messages": [],
            "answer": "我负责核心模块。",
        },
        config={"configurable": {"thread_id": "40"}},
    )

    assert result["route"] == "next_question"
    assert result["follow_up_depth"] == 0


@pytest.mark.asyncio
async def test_graph_checkpoint_is_visible_after_graph_reconstruction() -> None:
    from app.services.interview_graph import build_interview_graph

    saver = MemorySaver()
    decision_chain = RunnableLambda(
        lambda _: AgentDecision(
            action=AgentAction.HINT,
            responseInstruction="给出方向提示",
        )
    )
    first_graph = build_interview_graph(decision_chain, checkpointer=saver)
    config = {"configurable": {"thread_id": "restartable-40"}}
    await first_graph.ainvoke(
        {
            "session_id": "40",
            "phase": "SELF_INTRO",
            "questions": [],
            "current_question_index": 0,
            "follow_up_depth": 0,
            "messages": [{"role": "candidate", "content": "第一次回答"}],
            "answer": "第一次回答",
        },
        config=config,
    )

    restarted_graph = build_interview_graph(decision_chain, checkpointer=saver)
    checkpoint = await restarted_graph.aget_state(config)

    assert checkpoint.values["route"] == "hint"
    assert checkpoint.values["follow_up_depth"] == 1
    assert checkpoint.values["messages"][-1]["content"] == "第一次回答"


def test_redis_checkpointer_reuses_miraprep_connection_settings() -> None:
    from app.services.session_state import build_redis_checkpointer

    saver = build_redis_checkpointer(Settings(redis_host="redis.internal", redis_port=6380))
    connection = saver._redis.connection_pool.connection_kwargs

    assert isinstance(saver, AsyncRedisSaver)
    assert connection["host"] == "redis.internal"
    assert connection["port"] == 6380
    assert saver.ttl_config == {"default_ttl": 240, "refresh_on_read": True}
