"""设备场景配置：终端 scene 由后端 Device 配置决定。"""

from hashlib import sha256

from tests.community_helpers import make_device


async def test_community_device_gets_community_preset(db, client):
    device = await make_device(db, scene="community")
    response = await client.get("/api/v1/session/config", params={"device_id": device.device_id})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["scene"] == "community"
    assert body["need_payment"] is True
    assert body["report_type"] == "customer_pdf"
    # 社区正式题池扩容：自定节奏 60 秒连续出题，池 ≥12（按 20 请求）
    assert body["question_count"] == 30
    assert body["question_duration"] == 10
    assert "payment" in body["phases"] and "breathing" in body["phases"]


async def test_aviation_device_gets_aviation_preset(db, client):
    device = await make_device(db, scene="aviation")
    response = await client.get("/api/v1/session/config", params={"device_id": device.device_id})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["scene"] == "aviation"
    assert body["need_payment"] is False
    assert body["report_type"] == "admin"
    assert body["question_count"] == 6


async def test_unknown_device_rejected(db, client):
    response = await client.get("/api/v1/session/config", params={"device_id": "ghost-device"})
    assert response.status_code == 404


async def test_inactive_device_rejected(db, client):
    device = await make_device(db, scene="community", active=False)
    response = await client.get("/api/v1/session/config", params={"device_id": device.device_id})
    assert response.status_code == 403


async def test_device_token_enforced(db, client):
    device = await make_device(db, scene="community")
    token = "secret-device-token"
    device.token_hash = sha256(token.encode()).hexdigest()
    await db.commit()

    no_header = await client.get("/api/v1/session/config", params={"device_id": device.device_id})
    assert no_header.status_code == 401

    wrong = await client.get(
        "/api/v1/session/config",
        params={"device_id": device.device_id},
        headers={"X-Device-Token": "wrong"},
    )
    assert wrong.status_code == 401

    ok = await client.get(
        "/api/v1/session/config",
        params={"device_id": device.device_id},
        headers={"X-Device-Token": token},
    )
    assert ok.status_code == 200
    assert ok.json()["scene"] == "community"
