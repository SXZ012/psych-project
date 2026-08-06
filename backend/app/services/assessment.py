"""测评任务编排：Provider 流程 + 结果落库。

Demo 阶段以 FastAPI BackgroundTasks 驱动（单进程内 asyncio）。
真实联调（路线 A）下轮询可能耗时 80-90s，后续可平滑替换为 Celery worker。
"""
from __future__ import annotations

import logging
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from app.db.base import AsyncSessionLocal
from app.models.assessment import Assessment, AssessmentResult, AssessmentStatus
from app.services.qwen.report import generate_report
from app.services.oss.client import OSSClient
from app.services.v3.provider import get_v3_provider
from app.core.config import settings

logger = logging.getLogger(__name__)


async def run_assessment(assessment_id: UUID) -> None:
    """后台执行一次测评：上传 → 建任务 → 轮询 → 解析 → 落库。"""
    async with AsyncSessionLocal() as db:
        stmt = select(Assessment).where(Assessment.id == assessment_id)
        assessment = (await db.execute(stmt)).scalar_one_or_none()
        if assessment is None:
            logger.warning("assessment %s 不存在", assessment_id)
            return

        assessment.status = AssessmentStatus.video_processing
        assessment.processing_started_at = datetime.now(timezone.utc)
        await db.commit()

        try:
            if not assessment.video_storage_key:
                raise ValueError("测评视频缺失，无法开始分析")
            video_path = Path(__file__).resolve().parents[3] / "data" / assessment.video_storage_key
            if not video_path.is_file():
                raise FileNotFoundError(f"测评视频不存在: {assessment.video_storage_key}")

            # 我方保留一份私有OSS备份；本地文件只作为临时中转。
            if settings.OSS_ACCESS_KEY_ID and settings.OSS_ACCESS_KEY_SECRET and settings.OSS_BUCKET_NAME:
                backup_key = OSSClient.gen_object_key("assessment-videos", video_path.name)
                await asyncio.to_thread(
                    OSSClient().upload_file, video_path, backup_key, "video/webm"
                )
                assessment.backup_storage_key = backup_key
                assessment.backup_status = "completed"
                logger.info("assessment %s 我方视频备份完成: %s", assessment_id, backup_key)
            else:
                # Demo未配置我方OSS时保留本地文件，避免误删唯一副本。
                assessment.backup_status = "local_only"
                logger.warning("assessment %s 未配置我方OSS，视频仅保留本地临时副本", assessment_id)
            assessment.partner_upload_status = "pending"
            await db.commit()

            provider = get_v3_provider()
            assessment.status = AssessmentStatus.uploading
            assessment.video_status = "ready"
            await db.commit()
            # Provider.run encapsulates upload/create/poll; expose the long
            # running part as processing to the administrator UI.
            assessment.status = AssessmentStatus.processing
            assessment.partner_upload_status = "uploading"
            await db.commit()
            result = await provider.run(
                video_path=video_path,
            )
            assessment.partner_upload_status = "completed"

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
            assessment.status = AssessmentStatus.report_generating
            assessment.report_generated_at = datetime.now(timezone.utc)
            assessment.completed_at = datetime.now(timezone.utc)
            await db.commit()

            # 1.0保留QwenPlus：仅将V3事实层整理为供管理员复核的专业报告，
            # 不重算/新增任何分数，也不在用户端展示。Qwen不可用时仍保留V3结果。
            try:
                ar.qwen_report = await generate_report(summary)
                await db.commit()
                logger.info("assessment %s QwenPlus后台报告已生成", assessment_id)
            except Exception:  # noqa: BLE001
                logger.exception("assessment %s QwenPlus报告生成失败，保留V3结构化结果", assessment_id)

            assessment.status = AssessmentStatus.completed
            try:
                if assessment.backup_status == "completed":
                    video_path.unlink(missing_ok=True)
                    assessment.video_status = "deleted"
                else:
                    assessment.video_status = "retained_local_only"
            except OSError:
                assessment.video_status = "cleanup_failed"
                logger.exception("assessment %s 临时视频清理失败", assessment_id)
            await db.commit()
            logger.info("assessment %s 完成", assessment_id)
        except Exception as e:  # noqa: BLE001
            logger.exception("assessment %s 失败", assessment_id)
            await db.rollback()
            assessment = (
                await db.execute(select(Assessment).where(Assessment.id == assessment_id))
            ).scalar_one_or_none()
            if assessment is not None:
                assessment.status = AssessmentStatus.failed
                assessment.partner_upload_status = "failed" if assessment.partner_upload_status in {"pending", "uploading"} else assessment.partner_upload_status
                assessment.error_code = type(e).__name__
                assessment.error_message = str(e)[:500]
                assessment.completed_at = datetime.now(timezone.utc)
                await db.commit()
