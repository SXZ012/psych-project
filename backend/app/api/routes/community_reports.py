"""Community report centre. Share grants are scoped to exactly one assessment."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import String, cast, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.routes.community import get_current_customer
from app.api.routes.reports import ReportIdIn, _client_ip
from app.core.config import settings
from app.db.base import get_db
from app.models.assessment import Assessment
from app.models.community import Customer
from app.services.report_access import (
    RateLimited,
    check_lookup_rate_limit,
    clear_lookup_failures,
    record_lookup_failure,
)
from app.services.report_view import build_report_view, user_status

router = APIRouter(prefix="/api/v1/community/report-center", tags=["community reports"])
DB = Depends(get_db)


def grant(assessment: Assessment) -> str:
    return jwt.encode(
        {
            "sub": str(assessment.id),
            "scope": "community-report",
            "exp": datetime.now(timezone.utc) + timedelta(days=7),
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )


async def authorized(db: AsyncSession, token: str) -> Assessment:
    try:
        claims = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        if claims.get("scope") != "community-report":
            raise ValueError("scope")
        report_id = UUID(claims["sub"])
    except (jwt.InvalidTokenError, ValueError, KeyError) as exc:
        raise HTTPException(401, "报告链接已失效，请重新查询") from exc
    row = (
        await db.execute(
            select(Assessment)
            .options(selectinload(Assessment.result))
            .where(
                Assessment.id == report_id,
                Assessment.scene == "community",
            )
        )
    ).scalar_one_or_none()
    if row is None or row.report_access_token_revoked_at is not None:
        raise HTTPException(401, "报告链接已失效，请重新查询")
    return row


def payload(row: Assessment, token: str) -> dict:
    status = user_status(row)
    return {
        "id": str(row.id),
        "report_id": row.id.hex[:8].upper(),
        "status": status,
        "status_label": "分析中"
        if status == "processing"
        else ("报告已生成" if status == "completed" else "本次报告暂不可用"),
        "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
        "has_pdf": status == "completed" and bool(row.report_pdf_key),
        "pdf_status": row.report_status,
        "access_token": token,
        "is_demo": bool(row.result and str(row.result.algorithm_version or "").startswith("demo")),
        "report": build_report_view(row, row.result)
        if status == "completed" and row.result
        else None,
    }


def demo_lookup_only() -> None:
    # The current demo has no SMS/WeChat identity verification. Never silently
    # enable short-ID or session-capability access in a production deployment.
    if settings.ENV == "prod":
        raise HTTPException(403, "请使用测评时登录的手机身份查看报告")


@router.post("/lookup")
async def lookup(
    body: ReportIdIn, request: Request, response: Response, db: AsyncSession = DB
) -> dict:
    demo_lookup_only()
    response.headers["Cache-Control"] = "no-store"
    ip = _client_ip(request)
    try:
        # Fixed key makes the limit apply across guesses, not only to one ID.
        await check_lookup_rate_limit("community-report", ip)
    except RateLimited as exc:
        raise HTTPException(429, "查询过于频繁，请稍后再试") from exc
    rows = (
        (
            await db.execute(
                select(Assessment)
                .options(selectinload(Assessment.result))
                .where(
                    Assessment.scene == "community",
                    cast(Assessment.id, String).like(body.report_id.lower() + "%"),
                    Assessment.report_access_token_revoked_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    if len(rows) != 1:
        await record_lookup_failure("community-report", ip)
        raise HTTPException(401, "未找到报告，请核对 8 位报告编号")
    clear_lookup_failures("community-report", ip)
    return payload(rows[0], grant(rows[0]))


@router.get("/session/{session_id}")
async def receipt(session_id: UUID, response: Response, db: AsyncSession = DB) -> dict:
    demo_lookup_only()
    response.headers["Cache-Control"] = "no-store"
    row = (
        await db.execute(
            select(Assessment)
            .options(selectinload(Assessment.result))
            .where(
                Assessment.assessment_session_id == session_id,
                Assessment.scene == "community",
                Assessment.report_access_token_revoked_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return {"status": "awaiting_assessment", "report_id": "", "has_pdf": False}
    return payload(row, grant(row))


@router.get("/view")
async def view(token: str, response: Response, db: AsyncSession = DB) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return payload(await authorized(db, token), token)


@router.get("/mine/{report_id}")
async def own_report(
    report_id: UUID,
    response: Response,
    customer: Customer = Depends(get_current_customer),  # noqa: B008
    db: AsyncSession = DB,
) -> dict:
    """Preserve authenticated mobile bookmarks/notification links in all environments."""
    response.headers["Cache-Control"] = "no-store"
    row = (
        await db.execute(
            select(Assessment)
            .options(selectinload(Assessment.result))
            .where(
                Assessment.id == report_id,
                Assessment.scene == "community",
                Assessment.customer_id == customer.id,
                Assessment.report_access_token_revoked_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "报告不存在或不属于当前用户")
    return payload(row, grant(row))


@router.get("/pdf")
async def pdf(token: str, download: bool = False, db: AsyncSession = DB):
    row = await authorized(db, token)
    if user_status(row) != "completed" or not row.report_pdf_key:
        raise HTTPException(409, "PDF 正在准备，请稍后再试")
    path = Path(row.report_pdf_key)
    if path.is_absolute():
        if not path.is_file():
            raise HTTPException(404, "PDF 文件暂不可用，请联系工作人员")
        return FileResponse(
            path,
            media_type="application/pdf",
            filename=f"心理状态报告_{row.id.hex[:8].upper()}.pdf",
            content_disposition_type="attachment" if download else "inline",
            headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
        )
    from app.services.oss.client import OSSClient

    return RedirectResponse(
        OSSClient().presigned_url(
            row.report_pdf_key,
            expires=300,
            filename=f"report-{row.id.hex[:8].upper()}.pdf",
            download=download,
        ),
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )
