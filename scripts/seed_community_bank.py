"""发布社区题库(scene=community，本地授权照片 + 本地音频)，并确保社区开发设备存在。

v3: 6 个观察维度 × 5 条独立题干，共 30 张授权照片。
    题目语音由终端 TTS 逐题朗读；与航空题库完全隔离；幂等重跑。

用法:
    python scripts/seed_community_bank.py [--device-id community-dev-01]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import inspect, select, text

ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = ROOT / "community-assets"
sys.path.insert(0, str(ROOT / "backend"))

import app.models  # noqa: E402, F401 -- register every ORM model before schema inspection
from app.db.base import AsyncSessionLocal, Base, engine  # noqa: E402
from app.models.community import Device  # noqa: E402
from app.models.image_bank import Image, Pair  # noqa: E402

COMMUNITY_PREFIX = "static-assets/community"
DEFAULT_DEVICE_ID = "community-dev-01"


async def ensure_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        existing = await conn.run_sync(
            lambda c: {x["name"] for x in inspect(c).get_columns("pairs")}
        )
        columns = {
            "dimension": "VARCHAR(64)",
            "scenario": "VARCHAR(64)",
            "audio_url": "VARCHAR(512)",
            "content_version": "VARCHAR(32)",
            "source_note": "VARCHAR(256)",
            "scoring_mode": "VARCHAR(32) NOT NULL DEFAULT 'observation_only'",
            "scene": "VARCHAR(20) NOT NULL DEFAULT 'aviation'",
            "content_type": "VARCHAR(20) NOT NULL DEFAULT 'image'",
            "media_url": "VARCHAR(512)",
        }
        for name, ddl in columns.items():
            if name not in existing:
                await conn.execute(text(f"ALTER TABLE pairs ADD COLUMN {name} {ddl}"))


async def seed_bank(db) -> int:  # noqa: ANN001
    content = json.loads((STATIC_ROOT / "content.json").read_text(encoding="utf-8"))
    questions = content["questions"]

    if len(questions) != 30 or len({q["question"] for q in questions}) != 30:
        raise ValueError("社区正式题库必须包含 30 条不重复题干")
    manifest = json.loads((ROOT / "static-assets-manifest.json").read_text(encoding="utf-8"))
    published = {asset["key"] for asset in manifest["assets"]}
    for item in questions:
        if (
            not (STATIC_ROOT / item["image"]).is_file()
            and f"{COMMUNITY_PREFIX}/{item['image']}" not in published
        ):
            raise FileNotFoundError(STATIC_ROOT / item["image"])

    existing = (
        (await db.execute(select(Image).join(Pair).where(Pair.scene == "community").distinct()))
        .scalars()
        .all()
    )
    by_key = {image.oss_key: image for image in existing}
    by_url = {image.url: image for image in existing}

    installed = 0
    valid_keys = set()
    for item in questions:
        rel = item["image"]
        key = f"{COMMUNITY_PREFIX}/{rel}"
        valid_keys.add(key)
        url = f"/static/assets/community/{rel}"
        image = by_key.get(key) or by_url.get(url)
        if image is None:
            image = Image(oss_key=key, url=url, category=item["id"].split("-")[0])
            db.add(image)
            await db.flush()
        else:
            image.url = url
            image.oss_key = key
        image.active = True
        image.category = item["id"].split("-")[0]
        pair = await db.scalar(
            select(Pair).where(
                Pair.image_id == image.id,
                Pair.scene == "community",
                Pair.question == item["question"],
            )
        )
        values = dict(
            image_id=image.id,
            question=item["question"],
            option_a=item["option_a"],
            option_b=item["option_b"],
            dimension=item["dimension"],
            scenario=item["scenario"],
            audio_url=item.get("audio_url") or None,
            content_version=content["content_version"],
            source_note="Pexels License / 见 community-assets/ASSETS.md",
            scoring_mode=content["scoring_mode"],
            scene="community",
            content_type="image",
            active=True,
        )
        if pair is None:
            db.add(Pair(**values))
        else:
            for field, value in values.items():
                setattr(pair, field, value)
        installed += 1

    # Preserve historical IDs referenced by paid sessions; only deactivate old content.
    for image in existing:
        if image.oss_key not in valid_keys:
            image.active = False
            old_pairs = (await db.scalars(select(Pair).where(Pair.image_id == image.id))).all()
            for pair in old_pairs:
                pair.active = False
    return installed


async def ensure_device(db, device_id: str) -> None:  # noqa: ANN001
    device = (
        await db.execute(select(Device).where(Device.device_id == device_id))
    ).scalar_one_or_none()
    if device is None:
        device = Device(device_id=device_id, scene="community")
        db.add(device)
    device.scene = "community"
    device.is_active = True
    if not device.name:
        device.name = "社区开发设备"
    if not device.location:
        device.location = "本地 Mock 环境"


async def main() -> None:
    parser = argparse.ArgumentParser(description="发布社区题库与开发设备")
    parser.add_argument("--device-id", default=DEFAULT_DEVICE_ID, help="社区开发设备ID")
    args = parser.parse_args()

    await ensure_schema()
    async with AsyncSessionLocal() as db:
        installed = await seed_bank(db)
        await ensure_device(db, args.device_id)
        await db.commit()
    print(
        f"Published {installed} community pairs (30-photo bank, scene=community); "
        f"device '{args.device_id}' ready (scene=community)."
    )


if __name__ == "__main__":
    asyncio.run(main())
