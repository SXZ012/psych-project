"""Install the local 5-type / 20-image aviation draft into the image bank."""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import inspect, select, text, update

ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = ROOT / "backend" / "app" / "static" / "assets" / "aviation"
sys.path.insert(0, str(ROOT / "backend"))

import app.models  # noqa: E402,F401
from app.db.base import AsyncSessionLocal, Base, engine  # noqa: E402
from app.models.image_bank import Image, Pair  # noqa: E402


async def ensure_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        existing = await conn.run_sync(lambda c: {x["name"] for x in inspect(c).get_columns("pairs")})
        columns = {
            "dimension":"VARCHAR(64)", "scenario":"VARCHAR(64)", "audio_url":"VARCHAR(512)",
            "content_version":"VARCHAR(32)", "source_note":"VARCHAR(256)",
            "scoring_mode":"VARCHAR(32) NOT NULL DEFAULT 'observation_only'",
        }
        for name, ddl in columns.items():
            if name not in existing:
                await conn.execute(text(f"ALTER TABLE pairs ADD COLUMN {name} {ddl}"))


async def main() -> None:
    content = json.loads((STATIC_ROOT / "content.json").read_text(encoding="utf-8"))
    sources = json.loads((STATIC_ROOT / "sources.json").read_text(encoding="utf-8"))
    provenance = {item["file"]: item for item in sources["assets"]}
    await ensure_schema()
    installed = 0
    async with AsyncSessionLocal() as db:
        await db.execute(update(Pair).values(active=False))
        await db.execute(update(Image).values(active=False))
        for question_type in content["question_types"]:
            for filename in question_type["images"]:
                if not (STATIC_ROOT / filename).is_file():
                    raise FileNotFoundError(STATIC_ROOT / filename)
                key = f"local/aviation/{filename}"
                image = (await db.execute(select(Image).where(Image.oss_key == key))).scalar_one_or_none()
                if image is None:
                    image = Image(oss_key=key, url=f"/static/assets/aviation/{filename}", category=question_type["id"])
                    db.add(image)
                    await db.flush()
                image.active = True
                source = provenance[filename]
                db.add(Pair(
                    image_id=image.id, question=question_type["question"], option_a=question_type["option_a"],
                    option_b=question_type["option_b"], dimension=question_type["dimension"],
                    scenario=question_type["scenario"], audio_url=question_type["audio_url"],
                    content_version=content["content_version"],
                    source_note=f'{source["license"]} / {source["author"]}',
                    scoring_mode=content["scoring_mode"], active=True,
                ))
                installed += 1
        await db.commit()
    print(f"Installed {installed} images across {len(content['question_types'])} aviation question types.")


if __name__ == "__main__":
    asyncio.run(main())
