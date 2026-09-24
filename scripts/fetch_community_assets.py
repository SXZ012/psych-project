"""从 Wikimedia Commons 抓取社区场景授权素材（CC0/PDM/CC-BY/CC-BY-SA）。

- 只接受许可明确的图片/视频，逐张记录 作者/许可/来源页/下载日期 到 manifest.json + ASSETS.md
- 下载为统一宽度 ≤1600 的 JPEG 缩略图，存 backend/app/static/assets/community/
- 用法: python scripts/fetch_community_assets.py [--video]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
from datetime import date
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "backend" / "app" / "static" / "assets" / "community"
API = "https://commons.wikimedia.org/w/api.php"
UA = "psych-community-assets/1.0 (educational wellbeing kiosk; contact: dev@local)"
ALLOWED_LICENSES = ("cc0", "pdm", "cc by", "cc by-sa")

# 桶 → (目录, 数量, 搜索词列表[轮询取满为止])
BUCKETS: dict[str, tuple[str, int, list[str]]] = {
    "intro":   ("ux", 2, ["sunrise mist lake landscape", "soft morning light forest"]),
    "state-mood":    ("ux", 1, ["quiet lake calm water morning"]),
    "state-sleep":   ("ux", 1, ["starry night sky silhouette"]),
    "state-energy":  ("ux", 1, ["sunlight through trees path"]),
    "bank-mood":     ("images/bank", 5, ["calm lake sunrise", "misty lake morning", "still water reflection dawn"]),
    "bank-stress":   ("images/bank", 5, ["city street crowd motion", "busy crosswalk urban", "crowded street blur"]),
    "bank-sleep":    ("images/bank", 5, ["night sky stars landscape", "moon night window", "milky way night"]),
    "bank-social":   ("images/bank", 5, ["people walking together park", "friends tea table", "group walking outdoors"]),
    "bank-selfcare": ("images/bank", 5, ["tea cup book window", "cozy reading corner", "hot drink table warm"]),
    "bank-hope":     ("images/bank", 5, ["mountain sunrise horizon", "open road horizon sky", "sunrise mountains landscape"]),
    "game-scene":    ("ux/games", 3, ["city park pathway trees", "old street europe daytime", "bookshelf study room"]),
    "scenario":      ("ux/games", 3, ["rain window drops glass", "two coffee cups table", "desk papers notebook work"]),
}


def clean_html(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", "", value)
    return re.sub(r"\s+", " ", text).strip()


async def search_bucket(client: httpx.AsyncClient, terms: list[str], need: int) -> list[dict]:
    candidates: list[dict] = []
    seen_files: set[str] = set()
    for term in terms:
        if len(candidates) >= need + 4:
            break
        resp = await client.get(API, params={
            "action": "query", "format": "json", "generator": "search",
            "gsrsearch": f"filetype:bitmap {term}", "gsrlimit": 20,
            "gsrnamespace": 6,
            "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
            "iiurlwidth": 1600,
        })
        pages = (resp.json().get("query") or {}).get("pages") or {}
        for page in pages.values():
            title = page.get("title", "")
            if title in seen_files:
                continue
            info = (page.get("imageinfo") or [{}])[0]
            meta = info.get("extmetadata") or {}
            license_raw = clean_html(meta.get("LicenseShortName", {}).get("value", "")).lower()
            if not any(tag in license_raw for tag in ALLOWED_LICENSES):
                continue
            mime = info.get("mime", "")
            if mime not in ("image/jpeg",):
                continue
            width, height = info.get("width", 0), info.get("height", 0)
            if width < 1100 or height < 700:
                continue
            aspect = width / max(height, 1)
            if not 0.6 <= aspect <= 2.4:
                continue
            seen_files.add(title)
            candidates.append({
                "title": title,
                "page": info.get("descriptionurl", ""),
                "thumb": info.get("thumburl") or info.get("url"),
                "width": width, "height": height,
                "artist": clean_html(meta.get("Artist", {}).get("value", "")) or "Unknown",
                "license": clean_html(meta.get("LicenseShortName", {}).get("value", "")),
                "credit": clean_html(meta.get("Credit", {}).get("value", ""))[:120],
            })
    return candidates


async def fetch_all(include_video: bool) -> None:
    manifest_path = ASSET_ROOT / "manifest.json"
    manifest: list[dict] = []
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    known_titles = {entry["title"] for entry in manifest}

    async with httpx.AsyncClient(timeout=60, follow_redirects=True, headers={"User-Agent": UA}) as client:
        for bucket, (subdir, need, terms) in BUCKETS.items():
            target_dir = ASSET_ROOT / subdir
            target_dir.mkdir(parents=True, exist_ok=True)
            candidates = await search_bucket(client, terms, need)
            picked = 0
            for candidate in candidates:
                if picked >= need:
                    break
                if candidate["title"] in known_titles:
                    continue
                ext = ".jpg"
                filename = f"{bucket}-{picked + 1:02d}{ext}"
                file_path = target_dir / filename
                try:
                    image = await client.get(candidate["thumb"])
                    image.raise_for_status()
                    if len(image.content) < 60_000:  # 过小多为缩略残缺
                        continue
                    file_path.write_bytes(image.content)
                except Exception as exc:  # noqa: BLE001
                    print(f"  download failed {candidate['title']}: {exc}")
                    continue
                entry = {
                    "bucket": bucket, "file": f"{subdir}/{filename}",
                    "bytes": file_path.stat().st_size,
                    "downloaded": date.today().isoformat(),
                    "source": "Wikimedia Commons",
                    **candidate,
                }
                manifest.append(entry)
                known_titles.add(candidate["title"])
                picked += 1
                print(f"✓ {bucket}: {filename} ← {candidate['title'][:60]} | {candidate['license']} | {candidate['artist'][:30]}")
            if picked < need:
                print(f"⚠ {bucket} 只取到 {picked}/{need}，建议补充搜索词")

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    write_assets_md(manifest)
    print(f"\nmanifest 共 {len(manifest)} 条 → {manifest_path}")


def write_assets_md(manifest: list[dict]) -> None:
    lines = [
        "# 社区场景素材来源与授权清单",
        "",
        "所有素材来自 Wikimedia Commons，许可均为商用友好的 CC0 / PDM / CC-BY / CC-BY-SA。",
        "下载日期、作者、来源页逐张记录于 manifest.json；本文件为人类可读汇总。",
        "",
    ]
    for bucket in sorted({entry["bucket"] for entry in manifest}):
        lines.append(f"## {bucket}")
        lines.append("")
        lines.append("| 文件 | 作者 | 许可 | 来源页 |")
        lines.append("| --- | --- | --- | --- |")
        for entry in manifest:
            if entry["bucket"] != bucket:
                continue
            lines.append(
                f"| `{entry['file']}` | {entry['artist']} | {entry['license']} | {entry['page']} |"
            )
        lines.append("")
    (ASSET_ROOT / "ASSETS.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", action="store_true", help="同时尝试抓取开场视频")
    args = parser.parse_args()
    asyncio.run(fetch_all(args.video))
