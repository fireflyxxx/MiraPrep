import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from app.clients.redis import get_redis
from app.config import get_settings
from app.logging import configure_logging, request_id_context
from app.routers import health, internal, interview_stream
from app.services.interview_agent import build_interview_event_stream_service

configure_logging()
logger = logging.getLogger("miraprep.ai")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    maintenance_service = build_interview_event_stream_service()
    maintenance_task = asyncio.create_task(_run_interview_maintenance(maintenance_service))
    grading_queue = internal.get_shared_grading_task_queue()
    await grading_queue.recover_inflight()
    grading_tasks = [
        asyncio.create_task(_run_grading_maintenance(grading_queue))
        for _ in range(settings.grading_worker_count)
    ]
    try:
        yield
    finally:
        for task in (maintenance_task, *grading_tasks):
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
        await maintenance_service.aclose()
        await grading_queue.aclose()
        await get_redis().aclose()
        get_redis.cache_clear()
        internal.get_shared_grading_task_queue.cache_clear()


async def _run_interview_maintenance(service: object) -> None:
    while True:
        try:
            await service.run_maintenance_once()  # type: ignore[attr-defined]
        except Exception:
            logger.exception("interview maintenance sweep failed")
        await asyncio.sleep(2)


async def _run_grading_maintenance(queue: object) -> None:
    while True:
        try:
            processed = await queue.run_once()  # type: ignore[attr-defined]
        except Exception:
            logger.exception("grading queue sweep failed")
            processed = False
        await asyncio.sleep(0.05 if processed else 1)


app = FastAPI(title="MiraPrep AI Service", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(internal.router)
app.include_router(interview_stream.internal_router)
app.include_router(interview_stream.router)


@app.middleware("http")
async def add_request_id_and_handle_errors(request: Request, call_next) -> Response:
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    token = request_id_context.set(request_id)
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("unhandled request error")
        response = JSONResponse(
            status_code=500,
            content={"type": "error", "payload": {"message": "internal server error"}},
        )
    finally:
        request_id_context.reset(token)
    response.headers["X-Request-ID"] = request_id
    return response
