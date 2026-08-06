"""后台管理：登录鉴权 + 报告基础信息/备注/处理状态管理。

Demo 级权限（共享口令）；生产应换账号体系 + RBAC + 审计日志（阶段 5 合规）。
所有写接口均不触碰分数与结果标签——只改身份信息与后台管理字段。
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_auth import create_admin_session, require_admin_session
from app.core.config import settings
from app.db.base import get_db
from app.models.assessment import Assessment

router = APIRouter()


# ============ 登录 ============
class LoginIn(BaseModel):
    password: str


@router.post("/login")
async def login(body: LoginIn, response: Response) -> dict:
    """后台口令校验。生产环境应改用账号体系 + 会话/JWT。"""
    if not body.password or body.password != settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="密码错误")
    response.set_cookie(
        "admin_session",
        create_admin_session(),
        httponly=True,
        samesite="lax",
        secure=settings.ENV == "prod",
        max_age=8 * 60 * 60,
    )
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
    a = await db.get(Assessment, assessment_id)
    if a is None:
        raise HTTPException(status_code=404, detail="assessment not found")
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
    a = await db.get(Assessment, assessment_id)
    if a is None:
        raise HTTPException(status_code=404, detail="assessment not found")
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
    a = await db.get(Assessment, assessment_id)
    if a is None:
        raise HTTPException(status_code=404, detail="assessment not found")
    a.review_status = body.review_status
    await db.commit()
    return {"ok": True, "review_status": a.review_status}
