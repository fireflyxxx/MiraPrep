import logging

from fastapi import APIRouter, BackgroundTasks, Depends, status

from app.clients.business import BusinessCallbackClient
from app.clients.llm import LlmClient
from app.config import Settings, get_settings
from app.deps import require_internal_token
from app.schemas.resume import ResumeParseAcceptedResponse, ResumeParseRequest
from app.services.resume_parse import ResumeParseService

router = APIRouter(
    prefix="/internal", tags=["internal"], dependencies=[Depends(require_internal_token)]
)

logger = logging.getLogger("miraprep.ai.internal")


def _build_service(settings: Settings) -> ResumeParseService:
    """工厂：组装 LlmClient + BusinessCallbackClient + service。

    生产环境用真客户端；测试通过 FastAPI 的 dependency_overrides 替换。
    """

    llm = LlmClient(settings)
    callback = BusinessCallbackClient(settings)
    return ResumeParseService(llm=llm, callback=callback)


def get_resume_parse_service(
    settings: Settings = Depends(get_settings),
) -> ResumeParseService:
    """FastAPI 依赖：返回一次解析任务专用的 service 实例。"""

    return _build_service(settings)


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
