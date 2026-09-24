"""发布航空图题库到 OSS，并替换旧的通用图片题库。"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import delete, inspect, select, text

ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = ROOT / "backend" / "app" / "static" / "assets" / "aviation"
sys.path.insert(0, str(ROOT / "backend"))

import app.models  # noqa: F401
from app.db.base import AsyncSessionLocal, Base, engine
from app.models.image_bank import Image, Pair
from app.services.oss.client import OSSClient

AVIATION_PREFIX = "image-bank/aviation/v1"


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
    obsolete_oss_keys: list[str] = []
    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(Image))).scalars().all()
        by_key = {image.oss_key: image for image in existing}
        image_files = [filename for item in content["question_types"] for filename in item["images"]]
        # 一张情境图可配多道不同观察题；题目本身必须独立，图片无需机械地一题一图。
        if len(content["question_types"]) < 40:
            raise ValueError("航空题库至少需要 40 道题（当前 %d）" % len(content["question_types"]))

        oss = OSSClient()
        uploaded: dict[str, tuple[str, str]] = {}
        for filename in dict.fromkeys(image_files):
            key = f"{AVIATION_PREFIX}/{filename}"
            path = STATIC_ROOT / filename
            if path.is_file():
                url = oss.upload_file(path, key, "image/jpeg")
                oss._ensure().get_object_meta(key)
            elif key in by_key:
                # 已发布的图片无需留一份本地副本；直接复用已验证的 OSS 对象。
                url = by_key[key].url
            else:
                raise FileNotFoundError(path)
            uploaded[filename] = (key, url)

        new_keys = {key for key, _ in uploaded.values()}
        local_keys = {f"local/aviation/{filename}" for filename in image_files}

        # 仅替换航空场景的题目记录，社区题库保持完全隔离。图片可被多题复用。
        await db.execute(delete(Pair).where(Pair.scene == "aviation"))

        for question_type in content["question_types"]:
            for filename in question_type["images"]:
                key, url = uploaded[filename]
                image = by_key.get(key) or by_key.get(f"local/aviation/{filename}")
                if image is None:
                    image = Image(oss_key=key, url=url, category=question_type["id"])
                    db.add(image)
                    await db.flush()
                    by_key[key] = image
                else:
                    image.oss_key = key
                    image.url = url
                image.active = True
                image.category = "aviation"
                source = provenance[filename]
                db.add(
                    Pair(
                        image_id=image.id,
                        question=question_type["question"],
                        option_a=question_type["option_a"],
                        option_b=question_type["option_b"],
                        dimension=question_type["dimension"],
                        scenario=question_type["scenario"],
                        audio_url=question_type["audio_url"],
                        content_version=content["content_version"],
                        source_note=f'{source["license"]} / {source["author"]}',
                        scoring_mode=content["scoring_mode"],
                        active=True,
                    )
                )
                installed += 1

        for image in existing:
            if image.oss_key in new_keys or image.oss_key in local_keys:
                continue
            # 只清理旧的通用题库(images/ 前缀)；社区等其他场景的题库
            # (image-bank/community/...)由各自种子脚本管理，这里不得删除。
            if image.oss_key.startswith("images/"):
                obsolete_oss_keys.append(image.oss_key)
                await db.delete(image)
        await db.commit()

    for key in obsolete_oss_keys:
        oss.delete(key)
    print(
        f"Published {installed} aviation images; removed "
        f"{len(obsolete_oss_keys)} legacy OSS images."
    )


if __name__ == "__main__":
    asyncio.run(main())
