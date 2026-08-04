"""T-112/T-113 bidirectional interview voice WebSocket."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, WebSocket

from app.clients.business import BusinessCallbackClient
from app.clients.llm import LlmClient
from app.clients.redis import get_redis
from app.config import get_settings
from app.services.interview_agent import (
    BusinessGradingTrigger,
    BusinessMessageSink,
    BusinessQuestionSink,
    InterviewAgentService,
)
from app.services.interview_ws import VoiceInterviewRuntime
from app.services.asr.base import SpeechProviderConfigurationError
from app.services.session_state import RedisSessionStateStore, get_interview_checkpointer
from app.services.speech import build_asr_provider, build_tts_provider

router = APIRouter(tags=["interview-runtime"])
SessionId = Annotated[int, Path(gt=0)]


def build_voice_runtime() -> VoiceInterviewRuntime:
    settings = get_settings()
    store = RedisSessionStateStore(get_redis())
    callback = BusinessCallbackClient(settings)
    agent = InterviewAgentService(
        store=store,
        llm=LlmClient(settings, thinking={"type": "disabled"}),
        message_sink=BusinessMessageSink(callback),
        grading_trigger=BusinessGradingTrigger(callback),
        question_sink=BusinessQuestionSink(callback),
        checkpointer=get_interview_checkpointer(),
        tts=build_tts_provider(settings),
    )
    return VoiceInterviewRuntime(store=store, agent=agent, asr=build_asr_provider(settings))


@router.websocket("/ws/interview/{session_id}")
async def interview_voice_websocket(
    websocket: WebSocket,
    session_id: SessionId,
    access_token: str = Query(alias="accessToken", min_length=32, max_length=256),
    after_seq: int = Query(default=0, alias="afterSeq", ge=0),
    voice: bool = Query(default=True),
) -> None:
    try:
        runtime = build_voice_runtime()
        await runtime.run(
            websocket,
            session_id=session_id,
            access_token=access_token,
            after_seq=after_seq,
            voice_enabled=voice,
        )
    except SpeechProviderConfigurationError:
        await websocket.close(code=1013, reason="speech provider is not configured")
    except Exception:
        # The runtime emits protocol-level errors after acceptance. Pre-accept auth,
        # replay, and provider failures use an application close code.
        await websocket.close(code=4403)
