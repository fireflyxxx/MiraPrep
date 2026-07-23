import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.clients.business import BusinessCallbackClient
from app.clients.llm import LlmClient
from app.config import Settings, get_settings
from app.deps import require_internal_token
from app.schemas.outline import OutlineAcceptedResponse, OutlineRequest
from app.schemas.resume import ResumeParseAcceptedResponse, ResumeParseRequest
from app.services.outline import OutlineGenerationService
from app.services.resume_parse import ResumeParseService

router = APIRouter(
    prefix="/internal", tags=["internal"], dependencies=[Depends(require_internal_token)]
)

logger = logging.getLogger("miraprep.ai.internal")


def _build_service(settings: Settings) -> ResumeParseService:
    """工厂：组装 LlmClient + BusinessCallbackClient + service。

    生产环境用真客户端；测试通过 FastAPI 的 dependency_overrides 替换。
    """

    # 简历解析是固定 schema 的信息抽取，不需要推理过程；同时避免思考模式
    # 与 LangChain 强制结构化工具调用的 tool_choice 冲突。
    llm = LlmClient(settings, thinking={"type": "disabled"})
    callback = BusinessCallbackClient(settings)
    return ResumeParseService(llm=llm, callback=callback)


def get_resume_parse_service(
    settings: Settings = Depends(get_settings),
) -> ResumeParseService:
    """FastAPI 依赖：返回一次解析任务专用的 service 实例。"""

    return _build_service(settings)


def _build_outline_service(settings: Settings) -> OutlineGenerationService:
    """组装一次大纲生成任务专用的外部客户端。"""

    # LangChain 的结构化输出通过工具调用约束 JSON；Anthropic 思考模式不支持
    # 强制 tool_choice，因此大纲抽取与简历解析一样显式关闭思考模式。
    llm = LlmClient(settings, thinking={"type": "disabled"})
    callback = BusinessCallbackClient(settings)
    return OutlineGenerationService(llm=llm, callback=callback)


def get_outline_service(
    settings: Settings = Depends(get_settings),
) -> OutlineGenerationService:
    return _build_outline_service(settings)


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"status": "UP"}


@router.post(
    "/resumes/parse",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ResumeParseAcceptedResponse,
)
async def parse_resume(
    body: ResumeParseRequest,
    background_tasks: BackgroundTasks,
    service: ResumeParseService = Depends(get_resume_parse_service),
) -> ResumeParseAcceptedResponse:
    """触发简历解析。立即 202 返回，后台异步跑；结果通过回调发回 Spring Boot。"""

    # 由 FastAPI 持有任务直至执行完成，避免裸 asyncio task 失去强引用。
    background_tasks.add_task(
        service.parse_resume,
        resume_id=body.resumeId,
        signed_url=body.signedUrl,
        file_name=body.fileName,
        mime_type=body.mimeType,
    )
    return ResumeParseAcceptedResponse(accepted=True)


@router.post(
    "/interviews/{session_id}/outline",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=OutlineAcceptedResponse,
)
async def generate_outline(
    session_id: int,
    body: OutlineRequest,
    background_tasks: BackgroundTasks,
    service: OutlineGenerationService = Depends(get_outline_service),
) -> OutlineAcceptedResponse:
    """立即接受大纲任务，生成结果通过内部回调交还业务服务。"""

    if session_id != body.sessionId:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="path session id must match body sessionId",
        )
    background_tasks.add_task(service.generate_outline, body)
    return OutlineAcceptedResponse(accepted=True)
