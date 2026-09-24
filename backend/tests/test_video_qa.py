"""视频上传前质检/修复测试。

需要 ffmpeg/ffprobe；用 lavfi 生成合格/过短夹具，并用真实“无时长 WebM”样本验证修复。
"""

import asyncio
import shutil
import subprocess
from pathlib import Path

import pytest

from app.services.video.qa import probe, validate_and_repair

FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")
REPO = Path(__file__).resolve().parents[2]
REAL_BROKEN = REPO / "data" / "videos" / "858f597697ba2474eb0c54421cafffb8.webm"

pytestmark = pytest.mark.skipif(not (FFMPEG and FFPROBE), reason="本测试需要 ffmpeg / ffprobe")


def _gen(path: Path, seconds: float) -> None:
    """用 lavfi 生成一段指定时长的 H.264 视频（无音频）。"""
    subprocess.run(
        [
            FFMPEG,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=640x480:rate=30",
            "-t",
            str(seconds),
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-an",
            str(path),
        ],
        check=True,
    )


def test_valid_video_passes_without_repair(tmp_path: Path) -> None:
    v = tmp_path / "ok.mp4"
    _gen(v, 59)
    final, report = asyncio.run(validate_and_repair(v))
    assert report["ok"] is True
    assert Path(final) == v  # 合格直通，未产生修复文件
    assert report["final_probe"]["duration"] >= 58


def test_too_short_video_is_rejected(tmp_path: Path) -> None:
    v = tmp_path / "short.mp4"
    _gen(v, 10)
    final, report = asyncio.run(validate_and_repair(v))
    assert report["ok"] is False
    assert final is None
    assert "时长不足" in (report["reason"] or "")


def test_over_long_video_is_trimmed(tmp_path: Path) -> None:
    v = tmp_path / "long.mp4"
    _gen(v, 75)  # 超过 70s 上限
    final, report = asyncio.run(validate_and_repair(v))
    assert report["ok"] is True
    assert report["final_probe"]["duration"] <= 70.0 + 0.5


def test_no_video_stream_is_rejected(tmp_path: Path) -> None:
    v = tmp_path / "garbage.mp4"
    v.write_bytes(b"\x00" * 200)  # 非视频数据
    final, report = asyncio.run(validate_and_repair(v))
    assert report["ok"] is False
    assert final is None


def test_real_duration_zero_webm_gets_repaired(tmp_path: Path) -> None:
    """真实 MediaRecorder 无时长 WebM：remux 后应恢复时长并通过门禁。

    仅当仓库内存在该问题样本时运行；复制到临时目录，不污染原文件。
    """
    if not REAL_BROKEN.is_file():
        pytest.skip("无真实无时长 WebM 样本")
    work = tmp_path / REAL_BROKEN.name
    shutil.copyfile(REAL_BROKEN, work)

    p0 = asyncio.run(probe(work))
    assert p0["duration"] is None  # 确认问题复现：容器无时长

    final, report = asyncio.run(validate_and_repair(work))
    assert report["ok"] is True
    assert Path(final) != work  # 产生了修复文件
    assert report["final_probe"]["duration"] >= 30  # 修复后落在 30–60s
    assert REAL_BROKEN.read_bytes() == work.read_bytes()  # 原文件未被改动
