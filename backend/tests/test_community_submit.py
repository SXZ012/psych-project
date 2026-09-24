"""社区测评提交：session_id 校验 + 订单/用户/终端/会话绑定。"""

from uuid import UUID, uuid4

from app.models.assessment import Assessment
from app.models.community import AssessmentSession, PaymentOrder
from tests.community_helpers import (
    fake_video,
    make_customer,
    make_device,
    make_session,
    paid_session_via_api,
)


def _community_form(session_id: str, **extra: str) -> dict:
    form = {
        "name": "",
        "id_card": "",
        "selections": '[{"question_id":"q1","picked":["q1a"]}]',
        "duration_seconds": "60",
        "session_id": session_id,
        "self_report": '{"mood":7,"stress":5,"sleep":6}',
    }
    form.update(extra)
    return form


async def test_unpaid_session_rejected(db, client):
    device = await make_device(db)
    session = await make_session(db, device_id=device.device_id)  # awaiting_payment
    response = await client.post(
        "/api/v1/assessments/submit",
        data=_community_form(str(session.id)),
        files={"video": fake_video()},
    )
    assert response.status_code == 402
    assert "支付" in response.json()["detail"]


async def test_expired_session_rejected(db, client):
    device = await make_device(db)
    customer = await make_customer(db)
    session = await make_session(
        db, device_id=device.device_id, customer_id=customer.id, expires_minutes=-1
    )
    response = await client.post(
        "/api/v1/assessments/submit",
        data=_community_form(str(session.id)),
        files={"video": fake_video()},
    )
    assert response.status_code == 410
    await db.refresh(session)
    assert session.status == "expired"


async def test_scene_mismatch_session_rejected(db, client):
    device = await make_device(db, scene="aviation")
    customer = await make_customer(db)
    session = await make_session(
        db, device_id=device.device_id, customer_id=customer.id, scene="aviation"
    )
    response = await client.post(
        "/api/v1/assessments/submit",
        data=_community_form(str(session.id)),
        files={"video": fake_video()},
    )
    assert response.status_code == 403


async def test_unknown_and_malformed_session_rejected(db, client):
    unknown = await client.post(
        "/api/v1/assessments/submit",
        data=_community_form(str(uuid4())),
        files={"video": fake_video()},
    )
    assert unknown.status_code == 404

    malformed = await client.post(
        "/api/v1/assessments/submit",
        data=_community_form("not-a-uuid"),
        files={"video": fake_video()},
    )
    assert malformed.status_code == 422


async def test_used_session_rejected_on_second_submit(db, client):
    paid = await paid_session_via_api(db, client)
    first = await client.post(
        "/api/v1/assessments/submit",
        data=_community_form(paid["session_id"]),
        files={"video": fake_video()},
    )
    assert first.status_code == 201, first.text

    second = await client.post(
        "/api/v1/assessments/submit",
        data=_community_form(paid["session_id"]),
        files={"video": fake_video()},
    )
    assert second.status_code == 409


async def test_community_submit_binds_session_customer_order_device(db, client):
    paid = await paid_session_via_api(db, client)
    response = await client.post(
        "/api/v1/assessments/submit",
        data=_community_form(paid["session_id"]),
        files={"video": fake_video()},
    )
    assert response.status_code == 201, response.text
    assessment_id = response.json()["id"]

    assessment = await db.get(Assessment, UUID(assessment_id))
    assert assessment is not None
    assert assessment.scene == "community"
    assert assessment.report_type == "customer_pdf"
    assert assessment.assessment_session_id == UUID(paid["session_id"])
    assert assessment.device_id == paid["device"].device_id
    # 用户/订单来自支付会话，与提交表单无关
    assert assessment.customer_id is not None
    assert assessment.order_id == paid["order_id"]
    # 社区匿名提交：姓名由后端从支付用户昵称推导(Mock 授权默认"微信用户")
    assert assessment.name == "微信用户"
    # 自评问卷进入 selections_data，供 PDF"自我感受"区使用
    assert assessment.selections_data["self_report"] == {"mood": 7, "stress": 5, "sleep": 6}
    assert assessment.selections_data["selections"][0]["question_id"] == "q1"

    session = await db.get(AssessmentSession, UUID(paid["session_id"]))
    assert session.status == "submitted"
    order = await db.get(PaymentOrder, paid["order_id"])
    assert order.assessment_id == UUID(assessment_id)


async def test_client_cannot_inject_binding_fields(db, client):
    """前端伪造 customer_id/order_id/scene 字段必须被忽略。"""
    paid = await paid_session_via_api(db, client)
    fake_customer = uuid4()
    fake_order = uuid4()
    response = await client.post(
        "/api/v1/assessments/submit",
        data=_community_form(
            paid["session_id"],
            customer_id=str(fake_customer),
            order_id=str(fake_order),
            scene="aviation",
        ),
        files={"video": fake_video()},
    )
    assert response.status_code == 201, response.text
    assessment = await db.get(Assessment, UUID(response.json()["id"]))
    assert assessment.scene == "community"
    assert assessment.customer_id not in (None, fake_customer)
    assert assessment.order_id == paid["order_id"]
    assert assessment.order_id != fake_order


async def test_aviation_submit_unchanged_without_session(db, client):
    """回归：不传 session_id 的航空式提交行为与原先完全一致。"""
    response = await client.post(
        "/api/v1/assessments/submit",
        data={
            "name": "航空测试员",
            "id_card": "110101199001011234",
            "selections": "[]",
            "duration_seconds": "60",
        },
        files={"video": fake_video()},
    )
    assert response.status_code == 201, response.text
    assessment = await db.get(Assessment, UUID(response.json()["id"]))
    assert assessment.scene == "aviation"
    assert assessment.customer_id is None
    assert assessment.order_id is None
    assert assessment.report_type is None
    assert assessment.name == "航空测试员"


async def test_my_reports_lists_community_submission(db, client):
    paid = await paid_session_via_api(db, client)
    submitted = await client.post(
        "/api/v1/assessments/submit",
        data=_community_form(paid["session_id"]),
        files={"video": fake_video()},
    )
    assert submitted.status_code == 201

    reports = await client.get(
        "/api/v1/community/me/reports", headers={"Authorization": f"Bearer {paid['token']}"}
    )
    assert reports.status_code == 200
    body = reports.json()["reports"]
    assert len(body) == 1
    assert body[0]["id"] == submitted.json()["id"]
    assert body[0]["status"] == "analyzing"
    assert body[0]["has_pdf"] is False

    # 分析完成后状态映射正确(回归：枚举 str 不能进 map)
    from app.models.assessment import AssessmentStatus

    assessment = await db.get(Assessment, UUID(submitted.json()["id"]))
    assessment.status = AssessmentStatus.completed
    await db.commit()
    refreshed = await client.get(
        "/api/v1/community/me/reports", headers={"Authorization": f"Bearer {paid['token']}"}
    )
    assert refreshed.json()["reports"][0]["status"] == "completed"
    assert refreshed.json()["reports"][0]["status_label"] == "已生成"

    # 即使未来出现同一 customer_id 的其他场景记录，也绝不能出现在社区报告中。
    aviation = Assessment(
        name="不应出现在社区", scene="aviation", customer_id=assessment.customer_id
    )
    db.add(aviation)
    await db.commit()
    isolated = await client.get(
        "/api/v1/community/me/reports", headers={"Authorization": f"Bearer {paid['token']}"}
    )
    assert [item["id"] for item in isolated.json()["reports"]] == [submitted.json()["id"]]

    # 社区 H5 详情只返回状态字段，不返回后台报告、管理员备注或原始分析结果。
    detail = await client.get(
        f"/api/v1/community/me/reports/{submitted.json()['id']}",
        headers={"Authorization": f"Bearer {paid['token']}"},
    )
    assert detail.status_code == 200
    assert set(detail.json()) == {"id", "created_at", "status", "status_label", "has_pdf"}


async def test_download_url_requires_pdf(db, client, tmp_path):
    paid = await paid_session_via_api(db, client)
    submitted = await client.post(
        "/api/v1/assessments/submit",
        data=_community_form(paid["session_id"]),
        files={"video": fake_video()},
    )
    assert submitted.status_code == 201
    report_id = submitted.json()["id"]

    missing = await client.get(
        f"/api/v1/community/me/reports/{report_id}/download-url",
        headers={"Authorization": f"Bearer {paid['token']}"},
    )
    assert missing.status_code == 400

    # 伪造本地 PDF 文件后可拿到本地下载链接，并经 token 直链下载
    assessment = await db.get(Assessment, UUID(report_id))
    pdf = tmp_path / "fake-report.pdf"
    pdf.write_bytes(b"%PDF-1.4 fake")
    assessment.report_pdf_key = str(pdf)
    await db.commit()

    url_response = await client.get(
        f"/api/v1/community/me/reports/{report_id}/download-url",
        headers={"Authorization": f"Bearer {paid['token']}"},
    )
    assert url_response.status_code == 200
    url = url_response.json()["url"]
    assert "token=" in url

    # testserver 是 ASGI 虚拟主机，取 path+query 走同一个测试客户端
    path_with_query = "/" + url.split("://", 1)[1].split("/", 1)[1]
    file_response = await client.get(path_with_query)
    assert file_response.status_code == 200
    assert file_response.content == b"%PDF-1.4 fake"

    # 无 token 不能下载
    no_auth = await client.get(f"/api/v1/community/me/reports/{report_id}/file")
    assert no_auth.status_code == 401
