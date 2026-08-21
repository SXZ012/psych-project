"""Pre-generate the five reusable aviation question prompts with DashScope TTS.

Audio is downloaded into backend static assets. The assessment device never calls
the cloud TTS service at runtime.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

import httpx

ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = ROOT / "backend" / "app" / "static" / "assets" / "aviation"
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import settings  # noqa: E402

DEFAULT_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer"


def output_path(audio_url: str) -> Path:
    prefix = "/static/assets/aviation/"
    url_path = urlparse(audio_url).path
    if not url_path.startswith(prefix):
        raise ValueError(f"Unexpected local audio URL: {audio_url}")
    path = (STATIC_ROOT / url_path.removeprefix(prefix)).resolve()
    if STATIC_ROOT.resolve() not in path.parents:
        raise ValueError(f"Audio path escapes static root: {path}")
    return path


def find_audio_url(body: dict) -> str:
    candidates = [
        body.get("output", {}).get("audio", {}).get("url"),
        body.get("output", {}).get("audio_url"),
        body.get("audio_url"),
    ]
    result = next((value for value in candidates if isinstance(value, str) and value), None)
    if not result or urlparse(result).scheme not in {"http", "https"}:
        raise RuntimeError(f"DashScope response did not contain an audio URL: {body}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate five aviation question audio files")
    parser.add_argument("--model", default="cosyvoice-v3-flash")
    parser.add_argument("--voice", default="longanyang")
    parser.add_argument("--rate", type=float, default=0.92)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", choices=list("ABCDE"), help="Only generate one question type")
    parser.add_argument("--suffix", default="", help="Append a suffix before .mp3 for voice previews")
    args = parser.parse_args()
    if not settings.DASHSCOPE_API_KEY:
        raise SystemExit("DASHSCOPE_API_KEY is not configured")

    content = json.loads((STATIC_ROOT / "content.json").read_text(encoding="utf-8"))
    headers = {"Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}", "Content-Type": "application/json"}
    with httpx.Client(timeout=90, follow_redirects=True) as client:
        for question_type in content["question_types"]:
            if args.only and question_type["id"] != args.only:
                continue
            target = output_path(question_type["audio_url"])
            if args.suffix:
                target = target.with_name(f"{target.stem}-{args.suffix}{target.suffix}")
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists() and target.stat().st_size > 1024 and not args.force:
                print(f"skip {target.name} (already exists)")
                continue
            payload = {
                "model": args.model,
                "input": {
                    "text": question_type["question"],
                    "voice": args.voice,
                    "format": "mp3",
                    "sample_rate": 22050,
                    "volume": 60,
                    "rate": args.rate,
                    "pitch": 1.0,
                    "instruction": "你说话的情感是neutral。",
                },
            }
            response = client.post(args.endpoint, headers=headers, json=payload)
            response.raise_for_status()
            remote_url = find_audio_url(response.json())
            audio = client.get(remote_url)
            audio.raise_for_status()
            if not audio.content.startswith(b"ID3") and audio.content[:2] not in {b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"}:
                raise RuntimeError(f"Unexpected audio content for {question_type['id']}")
            target.write_bytes(audio.content)
            print(f"generated {question_type['id']} -> {target.name} ({len(audio.content)} bytes)")


if __name__ == "__main__":
    main()
