"""Verified private file storage, separate from public static assets and video retention."""

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.storage import StoredAsset


async def record_asset(db: AsyncSession, **values) -> None:
    values["verified_at"] = datetime.now(timezone.utc)
    stmt = insert(StoredAsset).values(**values)
    await db.execute(
        stmt.on_conflict_do_update(index_elements=[StoredAsset.object_key], set_=values)
    )


class StorageProvider:
    name = "base"

    async def publish(self, local_path: Path, key: str, **kwargs) -> str | None:
        raise NotImplementedError


class LocalStorage(StorageProvider):
    name = "local"

    async def publish(self, local_path: Path, key: str, **kwargs) -> str | None:
        return None


class OssStorage(StorageProvider):
    name = "oss"

    async def publish(
        self,
        local_path: Path,
        key: str,
        *,
        db: AsyncSession | None = None,
        category: str = "report_pdf",
        assessment_id: UUID | None = None,
        content_type: str = "application/pdf",
    ) -> str:
        from app.services.oss.client import OSSClient, file_sha256

        digest = await asyncio.to_thread(file_sha256, local_path)
        original = Path(key)
        versioned = f"{original.with_suffix('').as_posix()}/{digest}{original.suffix}"
        info = await asyncio.to_thread(
            OSSClient().upload_private_file, local_path, versioned, content_type
        )
        if db is not None:
            await record_asset(
                db,
                object_key=versioned,
                bucket=info["bucket"],
                category=category,
                visibility="private",
                content_type=content_type,
                size_bytes=info["size"],
                sha256=info["sha256"],
                assessment_id=assessment_id,
            )
        return versioned


def get_storage() -> StorageProvider:
    return OssStorage() if settings.REPORT_STORAGE_MODE == "oss" else LocalStorage()
