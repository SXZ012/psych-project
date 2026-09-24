"""社区链路测试的共享造数函数。"""

from __future__ import annotations

import re
from uuid import UUID, uuid4

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.community import AssessmentSession, Customer, Device


def _rand(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


async def make_device(
    db: AsyncSession, scene: str = "community", device_id: str | None = None, active: bool = True
) -> Device:
    device = Device(
        device_id=device_id or _rand("device"),
        scene=scene,
        name="测试设备",
        is_active=active,
    )
    db.add(device)
    await db.commit()
    return device


async def make_customer(db: AsyncSession, openid: str | None = None) -> Customer:
    customer = Customer(openid=openid or _rand("mock"), nickname="测试用户")
    db.add(customer)
    await db.commit()
    return customer


async def make_session(
    db: AsyncSession,
    device_id: str | None = None,
    customer_id: UUID | None = None,
    status: str = "awaiting_payment",
    scene: str = "community",
    expires_minutes: int = 30,
) -> AssessmentSession:
    from datetime import datetime, timedelta, timezone

    session = AssessmentSession(
        scene=scene,
        device_id=device_id,
        customer_id=customer_id,
        status=status,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=expires_minutes),
    )
    db.add(session)
    await db.commit()
    return session


def order_uuid_from_package(package: str) -> UUID:
    """从 Mock 支付参数 package(prepare_id=mock_<hex32>) 提取订单 UUID。"""
    hex_id = re.search(r"mock_([0-9a-f]{32})", package)
    if not hex_id:
        raise AssertionError(f"package 中没有 mock 订单号: {package}")
    raw = hex_id.group(1)
    return UUID(f"{raw[:8]}-{raw[8:12]}-{raw[12:16]}-{raw[16:20]}-{raw[20:]}")


async def paid_session_via_api(db: AsyncSession, client: httpx.AsyncClient) -> dict:
    """走完整 Mock 支付链路，返回一个已授权(已支付)的社区会话。"""
    device = await make_device(db)
    auth = await client.post("/api/v1/community/auth", json={"code": _rand("mock-code")})
    assert auth.status_code == 200, auth.text
    token = auth.json()["token"]

    created = await client.post("/api/v1/community/session", json={"device_id": device.device_id})
    assert created.status_code == 200, created.text
    session_id = created.json()["session_id"]

    pay = await client.post(
        "/api/v1/community/pay",
        json={"session_id": session_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert pay.status_code == 200, pay.text
    order_id = order_uuid_from_package(pay.json()["package"])

    notify = await client.post(
        "/api/v1/community/pay/mock-notify", json={"order_id": str(order_id)}
    )
    assert notify.status_code == 200, notify.text

    return {"device": device, "token": token, "session_id": session_id, "order_id": order_id}


def fake_video() -> tuple[str, bytes, str]:
    return ("assessment.webm", b"\x1a\x45\xdf\xa3fake-webm-bytes", "video/webm")
