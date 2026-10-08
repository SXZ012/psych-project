"""Admin report centre supports both scenes without widening personal access."""

from uuid import uuid4

from app.core.config import settings
from app.models.assessment import Assessment, AssessmentResult, AssessmentStatus


async def login(client):
    response = await client.post("/api/v1/admin/login", json={"password": settings.ADMIN_PASSWORD})
    assert response.status_code == 200


async def seed(db, scene="community", **fields):
    row = Assessment(scene=scene, status=AssessmentStatus.completed, result_valid=True, **fields)
    db.add(row)
    await db.flush()
    db.add(AssessmentResult(assessment_id=row.id, overall_score=65, summary_json={"marker": scene}))
    await db.commit()
    return row


async def test_admin_both_scenes_and_number_search(db, client):
    community = await seed(db, name="社区测试")
    aviation = await seed(db, "aviation", name="航空测试")
    assert (await client.get("/api/v1/assessments?scene=all")).status_code == 401
    assert (await client.get(f"/api/v1/assessments/{community.id}")).status_code == 401
    await login(client)
    all_rows = await client.get("/api/v1/assessments?scene=all")
    assert all_rows.headers["x-total-count"] == "2"
    assert {x["id"] for x in all_rows.json()} == {str(community.id), str(aviation.id)}
    for scene, row in [("community", community), ("aviation", aviation)]:
        response = await client.get("/api/v1/assessments", params={"scene": scene})
        assert response.headers["x-total-count"] == "1"
        assert [x["id"] for x in response.json()] == [str(row.id)]
        detail = await client.get(f"/api/v1/assessments/{row.id}")
        assert detail.status_code == 200
        assert detail.json()["result"]["overall_score"] == 65
        assert detail.json()["report_status"] == "none"
        assert detail.json()["has_pdf"] is False
        assert "report_pdf_key" not in detail.json()
    assert (await client.get("/api/v1/assessments?scene=unknown")).status_code == 422
    found = await client.get(
        "/api/v1/assessments",
        params={"scene": "all", "q": community.id.hex[:8].upper(), "limit": 1},
    )
    assert [x["id"] for x in found.json()] == [str(community.id)]
    assert found.headers["x-total-count"] == "1"
    literal = await client.get("/api/v1/assessments", params={"scene": "all", "q": "%"})
    assert literal.json() == []
    assert literal.headers["x-total-count"] == "0"
    # Number shown by the admin is exactly the one accepted by the existing terminal route.
    receipt = await client.post(
        "/api/v1/community/report-center/lookup", json={"report_id": community.id.hex[:8].upper()}
    )
    assert receipt.status_code == 200, receipt.text
    assert receipt.json()["id"] == str(community.id)
    assert receipt.json()["report_id"] == community.id.hex[:8].upper()


async def test_admin_total_is_independent_of_page_limit_and_offset(db, client):
    db.add_all(
        [Assessment(scene="aviation", name="分页航空") for _ in range(127)]
        + [Assessment(scene="community", name="分页社区") for _ in range(26)]
    )
    await db.commit()
    await login(client)
    for scene, total in [("all", 153), ("aviation", 127), ("community", 26)]:
        first = await client.get("/api/v1/assessments", params={"scene": scene, "limit": 100})
        assert first.status_code == 200
        assert int(first.headers["x-total-count"]) == total
        assert len(first.json()) == min(total, 100)
        rest = await client.get(
            "/api/v1/assessments", params={"scene": scene, "limit": 100, "offset": 100}
        )
        assert int(rest.headers["x-total-count"]) == total
        assert len(rest.json()) == max(0, total - 100)
        assert not ({x["id"] for x in first.json()} & {x["id"] for x in rest.json()})
    search = await client.get(
        "/api/v1/assessments", params={"scene": "all", "q": "分页社区", "limit": 1}
    )
    assert search.headers["x-total-count"] == "26"
    assert len(search.json()) == 1


async def test_community_notes_and_review(db, client):
    row = await seed(db)
    base = f"/api/v1/admin/assessments/{row.id}"
    assert (await client.patch(base + "/note", json={"admin_note": "跟进记录"})).status_code == 401
    await login(client)
    assert (await client.patch(base + "/note", json={"admin_note": "跟进记录"})).status_code == 200
    assert (
        await client.patch(base + "/review-status", json={"review_status": "following"})
    ).status_code == 200
    detail = (await client.get(f"/api/v1/assessments/{row.id}")).json()
    assert detail["admin_note"] == "跟进记录"
    assert detail["review_status"] == "following"
    assert detail["result"]["overall_score"] == 65


async def test_community_pdf_auth_and_disposition(db, client, tmp_path):
    path = tmp_path / "sample.pdf"
    path.write_bytes(b"%PDF-1.4\nadmin-test")
    row = await seed(db, report_pdf_key=str(path), report_status="ready")
    url = f"/api/v1/admin/assessments/{row.id}/pdf"
    assert (await client.get(url)).status_code == 401
    await login(client)
    for download, disposition in [("false", "inline"), ("true", "attachment")]:
        response = await client.get(url, params={"download": download})
        assert response.status_code == 200
        assert response.content == path.read_bytes()
        assert response.headers["content-disposition"].startswith(disposition)
        assert row.id.hex[:8].upper() in response.headers["content-disposition"]
        assert response.headers["cache-control"] == "no-store"
    detail = (await client.get(f"/api/v1/assessments/{row.id}")).json()
    assert detail["has_pdf"] is True
    path.unlink()
    assert (await client.get(url)).status_code == 404
    row.result_valid = False
    await db.commit()
    assert (await client.get(url)).status_code == 409
    assert (
        await client.post(f"/api/v1/admin/assessments/{row.id}/regenerate-pdf")
    ).status_code == 409


async def test_pdf_scene_and_oss_redirect(db, client, monkeypatch):
    from app.services.oss.client import OSSClient

    calls = []
    monkeypatch.setattr(OSSClient, "__init__", lambda self: None)

    def signed(self, key, **kwargs):
        calls.append((key, kwargs))
        return "https://example.test/private-signed.pdf"

    monkeypatch.setattr(OSSClient, "presigned_url", signed)
    row = await seed(db, report_pdf_key="reports/private.pdf", report_status="ready")
    aviation = await seed(db, "aviation")
    await login(client)
    response = await client.get(f"/api/v1/admin/assessments/{row.id}/pdf?download=true")
    assert response.status_code == 307
    assert response.headers["cache-control"] == "no-store"
    assert calls == [
        (
            "reports/private.pdf",
            {"expires": 300, "filename": f"report-{row.id.hex[:8].upper()}.pdf", "download": True},
        )
    ]
    assert (await client.get(f"/api/v1/admin/assessments/{aviation.id}/pdf")).status_code == 400


async def test_community_au_cache_requires_existing_report(db, client, monkeypatch, tmp_path):
    import app.api.routes.assessments as routes

    row = await seed(db)
    path = tmp_path / "au.png"
    path.write_bytes(b"cached-image")
    monkeypatch.setattr(routes, "find_cached_au_image", lambda _: (path, "image/png"))
    assert (await client.get(f"/api/v1/assessments/{row.id}/au-image")).status_code == 401
    await login(client)
    assert (await client.get(f"/api/v1/assessments/{row.id}/au-image")).content == b"cached-image"
    assert (await client.get(f"/api/v1/assessments/{uuid4()}/au-image")).status_code == 404
