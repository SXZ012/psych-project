from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select

from app.core.config import settings
from app.models.appointment import Appointment
from app.models.assessment import Assessment
from app.models.community import PaymentOrder
from tests.community_helpers import make_device, paid_session_via_api


async def test_revoked_fixed_number_is_rejected(db, client):
    row = Assessment(
        name="测试", scene="aviation", report_access_token_revoked_at=datetime.now(timezone.utc)
    )
    db.add(row)
    await db.commit()
    response = await client.post("/api/v1/reports/view-by-id", json={"report_id": row.id.hex[:8]})
    assert response.status_code == 401


async def test_changing_numbers_and_forwarded_header_does_not_evade_limit(client):
    for i in range(settings.REPORT_LOOKUP_MAX_ATTEMPTS):
        response = await client.post(
            "/api/v1/reports/view-by-id",
            json={"report_id": f"{i:08X}"},
            headers={"X-Forwarded-For": f"192.0.2.{i}"},
        )
        assert response.status_code == 401
    assert (
        await client.post("/api/v1/reports/view-by-id", json={"report_id": "FFFFFFFF"})
    ).status_code == 429


async def test_production_rejects_simulated_payment_and_public_id(client, monkeypatch):
    monkeypatch.setattr(settings, "ENV", "prod")
    assert (await client.get("/api/v1/community/mock-pay?session_id=anything")).status_code == 404
    assert (
        await client.post("/api/v1/community/pay/mock-notify", json={"order_id": str(uuid4())})
    ).status_code == 404
    assert (
        await client.post("/api/v1/reports/view-by-id", json={"report_id": "12345678"})
    ).status_code == 403
    assert (
        await client.post("/api/v1/community/auth", json={"code": "mock-abcd"})
    ).status_code == 400


async def test_resume_paid_and_interrupted_capture_keeps_same_order(db, client):
    paid = await paid_session_via_api(db, client)
    sid = paid["session_id"]
    state = (await client.get(f"/api/v1/community/session/{sid}/status")).json()
    code = state["recovery_code"]
    assert len(code) == 12
    body = {"device_id": paid["device"].device_id, "code": code}
    resumed = await client.post("/api/v1/community/session/resume", json=body)
    assert resumed.status_code == 200, resumed.text
    assert resumed.json()["session_id"] == sid
    started = await client.post(f"/api/v1/community/session/{sid}/start")
    assert started.status_code == 200, started.text
    assert (await client.post("/api/v1/community/session/resume", json=body)).json()[
        "status"
    ] == "assessing"
    assert (await db.execute(select(func.count()).select_from(PaymentOrder))).scalar_one() == 1
    other = await make_device(db)
    assert (
        await client.post(
            "/api/v1/community/session/resume", json={**body, "device_id": other.device_id}
        )
    ).status_code == 401
    order = await db.get(PaymentOrder, paid["order_id"])
    order.status = "refunded"
    await db.commit()
    assert (await client.post("/api/v1/community/session/resume", json=body)).status_code == 401


async def test_appointment_persists_once_and_requires_admin_to_read(db, client):
    device = await make_device(db)
    body = {
        "client_token": str(uuid4()),
        "device_id": device.device_id,
        "phone": "13800000000",
        "topics": ["睡眠困扰"],
        "contact_time": "工作日下午",
    }
    for _ in range(2):
        response = await client.post("/api/v1/community/appointments", json=body)
        assert response.status_code == 200, response.text
    assert (await db.execute(select(func.count()).select_from(Appointment))).scalar_one() == 1
    assert (await client.get("/api/v1/community/appointments")).status_code == 401
    await client.post("/api/v1/admin/login", json={"password": settings.ADMIN_PASSWORD})
    rows = (await client.get("/api/v1/community/appointments")).json()
    assert len(rows) == 1 and rows[0]["phone"] == body["phone"] and rows[0]["is_demo"]
    assert (
        await client.patch(
            "/api/v1/community/appointments/" + rows[0]["id"], json={"status": "contacted"}
        )
    ).status_code == 200
