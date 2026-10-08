"""Report centre: paid session -> submission -> processing -> result -> PDF."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.models.assessment import Assessment, AssessmentResult, AssessmentStatus
from tests.community_helpers import fake_video, paid_session_via_api
from tests.test_community_pdf import REAL_SUMMARY

BASE = "/api/v1/community/report-center"


async def test_complete_report_loop(db, client, tmp_path, monkeypatch):
    import app.services.pdf.report as pdf

    monkeypatch.setattr(pdf, "_OUTPUT_DIR", tmp_path)
    paid = await paid_session_via_api(db, client)
    sid = paid["session_id"]
    waiting = await client.get(f"{BASE}/session/{sid}")
    assert waiting.json()["status"] == "awaiting_assessment"
    await client.post(f"/api/v1/community/session/{sid}/start")
    submission = await client.post(
        "/api/v1/assessments/submit",
        data={
            "session_id": sid,
            "name": "",
            "id_card": "",
            "selections": "[]",
            "duration_seconds": "60",
            "self_report": "{}",
        },
        files={"video": fake_video()},
    )
    assert submission.status_code == 201, submission.text
    aid = UUID(submission.json()["id"])
    receipt = (await client.get(f"{BASE}/session/{sid}")).json()
    assert receipt["report_id"] == aid.hex[:8].upper()
    assert receipt["status"] == "processing"
    token = receipt["access_token"]
    assert (await client.get(f"{BASE}/pdf", params={"token": token})).status_code == 409
    lookup = await client.post(f"{BASE}/lookup", json={"report_id": aid.hex[:8]})
    assert lookup.json()["id"] == str(aid)
    assessment = await db.get(Assessment, aid)
    assessment.status = AssessmentStatus.completed
    assessment.result_valid = True
    result = AssessmentResult(
        assessment_id=aid, summary_json=REAL_SUMMARY, algorithm_version="demo-report-center"
    )
    db.add(result)
    await db.commit()
    path, error = await pdf.generate_pdf(db, aid)
    assert path, error
    assessment.report_pdf_key = str(path)
    await db.commit()
    view = await client.get(f"{BASE}/view", params={"token": token})
    assert view.headers["cache-control"] == "no-store"
    assert view.json()["status"] == "completed"
    assert (
        view.json()["report"]["summary_subset"]["clinical_screening"]
        == REAL_SUMMARY["clinical_screening"]
    )
    assert view.json()["has_pdf"]
    own = await client.get(
        f"{BASE}/mine/{aid}", headers={"Authorization": f"Bearer {paid['token']}"}
    )
    assert own.status_code == 200
    assert own.json()["id"] == str(aid)
    stranger = await client.post("/api/v1/community/auth", json={"code": f"stranger-{uuid4()}"})
    forbidden = await client.get(
        f"{BASE}/mine/{aid}",
        headers={"Authorization": f"Bearer {stranger.json()['token']}"},
    )
    assert forbidden.status_code == 404
    for download, disposition in [("false", "inline"), ("true", "attachment")]:
        response = await client.get(f"{BASE}/pdf", params={"token": token, "download": download})
        assert response.status_code == 200
        assert response.content.startswith(b"%PDF-")
        assert disposition in response.headers["content-disposition"]
        assert aid.hex[:8].upper() in response.headers["content-disposition"]
    assessment.status = AssessmentStatus.failed
    await db.commit()
    failed = (await client.get(f"{BASE}/view", params={"token": token})).json()
    assert failed["status"] == "needs_attention" and failed["report"] is None
    assert (await client.get(f"{BASE}/pdf", params={"token": token})).status_code == 409
    assessment.report_access_token_revoked_at = datetime.now(timezone.utc)
    await db.commit()
    assert (await client.get(f"{BASE}/view", params={"token": token})).status_code == 401
    assert (await client.get(f"{BASE}/pdf", params={"token": token})).status_code == 401


async def test_report_scope_and_production_guard(db, client, monkeypatch):
    from app.api.routes.community_reports import grant
    from app.core.config import settings
    from app.services.community import issue_jwt

    a = Assessment(name="aviation-only", scene="aviation")
    db.add(a)
    await db.commit()
    assert (
        await client.post(f"{BASE}/lookup", json={"report_id": a.id.hex[:8]})
    ).status_code == 401
    assert (await client.get(f"{BASE}/view", params={"token": grant(a)})).status_code == 401
    wrong_scope = issue_jwt(str(uuid4()), "test")
    assert (await client.get(f"{BASE}/view", params={"token": wrong_scope})).status_code == 401
    assert (await client.get(f"{BASE}/view", params={"token": "broken"})).status_code == 401
    monkeypatch.setattr(settings, "ENV", "prod")
    assert (await client.post(f"{BASE}/lookup", json={"report_id": "1234ABCD"})).status_code == 403
    assert (await client.get(f"{BASE}/session/{uuid4()}")).status_code == 403


def test_zero_pdf_metric_is_not_replaced():
    from app.services.pdf.report import _extract_core_metrics

    result = _extract_core_metrics(
        {
            "core_indicators": {
                "stress_load": {
                    "grade_source_score": 0,
                    "score": 88,
                    "classification_label": "参考范围",
                }
            }
        }
    )
    assert result[0]["score"] == 0
