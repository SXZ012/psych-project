from app.services.v3.provider import get_v3_provider


async def test_mock_provider_returns_real_sample():
    """路线 B：Mock Provider 回放真实样例，结构与线上接口一致。"""
    provider = get_v3_provider()
    result = await provider.run()

    assert result["schema_version"] == "emotion_runner_v3_wrapper_v1"
    summary = result["summary"]
    assert summary["schema_version"] == "report_json_v0.1"
    assert "clinical_screening" in summary
    assert "overall" in summary
    assert result["algorithm_version"] == "v3_20260724.1"
    assert "rppg_quality_gate" in summary
    assert "visualization" in summary["modules"]["au"]
    eye_tracking = result["timeline"]["display_payload"]["eye_tracking"]
    assert eye_tracking["status"] == "not_collected_in_upload_report"

    # 筛查字段与合规口径存在
    assert "depression" in summary["clinical_screening"]
    assert "anxiety" in summary["clinical_screening"]
