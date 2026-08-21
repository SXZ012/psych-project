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
        "dimension": pair.dimension,
        "scenario": pair.scenario,
        "audio_url": pair.audio_url,
        "content_version": pair.content_version,
        "source_note": pair.source_note,
        "scoring_mode": pair.scoring_mode,
    }


async def _active_pairs(db: AsyncSession) -> list[tuple[Pair, Image]]:
    stmt = (
        select(Pair, Image)
        .join(Image)
        .where(Pair.active.is_(True), Image.active.is_(True))
    )
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
    # 优先跨维度抽取，使单次会话不会被同一类航空情境占满；题库不足时再随机补齐。
    dimension_groups: dict[str, list[list[tuple[Pair, Image]]]] = {}
    for plist in by_image.values():
        dimension = next((p.dimension for p, _ in plist if p.dimension), "unclassified")
        dimension_groups.setdefault(dimension, []).append(plist)
    dimensions = list(dimension_groups)
    random.shuffle(dimensions)
    selected: list[list[tuple[Pair, Image]]] = []
    while dimensions and len(selected) < count:
        remaining: list[str] = []
        for dimension in dimensions:
            group = dimension_groups[dimension]
            if group:
                selected.append(group.pop(random.randrange(len(group))))
            if group:
                remaining.append(dimension)
            if len(selected) >= count:
                break
        dimensions = remaining
    session = [_pair_dict(*random.choice(plist)) for plist in selected]
    logger.info("schedule session | count=%d", len(session))
    return session
