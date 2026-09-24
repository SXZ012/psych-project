"""后台管理：登录鉴权 + 报告基础信息/备注/处理状态管理。

Demo 级权限（共享口令）；生产应换账号体系 + RBAC + 审计日志（阶段 5 合规）。
所有写接口均不触碰分数与结果标签——只改身份信息与后台管理字段。
"""
import hashlib
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_auth import (
    create_admin_session,
    drop_session,
    require_admin_session,
    require_role,
)
from app.core.config import settings
from app.db.base import get_db
from app.models.assessment import Assessment
from app.models.community import AssessmentSession, Device, PaymentOrder

router = APIRouter()


async def _get_aviation_assessment(db: AsyncSession, assessment_id: UUID) -> Assessment:
    """管理后台的航空复核入口不得操作社区用户数据。"""
    assessment = await db.get(Assessment, assessment_id)
    if assessment is None or assessment.scene != "aviation":
        raise HTTPException(status_code=404, detail="aviation assessment not found")
    return assessment


# ============ 登录 / 退出 ============
class LoginIn(BaseModel):
    password: str
    role: str = Field(default="administrator", pattern=r"^(reviewer|administrator)$")


@router.post("/login")
async def login(body: LoginIn, response: Response) -> dict:
    """工作人员口令校验，按口令映射角色（服务端鉴权，不依赖前端隐藏按钮）。

    - ADMIN_PASSWORD → administrator（设备/任务/凭证/复核全部能力）
    - REVIEWER_PASSWORD（非空时）→ reviewer（仅报告查看与复核）
    生产环境应改用账号体系 + SSO/RBAC。
    """
    password = body.password or ""
    role = body.role
    if role == "administrator":
        ok = password == settings.ADMIN_PASSWORD and settings.ADMIN_PASSWORD
    else:
        ok = settings.REVIEWER_PASSWORD and password == settings.REVIEWER_PASSWORD
    if not ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="密码错误")
    response.set_cookie(
        "admin_session",
        create_admin_session(role=role),
        httponly=True,
        samesite="lax",
        secure=settings.ENV == "prod",
        max_age=8 * 60 * 60,
    )
    return {"ok": True, "role": role}


@router.post("/logout")
async def logout(
    response: Response,
    admin_session: Annotated[str | None, Cookie()] = None,
) -> dict:
    """退出登录：清除管理会话（多人共用终端的隐私清理要求）。"""
    drop_session(admin_session)
    response.delete_cookie("admin_session")
    return {"ok": True}


# ============ 编辑基础信息（严禁改分数/结果） ============
class InfoUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=64, description="姓名")
    subject_id: str | None = Field(default=None, max_length=64, description="部门/工号")
    id_card: str | None = Field(
        default=None, pattern=r"^\d{17}[\dXx]$", description="身份证号（18 位）"
    )


@router.put("/assessments/{assessment_id}/info")
async def update_info(
    assessment_id: UUID,
    body: InfoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_admin_session)],
) -> dict:
    """修改被测者基础信息（姓名/部门/身份证）。不触碰任何分数与结果标签。"""
    a = await _get_aviation_assessment(db, assessment_id)
    if body.name is not None:
        a.name = body.name
    if body.subject_id is not None:
        a.subject_id = body.subject_id
    if body.id_card is not None:
        a.id_card = body.id_card
    await db.commit()
    return {"ok": True, "id": str(a.id)}


# ============ 内部备注（仅后台，绝不进入用户报告） ============
class NoteUpdate(BaseModel):
    admin_note: str | None = Field(default=None, max_length=2000)


@router.patch("/assessments/{assessment_id}/note")
async def update_note(
    assessment_id: UUID,
    body: NoteUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_admin_session)],
) -> dict:
    """记录/更新管理员内部回访备注。"""
    a = await _get_aviation_assessment(db, assessment_id)
    a.admin_note = body.admin_note
    await db.commit()
    return {"ok": True, "admin_note": a.admin_note}


# ============ 处理状态工作流 ============
class ReviewStatusUpdate(BaseModel):
    review_status: str = Field(pattern=r"^(pending|following|closed)$")


@router.patch("/assessments/{assessment_id}/review-status")
async def update_review_status(
    assessment_id: UUID,
    body: ReviewStatusUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_admin_session)],
) -> dict:
    """更新处理状态：pending 待查看 / following 跟进中 / closed 已结案。"""
    a = await _get_aviation_assessment(db, assessment_id)
    a.review_status = body.review_status
    await db.commit()
    return {"ok": True, "review_status": a.review_status}


# ============ 设备场景管理（最小管理接口） ============


class DeviceBindIn(BaseModel):
    device_id: str = Field(min_length=1, max_length=64)
    scene: str = Field(pattern=r"^(aviation|community)$")
    name: str | None = Field(default=None, max_length=128)
    location: str | None = Field(default=None, max_length=256)
    is_active: bool = True
    # 设备密钥（明文只在请求中出现，落库为 sha256；留空表示清除密钥，仅用 device_id 鉴权）
    device_token: str | None = Field(default=None, max_length=128)


@router.get("/devices")
async def list_devices(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_admin_session)],
) -> dict:
    """设备列表（含场景绑定与启用状态；不返回密钥哈希）。"""
    stmt = select(Device).order_by(Device.created_at.desc()).limit(200)
    rows = (await db.execute(stmt)).scalars().all()
    return {
        "devices": [
            {
                "device_id": d.device_id,
                "scene": d.scene,
                "name": d.name,
                "location": d.location,
                "is_active": d.is_active,
                "has_token": bool(d.token_hash),
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in rows
        ]
    }


@router.post("/devices")
async def bind_device(
    body: DeviceBindIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_admin_session)],
) -> dict:
    """绑定/更新设备场景（幂等 upsert）。device_token 只存哈希。"""
    device = (
        await db.execute(select(Device).where(Device.device_id == body.device_id))
    ).scalar_one_or_none()
    if device is None:
        device = Device(device_id=body.device_id, scene=body.scene)
        db.add(device)
    device.scene = body.scene
    device.is_active = body.is_active
    if body.name is not None:
        device.name = body.name
    if body.location is not None:
        device.location = body.location
    device.token_hash = (
        hashlib.sha256(body.device_token.encode()).hexdigest()
        if body.device_token
        else None
    )
    await db.commit()
    return {"ok": True, "device_id": device.device_id, "scene": device.scene}


# ============ 社区订单与会话查询（最小管理接口） ============


@router.get("/community/sessions")
async def list_community_sessions(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_admin_session)],
    limit: int = 50,
) -> dict:
    rows = (
        await db.execute(
            select(AssessmentSession)
            .where(AssessmentSession.scene == "community")
            .order_by(AssessmentSession.created_at.desc())
            .limit(min(limit, 200))
        )
    ).scalars().all()
    return {
        "sessions": [
            {
                "id": str(s.id),
                "device_id": s.device_id,
                "customer_id": str(s.customer_id) if s.customer_id else None,
                "status": s.status,
                "expires_at": s.expires_at.isoformat() if s.expires_at else None,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in rows
        ]
    }


@router.get("/community/orders")
async def list_community_orders(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_admin_session)],
    limit: int = 50,
    session_id: UUID | None = None,
) -> dict:
    """订单全状态：待支付/已支付/测评中/分析中/已完成/失败/过期。"""
    stmt = select(PaymentOrder).order_by(PaymentOrder.created_at.desc()).limit(min(limit, 200))
    if session_id is not None:
        stmt = stmt.where(PaymentOrder.assessment_session_id == session_id)
    rows = (await db.execute(stmt)).scalars().all()
    return {
        "orders": [
            {
                "id": str(o.id),
                "session_id": str(o.assessment_session_id) if o.assessment_session_id else None,
                "customer_id": str(o.customer_id),
                "assessment_id": str(o.assessment_id) if o.assessment_id else None,
                "amount_fen": o.amount_fen,
                "status": o.status,
                "paid_at": o.paid_at.isoformat() if o.paid_at else None,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
            for o in rows
        ]
    }


# ============ 社区报告重新生成（失败重试的最小闭环） ============


@router.post("/assessments/{assessment_id}/regenerate-pdf")
async def regenerate_community_pdf(
    assessment_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_admin_session)],
) -> dict:
    """重新生成社区用户版 PDF（仅 scene=community 且已有有效分析结果）。"""
    assessment = await db.get(Assessment, assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="assessment not found")
    if assessment.scene != "community":
        raise HTTPException(status_code=400, detail="仅社区测评支持用户版 PDF 重新生成")
    try:
        from app.services.pdf.report import generate_pdf

        pdf_path, oss_key = await generate_pdf(db, assessment.id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"PDF 生成失败: {exc}") from exc
    if not pdf_path:
        raise HTTPException(status_code=400, detail="暂无可用的分析结果，无法生成 PDF")
    assessment.report_pdf_key = oss_key or str(pdf_path)
    await db.commit()
    return {"ok": True, "report_pdf_key": assessment.report_pdf_key, "id": str(assessment.id)}


# ============ 后台处理任务：查看与安全重试（administrator） ============

@router.get("/tasks")
async def list_processing_tasks(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_role("administrator", "reviewer"))],
    status_filter: str = "active",
    limit: int = 50,
) -> list[dict]:
    """待处理/失败/超时任务列表（现场工作人员排障用）。

    status_filter：active（pending/running/failed 且未完成）、dead（超限）、
    uncertain（远端状态不确定，需人工确认）、all。
    """
    from app.models.assessment import ProcessingTask

    stmt = select(ProcessingTask)
    if status_filter == "active":
        stmt = stmt.where(ProcessingTask.status.in_(["pending", "running", "failed"]))
    elif status_filter in {"dead", "uncertain"}:
        if status_filter == "dead":
            stmt = stmt.where(ProcessingTask.status == "dead")
        else:
            stmt = stmt.where(ProcessingTask.uncertain_remote.is_(True))
    stmt = stmt.order_by(ProcessingTask.updated_at.desc()).limit(min(limit, 200))
    tasks = (await db.execute(stmt)).scalars().all()
    return [
        {
            "assessment_id": str(task.assessment_id),
            "scene": task.scene,
            "stage": task.stage,
            "status": task.status,
            "attempts": task.attempts,
            "max_attempts": task.max_attempts,
            "uncertain_remote": task.uncertain_remote,
            "last_error": task.last_error,
            "next_run_at": task.next_run_at.isoformat() if task.next_run_at else None,
            "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        }
        for task in tasks
    ]


@router.post("/tasks/{assessment_id}/retry")
async def retry_processing_task(
    assessment_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_role("administrator"))],
) -> dict:
    """安全重试一个失败/超限任务（administrator）。

    重置尝试次数并重新入队；同时把测评从 failed 拉回 pending。
    报告生成失败重走本入口——绝不要求重新录制视频。
    """
    from app.models.assessment import AssessmentStatus
    from app.services.processing import requeue_task_for_retry

    assessment = await db.get(Assessment, assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="assessment not found")
    task = await requeue_task_for_retry(db, assessment_id, reset_attempts=True)
    if task is None:
        raise HTTPException(status_code=404, detail="task not found")
    assessment.status = AssessmentStatus.pending
    assessment.error_code = None
    assessment.error_message = None
    await db.commit()
    return {"ok": True, "assessment_id": str(assessment_id), "attempts": 0}


# ============ 报告查询凭证：撤销 / 重置（administrator） ============

@router.post("/assessments/{assessment_id}/revoke-credential")
async def revoke_report_credential(
    assessment_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_role("administrator"))],
) -> dict:
    """撤销报告查询码：用户持旧码立即失效（不可再查）。"""
    assessment = await _get_aviation_assessment(db, assessment_id)
    from datetime import datetime, timezone

    assessment.report_access_token_revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "revoked": True}


@router.post("/assessments/{assessment_id}/reset-credential")
async def reset_report_credential(
    assessment_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[str, Depends(require_role("administrator"))],
) -> dict:
    """重置报告查询码：旧码作废，生成新码。明文只在本次响应返回一次。"""
    assessment = await _get_aviation_assessment(db, assessment_id)
    from datetime import datetime, timezone

    from app.services.report_access import generate_access_code, hash_access_code

    code = generate_access_code()
    assessment.report_access_token_hash = hash_access_code(code)
    assessment.report_access_token_created_at = datetime.now(timezone.utc)
    assessment.report_access_token_revoked_at = None
    await db.commit()
    return {"ok": True, "access_code": code}
