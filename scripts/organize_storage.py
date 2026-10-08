"""Inventory or migrate existing business files, without deleting sources or creating assessments.

Run from the project root with the backend Python runtime:
  python scripts/organize_storage.py                # read-only inventory
  python scripts/organize_storage.py --apply        # backup, verify, publish, update references
  python scripts/organize_storage.py --backup-only  # verified private database archive
"""

import argparse
import asyncio
import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import func, select  # noqa: E402

import app.models  # noqa: E402, F401 -- register all ORM models
from app.core.config import settings  # noqa: E402
from app.db.base import AsyncSessionLocal, Base, engine  # noqa: E402
from app.models.assessment import Assessment  # noqa: E402
from app.models.image_bank import Image, Pair  # noqa: E402
from app.models.storage import StoredAsset  # noqa: E402
from app.services.content import publish_bundled_content  # noqa: E402
from app.services.database_backup import create_database_backup  # noqa: E402
from app.services.oss.client import OSSClient  # noqa: E402
from app.services.storage import OssStorage, record_asset  # noqa: E402
from app.services.v3.assets import find_cached_au_image  # noqa: E402


def checked_local(path: str | Path) -> Path:
    resolved = Path(path).resolve()
    if not resolved.is_relative_to(ROOT.resolve()) or not resolved.is_file():
        raise ValueError("迁移源文件不存在或不在项目目录内")
    return resolved


async def backup(*, publish: bool = True) -> None:
    stamp = datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y%m%d-%H%M%S")
    path = await asyncio.to_thread(
        create_database_backup, ROOT / "data" / "backups" / f"psych-{stamp}.dump"
    )
    if not publish:
        print("Database backup: archive verified and retained locally", flush=True)
        return
    async with AsyncSessionLocal() as db:
        await OssStorage().publish(
            path,
            f"database-backups/psych-{stamp}.dump",
            db=db,
            category="database_backup",
            content_type="application/octet-stream",
        )
        await db.commit()
    print("Database backup: archive verified and privately published", flush=True)


def verify_public(asset: dict) -> dict:
    key = asset["key"]
    if not key.startswith("static-assets/"):
        raise ValueError("公共素材路径不合法")
    client = OSSClient(
        settings.static_asset_access_key_id,
        settings.static_asset_access_key_secret,
        settings.static_asset_endpoint,
        settings.static_asset_bucket_name,
    )
    bucket = client._ensure()
    if not bucket.object_exists(key):
        source = checked_local(ROOT / asset["source"])
        bucket.put_object_from_file(
            key,
            str(source),
            headers={
                "Content-Type": asset["content_type"],
                "x-oss-object-acl": "public-read",
                "Cache-Control": "public, max-age=86400",
            },
        )
    head = bucket.head_object(key)
    if head.content_length != asset["size"]:
        raise ValueError("公共素材大小不匹配")
    remote = bucket.get_object(key)
    digest = hashlib.sha256()
    try:
        while chunk := remote.read(1024 * 1024):
            digest.update(chunk)
    finally:
        remote.close()
    if digest.hexdigest() != asset["sha256"]:
        raise ValueError("公共素材内容不匹配")
    return dict(
        object_key=key,
        bucket=client.bucket_name,
        category="public_media",
        visibility="public",
        content_type=asset["content_type"],
        size_bytes=asset["size"],
        sha256=asset["sha256"],
        source=asset["source"],
    )


async def public_media() -> None:
    assets = json.loads((ROOT / "static-assets-manifest.json").read_text())["assets"]
    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [loop.run_in_executor(pool, verify_public, asset) for asset in assets]
        for index, future in enumerate(asyncio.as_completed(futures), 1):
            values = await future
            async with AsyncSessionLocal() as db:
                await record_asset(db, **values)
                await db.commit()
            if index % 25 == 0 or index == len(assets):
                print(f"Public media verified: {index}/{len(assets)}", flush=True)


async def question_images() -> None:
    async with AsyncSessionLocal() as db:
        images = (
            (await db.execute(select(Image).join(Pair).where(Pair.active).distinct()))
            .scalars()
            .all()
        )
        client = OSSClient()
        repaired = 0
        for image in images:
            parsed = urlparse(image.url)
            path = unquote(parsed.path)
            if path.startswith("/static/assets/community/"):
                actual_key = "static-assets/community/" + path.removeprefix(
                    "/static/assets/community/"
                )
            elif path.startswith("/static/assets/"):
                actual_key = "static-assets/assets/" + path.removeprefix("/static/assets/")
            elif parsed.hostname == f"{client.bucket_name}.{client.endpoint}":
                actual_key = path.lstrip("/")
            else:
                raise ValueError("题库图片地址不属于已配置的 OSS 或本地素材映射")
            existing = await db.get(StoredAsset, actual_key)
            bucket = client._ensure()
            if existing is None:
                remote = await asyncio.to_thread(bucket.get_object, actual_key)
                digest = hashlib.sha256()
                size = 0
                try:
                    while chunk := await asyncio.to_thread(remote.read, 1024 * 1024):
                        digest.update(chunk)
                        size += len(chunk)
                    content_type = remote.headers.get("Content-Type", "image/jpeg")
                finally:
                    remote.close()
                await record_asset(
                    db,
                    object_key=actual_key,
                    bucket=client.bucket_name,
                    category="question_image",
                    visibility="public",
                    content_type=content_type,
                    size_bytes=size,
                    sha256=digest.hexdigest(),
                )
            if image.oss_key != actual_key:
                collision = await db.scalar(
                    select(Image.id).where(Image.oss_key == actual_key, Image.id != image.id)
                )
                if collision is None:
                    image.oss_key = actual_key
                    repaired += 1
        await db.commit()
    print(
        f"Question images verified: {len(images)}, corrected storage keys: {repaired}", flush=True
    )


async def reports_and_attachments() -> None:
    async with AsyncSessionLocal() as db:
        ids = (await db.scalars(select(Assessment.id))).all()
    pdfs = attachments = videos = missing_videos = 0
    for index, assessment_id in enumerate(ids, 1):
        async with AsyncSessionLocal() as db:
            row = await db.get(Assessment, assessment_id, with_for_update=True)
            if row.report_pdf_key and Path(row.report_pdf_key).is_absolute():
                path = checked_local(row.report_pdf_key)
                row.report_pdf_key = await OssStorage().publish(
                    path,
                    f"report-pdfs/{row.id.hex}.pdf",
                    db=db,
                    assessment_id=row.id,
                )
                pdfs += 1
            cached = find_cached_au_image(row.id)
            if cached:
                path, content_type = cached
                await OssStorage().publish(
                    checked_local(path),
                    f"report-assets/au/{row.id.hex}{path.suffix}",
                    db=db,
                    category="au_image",
                    assessment_id=row.id,
                    content_type=content_type,
                )
                attachments += 1
            if row.video_storage_key and row.backup_status != "completed":
                path = (ROOT / "data" / row.video_storage_key).resolve()
                if path.is_file():
                    content_type = "video/mp4" if path.suffix == ".mp4" else "video/webm"
                    row.backup_storage_key = await OssStorage().publish(
                        checked_local(path),
                        f"assessment-videos/{settings.ENV}/{row.id.hex}{path.suffix}",
                        db=db,
                        category="video",
                        assessment_id=row.id,
                        content_type=content_type,
                    )
                    row.backup_status = "completed"
                    videos += 1
                else:
                    missing_videos += 1
            await db.commit()
        if index % 25 == 0 or index == len(ids):
            print(
                f"Private files migrated: PDFs={pdfs}, AU={attachments}, videos={videos}",
                flush=True,
            )
    print(f"Private migration complete: PDFs={pdfs}, AU={attachments}, videos={videos}", flush=True)
    print(
        f"Historical video references with no local source (unchanged): {missing_videos}",
        flush=True,
    )


async def main(args) -> None:
    async with AsyncSessionLocal() as db:
        counts = (
            await db.execute(select(Assessment.scene, func.count()).group_by(Assessment.scene))
        ).all()
        pdfs = await db.scalar(
            select(func.count())
            .select_from(Assessment)
            .where(Assessment.report_pdf_key.startswith("/"))
        )
    print("Inventory:", dict(counts), "local PDF references:", pdfs, flush=True)
    if not (args.apply or args.backup_only or args.public_only or args.local_backup):
        return
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    if args.local_backup:
        await backup(publish=False)
        return
    if args.public_only:
        async with AsyncSessionLocal() as db:
            await publish_bundled_content(db, replace=True)
            await db.commit()
        await public_media()
        await question_images()
        return
    await backup()
    if args.backup_only:
        return
    async with AsyncSessionLocal() as db:
        revision = await publish_bundled_content(db, replace=True)
        await db.commit()
        print(
            "Content stored:",
            len(revision.payload["scales"]),
            "scales,",
            len(revision.payload["officialResources"]),
            "articles",
            flush=True,
        )
    await public_media()
    await question_images()
    await reports_and_attachments()


async def entry(args):
    try:
        await main(args)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup-only", action="store_true")
    parser.add_argument("--public-only", action="store_true")
    parser.add_argument("--local-backup", action="store_true")
    asyncio.run(entry(parser.parse_args()))
