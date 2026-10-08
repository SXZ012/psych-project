"""个人报告视图构建：后端白名单子集 + 终端四页报告数据源。

设计（personal-report-v2）：
- 终端个人报告与管理员网页报告使用同一份原始分析结果与同一套前端映射层
  （frontend/shared/report-kit）：后端只做"安全子集"裁剪，不做第二套口径；
- 白名单只放行用户域的摘要子树（筛查/核心指标/证据指标/质量/置信度/通知），
  管理端专属内容（AU 标注图与文件 id、候选帧、rPPG 波形、眼动原始序列、
  Qwen 内部报告、任务与错误字段）结构性排除在个人视图之外；
- 缺失字段原样缺失，前端显示"暂未提供/本次未提供"，不补零不造默认值。

处理中阶段文案：终端不出现"合作方/算法/任务/上传"等技术表述，
统一为两档用户文案（已提交，正在处理 / 报告生成中）。
"""

from __future__ import annotations

from app.models.assessment import Assessment, AssessmentResult

# 用户可见的统一状态（比内部任务态粗粒度）
USER_STATUS = {
    "pending": "processing",
    "video_processing": "processing",
    "uploading": "processing",
    "queued": "processing",
    "processing": "processing",
    "report_generating": "processing",
    "completed": "completed",
    "invalid_result": "invalid",
    "failed": "needs_attention",
}

# 终端用户可见的两档阶段文案（管理员后台仍使用各自的技术状态标签）
_STAGE_USER_LABELS = {
    "pending": "已提交，正在处理",
    "video_processing": "已提交，正在处理",
    "uploading": "已提交，正在处理",
    "queued": "已提交，正在处理",
    "processing": "已提交，正在处理",
    "report_generating": "报告生成中",
}

# 报告模板版本：任何影响用户可见口径的模板改动都要递增
REPORT_TEMPLATE_VERSION = "personal-report-v2"

# ── 个人视图白名单：summary_json 中允许下发的子树 ──
# 键为顶层键名；值为嵌套白名单：
#   None  = 整棵子树放行；set = 放行列出的键（各键整棵子树）；dict = 继续嵌套裁剪。
# 注意：modules 下只放行 eye_tracking.status（眼动是否采集），
# modules.au.visualization 含文件 id/图片地址，一律不放行。
_SUMMARY_WHITELIST: dict[str, dict | set | None] = {
    "clinical_screening": None,  # 方向筛查（抑郁/焦虑）用户域字段
    "core_indicators": None,  # 四项核心指标（分数/档位/阈值/解释）
    "small_indicators": None,  # 证据指标（AU/rPPG/Vibra/眼动代理）
    "product_logic_summary": {"state_severity", "positioning"},
    "confidence": None,  # 整体置信度（档位/分数/构成项）
    "quality": None,  # 采集质量（人脸有效率/质量/干扰/丢帧）
    "rppg_quality_gate": {"physiology_available", "unavailable_reasons", "reasons"},
    "formal_segment_status": None,  # 正式段可解释性（clinical_eligible/段数）
    "clinical_notice": None,  # 专业定位与使用限制（面向用户的说明）
    "modules": {"eye_tracking": {"status"}},
}


def _qa_ok(assessment: Assessment) -> bool | None:
    """上传前质检结论；旧记录无报告时为 None（前端显示"暂未提供"）。"""
    if not isinstance(assessment.video_qa_json, dict):
        return None
    return bool(assessment.video_qa_json.get("ok"))


def user_status(assessment: Assessment) -> str:
    return USER_STATUS.get(assessment.status, "needs_attention")


def stage_label(assessment: Assessment) -> str | None:
    """处理中阶段的用户文案（两档）；终端界面不再出现内部技术表述。"""
    if user_status(assessment) != "processing":
        return None
    return _STAGE_USER_LABELS.get(assessment.status, "已提交，正在处理")


def _filter_subtree(value, allowed: dict | set | None):
    """按白名单递归裁剪 dict；allowed=None 放行整棵子树；set 放行列出的键。"""
    if not isinstance(value, dict):
        return value
    if allowed is None:
        return value
    picked: dict = {}
    if isinstance(allowed, set):
        for key in allowed:
            if key in value:
                picked[key] = value[key]
        return picked
    for key, sub in allowed.items():
        if key in value:
            picked[key] = _filter_subtree(value[key], sub)
    return picked


def _summary_subset(summary: dict) -> dict:
    subset: dict = {}
    for key, allowed in _SUMMARY_WHITELIST.items():
        if key in summary:
            picked = _filter_subtree(summary[key], allowed)
            if isinstance(picked, dict) and picked:
                subset[key] = picked
    return subset


def build_report_view(assessment: Assessment, result: AssessmentResult) -> dict:
    """已完成的测评 → 终端个人报告载荷（安全子集）。

    结构与网页版管理员报告同源：`summary_subset` 即共享映射层
    （frontend/shared/report-kit/mapping.ts）的输入，两端在其上得到
    同一等级标签、颜色规则与指标解释；本视图不产生第二套分数或结论。
    """
    summary = result.summary_json if isinstance(result.summary_json, dict) else {}
    quality = assessment.capture_quality or {}

    meta = {
        "template_version": REPORT_TEMPLATE_VERSION,
        "submitted_at": assessment.submitted_at.isoformat() if assessment.submitted_at else None,
        "completed_at": assessment.completed_at.isoformat() if assessment.completed_at else None,
        "result_valid": assessment.result_valid,
        "capture": {
            "duration_seconds": assessment.duration_seconds,
            "effective_duration_seconds": quality.get("effective_duration_seconds"),
            "video_qa_ok": _qa_ok(assessment),
        },
        "review": {
            "review_status": assessment.review_status,
            # 复核流程 v1 仅记录状态；复核人与时间无独立字段，不编造
            "reviewed": assessment.review_status == "closed",
        },
        "disclaimer": "辅助筛查，不构成医学诊断和适航结论",
    }

    # 管理员报告读取 result 顶层的筛查分数/标签（overviewCards）；
    # 个人视图下发同一批顶层字段，保证两端总览一致。
    result_subset = {
        "overall_score": result.overall_score,
        "overall_level_label": result.overall_level_label,
        "depression_score": result.depression_score,
        "depression_label": result.depression_label,
        "depression_classification": result.depression_classification,
        "anxiety_score": result.anxiety_score,
        "anxiety_label": result.anxiety_label,
        "anxiety_classification": result.anxiety_classification,
    }

    return {
        **meta,
        "result_subset": result_subset,
        "summary_subset": _summary_subset(summary),
        # 兼容 v1 字段（老终端仍可读最小三层）；v2 终端以子集驱动四页报告
        "indicators": [
            {
                "key": "overall",
                "label": "综合状态指数",
                "value": result.overall_score,
                "unit": "分",
                "level_label": result.overall_level_label,
                "reference": None,
            },
        ]
        if isinstance(result.overall_score, (int, float))
        else [],
        "advice": {
            "needs_review_attention": assessment.review_status != "closed",
            "review_note": None,
        },
    }
