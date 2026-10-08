"""图题配对包调度接口（支持双场景筛选）。"""

import json
from pathlib import Path
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import get_db
from app.models.community import AssessmentSession
from app.models.image_bank import Image
from app.services.scheduler import (
    get_aviation_pool,
    get_next_pair,
    get_pairs_by_ids,
    get_session_pairs,
)

router = APIRouter()

VALID_SCENES = ("aviation", "community")
DEFAULT_SCENE = "aviation"  # 不传 scene 视为航空终端，社区必须显式声明
MAX_IMAGE_BYTES = 10 * 1024 * 1024

_STATIC_DIR = Path(__file__).resolve().parents[2] / "static"
_COMMUNITY_ASSETS_DIR = Path(__file__).resolve().parents[4] / "community-assets"
_STATIC_MEDIA_TYPES = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}
_CDN_IMAGE_SUFFIXES = {".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"}
_PRACTICE_FILES = ("38239121.jpg", "5392095.jpg", "37443455.jpg")


async def _temporary_oss_image(path: str) -> Response:
    """Read cloud media without creating a server or browser disk cache."""
    base = settings.static_asset_base_url
    if not base or not path.startswith("/static/assets/community/"):
        raise HTTPException(503, "社区云端题库尚未配置，请联系工作人员")
    key = "static-assets/community/" + path.removeprefix("/static/assets/community/")
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            async with client.stream("GET", f"{base}/{key}") as upstream:
                upstream.raise_for_status()
                content_type = upstream.headers.get("content-type", "").split(";", 1)[0]
                if not content_type.startswith("image/"):
                    raise HTTPException(502, "云端题库图片格式异常")
                data = bytearray()
                async for chunk in upstream.aiter_bytes():
                    if len(data) + len(chunk) > MAX_IMAGE_BYTES:
                        raise HTTPException(502, "云端题库图片过大")
                    data.extend(chunk)
    except httpx.HTTPError as exc:
        raise HTTPException(502, "云端题库图片暂时不可用，请重新准备") from exc
    return Response(
        bytes(data),
        media_type=content_type,
        headers={"Cache-Control": "no-store", "X-Asset-Source": "oss"},
    )


@router.get("/practice-images/{index}")
async def practice_image(index: int) -> Response:
    if not 0 <= index < len(_PRACTICE_FILES):
        raise HTTPException(404, "预训练图片不存在")
    return await _temporary_oss_image("/static/assets/community/ux/" + _PRACTICE_FILES[index])


def _validate_scene(scene: str) -> str:
    if scene not in VALID_SCENES:
        raise HTTPException(status_code=422, detail=f"非法场景: {scene}，仅支持 aviation/community")
    return scene


def _serve_local_static(image_url: str) -> FileResponse | None:
    """url 指向本服务 /static/ 下本地文件时直接读盘返回(社区占位图等本地资产)。"""
    if not image_url.startswith("/static/"):
        return None
    rel = image_url.removeprefix("/static/")
    if rel.startswith("assets/community/"):
        path = (_COMMUNITY_ASSETS_DIR / rel.removeprefix("assets/community/")).resolve()
        base_dir = _COMMUNITY_ASSETS_DIR.resolve()
    else:
        path = (_STATIC_DIR / rel).resolve()
        base_dir = _STATIC_DIR.resolve()
    if base_dir not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="题库图片文件不存在")
    return FileResponse(
        path,
        media_type=_STATIC_MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/images/{image_id}")
async def terminal_image(
    image_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    temporary: bool = Query(default=False),
) -> Response:
    """将已登记的题库图片转发给终端，避免设备直接依赖公网 OSS。"""
    image = (
        await db.execute(select(Image).where(Image.id == image_id, Image.active.is_(True)))
    ).scalar_one_or_none()
    if image is None:
        raise HTTPException(status_code=404, detail="题库图片不存在或已停用")

    if temporary:
        return await _temporary_oss_image(image.url)

    cdn_base = settings.static_asset_base_url
    asset_url, _, asset_query = image.url.partition("?")
    if (
        cdn_base
        and asset_url.startswith("/static/assets/")
        and Path(asset_url).suffix.lower() in _CDN_IMAGE_SUFFIXES
    ):
        if asset_url.startswith("/static/assets/community/"):
            object_path = "static-assets/community/" + asset_url.removeprefix(
                "/static/assets/community/"
            )
        else:
            object_path = "static-assets/assets/" + asset_url.removeprefix("/static/assets/")
        target = f"{cdn_base}/{object_path}"
        if asset_query:
            target = f"{target}?{asset_query}"
        return RedirectResponse(
            target,
            status_code=307,
            headers={"Cache-Control": "public, max-age=300"},
        )

    local = _serve_local_static(image.url)
    if local is not None:
        return local

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
            upstream = await client.get(image.url)
            upstream.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="题库图片暂时不可用") from exc

    content_type = upstream.headers.get("content-type", "").split(";", 1)[0]
    if not content_type.startswith("image/") or len(upstream.content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=502, detail="题库图片格式异常")
    return Response(
        content=upstream.content,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/next")
async def next_pair(
    db: Annotated[AsyncSession, Depends(get_db)],
    used: str | None = Query(default=None, description="已用过的 pair_id，逗号分隔，用于去重"),
    scene: str = Query(
        default=DEFAULT_SCENE, description="场景筛选(aviation/community)，默认 aviation"
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
    scene = _validate_scene(scene)
    pair = await get_next_pair(db, exclude_ids=exclude, scene=scene)
    if pair is None:
        return {"detail": "no pairs available"}
    return pair


@router.get("/session")
async def session_pairs(
    db: Annotated[AsyncSession, Depends(get_db)],
    count: int = Query(default=settings.SESSION_PAIR_COUNT, ge=1, le=40, description="轮播图片数"),
    scene: str = Query(
        default=DEFAULT_SCENE, description="场景筛选(aviation/community)，默认 aviation"
    ),
    session_id: str | None = Query(default=None, description="社区支付会话；用于固定本次题组"),
    exclude_images: str | None = Query(
        default=None, description="逗号分隔的图片 URL 标记（如文件名），命中的图片不进入题组"
    ),
    exclude_questions: Annotated[
        list[str] | None, Query(description="预训练题干；正式题按内容去重排除")
    ] = None,
) -> dict:
    """一次返回 count 张互不重复图的配对包，供前端自定节奏出题。按 scene 筛选题库。"""
    scene = _validate_scene(scene)
    exclude_tags = [t.strip() for t in (exclude_images or "").split(",") if t.strip()]
    if scene == "community" and session_id:
        try:
            parsed_session_id = UUID(session_id)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="社区题组缺少有效 session_id") from exc
        session = await db.get(AssessmentSession, parsed_session_id)
        if session is None or session.scene != "community":
            raise HTTPException(status_code=404, detail="社区测评会话不存在")
        if session.selected_pair_ids:
            try:
                fixed_ids = [UUID(value) for value in json.loads(session.selected_pair_ids)]
            except (ValueError, TypeError, json.JSONDecodeError):
                fixed_ids = []
            pairs = await get_pairs_by_ids(
                db,
                fixed_ids,
                scene=scene,
                exclude_image_tags=exclude_tags,
                exclude_questions=exclude_questions,
            )
        else:
            pairs = await get_session_pairs(
                db,
                count=count,
                scene=scene,
                exclude_image_tags=exclude_tags,
                exclude_questions=exclude_questions,
            )
            if pairs:
                session.selected_pair_ids = json.dumps([pair["pair_id"] for pair in pairs])
                await db.commit()
    else:
        # 航空维持原接口；社区无 session_id 仅供后台预览/测试，终端始终传支付会话。
        pairs = await get_session_pairs(
            db,
            count=count,
            scene=scene,
            exclude_image_tags=exclude_tags,
            exclude_questions=exclude_questions,
        )
    return {"count": len(pairs), "pairs": pairs}


@router.get("/aviation/pool")
async def aviation_pool(
    db: Annotated[AsyncSession, Depends(get_db)],
    count: int = Query(default=24, ge=1, le=40, description="题池上限（自定节奏，按 pair 去重）"),
) -> dict:
    """航空自定节奏题池：60 秒固定时长、不固定题数。

    返回最多 count 道互不重复的航空题目（按 pair 去重，不按维度去重），
    供终端自定节奏连续出题与题池耗尽兜底。社区取题规则不受影响。
    """
    pairs = await get_aviation_pool(db, count=count)
    return {"count": len(pairs), "pairs": pairs}
