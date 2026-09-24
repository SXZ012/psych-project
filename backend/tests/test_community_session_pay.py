"""社区支付会话：创建校验、Mock 支付解锁(awaiting_payment → authorized)。"""

from tests.community_helpers import make_device, make_session, order_uuid_from_package


async def test_create_session_requires_registered_community_device(db, client):
    unknown = await client.post("/api/v1/community/session", json={"device_id": "ghost"})
    assert unknown.status_code == 404

    aviation_device = await make_device(db, scene="aviation")
    wrong_scene = await client.post(
        "/api/v1/community/session", json={"device_id": aviation_device.device_id}
    )
    assert wrong_scene.status_code == 403

    inactive = await make_device(db, scene="community", active=False)
    disabled = await client.post(
        "/api/v1/community/session", json={"device_id": inactive.device_id}
    )
    assert disabled.status_code == 403


async def test_create_session_awaits_payment(db, client):
    device = await make_device(db)
    response = await client.post("/api/v1/community/session", json={"device_id": device.device_id})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["scene"] == "community"
    assert body["amount_fen"] == 400
    assert body["pay_params"].get("_mock") is True
    assert body["expires_at"]

    status = await client.get(f"/api/v1/community/session/{body['session_id']}/status")
    assert status.status_code == 200
    assert status.json()["status"] == "awaiting_payment"
    assert status.json()["paid"] is False


async def test_mock_payment_unlocks_session(db, client):
    device = await make_device(db)
    auth = await client.post("/api/v1/community/auth", json={"code": "mock-pay-flow"})
    assert auth.status_code == 200
    token = auth.json()["token"]
    assert auth.json()["is_new_user"] is True

    created = await client.post("/api/v1/community/session", json={"device_id": device.device_id})
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
    assert notify.status_code == 200

    status = await client.get(f"/api/v1/community/session/{session_id}/status")
    body = status.json()
    assert body["status"] == "authorized"
    assert body["paid"] is True

    # 幂等：重复回调不会破坏状态
    again = await client.post("/api/v1/community/pay/mock-notify", json={"order_id": str(order_id)})
    assert again.status_code == 200
    assert (await client.get(f"/api/v1/community/session/{session_id}/status")).json()[
        "status"
    ] == "authorized"

    # 已支付会话不允许再次下单
    repay = await client.post(
        "/api/v1/community/pay",
        json={"session_id": session_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert repay.status_code == 400


async def test_mock_notify_unknown_order(db, client):
    from uuid import uuid4

    response = await client.post(
        "/api/v1/community/pay/mock-notify", json={"order_id": str(uuid4())}
    )
    assert response.status_code == 404


async def test_status_poll_lazily_expires_stale_session(db, client):
    device = await make_device(db)
    session = await make_session(db, device_id=device.device_id, expires_minutes=-1)
    response = await client.get(f"/api/v1/community/session/{session.id}/status")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "expired"
    assert body["paid"] is False


async def test_mock_pay_page_available_in_mock_mode(db, client):
    device = await make_device(db)
    created = await client.post("/api/v1/community/session", json={"device_id": device.device_id})
    session_id = created.json()["session_id"]
    response = await client.get("/api/v1/community/mock-pay", params={"session_id": session_id})
    assert response.status_code == 200
    assert "模拟支付" in response.text
