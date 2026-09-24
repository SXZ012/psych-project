"""测评任务编排：Provider 流程 + 结果落库。

执行由持久化任务层驱动（services/processing.py：DB 任务表 + worker，
同一事务入队、行锁领取、退避重试、服务重启恢复）。
本函数分阶段落库，可从既有进度续跑（已有 v3_task_id 则续查，避免重复创建）。

返回结局（供任务层区分"数据终态"与"处理故障"）：
completed / invalid_result / qa_failed / failed
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
from app.services.community import sync_community_order_status
from app.services.oss.client import OSSClient
from app.services.qwen.report import generate_report
from app.services.v3.assets import cache_au_image
from app.services.v3.provider import get_v3_provider
from app.services.v3.validation import validate_v3_result
from app.services.video.qa import validate_and_repair

logger = logging.getLogger(__name__)


async def run_assessment(assessment_id: UUID) -> str:
    """执行一次测评管道：上传 → 建任务 → 轮询 → 解析 → 落库。返回结局字符串。"""
    async with AsyncSessionLocal() as db:
        stmt = select(Assessment).where(Assessment.id == assessment_id)
        assessment = (await db.execute(stmt)).scalar_one_or_none()
        if assessment is None:
            logger.warning("assessment %s 不存在", assessment_id)
            return "missing"

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
            # 提交时已落库的首轮质检报告基于原始上传文件（含裁剪/修复步骤），
            # 是上传前门禁的审计依据；此处仅复核门禁，不覆盖已有合格报告。
            existing_qa = (
                assessment.video_qa_json
                if isinstance(assessment.video_qa_json, dict)
                else None
            )
            if not (existing_qa and existing_qa.get("ok")):
                assessment.video_qa_json = qa_report
            if not qa_report.get("ok"):
                assessment.video_status = "qa_failed"
                assessment.error_code = "VideoQAFailed"
                assessment.error_message = qa_report.get("reason") or "视频质检未通过"
                assessment.status = AssessmentStatus.failed
                assessment.completed_at = datetime.now(timezone.utc)
                await sync_community_order_status(db, assessment)
                await db.commit()
                logger.warning(
                    "assessment %s 视频质检未通过，未上传合作方: %s",
                    assessment_id,
                    qa_report.get("reason"),
                )
                return "qa_failed"
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

            # 幂等：任务重试（或状态误判重跑）时同一测评可能已有结果行，
            # 唯一约束 assessment_id 不允许二次 INSERT——改为更新已有行。
            ar = (
                await db.execute(
                    select(AssessmentResult).where(
                        AssessmentResult.assessment_id == assessment.id
                    )
                )
            ).scalar_one_or_none()
            if ar is not None:
                logger.info(
                    "assessment %s 结果行已存在，重试路径改为更新", assessment_id
                )
            ar = ar or AssessmentResult(assessment_id=assessment.id)
            ar.algorithm_version = result.get("algorithm_version")
            ar.summary_json = summary
            ar.overall_score = ov.get("score")
            ar.overall_level_label = (ov.get("level") or {}).get("label")
            ar.depression_classification = dep.get("classification")
            ar.depression_label = dep.get("classification_label")
            ar.depression_score = dep.get("score")
            ar.anxiety_classification = anx.get("classification")
            ar.anxiety_label = anx.get("classification_label")
            ar.anxiety_score = anx.get("score")
            ar.timeline_json = timeline_json
            ar.timeline_url = timeline_url
            db.add(ar)

            if result_valid:
                # 结果有效：生成正式 Qwen 报告并标记完成。
                assessment.status = AssessmentStatus.report_generating
                assessment.report_status = "generating"
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

                # 社区模式：生成用户版 PDF + 推送模板消息(航空模式不走此分支)
                if assessment.scene == "community":
                    try:
                        from app.services.pdf.report import generate_pdf
                        pdf_path, oss_key = await generate_pdf(db, assessment.id)
                        if pdf_path:
                            assessment.report_pdf_key = oss_key or str(pdf_path)
                            assessment.report_status = "ready"
                            from app.services.report_view import REPORT_TEMPLATE_VERSION
                            ar.report_template_version = REPORT_TEMPLATE_VERSION
                            logger.info(
                                "assessment %s 社区PDF已生成 | key=%s",
                                assessment_id, assessment.report_pdf_key,
                            )
                        else:
                            # 空结果保护：合作方数据不完整时不标记已完成，允许后续重试
                            assessment.status = AssessmentStatus.invalid_result
                            assessment.error_code = "PDFContentMissing"
                            assessment.error_message = (
                                oss_key or "合作方结果数据不完整，暂不生成报告"
                            )
                            assessment.report_status = "failed"
                            logger.warning(
                                "assessment %s 社区PDF拒绝生成 | %s",
                                assessment_id,
                                assessment.error_message,
                            )
                    except Exception:  # noqa: BLE001
                        assessment.report_status = "failed"
                        logger.exception(
                            "assessment %s 社区PDF生成失败(不影响主流程)", assessment_id
                        )

                    # 推送模板消息(如果配置了公众号)
                    try:
                        if assessment.customer_id:
                            from app.models.community import Customer
                            customer = await db.get(Customer, assessment.customer_id)
                            if customer and customer.openid:
                                from app.services.wechat.message import send_report_ready
                                await send_report_ready(
                                    openid=customer.openid,
                                    # 社区用户 H5 独立于航空管理后台；公众号消息直达该用户的报告页。
                                    report_url=f"/community/reports/{assessment.id}",
                                )
                                assessment.report_sent_at = datetime.now(timezone.utc)
                                logger.info(
                                    "assessment %s 模板消息已推送 | openid=%s...",
                                    assessment_id, customer.openid[:12],
                                )
                    except Exception:  # noqa: BLE001
                        logger.exception(
                            "assessment %s 模板消息推送失败(不影响主流程)", assessment_id
                        )
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
            # 分析到终态(completed/invalid_result)后回写社区订单状态；航空零副作用
            if assessment.status == AssessmentStatus.completed:
                # 终态时间戳在报告生成之后落：completed_at 不再早于报告产物
                assessment.completed_at = (
                    assessment.completed_at or datetime.now(timezone.utc)
                )
                assessment.report_generated_at = datetime.now(timezone.utc)
                if assessment.report_status == "generating":
                    # 航空无 PDF 环节，Qwen 结构化报告即成品；社区已由 PDF 分支置 ready/failed
                    assessment.report_status = "ready"
            await sync_community_order_status(db, assessment)
            await db.commit()
            logger.info("assessment %s 完成(status=%s)", assessment_id, assessment.status)
            # 注意返回枚举成员的 value（'completed'）；str(enum) 会得到
            # 'AssessmentStatus.completed'，任务层将误判为处理失败并重试。
            return assessment.status.value
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
                await sync_community_order_status(db, assessment)
                await db.commit()
            return "failed"
