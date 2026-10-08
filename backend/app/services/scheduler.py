"""图题配对包随机调度器（去重，保证 60s 时序内的多样性）。

支持双场景：通过 scene 参数筛选航空/社区题库，调度算法完全共用。
"""

from __future__ import annotations

import logging
import random
import unicodedata
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.image_bank import Image, Pair

logger = logging.getLogger(__name__)


def question_key(text: str) -> str:
    """Ignore typography differences when identifying duplicate prompts."""
    return "".join(
        c
        for c in unicodedata.normalize("NFKC", text).casefold()
        if not c.isspace() and not unicodedata.category(c).startswith("P")
    )


def _community_unique(rows, exclude_questions=None):
    questions = {question_key(q) for q in (exclude_questions or [])}
    images = set()
    result = []
    for pair, image in rows:
        key = question_key(pair.question)
        image_keys = {str(image.id), (image.url or "").split("?", 1)[0].split("#", 1)[0]}
        if image.oss_key:
            image_keys.add(image.oss_key)
        image_keys.discard("")
        if not key or key in questions or images.intersection(image_keys):
            continue
        questions.add(key)
        images.update(image_keys)
        result.append((pair, image))
    return result


def _pair_dict(pair: Pair, image: Image) -> dict:
    return {
        "pair_id": str(pair.id),
        "image_id": str(image.id),
        # 终端统一通过本机后端读取图片。不要把 OSS 域名直接交给 Android
        # WebView：现场设备可能只有局域网访问权限，或受 TLS/网络策略影响而
        # 无法预加载公网 OSS 图片。
        "image_url": f"/api/v1/pairs/images/{image.id}",
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
        "scene": pair.scene,
        "content_type": pair.content_type,
        "media_url": pair.media_url,
    }


async def _active_pairs(db: AsyncSession, scene: str | None = None) -> list[tuple[Pair, Image]]:
    stmt = select(Pair, Image).join(Image).where(Pair.active.is_(True), Image.active.is_(True))
    if scene:
        stmt = stmt.where(Pair.scene == scene)
    return [(r[0], r[1]) for r in (await db.execute(stmt)).all()]


async def get_next_pair(
    db: AsyncSession,
    exclude_ids: set[UUID] | None = None,
    scene: str | None = None,
) -> dict | None:
    """随机取一个 active 配对包（排除已用过的 pair_id；全用过则复用）。"""
    exclude_ids = exclude_ids or set()
    rows = await _active_pairs(db, scene=scene)
    avail = [r for r in rows if r[0].id not in exclude_ids] or rows
    if not avail:
        return None
    pair, image = random.choice(avail)
    logger.info("schedule pair | pair=%s image=%s scene=%s", pair.id, image.oss_key, pair.scene)
    return _pair_dict(pair, image)


async def get_session_pairs(
    db: AsyncSession,
    count: int = 4,
    scene: str | None = None,
    exclude_image_tags: list[str] | None = None,
    exclude_questions: list[str] | None = None,
) -> list[dict]:
    """随机抽取 count 道互不重复的题目配对包。

    Args:
        count: 题目数量；按 pair 去重，同一次正式测评的图片不重复
        scene: 场景筛选（aviation/community），None 时取全部
        exclude_image_tags: 图片 URL 包含任一标记（如文件名）即排除，
            用于保证"正式题与预训练题不重复"

    两遍抽取：第一遍优先维度多样（每维度先各取一题）；若不足 count
    （如社区题库扩容到 12+ 道后必然跨维度重复），第二遍放宽维度约束、
    仅按图片去重补足。图片仍然绝不复用；连第二遍也凑不够时宁可少返回，
    让终端明确提示素材不足，不静默降级。
    """
    rows = await _active_pairs(db, scene=scene)
    if exclude_image_tags:
        rows = [
            (pair, image)
            for pair, image in rows
            if not any(tag and tag in (image.url or "") for tag in exclude_image_tags)
        ]
    random.shuffle(rows)
    if scene == "community":
        rows = _community_unique(rows, exclude_questions)
    picked: list[tuple[Pair, Image]] = []
    used_images: set[UUID] = set()
    used_dimensions: set[str] = set()
    # 第一遍：维度 + 图片双重去重（多样性优先）
    for pair, image in rows:
        dimension_key = str(pair.dimension or pair.id)
        if image.id in used_images or dimension_key in used_dimensions:
            continue
        picked.append((pair, image))
        used_images.add(image.id)
        used_dimensions.add(dimension_key)
        if len(picked) == count:
            break
    # 第二遍：仅按图片去重补足（同一维度允许出现不同图片的题目）
    if len(picked) < count:
        for pair, image in rows:
            if image.id in used_images:
                continue
            picked.append((pair, image))
            used_images.add(image.id)
            if len(picked) == count:
                break
    session = [_pair_dict(*row) for row in picked]
    logger.info("schedule session | count=%d scene=%s", len(session), scene or "all")
    return session


async def get_pairs_by_ids(
    db: AsyncSession,
    pair_ids: list[UUID],
    scene: str | None = None,
    exclude_image_tags: list[str] | None = None,
    exclude_questions: list[str] | None = None,
) -> list[dict]:
    """按会话已固定的顺序恢复题组，刷新终端不会重新随机。"""
    if not pair_ids:
        return []
    rows = await _active_pairs(db, scene=scene)
    by_id = {pair.id: (pair, image) for pair, image in rows}
    ordered = [by_id[pair_id] for pair_id in pair_ids if pair_id in by_id]
    if scene == "community":
        ordered = [
            (p, i)
            for p, i in ordered
            if not any(tag and tag in (i.url or "") for tag in (exclude_image_tags or []))
        ]
        ordered = _community_unique(ordered, exclude_questions)
    return [_pair_dict(*row) for row in ordered]


async def get_aviation_pool(
    db: AsyncSession, count: int = 24, exclude_pair_ids: set[UUID] | None = None
) -> list[dict]:
    """航空自定节奏题池（60 秒固定时长、不固定题数专用）。

    与 get_session_pairs 的关键差异：按 pair 去重（不按维度去重）——
    同一维度下的多道不同题目都可以进入同一会话，因此能返回足量题目
    （题库 40 题时最多 40 题）。图片优先不重复：先取图片未用过的题，
    不足 count 再用图片复用的题补足（补足部分在返回里可通过 image 重复
    观察，供终端审计记录），绝不为凑数重复 pair 或伪造题目。

    社区 /pairs/session 的"图片+维度去重"规则不受本函数影响。
    """
    rows = await _active_pairs(db, scene="aviation")
    exclude_pair_ids = exclude_pair_ids or set()
    available = [(p, i) for p, i in rows if p.id not in exclude_pair_ids]
    random.shuffle(available)
    picked: list[tuple[Pair, Image]] = []
    used_images: set[UUID] = set()
    reused: list[tuple[Pair, Image]] = []
    for pair, image in available:
        if len(picked) >= count:
            break
        if image.id not in used_images:
            picked.append((pair, image))
            used_images.add(image.id)
        else:
            reused.append((pair, image))
    # 图片唯一池不足 count：用图片复用的题补足（题目本身仍互不重复）
    for row in reused:
        if len(picked) >= count:
            break
        picked.append(row)
    session = [_pair_dict(*row) for row in picked]
    logger.info(
        "schedule aviation pool | picked=%d image_unique=%d scene=aviation",
        len(session),
        len(used_images),
    )
    return session
