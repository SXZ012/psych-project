"""上传前视频质量门禁与自动修复。

真机浏览器 ``MediaRecorder`` 以分片 (``start(1000)``) 生成的 WebM 常缺少容器级
``Duration``/``Cues`` 元数据，导致合作方 V3 读出 ``duration_seconds=0.0``、``frame_count``
负溢出，进而 rPPG / Vibra 正式分段 / 抑郁焦虑筛查全部 ``unavailable``。

本模块在上传合作方之前用 ``ffprobe`` 校验、用 ``ffmpeg`` 修复：

1. 时长已知且在 ``[30, 70]`` 秒内（含容器误差容差）→ 直通。
2. 时长缺失 → 无损重封装 (``-fflags +genpts -c copy``) 重建时间戳/补 Duration。
3. 仍无时长 → 转标准 H.264 MP4（``-t 70`` 兜底，无音频）。
4. 任何阶段超过 70s → 裁剪到 70s，确保最终文件不超过合作方上限。

原始文件始终保留，修复产物写到 ``<name>.repaired.{webm|mp4}``，便于审计。
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path

logger = logging.getLogger(__name__)

# 合作方约 60s 最佳、30–70s 可用；下界硬拒，上界裁剪到 70s。0.5s 浮点/容器容差。
MIN_DURATION = 30.0
MAX_DURATION = 70.0
TOLERANCE = 0.5
MIN_BYTES = 50_000  # 过小基本是空录/损坏

FFPROBE_TIMEOUT = 30
FFMPEG_TIMEOUT = 300


async def _run(cmd: list[str], timeout: float) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return 124, "", f"timeout after {timeout}s"
    return proc.returncode, out.decode("utf-8", "replace"), err.decode("utf-8", "replace")


def _fps(rate: str | None) -> float | None:
    if not rate or rate == "0/0":
        return None
    try:
        num, _, den = rate.partition("/")
        denom = float(den) if den else 1.0
        return float(num) / denom if denom else None
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _to_float(value: object) -> float | None:
    try:
        f = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # NaN -> None


async def probe(path: Path) -> dict:
    """用 ffprobe 读取容器与视频流信息（不要求音频流）。

    返回 JSON 可序列化的 dict：``has_video / duration / codec / width / height / fps / size``。
    duration 读不到时为 ``None``（这正是要修复的情形）。
    """
    info: dict = {
        "has_video": False,
        "duration": None,
        "codec": None,
        "width": None,
        "height": None,
        "fps": None,
        "size": path.stat().st_size if path.exists() else None,
    }
    rc, out, _ = await _run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
        FFPROBE_TIMEOUT,
    )
    if rc != 0 or not out:
        return info
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return info
    fmt = data.get("format") or {}
    info["duration"] = _to_float(fmt.get("duration"))
    for stream in data.get("streams") or []:
        if stream.get("codec_type") == "video":
            info["has_video"] = True
            info["codec"] = stream.get("codec_name")
            info["width"] = stream.get("width")
            info["height"] = stream.get("height")
            info["fps"] = _fps(stream.get("r_frame_rate")) or _fps(stream.get("avg_frame_rate"))
            break
    return info


async def _ffmpeg(args: list[str], label: str) -> tuple[bool, int]:
    t0 = time.monotonic()
    rc, _, err = await _run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], FFMPEG_TIMEOUT
    )
    ms = int((time.monotonic() - t0) * 1000)
    if rc != 0:
        logger.warning("ffmpeg %s 失败 rc=%d: %s", label, rc, err.strip()[:300])
    return rc == 0, ms


async def _trim_if_over(final: Path, probe_now: dict, report: dict) -> Path:
    """超过 70s(+容差)则裁剪，确保最终上传文件 ≤70s。"""
    duration = probe_now.get("duration")
    if duration is not None and duration > MAX_DURATION + TOLERANCE:
        trimmed = final.with_name(f"{final.stem}.trimmed{final.suffix}")
        ok, ms = await _ffmpeg(
            ["-i", str(final), "-t", str(MAX_DURATION), "-c", "copy", str(trimmed)], "trim"
        )
        if ok:
            report["steps"].append(
                {"step": "trim", "from": final.name, "to": trimmed.name, "elapsed_ms": ms}
            )
            return trimmed
    return final


def _too_short(duration: float | None) -> bool:
    return duration is not None and duration < MIN_DURATION - TOLERANCE


async def validate_and_repair(src: Path) -> tuple[Path | None, dict]:
    """校验并在必要时修复视频。

    返回 ``(最终可用文件路径 | None, 报告dict)``。``ok=True`` 时第一项为可上传文件
    （可能是原文件，也可能是 ``*.repaired.*``）；``ok=False`` 时第一项为 ``None`` 且
    ``report['reason']`` 给出明确原因。报告整体 JSON 可序列化，便于落库审计。
    """
    report: dict = {
        "ok": False,
        "reason": None,
        "original": None,
        "steps": [],
        "final_path": None,
        "final_probe": None,
    }
    if not src.is_file():
        report["reason"] = f"文件不存在: {src.name}"
        return None, report

    p0 = await probe(src)
    report["original"] = p0
    if not p0["has_video"]:
        report["reason"] = "无可解码视频流"
        return None, report
    if p0["size"] is not None and p0["size"] < MIN_BYTES:
        report["reason"] = f"文件过小({p0['size']}B)"
        return None, report

    d0 = p0["duration"]

    # 1) 时长已知：直接门禁（过短拒绝，过长裁剪，合格直通）。
    if d0 is not None:
        if _too_short(d0):
            report["reason"] = f"时长不足({d0:.1f}s < {MIN_DURATION:g}s)"
            return None, report
        final = await _trim_if_over(src, p0, report)
        report["final_path"] = str(final)
        report["final_probe"] = p0 if final == src else await probe(final)
        report["ok"] = True
        return final, report

    # 2) 时长缺失：无损重封装重建时间戳/补 Duration（保持原编码，最快）。
    remux = src.with_name(f"{src.stem}.repaired{src.suffix}")
    ok, ms = await _ffmpeg(
        ["-fflags", "+genpts", "-i", str(src), "-c", "copy", str(remux)], "remux"
    )
    pr = await probe(remux) if ok else None
    report["steps"].append(
        {
            "step": "remux",
            "to": remux.name,
            "elapsed_ms": ms,
            "probe": pr,
            "ok": bool(pr and pr["duration"] is not None),
        }
    )
    if pr and pr["duration"] is not None:
        if _too_short(pr["duration"]):
            report["reason"] = f"修复后时长仍不足({pr['duration']:.1f}s)"
            return None, report
        final = await _trim_if_over(remux, pr, report)
        report["final_path"] = str(final)
        report["final_probe"] = pr if final == remux else await probe(final)
        report["ok"] = True
        return final, report

    # 3) 仍无时长：转标准 H.264 MP4（-t 70 兜底；本项目不采集音频 → -an）。
    mp4 = src.with_name(f"{src.stem}.repaired.mp4")
    ok, ms = await _ffmpeg(
        [
            "-i",
            str(src),
            "-t",
            str(MAX_DURATION),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-an",
            "-movflags",
            "+faststart",
            str(mp4),
        ],
        "transcode",
    )
    pp = await probe(mp4) if ok else None
    report["steps"].append(
        {
            "step": "transcode",
            "to": mp4.name,
            "elapsed_ms": ms,
            "probe": pp,
            "ok": bool(pp and pp["duration"] is not None),
        }
    )
    if pp and pp["duration"] is not None and not _too_short(pp["duration"]):
        report["final_path"] = str(mp4)
        report["final_probe"] = pp
        report["ok"] = True
        return mp4, report

    report["reason"] = "无法恢复视频时长(重封装与转码均失败)"
    return None, report
