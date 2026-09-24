"""社区用户版 PDF 报告：仅展示合作方/V3 正式结果。

流程: 查库(assessment_result) → 提取合作方数据 → 空结果保护 → Jinja2 渲染 → weasyprint 转 PDF。
社区模式专用；航空模式走 admin-web 四页报告，不经过此服务。

内容边界：仅展示 V3 返回的综合概览、核心指标、筛查结果与文字摘要。
自评、心情图卡和模拟测试等体验层数据一律不进入 PDF。
若合作方结果为空或关键内容全部缺失，拒绝生成空 PDF。
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assessment import Assessment, AssessmentResult

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"
_OUTPUT_DIR = Path(__file__).resolve().parents[3] / "data" / "report-pdfs"

_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(["html"]),
)

# 核心指标中文映射（key → 展示名称），按 V3 core_indicators 实际字段
_CORE_KEYS = [
    ("stress_load", "压力负荷"),
    ("fatigue_recovery", "疲劳/恢复"),
    ("physiological_arousal", "生理唤醒"),
    ("attention_focus", "视觉注意力"),
    ("depression_related", "情绪低落线索"),
    ("anxiety_tension", "紧张方向线索"),
    ("execution_stability", "执行稳定性"),
]


def _num(value) -> float | None:
    try:
        n = float(value)
        return n if n == n else None  # NaN check
    except (TypeError, ValueError):
        return None


def _extract_overall(summary: dict) -> dict:
    """提取综合概览：分数、档位、置信度。"""
    ov = summary.get("overall") or {}
    conf = summary.get("confidence") or {}

    score = _num(ov.get("score"))
    level_label = None
    if isinstance(ov.get("level"), dict):
        level_label = ov["level"].get("label")
    elif isinstance(ov.get("level_label"), str):
        level_label = ov["level_label"]

    confidence = _num(conf.get("score"))
    if confidence is not None and confidence <= 1:
        confidence = round(confidence * 100)

    result = {}
    if score is not None:
        result["score"] = score
    if level_label:
        result["level_label"] = level_label
    if confidence is not None:
        result["confidence"] = int(confidence)
    return result


def _friendly_label(key: str, raw_label: str | None, severity) -> str:
    """与航空管理端 displayResultLabel 对齐：低风险标签统一显示为"正常"。

    - 生理唤醒"负荷较低"是安静放松的常态，显示"正常（低负荷）"
    - 参考范围/无明显风险/负荷较低 → "正常"
    - 其余保留合作方原始分类标签
    """
    if not raw_label:
        return "—"
    low_risk = severity == 0 or "参考范围" in raw_label or "无明显风险" in raw_label
    if key == "physiological_arousal" and ("负荷较低" in raw_label or "偏低" in raw_label):
        return "正常（低负荷）"
    if key == "physiological_arousal" and low_risk:
        return "正常"
    if low_risk and any(w in raw_label for w in ("参考范围", "无明显风险", "负荷较低")):
        return "正常"
    return raw_label


def _extract_core_metrics(summary: dict) -> list[dict]:
    """从 core_indicators 提取核心指标（兼容 core_metrics 旧结构）。

    分数用 grade_source_score（合作方分档依据），与航空管理端同源；
    标签做与 displayResultLabel 一致的友好化转换。
    """
    core = summary.get("core_indicators") or summary.get("core_metrics") or {}
    if not core and isinstance(summary.get("modules"), dict):
        core = summary["modules"].get("core_metrics") or {}

    metrics = []
    for key, label in _CORE_KEYS:
        item = core.get(key)
        if not isinstance(item, dict):
            continue
        score = _num(item.get("grade_source_score") or item.get("raw_score") or item.get("score"))
        raw_label = item.get("classification_label")
        if not raw_label and isinstance(item.get("level"), dict):
            raw_label = item["level"].get("label")
        level_obj = item.get("level") if isinstance(item.get("level"), dict) else {}
        severity = level_obj.get("severity")
        if score is None and not raw_label:
            continue
        metrics.append({
            "label": label,
            "score": int(score) if score is not None else None,
            "level": _friendly_label(key, raw_label, severity),
        })
    return metrics


def _extract_screening(summary: dict) -> list[dict]:
    """提取方向筛查（抑郁/焦虑）。"""
    cs = summary.get("clinical_screening") or {}
    items = []
    for key, label in [("depression", "情绪低落方向"), ("anxiety", "紧张方向")]:
        item = cs.get(key) or {}
        classification = item.get("classification_label") or item.get("classification")
        score = _num(item.get("score"))
        if classification is None and score is None:
            continue
        items.append({
            "label": label,
            "classification": classification or "—",
            "score": int(score) if score is not None else None,
        })
    return items


def _extract_text_summary(summary: dict, qwen_report: str | None) -> str | None:
    """提取合作方文字摘要：final_summary > Qwen 摘要 > product_logic_summary。"""
    text = summary.get("final_summary")
    if isinstance(text, str) and text.strip():
        return text.strip()

    if qwen_report:
        try:
            qwen = json.loads(qwen_report)
            if isinstance(qwen, dict):
                pages = qwen.get("pages") or qwen.get("page_summaries") or []
                if pages and isinstance(pages[0], dict) and pages[0].get("summary"):
                    return str(pages[0]["summary"]).strip()
                if qwen.get("summary"):
                    return str(qwen["summary"]).strip()
        except (json.JSONDecodeError, TypeError):
            pass

    pls = summary.get("product_logic_summary")
    if isinstance(pls, dict) and pls.get("positioning"):
        return str(pls["positioning"]).strip()
    return None


def generate_pdf_sync(
    db_result: AssessmentResult, assessment: Assessment
) -> tuple[Path | None, str | None]:
    """纯同步生成：提取数据 → 校验 → 渲染 → 转 PDF。"""
    summary = db_result.summary_json or {}

    overall = _extract_overall(summary)
    core_metrics = _extract_core_metrics(summary)
    screening = _extract_screening(summary)
    text_summary = _extract_text_summary(summary, db_result.qwen_report)

    # ---- 空结果保护：至少有一项有效合作方内容才生成 PDF ----
    has_content = bool(overall or core_metrics or screening or text_summary)
    if not has_content:
        reason = "合作方结果数据不完整（无综合概览/核心指标/筛查/摘要），暂不生成报告"
        logger.warning("PDF 拒绝生成 | assessment=%s 原因=%s", assessment.id, reason)
        return None, reason

    template = _env.get_template("report.html")
    html_content = template.render(
        nickname=assessment.name or "社区用户",
        created_at=(assessment.created_at or datetime.now()).strftime("%Y-%m-%d %H:%M"),
        report_id=f"CM-{assessment.id.hex[:12].upper()}",
        overall=overall,
        core_metrics=core_metrics,
        screening=screening,
        text_summary=text_summary,
        algorithm_version=db_result.algorithm_version,
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )

    _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path = _OUTPUT_DIR / f"{assessment.id.hex}.pdf"

    from weasyprint import HTML

    HTML(string=html_content).write_pdf(str(pdf_path))
    return pdf_path, None


async def generate_pdf(db: AsyncSession, assessment_id: UUID) -> tuple[Path | None, str | None]:
    """生成社区用户版 PDF。返回 (pdf_path, oss_key) 或 (None, error_reason)。"""
    assessment = (
        await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    ).scalar_one_or_none()
    if assessment is None:
        return None, "测评不存在"

    result = (
        await db.execute(
            select(AssessmentResult).where(AssessmentResult.assessment_id == assessment_id)
        )
    ).scalar_one_or_none()
    if result is None or not result.summary_json:
        return None, "V3 结果不存在"

    try:
        pdf_path, error = generate_pdf_sync(result, assessment)
    except Exception as e:
        logger.exception("PDF 生成失败 | assessment=%s", assessment_id)
        return None, f"PDF 生成失败: {e}"

    if pdf_path is None:
        return None, error

    file_size = pdf_path.stat().st_size
    logger.info("PDF 生成成功 | assessment=%s size=%dKB", assessment_id, file_size // 1024)

    # 发布到长期存储（StorageProvider：本地或 OSS，可替换）
    oss_key = None
    try:
        from app.services.storage import get_storage

        storage = get_storage()
        oss_key = await storage.publish(pdf_path, f"report-pdfs/{assessment.id.hex}.pdf")
        if oss_key:
            logger.info("PDF 已发布到 %s | key=%s", storage.name, oss_key)
    except Exception as e:
        logger.warning("PDF 发布失败(不影响本地): %s", e)

    return pdf_path, oss_key
