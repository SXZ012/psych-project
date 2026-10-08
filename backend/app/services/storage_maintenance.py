"""Retry local report publication without blocking report viewing or deleting source bytes."""

import asyncio
import logging
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.db.base import AsyncSessionLocal
from app.models.assessment import Assessment
from app.services.storage import get_storage

logger = logging.getLogger(__name__)


async def sync_local_reports(limit: int = 2) -> int:
    if settings.REPORT_STORAGE_MODE != "oss":
        return 0
    count = 0
    async with AsyncSessionLocal() as db:
        rows = (
            (
                await db.execute(
                    select(Assessment)
                    .where(
                        Assessment.report_pdf_key.startswith("/"),
                        Assessment.report_status == "ready",
                    )
                    .order_by(Assessment.updated_at)
                    .limit(limit)
                    .with_for_update(skip_locked=True)
                )
            )
            .scalars()
            .all()
        )
        for row in rows:
            path = Path(row.report_pdf_key)
            if not path.is_file():
                continue
            try:
                async with db.begin_nested():
                    key = await get_storage().publish(
                        path, f"report-pdfs/{row.id.hex}.pdf", db=db, assessment_id=row.id
                    )
                    row.report_pdf_key = key
                    count += 1
            except Exception:
                logger.exception("报告 OSS 发布暂未完成，保留本地可查版本 | id=%s", row.id)
        await db.commit()
    return count


async def storage_sync_loop() -> None:
    while True:
        await asyncio.sleep(60)
        try:
            await sync_local_reports()
        except Exception:
            logger.exception("报告存储补传失败，将在下一轮重试")
