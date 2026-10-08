from contextlib import asynccontextmanager

from sqlalchemy import func, select

from app.core.config import settings
from app.models.assessment import Assessment
from app.models.storage import ContentVersion, StoredAsset
from app.services.content import publish_bundled_content
from app.services.oss.client import OSSClient, file_sha256
from app.services.storage import OssStorage, get_storage


async def test_catalogue_is_versioned_in_db_and_public_payload_has_no_personal_data(db, client):
    assert (await client.get("/api/v1/content/community-library")).status_code == 503
    version = await publish_bundled_content(db)
    await db.commit()
    same = await publish_bundled_content(db, replace=True)
    await db.commit()
    assert same.version == version.version
    assert await db.scalar(select(func.count()).select_from(ContentVersion)) == 1
    response = await client.get("/api/v1/content/community-library")
    assert response.status_code == 200
    payload = response.json()["payload"]
    assert len(payload["scales"]) == 11
    assert len(payload["officialResources"]) == 23
    for resource in payload["officialResources"]:
        assert payload["scienceDetails"][resource["title"]]
    assert [x["short"] for x in payload["scales"]] == [x["short"] for x in payload["selfScales"]]
    assert "assessment_id" not in payload and "customers" not in payload


async def test_pdf_publication_is_independent_of_video_backup_and_records_checksum(
    db, monkeypatch, tmp_path
):
    monkeypatch.setattr(settings, "REPORT_STORAGE_MODE", "oss")
    monkeypatch.setattr(settings, "OSS_BACKUP_ENABLED", False)
    assert get_storage().name == "oss"
    path = tmp_path / "report.pdf"
    path.write_bytes(b"%PDF-1.4 report-version-one")
    calls = []

    def publish(self, source, key, content_type):
        calls.append(key)
        return {
            "key": key,
            "bucket": "private-test",
            "size": source.stat().st_size,
            "sha256": file_sha256(source),
        }

    monkeypatch.setattr(OSSClient, "upload_private_file", publish)
    storage = OssStorage()
    first = await storage.publish(path, "report-pdfs/test.pdf", db=db)
    await db.commit()
    asset = await db.get(StoredAsset, first)
    assert asset.visibility == "private"
    assert asset.sha256 == file_sha256(path)
    path.write_bytes(b"%PDF-1.4 report-version-two")
    second = await storage.publish(path, "report-pdfs/test.pdf", db=db)
    await db.commit()
    assert first != second
    assert await db.scalar(select(func.count()).select_from(StoredAsset)) == 2


async def test_failed_publication_preserves_local_report_then_retries(db, monkeypatch, tmp_path):
    import app.services.storage_maintenance as maintenance

    monkeypatch.setattr(settings, "REPORT_STORAGE_MODE", "oss")
    path = tmp_path / "report.pdf"
    path.write_bytes(b"%PDF-1.4 original")
    row = Assessment(scene="community", report_pdf_key=str(path), report_status="ready")
    db.add(row)
    await db.commit()

    @asynccontextmanager
    async def session():
        yield db

    monkeypatch.setattr(maintenance, "AsyncSessionLocal", session)

    def failed(*args):
        raise RuntimeError("network unavailable")

    monkeypatch.setattr(OSSClient, "upload_private_file", failed)
    assert await maintenance.sync_local_reports() == 0
    await db.refresh(row)
    assert row.report_pdf_key == str(path) and path.is_file()
    assert await db.scalar(select(func.count()).select_from(StoredAsset)) == 0

    def success(self, source, key, content_type):
        return {
            "key": key,
            "bucket": "private-test",
            "size": source.stat().st_size,
            "sha256": file_sha256(source),
        }

    monkeypatch.setattr(OSSClient, "upload_private_file", success)
    assert await maintenance.sync_local_reports() == 1
    await db.refresh(row)
    assert row.report_pdf_key.startswith("report-pdfs/") and path.is_file()
