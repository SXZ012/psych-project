"""个人安全报告视图（personal-report-v2）测试。

锁定的契约：
- 白名单子树完整下发（筛查/核心/证据/质量/置信度/眼动状态）——终端四页的数据源；
- 管理端专属内容结构性排除：AU 可视化文件 id、图片地址、Qwen 内部报告、
  错误码/任务字段、原始 timeline；
- 处理中阶段只输出两档用户文案，不出现"合作方/算法/任务/上传"。
"""

from __future__ import annotations

import json

from app.models.assessment import Assessment, AssessmentResult, AssessmentStatus
from app.services.report_view import build_report_view, stage_label


def _assessment() -> Assessment:
    return Assessment(
        name="视图测试",
        scene="aviation",
        status=AssessmentStatus.completed,
        duration_seconds=60,
        selections_data={"capture_quality": {"effective_duration_seconds": 60}},
        video_qa_json={"ok": True},
        review_status="pending",
        submitted_at=None,
    )


def _result() -> AssessmentResult:
    return AssessmentResult(
        algorithm_version="v3_test",
        overall_score=40.4,
        overall_level_label="参考范围",
        depression_score=69.26,
        depression_label="高风险关注",
        depression_classification="high_attention",
        anxiety_score=55.27,
        anxiety_label="无明显风险",
        anxiety_classification="no_obvious_risk",
        summary_json={
            "clinical_screening": {
                "depression": {"score": 69.26, "classification": "high_attention"},
            },
            "core_indicators": {
                "stress_load": {
                    "grade_source_score": 40,
                    "classification_label": "参考范围",
                    "level": {"label": "参考范围", "severity": 0},
                },
            },
            "small_indicators": {
                "eye_tracking": {"attention_focus_score": {"value": 70, "unit": "score"}},
                "au": {"facial_variability": {"value": 12, "unit": "score"}},
            },
            "product_logic_summary": {
                "state_severity": {"stress_load": {"label": "x"}},
                "other_internal": "should-dropped",
            },
            "confidence": {"level": {"key": "low", "label": "低"}, "score": 0.5},
            "quality": {"face_valid_ratio": 0.98},
            "modules": {
                "eye_tracking": {"status": "collected"},
                "au": {
                    "visualization": {
                        "image_url": "https://oss/example.jpg",
                        "image_url_file_id": 123,
                    }
                },
            },
            "internal_only": {"task_id": "should-not-leak"},
        },
        timeline_json={"display_payload": {"rppg_waveforms": {"waveforms": {"hr_avg": []}}}},
        qwen_report=json.dumps({"schema_version": "qwen_page_summaries_v2", "pages": {}}),
    )


def test_personal_view_carries_four_page_sources() -> None:
    view = build_report_view(_assessment(), _result())
    subset = view["summary_subset"]
    # 四页数据源齐备：总览(质量/置信) 情绪(筛查) 行为(证据/眼动状态) 建议(通知缺省可不返回)
    assert "clinical_screening" in subset
    assert "core_indicators" in subset
    assert "small_indicators" in subset
    assert subset["confidence"]["level"]["key"] == "low"
    assert subset["modules"]["eye_tracking"]["status"] == "collected"
    assert view["result_subset"]["depression_score"] == 69.26
    assert view["review"]["reviewed"] is False


def test_personal_view_structurally_excludes_admin_content() -> None:
    view = build_report_view(_assessment(), _result())
    payload = json.dumps(view, ensure_ascii=False)
    # 管理端专属：AU 图地址/文件 id、Qwen、timeline 波形、内部键
    assert "image_url" not in payload
    assert "oss/example" not in payload
    assert "qwen" not in payload
    assert "waveforms" not in payload
    assert "internal_only" not in payload
    assert "other_internal" not in payload
    # 白名单子树内的嵌套裁剪：product_logic_summary 只留 state_severity/positioning
    assert set(view["summary_subset"]["product_logic_summary"]) == {"state_severity"}


def test_processing_stage_labels_are_user_safe() -> None:
    for status_value, expected in [
        ("pending", "已提交，正在处理"),
        ("video_processing", "已提交，正在处理"),
        ("uploading", "已提交，正在处理"),
        ("queued", "已提交，正在处理"),
        ("processing", "已提交，正在处理"),
        ("report_generating", "报告生成中"),
    ]:
        assessment = Assessment(status=AssessmentStatus(status_value))
        label = stage_label(assessment) or ""
        assert label == expected
        # 终端文案不得出现内部技术表述
        for banned in ("合作方", "算法", "任务", "上传"):
            assert banned not in label
    # 非处理中不返回阶段
    assert stage_label(Assessment(status=AssessmentStatus.completed)) is None
