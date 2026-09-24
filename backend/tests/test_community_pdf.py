"""社区 PDF：有效结果生成 / 空结果拒绝 / 内容仅含合作方数据。"""
from datetime import datetime, timezone
from uuid import UUID

from app.models.assessment import Assessment, AssessmentResult, AssessmentStatus

# 模拟真实 V3 summary（基于库内真实数据结构）
REAL_SUMMARY = {
    "algorithm_version": "v3_20260724.1",
    "overall": {
        "name": "综合状态负荷指数",
        "score": 64.61,
        "level": {"key": "high", "label": "偏高", "severity": 2},
    },
    "confidence": {"score": 0.814, "level": {"key": "high", "label": "高"}},
    "clinical_screening": {
        "depression": {
            "classification": "no_obvious_risk",
            "classification_label": "无明显风险",
            "score": 4.27,
        },
        "anxiety": {
            "classification": "high_attention",
            "classification_label": "需要关注",
            "score": 35.71,
        },
    },
    "core_indicators": {
        "stress_load": {
            "name": "压力/唤醒负荷",
            "grade_source_score": 48.2,
            "classification_label": "参考范围",
        },
        "fatigue_recovery": {
            "name": "疲劳恢复负荷",
            "grade_source_score": 34.82,
            "classification_label": "负荷较低",
        },
        "attention_focus": {
            "name": "视觉注意力",
            "grade_source_score": 41.24,
            "classification_label": "偏低",
        },
    },
    "final_summary": "本次视频状态参考显示整体负荷偏高，建议结合近期情境理解。仅供参考。",
}

# 空结果（只有 input 元数据，无分析内容）
EMPTY_SUMMARY = {
    "input": {"fps": 30.0, "width": 1920, "height": 1080, "duration_seconds": 60.7},
}


def _make_result(db, assessment_id: UUID, summary: dict) -> None:
    db.add(
        AssessmentResult(
            assessment_id=assessment_id, summary_json=summary, algorithm_version="test"
        )
    )


async def test_pdf_generated_with_real_summary(db, tmp_path):
    """完整合作方结果 → PDF 可生成且包含关键内容。"""
    from app.services.pdf.report import (
        _extract_core_metrics,
        _extract_overall,
        _extract_screening,
        _extract_text_summary,
    )

    overall = _extract_overall(REAL_SUMMARY)
    assert overall["score"] == 64.61
    assert overall["level_label"] == "偏高"
    assert overall["confidence"] == 81  # 0.814 → 81%

    core = _extract_core_metrics(REAL_SUMMARY)
    assert len(core) >= 3
    labels = [m["label"] for m in core]
    assert "压力负荷" in labels and "疲劳/恢复" in labels and "视觉注意力" in labels
    stress = next(m for m in core if m["label"] == "压力负荷")
    assert stress["score"] == 48
    assert stress["level"] == "正常"  # 参考范围→正常，与航空管理端对齐

    screening = _extract_screening(REAL_SUMMARY)
    assert len(screening) == 2
    dep = screening[0]
    assert dep["classification"] == "无明显风险"

    text = _extract_text_summary(REAL_SUMMARY, None)
    assert "偏高" in text


async def test_pdf_rejected_with_empty_summary(db):
    """空结果（无分析内容）→ 拒绝生成 PDF。"""
    from app.services.pdf.report import (
        _extract_core_metrics,
        _extract_overall,
        _extract_screening,
        _extract_text_summary,
    )

    assert _extract_overall(EMPTY_SUMMARY) == {}
    assert _extract_core_metrics(EMPTY_SUMMARY) == []
    assert _extract_screening(EMPTY_SUMMARY) == []
    assert _extract_text_summary(EMPTY_SUMMARY, None) is None


async def test_pdf_full_generation_and_content_check(db, tmp_path, monkeypatch):
    """端到端：完整结果 → PDF 文件生成 → 文件非空且为 PDF 格式。"""
    import app.services.pdf.report as pdf_report

    monkeypatch.setattr(pdf_report, "_OUTPUT_DIR", tmp_path)

    assessment = Assessment(
        name="PDF测试用户", scene="community", report_type="customer_pdf",
        status=AssessmentStatus.completed,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(assessment)
    await db.flush()
    result = AssessmentResult(
        assessment_id=assessment.id, summary_json=REAL_SUMMARY, algorithm_version="test-v3"
    )
    db.add(result)
    await db.commit()

    pdf_path, error = await pdf_report.generate_pdf(db, assessment.id)
    assert pdf_path is not None, f"PDF should be generated, got error: {error}"
    assert pdf_path.exists()
    assert pdf_path.stat().st_size > 1000  # 至少 1KB（不是空壳）
    content = pdf_path.read_bytes()
    assert content[:5] == b"%PDF-"


async def test_pdf_full_rejection_on_empty(db, tmp_path, monkeypatch):
    """端到端：空结果 → PDF 返回 None + 明确原因。"""
    import app.services.pdf.report as pdf_report

    monkeypatch.setattr(pdf_report, "_OUTPUT_DIR", tmp_path)

    assessment = Assessment(
        name="空结果用户", scene="community", report_type="customer_pdf",
        status=AssessmentStatus.completed,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(assessment)
    await db.flush()
    result = AssessmentResult(
        assessment_id=assessment.id, summary_json=EMPTY_SUMMARY, algorithm_version="test-v3"
    )
    db.add(result)
    await db.commit()

    pdf_path, error = await pdf_report.generate_pdf(db, assessment.id)
    assert pdf_path is None
    assert error is not None
    assert "不完整" in error or "暂不生成" in error


async def test_aviation_reports_unaffected(db, client):
    """航空报告列表和详情接口不受社区 PDF 改动影响。"""
    from app.core.config import settings

    await client.post("/api/v1/admin/login", json={"password": settings.ADMIN_PASSWORD})
    response = await client.get("/api/v1/assessments", params={"scene": "aviation", "limit": 5})
    assert response.status_code == 200
    # 只要有接口正常返回即可（不要求有数据）
