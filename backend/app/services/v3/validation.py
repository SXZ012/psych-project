"""V3 返回结果的有效性校验。

合作方在视频容器缺少 Duration 时会返回 ``input.duration_seconds=0.0``、
``frame_count`` 为负溢出，导致 rPPG / Vibra 正式分段 / 抑郁焦虑筛查被判 ``unavailable``。
拿到 V3 结果后调用本函数：若时长为 0 或异常，则该结果不可作为正式可解释报告。
注意：不依据 ``sampled_frames / sample_fps`` 推断完整分析时长。
"""

from __future__ import annotations


def _to_float(value: object) -> float | None:
    try:
        f = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # NaN -> None


def validate_v3_result(summary: dict | None) -> tuple[bool, str | None]:
    """返回 ``(是否有效, 原因)``。有效时原因为 ``None``。"""
    if not isinstance(summary, dict):
        return False, "V3 结果缺少 summary"

    inp = summary.get("input") or {}
    quality = summary.get("quality") or {}

    durations = [
        _to_float(inp.get("duration_seconds")),
        _to_float(quality.get("video_duration_seconds")),
        _to_float(summary.get("session_duration_seconds")),
    ]
    durations = [d for d in durations if d is not None]

    frame_count = _to_float(inp.get("frame_count"))
    if frame_count is not None and frame_count < 0:
        return False, f"frame_count 异常({frame_count})"

    if not durations:
        return False, "V3 未返回任何时长字段"
    if max(durations) <= 0:
        return False, f"V3 返回时长为 0({durations})"
    return True, None
