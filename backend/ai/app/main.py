import logging
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from app.config import get_settings
from app.logging import configure_logging, request_id_context
from app.routers import health, internal

configure_logging()
logger = logging.getLogger("miraprep.ai")
settings = get_settings()

app = FastAPI(title="MiraPrep AI Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(internal.router)


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
