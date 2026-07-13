from fastapi import APIRouter, Depends

from app.deps import require_internal_token

router = APIRouter(
    prefix="/internal", tags=["internal"], dependencies=[Depends(require_internal_token)]
)


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"status": "UP"}
