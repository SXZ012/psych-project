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

GUIDES = {
    "practice-welcome": {
        "audio_url": "/static/assets/aviation/audio/practice-welcome.wav",
        "text": (
            "欢迎进入 AI视觉心理评估终端。正式测评开始前，我们将先完成三道简短操作体验题。"
            "请保持自然坐姿，将面部完整置于右上角画面框内。当边框变为绿色，即表示位置合适。"
            "本体验环节不会录制，不会上传，也不会生成测评结果。"
        ),
    },
}


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


def to_wav_bytes(content: bytes, question_id: str) -> bytes:
    """请求 wav 输出；若返回的仍是 MP3（参数被忽略等）就地 ffmpeg 转码。

    content.json 的 audio_url 均为 .wav：把 MP3 字节直接写进 .wav 文件名
    会让任何按扩展名服务的路径拿到"假 wav"（前端 paired-v1 重定向曾掩盖
    此问题）。这里强制落盘的必须是真 RIFF/WAVE。
    """
    if content[:4] == b"RIFF":
        return content
    if content.startswith(b"ID3") or content[:2] in {b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"}:
        import os
        import shutil
        import subprocess
        import tempfile

        if shutil.which("ffmpeg") is None:
            raise RuntimeError(
                f"{question_id}: TTS returned MP3 but ffmpeg is not available to transcode to WAV"
            )
        src_fd, src_path = tempfile.mkstemp(suffix=".mp3")
        dst_fd, dst_path = tempfile.mkstemp(suffix=".wav")
        try:
            os.write(src_fd, content)
            os.close(src_fd)
            os.close(dst_fd)
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", src_path, "-ar", "22050", dst_path],
                check=True,
            )
            return Path(dst_path).read_bytes()
        finally:
            for path in (src_path, dst_path):
                try:
                    os.unlink(path)
                except OSError:
                    pass
    raise RuntimeError(f"Unexpected audio content for {question_id}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate reusable aviation question audio files")
    # 使用同一款 CosyVoice v3 女声。旧默认 longanyang 为男声，且题库曾分批
    # 生成，不能保证现场听感一致。
    parser.add_argument("--model", default="cosyvoice-v3-flash")
    parser.add_argument("--voice", default="longanhuan")
    parser.add_argument("--rate", type=float, default=0.92)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", help="Only generate one question id")
    parser.add_argument("--guide", choices=sorted(GUIDES), help="Generate one fixed guidance prompt")
    parser.add_argument("--suffix", default="", help="Append a suffix before the audio extension for voice previews")
    args = parser.parse_args()
    if not settings.DASHSCOPE_API_KEY:
        raise SystemExit("DASHSCOPE_API_KEY is not configured")

    content = json.loads((STATIC_ROOT / "content.json").read_text(encoding="utf-8"))
    headers = {"Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}", "Content-Type": "application/json"}
    items = content["question_types"]
    if args.guide:
        guide = GUIDES[args.guide]
        items = [{"id": args.guide, "audio_url": guide["audio_url"], "question": guide["text"]}]

    with httpx.Client(timeout=90, follow_redirects=True) as client:
        for question_type in items:
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
                    # content.json 的 audio_url 全部指向 .wav；直接产出 wav，
                    # 避免 MP3 字节写进 .wav 文件名的"假 wav"
                    "format": "wav",
                    "sample_rate": 22050,
                    "volume": 60,
                    "rate": args.rate,
                    "pitch": 1.0,
                    "instruction": "你说话的情感是neutral。",
                },
            }
            response = client.post(args.endpoint, headers=headers, json=payload)
            if response.is_error:
                raise RuntimeError(
                    f"TTS request failed for {question_type['id']}: "
                    f"HTTP {response.status_code} {response.text[:500]}"
                )
            response.raise_for_status()
            remote_url = find_audio_url(response.json())
            audio = client.get(remote_url)
            audio.raise_for_status()
            wav = to_wav_bytes(audio.content, question_type["id"])
            target.write_bytes(wav)
            print(f"generated {question_type['id']} -> {target.name} ({len(wav)} bytes)")


if __name__ == "__main__":
    main()
