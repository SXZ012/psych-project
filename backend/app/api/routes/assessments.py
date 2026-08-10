"""测评接口：提交（含视频）、列表、查询状态与结果。"""
import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.admin_auth import require_admin_session
from app.core.config import _REPO_ROOT, settings
from app.db.base import get_db
from app.models.assessment import Assessment, AssessmentStatus
from app.schemas.assessment import AssessmentDetail, AssessmentOut
from app.services.assessment import run_assessment

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


@router.post("/submit", response_model=AssessmentOut, status_code=status.HTTP_201_CREATED)
async def submit_assessment(
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
    video: Annotated[UploadFile | None, File()] = None,
    name: Annotated[str, Form()] = "",
    id_card: Annotated[str, Form()] = "",
    selections: Annotated[str, Form()] = "[]",
    duration_seconds: Annotated[int, Form()] = 0,
) -> Assessment:
    """接收视频+答题数据，创建测评。用户端拿到 201 后即可显示'测评已完成'。
    后台异步处理视频转码+V3分析+报告生成。
    """
    if not name.strip():
        raise HTTPException(status_code=422, detail="姓名必填")

    # 解析答题数据
    try:
        selections_list = json.loads(selections)
    except (json.JSONDecodeError, TypeError):
        selections_list = []

    # 视频安全校验 + 安全存储（无摄像头时可选）
    video_storage_key = None
    video_orig_name = None
    video_status = None
    if video and video.filename:
        video_storage_key, video_orig_name = await _save_video(video)
        video_status = "received"
        logger.info("视频已接收: %s", video_storage_key)

    assessment = Assessment(
        name=name.strip(),
        id_card=id_card.strip() or None,
        selections_data={"selections": selections_list},
        duration_seconds=duration_seconds or None,
        video_storage_key=video_storage_key,
        video_filename=video_orig_name,
        video_status=video_status,
        status=AssessmentStatus.pending,
        provider_mode=settings.PROVIDER_MODE,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)

    # 后台异步：V3分析 + QwenPlus后台报告（用户端不等待、不展示报告）
    background_tasks.add_task(run_assessment, assessment.id)
    logger.info(
        "测评提交成功: id=%s name=%s video=%s",
        assessment.id,
        name.strip(),
        video_status or "无视频",
    )
    return assessment


@router.post("/{assessment_id}/resubmit", response_model=AssessmentOut)
async def resubmit_assessment(
    assessment_id: UUID,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
    name: Annotated[str, Form()] = "",
    id_card: Annotated[str, Form()] = "",
    selections: Annotated[str, Form()] = "[]",
    duration_seconds: Annotated[int, Form()] = 0,
    video: Annotated[UploadFile | None, File()] = None,
) -> Assessment:
    """幂等重新提交：不创建新测评，只更新数据并重试后台任务。"""
    assessment = await db.get(Assessment, assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="assessment not found")

    # 更新数据（幂等：同一 assessment_id 不重复创建）。仅轮询超时时续查原task_id；
    # 其他失败以及上传了新视频时，应重新创建合作方任务。
    resume_timed_out_task = assessment.error_code == "TimeoutError" and bool(
        assessment.v3_task_id
    )
    if video and video.filename:
        video_storage_key, video_filename = await _save_video(video)
        assessment.video_storage_key = video_storage_key
        assessment.video_filename = video_filename
        assessment.video_status = "received"
        resume_timed_out_task = False

    if not resume_timed_out_task:
        assessment.v3_task_id = None
        assessment.v3_file_id = None
        assessment.partner_file_id = None
        assessment.partner_upload_status = "pending"

    try:
        assessment.selections_data = {"selections": json.loads(selections)}
    except (json.JSONDecodeError, TypeError):
        pass
    if duration_seconds:
        assessment.duration_seconds = duration_seconds
    assessment.retry_count += 1
    assessment.status = AssessmentStatus.pending
    assessment.error_code = None
    assessment.error_message = None
    assessment.submitted_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(assessment)

    background_tasks.add_task(run_assessment, assessment.id)
    logger.info("测评重新提交: id=%s retry=%d", assessment_id, assessment.retry_count)
    return assessment


@router.post(
    "", response_model=AssessmentOut, status_code=status.HTTP_201_CREATED, include_in_schema=False
)
async def create_assessment_legacy(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Assessment:
    """旧版 JSON 创建接口（内部/兼容用）。前端应使用 /submit。"""
    assessment = Assessment(
        name=payload.get("name", "").strip() or None,
        id_card=payload.get("id_card", "").strip() or None,
        selections_data={"selections": payload.get("selections", [])},
        duration_seconds=payload.get("duration_seconds"),
        status=AssessmentStatus.pending,
        provider_mode=settings.PROVIDER_MODE,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    background_tasks.add_task(run_assessment, assessment.id)
    return assessment


@router.get("", response_model=list[AssessmentOut])
async def list_assessments(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_admin_session)],
    limit: int = 50,
    name: str | None = None,
    id_card: str | None = None,
) -> list[Assessment]:
    stmt = select(Assessment)
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
        .where(Assessment.id == assessment_id)
    )
    assessment = (await db.execute(stmt)).scalar_one_or_none()
    if assessment is None:
        raise HTTPException(status_code=404, detail="assessment not found")
    return assessment
