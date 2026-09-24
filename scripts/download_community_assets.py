"""下载社区场景授权素材（Pexels）到本地，并生成 manifest.json / ASSETS.md。

- 全部来自 Pexels，许可为 Pexels License（免费商用、无需署名，允许修改）
- 每条记录：文件、用途桶、来源页、作者（已知种子图实名，其余"见来源页"）、下载日期
- 下载后用 PIL 校验可解码、尺寸达标，不合格即报错
"""
from __future__ import annotations

import asyncio
import json
from datetime import date
from io import BytesIO
from pathlib import Path

import httpx
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "backend" / "app" / "static" / "assets" / "community"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
W = 1600

# bucket → [(pexels_id, slug_or_empty, author)]
ASSETS: dict[str, list[tuple[str, str, str]]] = {
    "ux": [
        ("28945280", "serene-sunrise-above-foggy-wisconsin-hills", "Tom Fisk"),
        ("29065905", "serene-misty-landscape-during-sunrise-in-tell", "见来源页"),
        ("38239121", "misty-lake-at-sunrise-with-reflective-water", "Plato Terentev"),
        ("37443455", "serene-misty-lake-at-sunrise-with-forest-reflection", "见来源页"),
        ("5392095", "", "见来源页"),            # state-mood 静湖晨雾
        ("33500208", "starry-night-sky-over-a-forest-landscape", "见来源页"),  # state-sleep
        ("35394159", "serene-forest-path-with-morning-sun-rays", "见来源页"),   # state-energy
    ],
    "ux/games": [
        ("38268366", "serene-park-pathway-with-bench-under-trees", "见来源页"),
        ("11648563", "busy-people-walking-on-the-side-of-the-street-near-green-trees", "见来源页"),
        ("29144101", "cozy-library-window-with-sunlit-bookshelves", "见来源页"),
        ("30427235", "raindrops-on-window-creating-moody-atmosphere", "见来源页"),
        ("6382453", "best-friends-speaking-at-table-with-cups-of-coffee", "见来源页"),
        ("8586182", "notebook-and-pen-on-the-work-desk", "见来源页"),
    ],
    "images/bank": [
        # 情绪状态（静水晨光）
        ("38239121", "misty-lake-at-sunrise-with-reflective-water", "Plato Terentev"),
        ("16822114", "fog-over-lake", "见来源页"),
        ("35091112", "misty-lakeside-sunrise-with-calm-water-reflections", "见来源页"),
        ("18386434", "fog-above-the-surface-of-the-water", "见来源页"),
        ("8964561", "", "见来源页"),
        # 压力水平（城市节奏）
        ("36678705", "busy-urban-street-with-pedestrians-and-traffic", "wal_ 172619"),
        ("15663393", "urban-rush-at-sunset", "见来源页"),
        ("6123962", "", "见来源页"),
        ("2962589", "", "见来源页"),
        ("36649334", "busy-urban-traffic-scene-with-motorcyclists", "见来源页"),
        # 睡眠与恢复（夜空）
        ("33611286", "stunning-milky-way-starry-night-sky-landscape", "见来源页"),
        ("33500208", "starry-night-sky-over-a-forest-landscape", "见来源页"),
        ("31540471", "starry-night-over-rocky-landscape-with-milky-way", "见来源页"),
        ("35461811", "starry-night-sky-with-milky-way-over-forest", "见来源页"),
        ("38103285", "starry-night-sky-with-milky-way-and-trees", "见来源页"),
        # 社交联结（同行）
        ("36763394", "happy-friends-in-autumn-park-smiling-together", "见来源页"),
        ("6146941", "happy-diverse-friends-walking-in-fall-park", "Keira Burton"),
        ("19156757", "two-young-women-and-a-boy-standing-in-a-park-in-autumn-and-smiling", "见来源页"),
        ("36763393", "group-of-friends-enjoying-autumn-outdoors", "见来源页"),
        ("5838871", "diverse-friends-walking-in-park", "见来源页"),
        # 自我关怀（窗边茶书）
        ("28963830", "cozy-autumn-reading-with-tea-by-the-window", "见来源页"),
        ("11648021", "tea-cup-and-book-on-windowsill", "见来源页"),
        ("19872069", "an-opened-book-and-a-cup-of-tea-by-a-fireplace", "见来源页"),
        ("31146888", "cozy-moment-with-tea-by-the-window", "见来源页"),
        ("17279644", "a-cup-of-coffee-a-candle-and-a-book-on-a-white-sheet", "见来源页"),
        # 希望感（山野天光）
        ("15575139", "photo-of-of-a-mountain-landscape-at-sunrise-and-yellow-sky", "见来源页"),
        ("34735091", "serene-mountain-sunrise-over-tranquil-lake", "见来源页"),
        ("30712585", "golden-sunrise-over-misty-mountain-range", "见来源页"),
        ("29051621", "serene-sunrise-over-foggy-wisconsin-landscape", "见来源页"),
        ("29079800", "misty-sunrise-over-scenic-wisconsin-landscape", "见来源页"),
    ],
}

# bank 内的分类顺序（每 5 张一类，与 ASSETS 列表顺序一致）
BANK_ORDER = ["mood", "stress", "sleep", "social", "selfcare", "hope"]


def cdn_urls(pid: str, slug: str) -> list[str]:
    urls = [f"https://images.pexels.com/photos/{pid}/pexels-photo-{pid}.jpeg?auto=compress&cs=tinysrgb&w={W}"]
    if slug:
        urls.append(
            f"https://images.pexels.com/photos/{pid}/pexels-photo-{pid}/{slug}.jpeg?auto=compress&cs=tinysrgb&w={W}"
        )
    return urls


def page_url(pid: str, slug: str) -> str:
    if slug:
        return f"https://www.pexels.com/photo/{slug}-{pid}/"
    return f"https://www.pexels.com/photo/{pid}/"


async def main() -> None:
    manifest: list[dict] = []
    failures: list[str] = []
    seen_ids: set[str] = set()
    async with httpx.AsyncClient(timeout=60, follow_redirects=True, headers=UA) as client:
        for subdir, entries in ASSETS.items():
            target = ASSET_ROOT / subdir
            target.mkdir(parents=True, exist_ok=True)
            for pid, slug, author in entries:
                if pid in seen_ids:
                    continue  # 同一张图只落一份
                seen_ids.add(pid)
                ok = False
                for url in cdn_urls(pid, slug):
                    try:
                        resp = await client.get(url)
                        if resp.status_code != 200 or len(resp.content) < 40_000:
                            continue
                        img = Image.open(BytesIO(resp.content))
                        img.verify()
                        img = Image.open(BytesIO(resp.content))
                        if img.width < 900 or img.height < 500:
                            continue
                        path = target / f"{pid}.jpg"
                        path.write_bytes(resp.content)
                        manifest.append({
                            "file": str(path.relative_to(ASSET_ROOT)).replace("\\", "/"),
                            "pexels_id": pid,
                            "page": page_url(pid, slug),
                            "author": author,
                            "license": "Pexels License (free to use, no attribution required)",
                            "width": img.width, "height": img.height,
                            "bytes": len(resp.content),
                            "downloaded": date.today().isoformat(),
                        })
                        print(f"✓ {pid} {img.width}x{img.height} {len(resp.content)//1024}KB → {path.relative_to(ASSET_ROOT)}")
                        ok = True
                        break
                    except Exception as exc:  # noqa: BLE001
                        print(f"  retry {pid}: {exc}")
                if not ok:
                    failures.append(pid)
    (ASSET_ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8")
    lines = [
        "# 社区场景素材来源与授权清单", "",
        f"共 {len(manifest)} 张，全部来自 Pexels（Pexels License：免费商用、无需署名、允许修改）。",
        "“见来源页”表示作者名请点击来源链接查看（该网络环境无法逐页抓取作者字段；许可本身不要求署名）。",
        "下载日期：" + date.today().isoformat(), "",
        "| 文件 | Pexels ID | 作者 | 许可 | 来源页 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for m in manifest:
        lines.append(f"| `{m['file']}` | {m['pexels_id']} | {m['author']} | Pexels License | {m['page']} |")
    (ASSET_ROOT / "ASSETS.md").write_text("\n".join(lines) + "\n", "utf-8")
    print(f"\n完成 {len(manifest)} 张；失败: {failures or '无'}")


if __name__ == "__main__":
    asyncio.run(main())
