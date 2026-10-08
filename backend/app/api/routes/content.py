"""Public, non-personal content; assessment results remain on authorized endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.models.storage import ContentVersion

router = APIRouter(prefix="/api/v1/content", tags=["content"])


@router.get("/community-library")
async def library(response: Response, db: AsyncSession = Depends(get_db)) -> dict:  # noqa: B008
    current = (
        await db.execute(
            select(ContentVersion).where(
                ContentVersion.name == "community-library", ContentVersion.active
            )
        )
    ).scalar_one_or_none()
    if current is None:
        raise HTTPException(503, "内容正在准备，暂使用终端自带版本")
    response.headers["Cache-Control"] = "public, max-age=300"
    response.headers["ETag"] = f'"{current.version}"'
    return {"version": current.version, "payload": current.payload}
