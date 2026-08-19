"""持久化合作方报告附件，避免短期签名 URL 过期。"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any
from uuid import UUID

from app.core.config import _REPO_ROOT

logger = logging.getLogger(__name__)

_CONTENT_SUFFIX = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def au_asset_dir() -> Path:
    return _REPO_ROOT / "data" / "report-assets" / "au"


def find_cached_au_image(assessment_id: UUID) -> tuple[Path, str] | None:
    root = au_asset_dir()
    for content_type, suffix in _CONTENT_SUFFIX.items():
        candidate = root / f"{assessment_id}{suffix}"
        if candidate.is_file():
            return candidate, content_type
    return None


async def cache_au_image(
    summary: dict[str, Any], assessment_id: UUID, provider: object
) -> tuple[Path, str] | None:
    """下载并缓存 AU 标注图；Mock 的 data URL 无需落盘。"""
    cached = find_cached_au_image(assessment_id)
    if cached:
        return cached

    visual = (((summary.get("modules") or {}).get("au") or {}).get("visualization") or {})
    if not isinstance(visual, dict):
        return None
    image_url = visual.get("image_url")
    if isinstance(image_url, str) and image_url.startswith("data:"):
        return None

    download_image = getattr(provider, "download_image", None)
    if download_image is None:
        return None

    file_id = visual.get("image_url_file_id")
    if file_id is not None:
        get_file_url = getattr(provider, "get_file_url", None)
        if get_file_url is not None:
            image_url = await get_file_url(int(file_id))
    if not image_url:
        return None

    data, content_type = await download_image(str(image_url))
    suffix = _CONTENT_SUFFIX.get(content_type)
    if suffix is None:
        return None
    root = au_asset_dir()
    await asyncio.to_thread(root.mkdir, parents=True, exist_ok=True)
    target = root / f"{assessment_id}{suffix}"
    await asyncio.to_thread(target.write_bytes, data)
    logger.info("assessment %s AU图片已本地持久化: %s", assessment_id, target.name)
    return target, content_type
