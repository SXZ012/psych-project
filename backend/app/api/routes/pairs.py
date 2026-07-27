"""图题配对包调度接口。"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import get_db
from app.services.scheduler import get_next_pair, get_session_pairs

router = APIRouter()


@router.get("/next")
async def next_pair(
    db: Annotated[AsyncSession, Depends(get_db)],
    used: str | None = Query(
        default=None, description="已用过的 pair_id，逗号分隔，用于去重"
    ),
) -> dict:
    exclude: set[UUID] = set()
    for part in (used or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            exclude.add(UUID(part))
        except ValueError:
            continue  # 忽略非法 id
    pair = await get_next_pair(db, exclude_ids=exclude)
    if pair is None:
        return {"detail": "no pairs available"}
    return pair


@router.get("/session")
async def session_pairs(
    db: Annotated[AsyncSession, Depends(get_db)],
    count: int = Query(
        default=settings.SESSION_PAIR_COUNT, ge=1, le=20, description="轮播图片数"
    ),
) -> dict:
    """一次返回 count 张互不重复图的配对包，供前端 60s 轮播。"""
    pairs = await get_session_pairs(db, count=count)
    return {"count": len(pairs), "pairs": pairs}
