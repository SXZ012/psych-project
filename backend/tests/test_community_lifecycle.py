"""社区订单全生命周期 + 设备管理接口 + 报告重新生成。"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.core.config import settings
from app.models.assessment import Assessment, AssessmentResult, AssessmentStatus
from app.models.community import AssessmentSession, PaymentOrder
from app.services.community import sync_community_order_status
from tests.community_helpers import fake_video, paid_session_via_api


async def _login_admin(client) -> None:
    response = await client.post("/api/v1/admin/login", json={"password": settings.ADMIN_PASSWORD})
    assert response.status_code == 200, response.text


async def test_order_full_lifecycle(db, client):
    """待支付→已支付→测评中→分析中→已完成；失败路径→失败。"""
    paid = await paid_session_via_api(db, client)
    session_id = paid["session_id"]
    order_id = paid["order_id"]

    order = await db.get(PaymentOrder, order_id)
    assert order.status == "paid"  # 已支付

    # 进入核心测评：测评中（幂等）
    start = await client.post(f"/api/v1/community/session/{session_id}/start")
    assert start.status_code == 200 and start.json()["status"] == "assessing"
    again = await client.post(f"/api/v1/community/session/{session_id}/start")
    assert again.status_code == 200 and again.json()["status"] == "assessing"
    await db.refresh(order)
    assert order.status == "assessing"

    # 提交：分析中 + 会话已提交
    submit = await client.post(
        "/api/v1/assessments/submit",
        data={
            "session_id": session_id,
            "name": "",
            "id_card": "",
            "selections": "[]",
            "duration_seconds": "60",
            "self_report": "{}",
        },
        files={"video": fake_video()},
    )
    assert submit.status_code == 201, submit.text
    await db.refresh(order)
    assert order.status == "analyzing"
    assert order.assessment_id == UUID(submit.json()["id"])
    session = await db.get(AssessmentSession, UUID(session_id))
    assert session.status == "submitted"

    # 分析到终态：回写订单
    assessment = await db.get(Assessment, UUID(submit.json()["id"]))
    assessment.status = AssessmentStatus.completed
    await sync_community_order_status(db, assessment)
    await db.commit()
    await db.refresh(order)
    assert order.status == "completed"

    # 失败路径
    assessment.status = AssessmentStatus.failed
    await sync_community_order_status(db, assessment)
    await db.commit()
    await db.refresh(order)
    assert order.status == "failed"


async def test_start_rejects_unpaid_session(db, client):
    from tests.community_helpers import make_device, make_session

    device = await make_device(db)
    session = await make_session(db, device_id=device.device_id)  # awaiting_payment
    response = await client.post(f"/api/v1/community/session/{session.id}/start")
    assert response.status_code == 409
    unknown = await client.post(f"/api/v1/community/session/{uuid4()}/start")
    assert unknown.status_code == 404


async def test_lazy_expire_closes_unpaid_orders(db, client):
    from tests.community_helpers import make_customer, make_device, make_session

    device = await make_device(db)
    customer = await make_customer(db)
    session = await make_session(db, device_id=device.device_id, expires_minutes=-1)
    order = PaymentOrder(
        customer_id=customer.id,
        assessment_session_id=session.id,
        amount_fen=400,
        status="created",
    )
    db.add(order)
    await db.commit()

    status = await client.get(f"/api/v1/community/session/{session.id}/status")
    assert status.json()["status"] == "expired"
    await db.refresh(order)
    assert order.status == "expired"


async def test_admin_device_bind_and_token_auth(db, client):
    await _login_admin(client)

    listed_before = await client.get("/api/v1/admin/devices")
    assert listed_before.status_code == 200

    bind = await client.post(
        "/api/v1/admin/devices",
        json={
            "device_id": "bind-test-01",
            "scene": "community",
            "name": "绑定测试机",
            "device_token": "secret-token-1",
        },
    )
    assert bind.status_code == 200, bind.text

    devices = (await client.get("/api/v1/admin/devices")).json()["devices"]
    mine = next(d for d in devices if d["device_id"] == "bind-test-01")
    assert mine["scene"] == "community"
    assert mine["has_token"] is True
    assert "token_hash" not in mine  # 哈希不外泄

    # 配置接口走密钥校验：无头 401 / 错头 401 / 对头 200
    no_header = await client.get("/api/v1/session/config", params={"device_id": "bind-test-01"})
    assert no_header.status_code == 401
    wrong = await client.get(
        "/api/v1/session/config",
        params={"device_id": "bind-test-01"},
        headers={"X-Device-Token": "wrong"},
    )
    assert wrong.status_code == 401
    ok = await client.get(
        "/api/v1/session/config",
        params={"device_id": "bind-test-01"},
        headers={"X-Device-Token": "secret-token-1"},
    )
    assert ok.status_code == 200 and ok.json()["scene"] == "community"

    # 管理接口需要管理员会话（清掉登录 cookie 再访问）
    client.cookies.clear()
    anon = await client.get("/api/v1/admin/devices")
    assert anon.status_code in (401, 403)


async def test_admin_community_queries(db, client):
    paid = await paid_session_via_api(db, client)
    await _login_admin(client)

    sessions = (await client.get("/api/v1/admin/community/sessions")).json()["sessions"]
    assert any(s["id"] == paid["session_id"] for s in sessions)

    orders = (
        await client.get(
            "/api/v1/admin/community/orders", params={"session_id": paid["session_id"]}
        )
    ).json()["orders"]
    assert len(orders) == 1
    assert orders[0]["id"] == str(paid["order_id"])
    assert orders[0]["status"] == "paid"


async def test_regenerate_pdf_admin_only_and_community_only(db, client, monkeypatch, tmp_path):
    import app.services.pdf.report as pdf_report

    monkeypatch.setattr(pdf_report, "_OUTPUT_DIR", tmp_path)

    # 无管理员会话 → 拒绝
    aviation = Assessment(
        name="航空样本",
        status=AssessmentStatus.completed,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(aviation)
    await db.commit()
    denied = await client.post(f"/api/v1/admin/assessments/{aviation.id}/regenerate-pdf")
    assert denied.status_code in (401, 403)

    await _login_admin(client)
    # 航空测评不支持
    wrong_scene = await client.post(f"/api/v1/admin/assessments/{aviation.id}/regenerate-pdf")
    assert wrong_scene.status_code == 400

    # 社区测评 + 有效结果 → 生成 PDF 并写 report_pdf_key
    community = Assessment(
        name="社区样本",
        scene="community",
        report_type="customer_pdf",
        customer_id=None,
        status=AssessmentStatus.completed,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(community)
    await db.flush()
    db.add(
        AssessmentResult(
            assessment_id=community.id,
            algorithm_version="v3-test",
            summary_json={
                "clinical_screening": {},
                "overall": {},
                "final_summary": "本次分析已完成，结果仅供日常状态参考。",
            },
        )
    )
    await db.commit()

    ok = await client.post(f"/api/v1/admin/assessments/{community.id}/regenerate-pdf")
    assert ok.status_code == 200, ok.text
    await db.refresh(community)
    assert community.report_pdf_key
    assert community.report_pdf_key.endswith(".pdf")


async def test_aviation_submit_creates_no_community_rows(db, client):
    """航空提交不产生社区会话或订单（业务系统隔离回归）。"""
    from sqlalchemy import func, select

    response = await client.post(
        "/api/v1/assessments/submit",
        data={"name": "航空隔离回归", "id_card": "", "selections": "[]", "duration_seconds": "60"},
        files={"video": fake_video()},
    )
    assert response.status_code == 201

    sessions = (await db.execute(select(func.count()).select_from(AssessmentSession))).scalar()
    orders = (await db.execute(select(func.count()).select_from(PaymentOrder))).scalar()
    assert sessions == 0
    assert orders == 0
