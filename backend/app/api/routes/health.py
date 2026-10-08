"""健康检查接口。"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import get_db

router = APIRouter()


@router.get("/health")
async def health(db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    payload: dict = {
        "status": "ok",
        "env": settings.ENV,
        "provider_mode": settings.PROVIDER_MODE,
    }
    try:
        await db.execute(text("SELECT 1"))
        payload["db"] = "ok"
    except Exception as e:  # noqa: BLE001 - 健康检查不应因 DB 报错而 500
        payload["status"] = "degraded"
        payload["db"] = f"error: {type(e).__name__}"
    return payload
