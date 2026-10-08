"""个人报告终端查询接口。"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import String, cast, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.admin_auth import require_admin_session
from app.core.config import settings
from app.db.base import get_db
from app.models.assessment import Assessment
from app.services.report_access import (
    RateLimited,
    check_lookup_rate_limit,
    clear_lookup_failures,
    hash_access_code,
    record_lookup_failure,
)
from app.services.report_view import build_report_view, stage_label, user_status

router = APIRouter()

# 固定报告编号 = assessment UUID 的前八位；终端与管理端展示同一编号。
UNIFORM_INVALID = "报告编号有误，请核对后重新输入"
EXPECTED_MINUTES = (3, 4)


class LookupIn(BaseModel):
    """保留旧版工号+查询码接口，兼容已发出的历史凭证。"""

    subject_id: str = Field(min_length=1, max_length=64)
    access_code: str = Field(min_length=1, max_length=32)


class ReportIdIn(BaseModel):
    report_id: str = Field(min_length=8, max_length=8, pattern=r"^[0-9A-Fa-f]{8}$")


def _client_ip(request: Request) -> str:
    # ASGI server applies trusted proxy rules; never trust a caller-supplied header.
    return request.client.host if request.client else "unknown"


async def _authorize(db: AsyncSession, payload: LookupIn) -> Assessment:
    token_hash = hash_access_code(payload.access_code)
    stmt = (
        select(Assessment)
        .options(selectinload(Assessment.result))
        .where(
            Assessment.scene == "aviation",  # 终端查询接口只服务航空报告，社区走 H5
            Assessment.subject_id == payload.subject_id.strip(),
            Assessment.report_access_token_hash == token_hash,
        )
        .order_by(Assessment.created_at.desc())
        .limit(1)
    )
    assessment = (await db.execute(stmt)).scalar_one_or_none()
    if assessment is None or assessment.report_access_token_revoked_at is not None:
        raise HTTPException(status_code=401, detail=UNIFORM_INVALID)
    return assessment


async def _authorize_report_id(db: AsyncSession, report_id: str) -> Assessment:
    """按 UUID 前缀精确定位；碰撞时拒绝查询，绝不猜测记录。

    只查航空场景：社区报告无查询码，由微信 H5 按用户令牌访问，
    不得经终端 8 位编号通道读出。
    """
    prefix = report_id.strip().lower()
    stmt = (
        select(Assessment)
        .options(selectinload(Assessment.result))
        .where(
            Assessment.scene == "aviation",
            cast(Assessment.id, String).like(f"{prefix}%"),
        )
    )
    records = (await db.execute(stmt)).scalars().all()
    if len(records) != 1 or records[0].report_access_token_revoked_at is not None:
        raise HTTPException(status_code=401, detail=UNIFORM_INVALID)
    return records[0]


def _status_payload(assessment: Assessment) -> dict:
    return {
        "status": user_status(assessment),
        "stage_label": stage_label(assessment),
        "submitted_at": assessment.submitted_at.isoformat() if assessment.submitted_at else None,
        "expected_minutes": list(EXPECTED_MINUTES),
    }


@router.post("/view-by-id")
async def view_report_by_id(
    payload: ReportIdIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """终端主查询：输入固定报告编号即可查看本次报告。"""
    # A public display number is not a production identity credential.
    if settings.ENV == "prod":
        try:
            require_admin_session(request.cookies.get("admin_session"))
        except HTTPException as exc:
            raise HTTPException(403, "请联系工作人员认证后查询") from exc
    report_id = payload.report_id.upper()
    client_ip = _client_ip(request)
    try:
        await check_lookup_rate_limit(report_id, client_ip)
    except RateLimited as exc:
        raise HTTPException(status_code=429, detail="尝试过于频繁，请稍后再试") from exc
    try:
        assessment = await _authorize_report_id(db, report_id)
    except HTTPException:
        await record_lookup_failure(report_id, client_ip)
        raise
    clear_lookup_failures(report_id, client_ip)
    base = _status_payload(assessment)
    if assessment.status != "completed" or assessment.result is None:
        return base
    return {**base, "report": build_report_view(assessment, assessment.result)}


@router.post("/lookup")
async def lookup_report(
    payload: LookupIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """旧版状态查询接口，兼容已下发的查询码。"""
    client_ip = _client_ip(request)
    try:
        await check_lookup_rate_limit(payload.subject_id, client_ip)
        assessment = await _authorize(db, payload)
    except RateLimited as exc:
        raise HTTPException(status_code=429, detail="尝试过于频繁，请稍后再试") from exc
    except HTTPException:
        await record_lookup_failure(payload.subject_id, client_ip)
        raise
    clear_lookup_failures(payload.subject_id, client_ip)
    return {
        **_status_payload(assessment),
        "report_ready": assessment.status == "completed" and assessment.result is not None,
    }


@router.post("/view")
async def view_report(
    payload: LookupIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """旧版报告查询接口，兼容已下发的查询码。"""
    client_ip = _client_ip(request)
    try:
        await check_lookup_rate_limit(payload.subject_id, client_ip)
        assessment = await _authorize(db, payload)
    except RateLimited as exc:
        raise HTTPException(status_code=429, detail="尝试过于频繁，请稍后再试") from exc
    except HTTPException:
        await record_lookup_failure(payload.subject_id, client_ip)
        raise
    clear_lookup_failures(payload.subject_id, client_ip)
    base = _status_payload(assessment)
    if assessment.status != "completed" or assessment.result is None:
        return base
    return {**base, "report": build_report_view(assessment, assessment.result)}
