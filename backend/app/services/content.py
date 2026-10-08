"""Versioned reading and scale content; no scoring rules are invented here."""

import json
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.storage import ContentVersion

BUNDLE = Path(__file__).resolve().parents[1] / "content" / "community-library.json"


async def publish_bundled_content(db: AsyncSession, *, replace: bool = False) -> ContentVersion:
    bundle = json.loads(BUNDLE.read_text(encoding="utf-8"))
    current = (
        await db.execute(
            select(ContentVersion).where(
                ContentVersion.name == bundle["name"], ContentVersion.active
            )
        )
    ).scalar_one_or_none()
    if current is not None and (not replace or current.version == bundle["version"]):
        return current
    await db.execute(
        update(ContentVersion).where(ContentVersion.name == bundle["name"]).values(active=False)
    )
    revision = await db.get(ContentVersion, (bundle["name"], bundle["version"]))
    if revision is None:
        revision = ContentVersion(**bundle, active=True)
        db.add(revision)
    else:
        revision.active = True
    await db.flush()
    return revision
