"""测评任务编排：Provider 流程 + 结果落库。

Demo 阶段以 FastAPI BackgroundTasks 驱动（单进程内 asyncio）。
真实联调（路线 A）下轮询可能耗时 80-90s，后续可平滑替换为 Celery worker。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select

from app.db.base import AsyncSessionLocal
from app.models.assessment import Assessment, AssessmentResult, AssessmentStatus
from app.services.qwen.report import generate_report
from app.services.v3.provider import get_v3_provider

logger = logging.getLogger(__name__)


async def run_assessment(assessment_id: UUID) -> None:
    """后台执行一次测评：上传 → 建任务 → 轮询 → 解析 → 落库。"""
    async with AsyncSessionLocal() as db:
        stmt = select(Assessment).where(Assessment.id == assessment_id)
        assessment = (await db.execute(stmt)).scalar_one_or_none()
        if assessment is None:
            logger.warning("assessment %s 不存在", assessment_id)
            return

        assessment.status = AssessmentStatus.processing
        await db.commit()

        try:
            provider = get_v3_provider()
            result = await provider.run(
                sds_score=assessment.sds_score,
                sas_score=assessment.sas_score,
            )

            summary = result.get("summary") or {}
            cs = summary.get("clinical_screening") or {}
            dep = cs.get("depression") or {}
            anx = cs.get("anxiety") or {}
            ov = summary.get("overall") or {}

            timeline = result.get("timeline")
            timeline_json = timeline if isinstance(timeline, dict) else None
            timeline_url = timeline if isinstance(timeline, str) else None
            # TODO(real): timeline 为 presigned URL 时，下载后转存到我们自己的 OSS，
            # 在此填入永久可访问的 timeline_url（合作方 URL 仅 1 小时有效）。

            ar = AssessmentResult(
                assessment_id=assessment.id,
                algorithm_version=result.get("algorithm_version"),
                summary_json=summary,
                overall_score=ov.get("score"),
                overall_level_label=(ov.get("level") or {}).get("label"),
                depression_classification=dep.get("classification"),
                depression_label=dep.get("classification_label"),
                depression_score=dep.get("score"),
                anxiety_classification=anx.get("classification"),
                anxiety_label=anx.get("classification_label"),
                anxiety_score=anx.get("score"),
                timeline_json=timeline_json,
                timeline_url=timeline_url,
            )
            db.add(ar)
            assessment.status = AssessmentStatus.completed
            assessment.completed_at = datetime.now(timezone.utc)
            await db.commit()
            logger.info("assessment %s 完成", assessment_id)

            # 生成 Qwen 个性化解读报告（失败不影响 V3 测评结果）
            try:
                ar.qwen_report = await generate_report(summary)
                await db.commit()
                logger.info("assessment %s Qwen 报告已生成", assessment_id)
            except Exception:  # noqa: BLE001
                logger.exception("assessment %s Qwen 报告生成失败（不影响测评结果）", assessment_id)
        except Exception as e:  # noqa: BLE001
            logger.exception("assessment %s 失败", assessment_id)
            await db.rollback()
            assessment = (
                await db.execute(select(Assessment).where(Assessment.id == assessment_id))
            ).scalar_one_or_none()
            if assessment is not None:
                assessment.status = AssessmentStatus.failed
                assessment.error_message = str(e)[:500]
                assessment.completed_at = datetime.now(timezone.utc)
                await db.commit()
