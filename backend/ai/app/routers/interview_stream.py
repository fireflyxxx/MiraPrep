"""T-040 面试文字流 API。"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, status
from fastapi.responses import StreamingResponse

from app.deps import require_internal_token
from app.schemas.interview import AcceptedResponse, InterviewAnswerRequest, InterviewStartRequest
from app.services.interview_agent import (
    QuestionMismatchError,
    RuntimeAuthorizationError,
    SessionEndingError,
)
from app.services.session_state import ReplayGapError, SessionNotFoundError

router = APIRouter(tags=["interview-runtime"])
internal_router = APIRouter(
    prefix="/internal", dependencies=[Depends(require_internal_token)], tags=["internal"]
)
SessionId = Annotated[int, Path(gt=0)]


def build_interview_service() -> Any:
    """延迟组装运行时服务，避免模块导入时就连接外部资源。"""

    from app.services.interview_agent import build_interview_agent_service

    return build_interview_agent_service()


def build_interview_stream_service() -> Any:
    """SSE 连接不创建未使用的 Anthropic 客户端。"""

    from app.services.interview_agent import build_interview_event_stream_service

    return build_interview_event_stream_service()


@internal_router.post(
    "/interviews/{session_id}/start",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=AcceptedResponse,
)
async def start_interview(
    session_id: SessionId,
    body: InterviewStartRequest,
) -> AcceptedResponse:
    service = build_interview_service()
    await _invoke(service, "start", session_id, body)
    return AcceptedResponse()


@router.post(
    "/interviews/{session_id}/answer",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=AcceptedResponse,
)
async def submit_answer(
    session_id: SessionId,
    body: InterviewAnswerRequest,
    authorization: str | None = Header(default=None),
) -> AcceptedResponse:
    service = build_interview_service()
    await _authorize(service, session_id, authorization)
    await _invoke(service, "answer", session_id, body)
    return AcceptedResponse()


@router.get("/interviews/{session_id}/stream")
async def stream_interview(
    session_id: SessionId,
    after_seq: int = Query(default=0, ge=0, alias="afterSeq"),
    last_event_id: int | None = Header(default=None, alias="Last-Event-ID"),
    authorization: str | None = Header(default=None),
) -> StreamingResponse:
    service = build_interview_stream_service()
    await _authorize(service, session_id, authorization)
    ensure_session = getattr(service, "ensure_session", None)
    if ensure_session is not None:
        try:
            await ensure_session(session_id)
        except SessionNotFoundError as exc:
            await _close_service(service)
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    resume_after = last_event_id if last_event_id is not None else after_seq
    ensure_replay = getattr(service, "ensure_replay", None)
    if ensure_replay is not None:
        try:
            await ensure_replay(session_id, resume_after)
        except ReplayGapError as exc:
            await _close_service(service)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return StreamingResponse(
        service.stream_events(session_id, resume_after),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post(
    "/interviews/{session_id}/end",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=AcceptedResponse,
)
async def end_interview(
    session_id: SessionId, authorization: str | None = Header(default=None)
) -> AcceptedResponse:
    service = build_interview_service()
    await _authorize(service, session_id, authorization)
    await _invoke(service, "end", session_id, "manual")
    return AcceptedResponse()


async def _invoke(service: Any, method: str, *args: Any) -> None:
    try:
        await getattr(service, method)(*args)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (QuestionMismatchError, SessionEndingError, TimeoutError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    finally:
        await _close_service(service)


async def _close_service(service: Any) -> None:
    close = getattr(service, "aclose", None)
    if close is not None:
        await close()


async def _authorize(service: Any, session_id: int, authorization: str | None) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        await _close_service(service)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing interview runtime token",
        )
    authorize = getattr(service, "authorize", None)
    if authorize is None:
        return
    try:
        await authorize(session_id, authorization.removeprefix("Bearer ").strip())
    except SessionNotFoundError as exc:
        await _close_service(service)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RuntimeAuthorizationError as exc:
        await _close_service(service)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
