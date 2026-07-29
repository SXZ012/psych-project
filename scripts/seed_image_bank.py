"""图题库数据注入脚本（替代管理后台）。

模式:
  --fetch N          抓 N 张 CC0 图(Picsum, Demo 用) + 按类别配题
  --csv <题库.csv>    CSV 精细控制每张图的题(正式诱发图用)
  --dir <图片目录>    上传目录内图片(按子目录名分类) + 默认题
  --requestion        用最新题目刷新已有图片的配对包(保留图片)
  (无参数)           等同 --fetch 24

CSV 格式(UTF-8, 首行表头):
  image,category,question,option_a,option_b
  风景/湖.jpg,风景,这片景色让你心情更接近？,放松舒展,紧绷疲惫
  (同一 image 多行 = 该图多道题)
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import app.models  # noqa: E402,F401  注册模型
import httpx  # noqa: E402
from app.db.base import AsyncSessionLocal, Base, engine  # noqa: E402
from app.models.image_bank import Image, Pair  # noqa: E402
from app.services.oss.client import OSSClient  # noqa: E402

FETCH_CATEGORIES = ["中性", "风景", "轻压力"]

DEFAULT_QUESTIONS = [
    (
        "注视这张图片片刻，你此刻的注意力更接近哪种状态？",
        "完全沉浸在画面的细节里",
        "思绪不断飘走、难以集中",
    ),
    (
        "看着这幅画面，你内心的感受更贴近哪一种？",
        "安静平稳，没有明显情绪起伏",
        "有些麻木或空泛，说不上来",
    ),
]

CATEGORY_QUESTIONS: dict[str, list[tuple[str, str, str]]] = {
    "中性": [
        (
            "注视这张图片片刻，你此刻的注意力更接近哪种状态？",
            "完全沉浸在画面的细节里",
            "思绪不断飘走、难以集中",
        ),
        (
            "看着这幅画面，你内心的感受更贴近哪一种？",
            "安静平稳，没有明显情绪起伏",
            "有些麻木或空泛，说不上来",
        ),
    ],
    "风景": [
        (
            "面对这片景色，你当下身心的整体感受更接近？",
            "放松舒展，呼吸都变得深长",
            "紧绷疲惫，难以真正放松下来",
        ),
        (
            "如果可以自由选择，你愿意在这样的环境里停留多久？",
            "愿意多待一会儿，让心情沉淀",
            "想尽快离开，没什么特别感觉",
        ),
    ],
    "轻压力": [
        (
            "想象自己身处这类情境，你的第一反应更接近？",
            "能较快调整状态、从容应对",
            "下意识想要回避或拖延",
        ),
        (
            "此时你身体的感受更接近哪一种？",
            "手脚平稳，心率正常",
            "心跳略快、肌肉有些紧绷",
        ),
    ],
}


async def _ensure_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def _add_pairs_for(db, image, category: str | None) -> int:
    qs = CATEGORY_QUESTIONS.get(category or "", DEFAULT_QUESTIONS) or DEFAULT_QUESTIONS
    for q, a, b in qs:
        db.add(Pair(image_id=image.id, question=q, option_a=a, option_b=b))
    return len(qs)


async def seed_fetch(oss: OSSClient, n: int) -> None:
    async with AsyncSessionLocal() as db:
        ok = 0
        for i in range(n):
            cat = FETCH_CATEGORIES[i % len(FETCH_CATEGORIES)]
            try:
                resp = httpx.get(
                    f"https://picsum.photos/seed/psych-{i}/1024/768",
                    timeout=30,
                    follow_redirects=True,
                )
                resp.raise_for_status()
                data, ct = resp.content, resp.headers.get("content-type", "image/jpeg")
            except Exception as e:  # noqa: BLE001
                print(f"  跳过 #{i}: {type(e).__name__} {str(e)[:60]}")
                continue
            ext = ".jpg" if "jpeg" in ct or "jpg" in ct else ".png"
            key = OSSClient.gen_object_key("images", f"demo-{i}{ext}")
            url = oss.upload(data, key, ct)
            image = Image(oss_key=key, url=url, category=cat)
            db.add(image)
            await db.flush()
            _add_pairs_for(db, image, cat)
            ok += 1
        await db.commit()
    print(f"✅ 抓取注入完成：{ok}/{n} 图 × 2 题 = {ok * 2} 配对包")


async def seed_csv(oss: OSSClient, csv_path: Path) -> None:
    with open(csv_path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        print(f"!! {csv_path} 无数据行")
        return
    async with AsyncSessionLocal() as db:
        cache: dict[str, object] = {}
        n_pair = 0
        for row in rows:
            img_path = row["image"].strip()
            if img_path not in cache:
                fp = Path(img_path)
                if not fp.is_absolute():
                    fp = (csv_path.parent / fp).resolve()
                key = OSSClient.gen_object_key("images", fp.name)
                url = oss.upload_file(fp, key)
                cat = (row.get("category") or "").strip() or None
                image = Image(oss_key=key, url=url, category=cat)
                db.add(image)
                await db.flush()
                cache[img_path] = image
            img = cache[img_path]
            db.add(
                Pair(
                    image_id=img.id,
                    question=row["question"].strip(),
                    option_a=row["option_a"].strip(),
                    option_b=row["option_b"].strip(),
                )
            )
            n_pair += 1
        await db.commit()
    print(f"✅ CSV 注入完成：{len(cache)} 图 / {n_pair} 配对包")


async def seed_dir(oss: OSSClient, dir_path: Path) -> None:
    exts = {".jpg", ".jpeg", ".png", ".webp"}
    files = sorted(p for p in dir_path.rglob("*") if p.suffix.lower() in exts)
    if not files:
        print(f"!! 目录 {dir_path} 内未找到图片")
        return
    async with AsyncSessionLocal() as db:
        for fp in files:
            category = fp.parent.name if fp.parent != dir_path else None
            key = OSSClient.gen_object_key("images", fp.name)
            url = oss.upload_file(fp, key)
            image = Image(oss_key=key, url=url, category=category)
            db.add(image)
            await db.flush()
            _add_pairs_for(db, image, category)
        await db.commit()
    print(f"✅ 目录注入完成：{len(files)} 图 × 2 题")


async def requestion() -> None:
    """用最新题目刷新已有图片的配对包（保留图片，只换题）。"""
    from sqlalchemy import delete, select

    async with AsyncSessionLocal() as db:
        await db.execute(delete(Pair))
        imgs = (await db.execute(select(Image))).scalars().all()
        n = 0
        for img in imgs:
            qs = CATEGORY_QUESTIONS.get(img.category or "", DEFAULT_QUESTIONS)
            for q, a, b in qs:
                db.add(Pair(image_id=img.id, question=q, option_a=a, option_b=b))
                n += 1
        await db.commit()
    print(f"✅ 题目已刷新：{len(imgs)} 图 / {n} 配对包（加长版题目）")


async def main() -> None:
    ap = argparse.ArgumentParser(description="图题库数据注入")
    ap.add_argument("--fetch", type=int, metavar="N", help="抓 N 张 CC0 图(Demo)")
    ap.add_argument("--csv", metavar="FILE", help="CSV 题库(精细控制图题)")
    ap.add_argument("--dir", metavar="DIR", help="图片目录(按子目录分类)")
    ap.add_argument(
        "--requestion", action="store_true", help="刷新已有图片的题目(保留图片)"
    )
    args = ap.parse_args()

    await _ensure_tables()
    if args.requestion:
        await requestion()
        return

    oss = OSSClient()
    if not (oss.access_key_id and oss.access_key_secret):
        print("!! .env 未配置 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET")
        sys.exit(1)
    if args.csv:
        await seed_csv(oss, Path(args.csv))
    elif args.dir:
        await seed_dir(oss, Path(args.dir))
    else:
        await seed_fetch(oss, args.fetch or 24)


if __name__ == "__main__":
    asyncio.run(main())
