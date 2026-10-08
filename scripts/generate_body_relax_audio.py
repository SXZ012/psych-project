"""Build an original two-minute, prerecorded relaxation guide. No runtime TTS.

Uses the project's existing DashScope account; never writes credentials to output.
The intentionally quiet gaps are part of the guide, not loading delays.
"""

import io
import json
import os
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "frontend/terminal-web/src/assets/body-relax"
CACHE = ROOT / "outputs/body-relax-audio-build"
STEPS = [
    (
        0,
        "安顿下来",
        "找个舒服的坐姿",
        "让座椅托住身体，双脚自然落地。",
        "接下来的两分钟，给身体一点休息的时间。找个舒服的坐姿，让座椅托住身体，双脚自然落地。不必看着屏幕，听着就好。",
    ),
    (
        23,
        "放松面部",
        "让眉心和下巴松一松",
        "牙齿不必咬紧，保持自然呼吸。",
        "留意一下你的眉心、脸颊和下巴。如果牙齿正咬紧，试着轻轻松开。不需要做出表情，保持自然呼吸。",
    ),
    (
        44,
        "放松肩膀",
        "让肩膀自然落下",
        "不用耸肩或转动脖子，以舒服为准。",
        "把注意力带到肩膀。如果肩膀有些提着，允许它自然落下来。不用耸肩，也不用转动脖子。找一个舒服的位置，停留一会儿。",
    ),
    (
        65,
        "放松双手",
        "把双手轻轻放好",
        "手掌搭在腿上，手指自然舒展。",
        "把双手轻轻放在腿上，松开手指。感受手掌和衣服接触的地方。不需要用力，让双手安静地歇一会儿。",
    ),
    (
        86,
        "安静停留",
        "就这样，歇一会儿",
        "不必努力放松，也不必改变呼吸。",
        "现在，感受身体被座椅支撑着。保持自然呼吸，不必努力达到某种状态。思绪走远了也没关系，慢慢回来就好。",
    ),
    (
        108,
        "回到当下",
        "按自己的节奏，慢慢结束",
        "留意周围的声音，轻轻活动手指。",
        "慢慢留意周围的声音，轻轻活动一下手指。按自己的节奏，结束这段休息。",
    ),
]


def main():
    key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not key:
        for line in (ROOT / ".env").read_text(encoding="utf-8-sig").splitlines():
            if line.strip().startswith("DASHSCOPE_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("\"'")
    if not key:
        raise SystemExit("DASHSCOPE_API_KEY is not configured")
    DEST.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    sample_rate = 22050
    track = bytearray(120 * sample_rate * 2)
    metadata = []
    for i, (start, label, title, cue, text) in enumerate(STEPS):
        cached = CACHE / f"segment-{i + 1}.wav"
        if not cached.exists():
            payload = {
                "model": "cosyvoice-v3-flash",
                "input": {
                    "text": text,
                    "voice": "longanhuan",
                    "format": "wav",
                    "sample_rate": sample_rate,
                    "volume": 60,
                    "rate": 0.85,
                    "pitch": 1.0,
                },
            }
            req = urllib.request.Request(
                "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
                data=json.dumps(payload).encode(),
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=90) as response:
                body = json.load(response)
            url = (
                body.get("output", {}).get("audio", {}).get("url")
                or body.get("output", {}).get("audio_url")
                or body.get("audio_url")
            )
            if not url:
                raise RuntimeError(
                    f"No audio URL returned: code={body.get('code')}, message={body.get('message')}"
                )
            if url.startswith("http://"):
                url = "https://" + url[7:]
            if not url.startswith("https://"):
                raise RuntimeError("Unsupported audio URL")
            with urllib.request.urlopen(url, timeout=90) as response:
                cached.write_bytes(response.read())
        with wave.open(io.BytesIO(cached.read_bytes())) as audio:
            if (audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) != (
                sample_rate,
                1,
                2,
            ):
                raise RuntimeError("Unexpected PCM format")
            pcm = audio.readframes(audio.getnframes())
        end = STEPS[i + 1][0] if i + 1 < len(STEPS) else 120
        seconds = len(pcm) / (sample_rate * 2)
        if seconds > end - start:
            raise RuntimeError(f"Segment {i + 1} exceeds its time slot: {seconds:.2f}s")
        offset = start * sample_rate * 2
        track[offset : offset + len(pcm)] = pcm
        metadata.append({"start": start, "label": label, "title": title, "cue": cue, "text": text})
        print(f"Segment {i + 1}: {seconds:.2f}s / slot {end - start}s", flush=True)
    with wave.open(str(DEST / "body-relax-120.wav"), "wb") as output:
        output.setparams((1, 2, sample_rate, 0, "NONE", "not compressed"))
        output.writeframes(track)
    (DEST / "guide.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("Created a 120-second local guide.")


if __name__ == "__main__":
    main()
