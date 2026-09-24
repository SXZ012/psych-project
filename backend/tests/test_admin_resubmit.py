"""resubmit 管理员鉴权：未登录拒绝，管理员可触发重试且状态复位。"""
from datetime import datetime, timezone
from uuid import uuid4

from app.core.config import settings
from app.models.assessment import Assessment, AssessmentStatus


async def _make_failed(db) -> Assessment:
    assessment = Assessment(
        name="失败样本",
        status=AssessmentStatus.failed,
        error_code="TimeoutError",
        error_message="partner timeout",
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(assessment)
    await db.commit()
    return assessment


async def _login(client) -> None:
    response = await client.post(
        "/api/v1/admin/login", json={"password": settings.ADMIN_PASSWORD}
    )
    assert response.status_code == 200, response.text


async def test_resubmit_requires_admin_session(db, client):
    assessment = await _make_failed(db)

    denied = await client.post(f"/api/v1/assessments/{assessment.id}/resubmit")
    assert denied.status_code == 401

    await _login(client)
    allowed = await client.post(f"/api/v1/assessments/{assessment.id}/resubmit")
    assert allowed.status_code == 200, allowed.text
    body = allowed.json()
    assert body["status"] == "pending"

    await db.refresh(assessment)
    assert assessment.status == AssessmentStatus.pending
    assert assessment.error_code is None
    assert assessment.retry_count == 1


async def test_resubmit_unknown_id_still_guarded(db, client):
    """未知 id 也不允许匿名探测：先过鉴权再判存在性。"""
    denied = await client.post(f"/api/v1/assessments/{uuid4()}/resubmit")
    assert denied.status_code == 401

    await _login(client)
    missing = await client.post(f"/api/v1/assessments/{uuid4()}/resubmit")
    assert missing.status_code == 404
