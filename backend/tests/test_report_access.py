"""航空自助报告凭证：隐私隔离、正常轮询与失败限频。"""

from datetime import datetime, timezone

from app.models.assessment import Assessment, AssessmentStatus
from app.services.report_access import generate_access_code, hash_access_code


async def test_valid_processing_lookup_can_poll_without_consuming_failure_limit(db, client):
    code = generate_access_code()
    assessment = Assessment(
        name="查询用户",
        subject_id="POLL-001",
        scene="aviation",
        status=AssessmentStatus.processing,
        report_access_token_hash=hash_access_code(code),
        report_access_token_created_at=datetime.now(timezone.utc),
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(assessment)
    await db.commit()

    for _ in range(8):
        response = await client.post(
            "/api/v1/reports/view",
            json={"subject_id": "POLL-001", "access_code": code},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "processing"


async def test_invalid_credentials_are_uniform_and_rate_limited(db, client):
    code = generate_access_code()
    db.add(
        Assessment(
            name="隐私用户",
            subject_id="RATE-001",
            scene="aviation",
            status=AssessmentStatus.processing,
            report_access_token_hash=hash_access_code(code),
        )
    )
    await db.commit()

    bodies = []
    for _ in range(5):
        response = await client.post(
            "/api/v1/reports/view",
            json={"subject_id": "RATE-001", "access_code": "WRONG-CODE"},
        )
        assert response.status_code == 401
        bodies.append(response.json())
    assert all(body == bodies[0] for body in bodies)

    blocked = await client.post(
        "/api/v1/reports/view",
        json={"subject_id": "RATE-001", "access_code": "WRONG-CODE"},
    )
    assert blocked.status_code == 429


async def test_fixed_report_id_returns_the_matching_report_status(db, client):
    assessment = Assessment(
        name="固定编号用户",
        subject_id="REPORT-ID-001",
        scene="aviation",
        status=AssessmentStatus.processing,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)

    report_id = str(assessment.id).replace("-", "")[:8].upper()
    response = await client.post("/api/v1/reports/view-by-id", json={"report_id": report_id})
    assert response.status_code == 200
    assert response.json()["status"] == "processing"


async def test_fixed_report_id_rejects_unknown_value(client):
    response = await client.post("/api/v1/reports/view-by-id", json={"report_id": "DEADBEEF"})
    assert response.status_code == 401
