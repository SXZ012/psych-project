"""Generate community question-only speech; publish verified audio before updating pairs.

Run from backend: ../.venv/bin/python ../scripts/generate_community_audio.py --publish
The device downloads pre-recorded audio during preparation and needs no system TTS.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import io
import json
import math
import struct
import subprocess
import sys
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
# Standalone script: make the backend package importable before importing its services.
from app.core.config import settings  # noqa: E402
from app.db.base import AsyncSessionLocal  # noqa: E402
from app.models.image_bank import Pair  # noqa: E402
from app.services.oss.client import OSSClient  # noqa: E402

DEST = ROOT / "community-assets" / "audio"
PRACTICE = [
    "看到这片安静的湖面，你更想？",
    "这个清晨给你的感觉更接近？",
    "看到晨光映在水面上，你更想？",
]
FINISHING = "采集即将完成，请完成当前选择"


def question_file(text: str) -> str:
    return "questions/cq-" + hashlib.sha256(text.encode()).hexdigest()[:16] + ".wav"


def validate(content: bytes) -> float:
    with wave.open(io.BytesIO(content)) as audio:
        if audio.getnchannels() != 1 or audio.getsampwidth() != 2:
            raise ValueError("Unexpected speech format")
        duration = audio.getnframes() / audio.getframerate()
        if not 0.2 < duration < 30:
            raise ValueError("Unexpected speech duration")
        return duration


def generate(item: tuple[str, str]) -> tuple[str, str, bytes]:
    relative, text = item
    path = DEST / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        content = path.read_bytes()
        validate(content)
        return relative, text, content
    if relative == "cues/start-tone.wav":
        rate = 22050
        duration = 0.32
        pcm = bytearray()
        for i in range(round(rate * duration)):
            t = i / rate
            envelope = min(t / 0.02, 1) * max(0, 1 - t / duration) ** 2
            sample = (
                0.16
                * envelope
                * (math.sin(2 * math.pi * 660 * t) + 0.35 * math.sin(2 * math.pi * 880 * t))
            )
            pcm.extend(struct.pack("<h", round(sample * 32767)))
        with wave.open(str(path), "wb") as output:
            output.setparams((1, 2, rate, 0, "NONE", "not compressed"))
            output.writeframes(pcm)
        content = path.read_bytes()
        validate(content)
        return relative, text, content
    payload = {
        "model": "cosyvoice-v3-flash",
        "input": {
            "text": text,
            "voice": "longanhuan",
            "format": "wav",
            "sample_rate": 22050,
            "rate": 0.92,
        },
    }
    with httpx.Client(timeout=90, follow_redirects=True) as client:
        result = client.post(
            "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
            headers={"Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}"},
            json=payload,
        )
        result.raise_for_status()
        body = result.json()
        url = body.get("output", {}).get("audio", {}).get("url") or body.get("output", {}).get(
            "audio_url"
        )
        if not url:
            raise RuntimeError(f"Speech generation failed: {body.get('code')}")
        url = url.replace("http://", "https://", 1)
        audio = client.get(url)
        audio.raise_for_status()
        content = audio.content
    # 云服务偶尔返回流式 WAV（帧数未回填）或 MP3；统一为真实、可 seek 的 PCM WAV。
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-ac",
            "1",
            "-ar",
            "22050",
            "-c:a",
            "pcm_s16le",
            str(path),
        ],
        input=content,
        check=True,
    )
    content = path.read_bytes()
    duration = validate(content)
    print(f"Generated {relative}: {duration:.2f}s", flush=True)
    return relative, text, content


async def main(publish: bool) -> None:
    if not settings.DASHSCOPE_API_KEY:
        raise RuntimeError("DASHSCOPE_API_KEY is not configured")
    async with AsyncSessionLocal() as db:
        pairs = (
            (await db.execute(select(Pair).where(Pair.scene == "community", Pair.active.is_(True))))
            .scalars()
            .all()
        )
        texts = list(dict.fromkeys([p.question for p in pairs] + PRACTICE))
        jobs = [(question_file(text), text) for text in texts] + [
            ("cues/finishing-v2.wav", FINISHING),
            ("cues/start-tone.wav", "正式采集开始提示音"),
        ]
        with ThreadPoolExecutor(max_workers=3) as executor:
            files = list(executor.map(generate, jobs))
        if publish:
            oss = OSSClient()
            for relative, _, content in files:
                key = "static-assets/community/audio/" + relative
                oss.upload(content, key, "audio/wav")
                downloaded = oss._ensure().get_object(key).read()
                if hashlib.sha256(downloaded).digest() != hashlib.sha256(content).digest():
                    raise RuntimeError("Published audio verification failed")
            for relative, _, content in files:
                if relative.startswith("cues/"):
                    oss.upload(
                        content,
                        "static-assets/assets/aviation/audio/paired-v1/" + Path(relative).name,
                        "audio/wav",
                    )
            for pair in pairs:
                pair.audio_url = "/static/assets/community/audio/" + question_file(pair.question)
            await db.commit()
        records = [
            {"text": text, "audio_url": "/static/assets/community/audio/" + relative}
            for relative, text, _ in files
        ]
        (DEST / "question-audio.json").write_text(
            json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        manifest_path = ROOT / "static-assets-manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        records_by_key = {
            item["key"]: item
            for item in manifest["assets"]
            if not item["key"].endswith("/finishing.wav")
        }
        for relative, _, content in files:
            key = "static-assets/community/audio/" + relative
            records_by_key[key] = {
                "source": "community-assets/audio/" + relative,
                "key": key,
                "size": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
                "content_type": "audio/wav",
            }
            if relative.startswith("cues/"):
                alias_key = "static-assets/assets/aviation/audio/paired-v1/" + Path(relative).name
                records_by_key[alias_key] = {**records_by_key[key], "key": alias_key}
        manifest["assets"] = list(records_by_key.values())
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(
            f"Verified {len(files)} audio files; "
            f"{'published and updated' if publish else 'generated'} {len(pairs)} community pairs.",
            flush=True,
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publish", action="store_true")
    asyncio.run(main(parser.parse_args().publish))
