"""测评接口：提交（含视频）、列表、查询状态与结果。"""
import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.admin_auth import require_admin_session
from app.core.config import _REPO_ROOT, settings
from app.db.base import get_db
from app.models.assessment import Assessment, AssessmentStatus
from app.schemas.assessment import AssessmentDetail, AssessmentOut, AssessmentSubmitOut
from app.services.community import (
    SessionBindingError,
    authorize_community_submission,
    mark_order_analyzing,
)
from app.services.processing import enqueue_assessment_task, requeue_task_for_retry
from app.services.report_access import generate_access_code, hash_access_code
from app.services.v3.assets import cache_au_image, find_cached_au_image
from app.services.v3.provider import get_v3_provider
from app.services.video.qa import validate_and_repair

logger = logging.getLogger("app.routes.assessments")
router = APIRouter()

# 上传安全限制
ALLOWED_VIDEO_TYPES = {"video/webm", "video/mp4", "video/quicktime", "application/octet-stream"}
ALLOWED_VIDEO_EXTS = {".webm", ".mp4", ".mov"}
MAX_VIDEO_SIZE = 200 * 1024 * 1024  # 200MB


async def _save_video(video: UploadFile) -> tuple[str, str]:
    """Validate and persist an uploaded video with a server-generated name."""
    if not video.filename:
        raise HTTPException(status_code=422, detail="视频文件必填")
    ct = video.content_type or ""
    if ct not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=415, detail=f"不支持的视频类型: {ct}")
    ext = "." + video.filename.rsplit(".", 1)[-1].lower() if "." in video.filename else ""
    if ext not in ALLOWED_VIDEO_EXTS:
        raise HTTPException(status_code=415, detail=f"不支持的视频格式: {ext}")
    safe_id = secrets.token_hex(16)
    ext = ".webm" if "webm" in ct or ext == ".webm" else ext
    video_dir = _REPO_ROOT / "data" / "videos"
    video_dir.mkdir(parents=True, exist_ok=True)
    video_path = video_dir / f"{safe_id}{ext}"
    content = await video.read(MAX_VIDEO_SIZE + 1)
    if not content:
        raise HTTPException(status_code=422, detail="视频文件为空")
    if len(content) > MAX_VIDEO_SIZE:
        max_mb = MAX_VIDEO_SIZE // 1024 // 1024
        raise HTTPException(status_code=413, detail=f"视频过大，最大允许{max_mb}MB")
    video_path.write_bytes(content)
    return f"videos/{safe_id}{ext}", video.filename


async def _validate_uploaded_video(storage_key: str) -> tuple[str, dict]:
    """在创建测评前完成一次可见的质量门禁。

    终端需要在当前会话得到明确结果：不合格视频不能先显示“已完成”、再在后台静默失败。
    返回 (可提交的最终文件相对 data/ 路径, 首轮质检报告)；失败时删除本次临时文件并给前端稳定错误码。
    首轮报告基于原始上传文件（含裁剪/修复步骤），是上传前门禁的审计依据，须随测评落库。
    """
    data_dir = (_REPO_ROOT / "data").resolve()
    video_path = (data_dir / storage_key).resolve()
    if data_dir not in video_path.parents:
        raise HTTPException(status_code=500, detail="视频路径异常")
    final_path, report = await validate_and_repair(video_path)
    if not report.get("ok") or final_path is None:
        video_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422,
            detail={
                "code": "VideoQAFailed",
                "message": report.get("reason") or "视频质量未达到分析要求",
            },
        )
    final_path = final_path.resolve()
    if data_dir not in final_path.parents:
        raise HTTPException(status_code=500, detail="视频质检路径异常")
    # 修复/裁剪产生了新文件时，只保留可用于后续分析的版本。
    if final_path != video_path:
        video_path.unlink(missing_ok=True)
    return final_path.relative_to(data_dir).as_posix(), report


@router.post("/submit", response_model=AssessmentSubmitOut, status_code=status.HTTP_201_CREATED)
async def submit_assessment(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
    video: Annotated[UploadFile | None, File()] = None,
    name: Annotated[str, Form()] = "",
    id_card: Annotated[str, Form()] = "",
    selections: Annotated[str, Form()] = "[]",
    duration_seconds: Annotated[int, Form()] = 0,
    effective_duration_seconds: Annotated[int, Form()] = 0,
    paused_count: Annotated[int, Form()] = 0,
    session_id: Annotated[str, Form()] = "",
    self_report: Annotated[str, Form()] = "",
    interaction: Annotated[str, Form()] = "",
    subject_id: Annotated[str, Form()] = "",
    gender: Annotated[str, Form()] = "",
    age: Annotated[str, Form()] = "",
    # 采集协议审计（采集流程升级新增；可选，旧终端不传不受影响）
    protocol_version: Annotated[str, Form()] = "",
    timeline_version: Annotated[str, Form()] = "",
    interruptions: Annotated[int, Form()] = -1,
    interrupted_ms: Annotated[int, Form()] = -1,
    # 题库内容版本与调度兜底审计（自定节奏调度升级；可选）
    content_version: Annotated[str, Form()] = "",
    scheduling_notes: Annotated[str, Form()] = "",
    # 终端幂等令牌：同一次测评的重试复用同一 token，不重复建记录
    client_token: Annotated[str, Form()] = "",
    # 知情同意版本（可追溯字段；旧终端不传不受影响）
    consent_version: Annotated[str, Form()] = "",
) -> AssessmentSubmitOut:
    """接收视频+答题数据，创建测评。用户端拿到 201 后即可显示'测评已完成'。
    后台异步处理视频转码+V3分析+报告生成。

    社区场景：终端只能传 session_id（来自支付成功的会话），scene/customer/order/device
    全部由后端从会话推导写入，前端传入的同名字段一律忽略；未支付/过期/已使用的
    会话直接拒绝提交。航空场景不传 session_id，行为与原先完全一致。

    幂等：携带 client_token 的重试若已创建过测评，则更新该记录并重试后台任务
    （返回 200），绝不重复创建——网络失败后"再试一次"是安全的。
    """
    # 社区会话校验（传了 session_id 才走；航空提交不传，保持原行为）
    community = None
    if session_id.strip():
        try:
            parsed_session_id = UUID(session_id.strip())
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="session_id 格式非法") from exc
        # 社区幂等重试：首次提交已落库（含后台任务）但响应丢失时，原样返回
        # 已有测评（200），不因 409 让已付款用户陷入"已提交却拿不到报告"。
        existing_community = (
            await db.execute(
                select(Assessment)
                .where(
                    Assessment.assessment_session_id == parsed_session_id,
                    Assessment.scene == "community",
                )
                .order_by(Assessment.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if existing_community is not None:
            response.status_code = status.HTTP_200_OK
            payload = AssessmentOut.model_validate(existing_community).model_dump(mode="json")
            return AssessmentSubmitOut.model_validate({**payload, "access_code": None})
        try:
            community = await authorize_community_submission(db, parsed_session_id)
        except SessionBindingError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    clean_client_token = client_token.strip()[:64]
    if clean_client_token and community is None:
        existing = (
            await db.execute(
                select(Assessment).where(Assessment.client_token == clean_client_token)
            )
        ).scalar_one_or_none()
        if existing is not None:
            if existing.scene != "aviation":
                raise HTTPException(status_code=409, detail="client_token 已绑定其他场景的测评")
            response.status_code = status.HTTP_200_OK   # 幂等重试：更新而非创建
            updated = await _retry_existing_assessment(
                existing,
                db=db,
                video=video,
                name=name,
                id_card=id_card,
                selections=selections,
                duration_seconds=duration_seconds,
                effective_duration_seconds=effective_duration_seconds,
                paused_count=paused_count,
                subject_id=subject_id,
                gender=gender,
                age=age,
                protocol_version=protocol_version,
                timeline_version=timeline_version,
                interruptions=interruptions,
                interrupted_ms=interrupted_ms,
                content_version=content_version,
                scheduling_notes=scheduling_notes,
            )
            # 若首次响应在网络中丢失，终端无法取回旧查询码明文。幂等重试时
            # 为同一测评轮换一个新码，旧码立即失效，避免用户陷入“已提交但无法查询”。
            replacement_code = generate_access_code()
            updated.report_access_token_hash = hash_access_code(replacement_code)
            updated.report_access_token_created_at = datetime.now(timezone.utc)
            updated.report_access_token_revoked_at = None
            await db.commit()
            await db.refresh(updated)
            payload = AssessmentOut.model_validate(updated).model_dump(mode="json")
            return AssessmentSubmitOut.model_validate(
                {**payload, "access_code": replacement_code}
            )

    # 社区提交允许匿名（报告面向微信用户，不采集姓名/身份证）
    if community is not None:
        _, _, customer = community
        name = name.strip() or customer.nickname or "社区用户"
    elif not name.strip():
        raise HTTPException(status_code=422, detail="姓名必填")

    # 解析答题数据
    try:
        selections_list = json.loads(selections)
    except (json.JSONDecodeError, TypeError):
        selections_list = []

    # 社区前置自评（3 题问卷，进入 PDF 报告"自我感受"区）
    try:
        self_report_data = json.loads(self_report) if self_report.strip() else None
    except (json.JSONDecodeError, TypeError):
        self_report_data = None
    if not isinstance(self_report_data, dict):
        self_report_data = None

    # 社区互动记录（心情图卡 + 三个小游戏），仅作社区辅助数据，不影响 V3 结论
    try:
        interaction_data = json.loads(interaction) if interaction.strip() else None
    except (json.JSONDecodeError, TypeError):
        interaction_data = None
    if not isinstance(interaction_data, dict):
        interaction_data = None

    # 视频安全校验 + 安全存储（无摄像头时可选）
    video_storage_key = None
    video_orig_name = None
    video_status = None
    video_qa_json = None
    if video and video.filename:
        video_storage_key, video_orig_name = await _save_video(video)
        video_storage_key, video_qa_json = await _validate_uploaded_video(video_storage_key)
        video_status = "received"
        logger.info("视频已接收: %s", video_storage_key)

    selections_data: dict = {"selections": selections_list}
    # 前端在正式采集中累计的有效时长与暂停次数，供质量审计与后续复测判断使用。
    # 它们是终端采集元数据，不替代后端对实际视频的 ffprobe 质检。
    if community is None:
        selections_data["capture_quality"] = {
            "effective_duration_seconds": max(0, min(effective_duration_seconds, 600)),
            "paused_count": max(0, min(paused_count, 99)),
        }
        # 采集协议审计字段（strict-continuous 升级）：仅终端显式上报时记录
        if protocol_version.strip():
            selections_data["capture_quality"]["protocol_version"] = protocol_version.strip()[:32]
        if timeline_version.strip():
            selections_data["capture_quality"]["timeline_version"] = timeline_version.strip()[:32]
        if interruptions >= 0:
            selections_data["capture_quality"]["interruptions"] = min(interruptions, 999)
        if interrupted_ms >= 0:
            selections_data["capture_quality"]["interrupted_ms"] = min(interrupted_ms, 600_000)
        # 自定节奏调度审计：题库内容版本与兜底事件（题池耗尽时刻等）
        if content_version.strip():
            selections_data["capture_quality"]["content_version"] = content_version.strip()[:32]
        if scheduling_notes.strip():
            try:
                notes = json.loads(scheduling_notes)
                if isinstance(notes, list):
                    selections_data["capture_quality"]["scheduling_notes"] = [
                        str(note)[:128] for note in notes[:20]
                    ]
            except (json.JSONDecodeError, TypeError):
                pass
    if self_report_data is not None:
        selections_data["self_report"] = self_report_data
    if interaction_data is not None and community is not None:
        selections_data["community_interaction"] = interaction_data

    # 终端登录页四项：工号入既有 subject_id 列；性别/年龄入 selections_data.basic_info。
    # 仅航空采集（社区用户身份来自支付会话）；旧终端不传时完全不受影响。
    basic_info: dict | None = None
    if community is None:
        clean_gender = gender.strip()
        clean_age: int | None = None
        try:
            parsed_age = int(age.strip())
            if 1 <= parsed_age <= 120:
                clean_age = parsed_age
        except ValueError:
            clean_age = None
        if clean_gender in ("男", "女") or clean_age is not None:
            basic_info = {}
            if clean_gender in ("男", "女"):
                basic_info["gender"] = clean_gender
            if clean_age is not None:
                basic_info["age"] = clean_age
        if basic_info is not None:
            selections_data["basic_info"] = basic_info

    assessment_kwargs: dict = {}
    if community is not None:
        sess, order, _ = community
        assessment_kwargs = {
            "scene": "community",
            "customer_id": sess.customer_id,
            "order_id": order.id,
            "device_id": sess.device_id,
            "report_type": "customer_pdf",
            "assessment_session_id": sess.id,
        }

    # 报告查询凭证：高熵明文码只在本次响应返回一次；库中只存哈希
    access_code: str | None = None
    if community is None:
        access_code = generate_access_code()

    assessment = Assessment(
        name=name.strip(),
        id_card=id_card.strip() or None,
        subject_id=(subject_id.strip() or None) if community is None else None,
        client_token=clean_client_token or None,
        # 一体化可追溯字段（旧终端不传时为空，不影响既有数据）
        consent_version=consent_version.strip()[:32] or None,
        capture_protocol_version=protocol_version.strip()[:64] or None,
        question_protocol_version=timeline_version.strip()[:64] or None,
        content_version=content_version.strip()[:64] or None,
        selections_data=selections_data,
        duration_seconds=duration_seconds or None,
        video_storage_key=video_storage_key,
        video_filename=video_orig_name,
        video_status=video_status,
        video_qa_json=video_qa_json,
        status=AssessmentStatus.pending,
        provider_mode=settings.PROVIDER_MODE,
        submitted_at=datetime.now(timezone.utc),
        **assessment_kwargs,
    )
    db.add(assessment)
    if community is None and access_code is not None:
        assessment.report_access_token_hash = hash_access_code(access_code)
        assessment.report_access_token_created_at = datetime.now(timezone.utc)
    # Python 侧 UUID/default 字段在 flush 时才生成。任务必须拿到真实 assessment_id，
    # 才能与测评在同一事务内创建并满足外键约束。
    await db.flush()
    if community is not None:
        sess, order, _ = community
        # 会话推进为已提交 + 订单回填测评ID并进入分析中，与测评创建同事务落库
        sess.status = "submitted"
        order.assessment_id = assessment.id
        await mark_order_analyzing(db, order.id)

    # 持久化任务与测评同事务创建：提交成功即有任务，服务重启可恢复
    await enqueue_assessment_task(db, assessment.id, assessment.scene)
    await db.commit()
    await db.refresh(assessment)

    logger.info(
        "测评提交成功: id=%s name=%s video=%s scene=%s",
        assessment.id,
        name.strip(),
        video_status or "无视频",
        assessment.scene,
    )
    # 一次性下发查询码明文（不写日志；重试命中幂等路径不再返回）
    payload = AssessmentOut.model_validate(assessment).model_dump(mode="json")
    return AssessmentSubmitOut.model_validate({**payload, "access_code": access_code})


@router.post("/{assessment_id}/resubmit", response_model=AssessmentOut)
async def resubmit_assessment(
    assessment_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_admin_session)],
    name: Annotated[str, Form()] = "",
    id_card: Annotated[str, Form()] = "",
    selections: Annotated[str, Form()] = "[]",
    duration_seconds: Annotated[int, Form()] = 0,
    effective_duration_seconds: Annotated[int, Form()] = 0,
    paused_count: Annotated[int, Form()] = 0,
    video: Annotated[UploadFile | None, File()] = None,
    subject_id: Annotated[str, Form()] = "",
    gender: Annotated[str, Form()] = "",
    age: Annotated[str, Form()] = "",
) -> Assessment:
    """幂等重新提交：不创建新测评，只更新数据并重试后台任务。"""
    assessment = await db.get(Assessment, assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="assessment not found")
    if assessment.scene != "aviation":
        raise HTTPException(status_code=404, detail="aviation assessment not found")
    return await _retry_existing_assessment(
        assessment,
        db=db,
        video=video,
        name=name,
        id_card=id_card,
        selections=selections,
        duration_seconds=duration_seconds,
        effective_duration_seconds=effective_duration_seconds,
        paused_count=paused_count,
        subject_id=subject_id,
        gender=gender,
        age=age,
    )


async def _retry_existing_assessment(
    assessment: Assessment,
    *,
    db: AsyncSession,
    video: UploadFile | None,
    name: str,
    id_card: str,
    selections: str,
    duration_seconds: int,
    effective_duration_seconds: int,
    paused_count: int,
    subject_id: str,
    gender: str,
    age: str,
    protocol_version: str = "",
    timeline_version: str = "",
    interruptions: int = -1,
    interrupted_ms: int = -1,
    content_version: str = "",
    scheduling_notes: str = "",
) -> Assessment:
    """幂等更新已有测评并重试后台任务（终端 token 重试与管理端 resubmit 共用）。"""
    # 更新数据（幂等：同一测评不重复创建）。仅轮询超时时续查原task_id；
    # 其他失败以及上传了新视频时，应重新创建合作方任务。
    resume_timed_out_task = assessment.error_code == "TimeoutError" and bool(
        assessment.v3_task_id
    )
    if video and video.filename:
        video_storage_key, video_filename = await _save_video(video)
        video_storage_key, video_qa_json = await _validate_uploaded_video(video_storage_key)
        assessment.video_storage_key = video_storage_key
        assessment.video_filename = video_filename
        assessment.video_status = "received"
        # 新视频意味着新的上传前门禁证据，覆盖旧报告
        assessment.video_qa_json = video_qa_json
        resume_timed_out_task = False

    if not resume_timed_out_task:
        assessment.v3_task_id = None
        assessment.v3_file_id = None
        assessment.partner_file_id = None
        assessment.partner_upload_status = "pending"

    try:
        fresh_selections = json.loads(selections)
        if isinstance(fresh_selections, list):
            assessment.selections_data = {"selections": fresh_selections}
    except (json.JSONDecodeError, TypeError):
        pass
    merged = dict(assessment.selections_data or {})
    quality = dict(merged.get("capture_quality") or {})
    quality.update({
        "effective_duration_seconds": max(0, min(effective_duration_seconds, 600)),
        "paused_count": max(0, min(paused_count, 99)),
    })
    if protocol_version.strip():
        quality["protocol_version"] = protocol_version.strip()[:32]
    if timeline_version.strip():
        quality["timeline_version"] = timeline_version.strip()[:32]
    if interruptions >= 0:
        quality["interruptions"] = min(interruptions, 999)
    if interrupted_ms >= 0:
        quality["interrupted_ms"] = min(interrupted_ms, 600_000)
    if content_version.strip():
        quality["content_version"] = content_version.strip()[:32]
    if scheduling_notes.strip():
        try:
            notes = json.loads(scheduling_notes)
            if isinstance(notes, list):
                quality["scheduling_notes"] = [str(note)[:128] for note in notes[:20]]
        except (json.JSONDecodeError, TypeError):
            pass
    merged["capture_quality"] = quality
    assessment.selections_data = merged
    # 四项基础信息跟随重试更新（与 submit 同口径；不传时保留原值）
    if name.strip():
        assessment.name = name.strip()
    if id_card.strip():
        assessment.id_card = id_card.strip() or None
    if subject_id.strip():
        assessment.subject_id = subject_id.strip()
    fresh_info: dict = {}
    if gender.strip() in ("男", "女"):
        fresh_info["gender"] = gender.strip()
    try:
        parsed_age = int(age.strip())
        if 1 <= parsed_age <= 120:
            fresh_info["age"] = parsed_age
    except ValueError:
        pass
    if fresh_info:
        merged = dict(assessment.selections_data or {})
        existing = merged.get("basic_info")
        if isinstance(existing, dict):
            merged["basic_info"] = {**existing, **fresh_info}
        else:
            merged["basic_info"] = fresh_info
        assessment.selections_data = merged
    if duration_seconds:
        assessment.duration_seconds = duration_seconds
    assessment.retry_count += 1
    assessment.status = AssessmentStatus.pending
    assessment.error_code = None
    assessment.error_message = None
    assessment.submitted_at = datetime.now(timezone.utc)
    # 持久化任务一并重置（同事务）；提交后由 worker 重新领取
    await requeue_task_for_retry(db, assessment.id)

    await db.commit()
    await db.refresh(assessment)
    logger.info("测评重新提交: id=%s retry=%d", assessment.id, assessment.retry_count)
    return assessment


@router.get("", response_model=list[AssessmentOut])
async def list_assessments(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_admin_session)],
    limit: int = 50,
    name: str | None = None,
    id_card: str | None = None,
    scene: str = "aviation",
) -> list[Assessment]:
    # 现有管理后台是航空管理端；社区记录由社区用户报告链路处理，避免混入航空复核列表。
    if scene not in {"aviation", "community"}:
        raise HTTPException(status_code=422, detail="非法场景")
    stmt = select(Assessment).where(Assessment.scene == scene)
    if name:
        stmt = stmt.where(Assessment.name.ilike(f"%{name.strip()}%"))
    if id_card:
        stmt = stmt.where(Assessment.id_card == id_card.strip())
    stmt = stmt.order_by(Assessment.created_at.desc()).limit(min(limit, 100))
    return list((await db.execute(stmt)).scalars().all())


@router.get("/{assessment_id}", response_model=AssessmentDetail)
async def get_assessment(
    assessment_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_admin_session)],
) -> Assessment:
    stmt = (
        select(Assessment)
        .options(selectinload(Assessment.result))
        .where(Assessment.id == assessment_id, Assessment.scene == "aviation")
    )
    assessment = (await db.execute(stmt)).scalar_one_or_none()
    if assessment is None:
        raise HTTPException(status_code=404, detail="assessment not found")
    return assessment


@router.get("/{assessment_id}/au-image", response_class=FileResponse)
async def get_assessment_au_image(
    assessment_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_admin_session)],
) -> FileResponse:
    """返回持久化 AU 标注图；旧报告首次访问时按 file_id 刷新并缓存。"""
    cached = find_cached_au_image(assessment_id)
    if cached is None:
        stmt = (
            select(Assessment)
            .options(selectinload(Assessment.result))
            .where(Assessment.id == assessment_id, Assessment.scene == "aviation")
        )
        assessment = (await db.execute(stmt)).scalar_one_or_none()
        if assessment is None or assessment.result is None:
            raise HTTPException(status_code=404, detail="AU image not found")
        try:
            cached = await cache_au_image(
                assessment.result.summary_json or {}, assessment_id, get_v3_provider()
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("恢复 assessment %s AU图片失败: %s", assessment_id, exc)
            raise HTTPException(status_code=404, detail="AU image expired or unavailable") from exc
    if cached is None:
        raise HTTPException(status_code=404, detail="AU image not provided")
    path, content_type = cached
    return FileResponse(
        path,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=86400"},
    )
