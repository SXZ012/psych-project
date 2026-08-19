"""测评任务编排：Provider 流程 + 结果落库。

Demo 阶段以 FastAPI BackgroundTasks 驱动（单进程内 asyncio）。
真实联调（路线 A）下轮询可能耗时 80-90s，后续可平滑替换为 Celery worker。
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from app.core.config import settings
from app.db.base import AsyncSessionLocal
from app.models.assessment import Assessment, AssessmentResult, AssessmentStatus
from app.services.oss.client import OSSClient
from app.services.qwen.report import generate_report
from app.services.v3.assets import cache_au_image
from app.services.v3.provider import get_v3_provider
from app.services.v3.validation import validate_v3_result
from app.services.video.qa import validate_and_repair

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

            # 上传前质量门禁 + 自动修复：只有“可识别时长 30–60s”的视频才进 V3。
            final_video_path_obj, qa_report = await validate_and_repair(video_path)
            assessment.video_qa_json = qa_report
            if not qa_report.get("ok"):
                assessment.video_status = "qa_failed"
                assessment.error_code = "VideoQAFailed"
                assessment.error_message = qa_report.get("reason") or "视频质检未通过"
                assessment.status = AssessmentStatus.failed
                assessment.completed_at = datetime.now(timezone.utc)
                await db.commit()
                logger.warning(
                    "assessment %s 视频质检未通过，未上传合作方: %s",
                    assessment_id,
                    qa_report.get("reason"),
                )
                return
            final_video_path = Path(final_video_path_obj)
            assessment.video_status = "ready"
            await db.commit()
            logger.info(
                "assessment %s 视频质检通过，最终文件: %s",
                assessment_id,
                qa_report.get("final_path"),
            )

            # 我方保留一份私有OSS备份；本地文件只作为临时中转。
            if (
                settings.OSS_BACKUP_ENABLED
                and settings.OSS_ACCESS_KEY_ID
                and settings.OSS_ACCESS_KEY_SECRET
                and settings.OSS_BUCKET_NAME
            ):
                video_prefix = (
                    "assessment-videos/production"
                    if settings.ENV.lower() == "prod"
                    else "assessment-videos/test"
                )
                backup_key = OSSClient.gen_object_key(video_prefix, final_video_path.name)
                backup_ct = (
                    "video/mp4" if final_video_path.suffix.lower() == ".mp4" else "video/webm"
                )
                # 备份与合作方V3主流程相互独立：失败只标记状态，不阻断后续上传/分析。
                try:
                    await asyncio.to_thread(
                        OSSClient().upload_file, final_video_path, backup_key, backup_ct
                    )
                    assessment.backup_storage_key = backup_key
                    assessment.backup_status = "completed"
                    logger.info("assessment %s 我方视频备份完成: %s", assessment_id, backup_key)
                except Exception:  # noqa: BLE001
                    assessment.backup_status = "failed"
                    logger.exception(
                        "assessment %s 我方OSS备份失败(不影响V3主流程，本地保留): %s",
                        assessment_id,
                        backup_key,
                    )
            else:
                # 开发期关闭视频备份时保留本地文件，避免上传真人测试视频。
                assessment.backup_status = "local_only"
                logger.info("assessment %s OSS视频备份未启用，视频仅保留本地副本", assessment_id)
            assessment.partner_upload_status = "pending"
            await db.commit()

            provider = get_v3_provider()
            assessment.provider_mode = settings.PROVIDER_MODE.lower()
            assessment.status = AssessmentStatus.uploading
            assessment.video_status = "ready"
            assessment.partner_upload_status = "uploading"
            await db.commit()

            # 超时或进程重启后如果已有 task_id，直接续查合作方任务，避免重复上传/计费。
            if assessment.v3_task_id:
                task_id: str | int = assessment.v3_task_id
                assessment.partner_upload_status = "completed"
                logger.info("assessment %s 续查已有V3任务: %s", assessment_id, task_id)
            else:
                # 分阶段执行并保存合作方 file_id/task_id，便于定位失败环节。
                file_url, file_id = await provider.upload_video(video_path=final_video_path)
                assessment.v3_file_id = file_id
                assessment.partner_file_id = str(file_id)
                assessment.partner_upload_status = "completed"
                task = await provider.create_task(file_url=file_url, file_id=file_id)
                task_id = task["id"]
                assessment.v3_task_id = str(task_id)
                assessment.status = AssessmentStatus.queued
                await db.commit()

            assessment.status = AssessmentStatus.processing
            await db.commit()
            final_task = await provider.wait_task(task_id)
            result = await provider.get_result(final_task)

            summary = result.get("summary") or {}
            result_valid, invalid_reason = validate_v3_result(summary)
            assessment.result_valid = result_valid
            timeline = result.get("timeline")
            # V3.2 将上传模式的眼动采集状态放在 timeline.display_payload。
            # 归一到 summary，供后台展示和 Qwen 报告安全地判断“未采集”。
            if isinstance(timeline, dict):
                eye_tracking = ((timeline.get("display_payload") or {}).get("eye_tracking"))
                if isinstance(eye_tracking, dict):
                    summary.setdefault("modules", {}).setdefault("eye_tracking", eye_tracking)
            cs = summary.get("clinical_screening") or {}
            dep = cs.get("depression") or {}
            anx = cs.get("anxiety") or {}
            ov = summary.get("overall") or {}

            timeline_json = timeline if isinstance(timeline, dict) else None
            timeline_url = None
            if isinstance(timeline, str):
                # 合作方地址约1小时失效，必须在任务完成后立即下载并持久化。
                download_timeline = getattr(provider, "download_timeline", None)
                if download_timeline is None:
                    raise RuntimeError("真实V3结果包含临时timeline地址，但Provider不支持下载")
                timeline_json = await download_timeline(timeline)
                logger.info("assessment %s V3 timeline已下载并持久化", assessment_id)

            # 合作方 AU 图片是短期签名地址，任务完成后立即持久化。
            # 图片失败不应阻断结构化报告生成，后台接口仍可按 file_id 懒恢复。
            try:
                await cache_au_image(summary, assessment.id, provider)
            except Exception:  # noqa: BLE001
                logger.exception("assessment %s AU图片持久化失败，稍后按需恢复", assessment_id)

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

            if result_valid:
                # 结果有效：生成正式 Qwen 报告并标记完成。
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
                    logger.exception(
                        "assessment %s QwenPlus报告生成失败，保留V3结构化结果", assessment_id
                    )
                assessment.status = AssessmentStatus.completed
            else:
                # 合作方未正确识别视频时长/分析结果无效：不作为正式可解释报告；
                # 仍保留 V3 原始 summary/timeline 供排查。
                assessment.status = AssessmentStatus.invalid_result
                assessment.error_code = "InvalidV3Result"
                assessment.error_message = (
                    f"合作方未正确识别视频时长/分析结果无效：{invalid_reason}"
                )
                assessment.completed_at = datetime.now(timezone.utc)
                logger.warning("assessment %s V3结果无效: %s", assessment_id, invalid_reason)

            # 本地视频清理：备份成功才删最终文件；修复过的保留原始问题文件审计
            try:
                if assessment.backup_status == "completed":
                    if final_video_path != video_path:
                        final_video_path.unlink(missing_ok=True)
                        assessment.video_status = "retained_original_for_audit"
                    else:
                        video_path.unlink(missing_ok=True)
                        assessment.video_status = "deleted"
                else:
                    assessment.video_status = "retained_local_only"
            except OSError:
                assessment.video_status = "cleanup_failed"
                logger.exception("assessment %s 临时视频清理失败", assessment_id)
            await db.commit()
            logger.info("assessment %s 完成(status=%s)", assessment_id, assessment.status)
        except Exception as e:  # noqa: BLE001
            logger.exception("assessment %s 失败", assessment_id)
            await db.rollback()
            assessment = (
                await db.execute(select(Assessment).where(Assessment.id == assessment_id))
            ).scalar_one_or_none()
            if assessment is not None:
                assessment.status = AssessmentStatus.failed
                if assessment.partner_upload_status in {"pending", "uploading"}:
                    assessment.partner_upload_status = "failed"
                assessment.error_code = type(e).__name__
                assessment.error_message = str(e)[:500]
                assessment.completed_at = datetime.now(timezone.utc)
                await db.commit()
