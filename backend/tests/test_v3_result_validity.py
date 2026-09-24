"""V3 返回结果有效性校验的纯函数测试（不依赖 ffmpeg/网络/数据库）。"""

from app.services.v3.validation import validate_v3_result


def test_valid_result_passes() -> None:
    summary = {
        "input": {"duration_seconds": 60.0, "frame_count": 1800},
        "quality": {"video_duration_seconds": 60.4},
        "session_duration_seconds": 60.7,
    }
    assert validate_v3_result(summary) == (True, None)


def test_duration_zero_invalid() -> None:
    # 真实故障形态：duration=0 + frame_count 负溢出
    summary = {
        "input": {"duration_seconds": 0.0, "frame_count": -276701161105643264},
        "quality": {"video_duration_seconds": 0.0},
    }
    ok, reason = validate_v3_result(summary)
    assert ok is False
    assert reason


def test_negative_frame_count_invalid() -> None:
    summary = {"input": {"duration_seconds": 60.0, "frame_count": -999}}
    ok, reason = validate_v3_result(summary)
    assert ok is False
    assert "frame_count" in reason


def test_does_not_infer_duration_from_sampled_frames() -> None:
    # 不能仅凭 sampled_frames / sample_fps 推断完整分析时长
    summary = {"input": {"sampled_frames": 199, "sample_fps": 10.0}}
    ok, _ = validate_v3_result(summary)
    assert ok is False


def test_non_dict_summary_invalid() -> None:
    assert validate_v3_result(None)[0] is False
    assert validate_v3_result("not a dict")[0] is False
