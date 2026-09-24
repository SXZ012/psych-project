from pathlib import Path
import sys
import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.core.config import settings

LINES = {
    "01-morning": "每天，我们忙着工作、照顾家人、安排生活。",
    "02-pause": "你有多久，没有问问自己，最近过得怎么样？",
    "03-weather": "开心、紧张、疲惫，都是生活里常有的感受。心理健康，是能留意自己的变化，照顾自己的需要。",
    "04-care": "就像关心睡眠和身体一样，我们也可以关心自己的情绪、精力，以及和他人相处时的感受。",
    "05-support": "留一点时间做喜欢的事，和信任的人聊一聊。如果困扰持续影响生活，也可以寻求专业支持。",
    "06-assessment": "现在，请花几分钟了解此刻的状态。先看操作示范，再跟随语音和画面，按照真实感受选择。",
    "07-ready": "这不是考试，没有标准答案。测评用于了解当前状态，不代替专业诊断。准备好，我们就开始。",
}

endpoint = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer"
headers = {"Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}", "Content-Type": "application/json"}
out = Path(__file__).parent / "public" / "audio"
with httpx.Client(timeout=120, follow_redirects=True) as client:
    for name, text in LINES.items():
        payload = {"model": "cosyvoice-v3-flash", "input": {"text": text, "voice": "longanhuan", "format": "mp3", "sample_rate": 22050, "volume": 65, "rate": 0.90, "pitch": 1.0, "instruction": "你说话的情感是neutral。"}}
        response = client.post(endpoint, headers=headers, json=payload)
        if response.is_error:
            raise RuntimeError(f"{name} HTTP {response.status_code}: {response.text[:1000]}")
        body = response.json()
        url = body.get("output", {}).get("audio", {}).get("url") or body.get("output", {}).get("audio_url") or body.get("audio_url")
        if not url:
            raise RuntimeError(str(body)[:500])
        audio = client.get(url)
        audio.raise_for_status()
        target = out / f"{name}.mp3"
        target.write_bytes(audio.content)
        print(target.name, len(audio.content))
