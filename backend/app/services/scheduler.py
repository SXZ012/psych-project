"""图题配对包随机调度器（去重，保证 60s 时序内的多样性）。"""
from __future__ import annotations

import logging
import random
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.image_bank import Image, Pair

logger = logging.getLogger(__name__)


def _pair_dict(pair: Pair, image: Image) -> dict:
    return {
        "pair_id": str(pair.id),
        "image_id": str(image.id),
        "image_url": image.url,
        "oss_key": image.oss_key,
        "category": image.category,
        "question": pair.question,
        "option_a": pair.option_a,
        "option_b": pair.option_b,
    }


async def _active_pairs(db: AsyncSession) -> list[tuple[Pair, Image]]:
    stmt = select(Pair, Image).join(Image).where(Pair.active.is_(True))
    return [(r[0], r[1]) for r in (await db.execute(stmt)).all()]


async def get_next_pair(
    db: AsyncSession, exclude_ids: set[UUID] | None = None
) -> dict | None:
    """随机取一个 active 配对包（排除本批次已用过的 pair_id；全用过则复用）。"""
    exclude_ids = exclude_ids or set()
    rows = await _active_pairs(db)
    avail = [r for r in rows if r[0].id not in exclude_ids] or rows
    if not avail:
        return None
    pair, image = random.choice(avail)
    logger.info("schedule pair | pair=%s image=%s", pair.id, image.oss_key)
    return _pair_dict(pair, image)


async def get_session_pairs(db: AsyncSession, count: int = 4) -> list[dict]:
    """抽 count 张【互不重复图】的配对包，供 60s 轮播（按 image_id 去重）。"""
    rows = await _active_pairs(db)
    by_image: dict[object, list[tuple[Pair, Image]]] = {}
    for pair, image in rows:
        by_image.setdefault(image.id, []).append((pair, image))
    images = list(by_image.values())
    random.shuffle(images)
    session = [_pair_dict(*random.choice(plist)) for plist in images[:count]]
    logger.info("schedule session | count=%d", len(session))
    return session
