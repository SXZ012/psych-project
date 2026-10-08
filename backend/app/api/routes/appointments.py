import hashlib
import hmac
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_auth import require_admin_session
from app.core.config import settings
from app.db.base import get_db
from app.models.appointment import Appointment
from app.models.community import Device
from app.services.report_access import RateLimited, check_lookup_rate_limit, record_lookup_failure

router = APIRouter(prefix="/api/v1/community/appointments", tags=["appointments"])
DB = Depends(get_db)


class AppointmentIn(BaseModel):
    client_token: UUID
    device_id: str = Field(min_length=1, max_length=64)
    phone: str = Field(pattern=r"^1[3-9]\d{9}$")
    topics: list[Literal["情绪与压力", "睡眠困扰", "家庭与人际", "其他咨询"]] = Field(
        min_length=1, max_length=4
    )
    contact_time: Literal["工作日上午", "工作日下午", "周末"]


@router.post("")
async def submit(
    body: AppointmentIn,
    request: Request,
    response: Response,
    x_device_token: str = Header(default=""),
    db: AsyncSession = DB,
):
    response.headers["Cache-Control"] = "no-store"
    if settings.ENV == "prod" and not settings.COMMUNITY_APPOINTMENTS_ENABLED:
        raise HTTPException(503, "当前社区尚未开通预约，请使用心理援助热线或联系现场工作人员")
    device = await db.get(Device, body.device_id)
    if device is None or not device.is_active or device.scene != "community":
        raise HTTPException(403, "当前终端未开通社区预约")
    if settings.ENV == "prod" or device.token_hash:
        if not device.token_hash or not hmac.compare_digest(
            device.token_hash, hashlib.sha256(x_device_token.encode()).hexdigest()
        ):
            raise HTTPException(401, "设备验证失败，请联系工作人员")
    # Atomic idempotency: retries never create duplicate appointment records.
    existing = (
        await db.execute(
            select(Appointment).where(Appointment.client_token == str(body.client_token))
        )
    ).scalar_one_or_none()
    if existing:
        if existing.device_id != body.device_id or existing.phone != body.phone:
            raise HTTPException(409, "本次提交已存在，请重新填写")
        return {"registered": True}
    ip = "appointment:" + (request.client.host if request.client else "unknown")
    try:
        await check_lookup_rate_limit("appointment", ip)
        await record_lookup_failure("appointment", ip)
    except RateLimited as exc:
        raise HTTPException(429, "提交过于频繁，请稍后再试") from exc
    await db.execute(
        insert(Appointment)
        .values(
            client_token=str(body.client_token),
            device_id=body.device_id,
            phone=body.phone,
            topics=list(dict.fromkeys(body.topics)),
            contact_time=body.contact_time,
            is_demo=settings.ENV != "prod",
        )
        .on_conflict_do_nothing(index_elements=["client_token"])
    )
    await db.commit()
    return {"registered": True}


@router.get("", dependencies=[Depends(require_admin_session)])
async def listing(response: Response, offset: int = 0, db: AsyncSession = DB):
    response.headers["Cache-Control"] = "no-store"
    rows = (
        (
            await db.execute(
                select(Appointment)
                .order_by(Appointment.created_at.desc())
                .offset(max(0, offset))
                .limit(50)
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": str(a.id),
            "phone": a.phone,
            "topics": a.topics,
            "contact_time": a.contact_time,
            "status": a.status,
            "is_demo": a.is_demo,
            "created_at": a.created_at.isoformat(),
        }
        for a in rows
    ]


class StatusIn(BaseModel):
    status: Literal["pending", "contacted", "closed"]


@router.patch("/{appointment_id}", dependencies=[Depends(require_admin_session)])
async def update(appointment_id: UUID, body: StatusIn, db: AsyncSession = DB):
    row = await db.get(Appointment, appointment_id)
    if row is None:
        raise HTTPException(404, "预约不存在")
    row.status = body.status
    await db.commit()
    return {"status": row.status}
