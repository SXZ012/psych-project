import pytest

from app.services.oss.client import OSSClient


def test_gen_object_key_unique_and_shaped():
    k1 = OSSClient.gen_object_key("images", "face.jpg")
    k2 = OSSClient.gen_object_key("images", "face.jpg")
    assert k1.startswith("images/")
    assert k1.endswith(".jpg")
    assert k1 != k2  # UUID 保证唯一
    assert k1.count("/") == 2  # images/<date>/<uuid>.jpg


def test_public_url():
    oss = OSSClient(
        access_key_id="dummy-id",
        access_key_secret="dummy-secret",
        endpoint="oss-cn-shenzhen.aliyuncs.com",
        bucket_name="psych-test-bucket",
    )
    assert oss.base_url == "https://psych-test-bucket.oss-cn-shenzhen.aliyuncs.com"
    assert (
        oss.public_url("images/a.jpg")
        == "https://psych-test-bucket.oss-cn-shenzhen.aliyuncs.com/images/a.jpg"
    )


def test_ensure_requires_credentials(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "OSS_ACCESS_KEY_ID", "")
    monkeypatch.setattr(settings, "OSS_ACCESS_KEY_SECRET", "")
    oss = OSSClient()  # 从 settings 取，已被 monkeypatch 置空
    with pytest.raises(RuntimeError):
        oss._ensure()


def test_private_upload_verifies_acl_size_and_actual_content(tmp_path, monkeypatch):
    import hashlib
    from io import BytesIO
    from types import SimpleNamespace

    import app.services.oss.client as module

    monkeypatch.setattr(
        module.httpx, "get", lambda *args, **kwargs: SimpleNamespace(status_code=403)
    )

    path = tmp_path / "report.pdf"
    path.write_bytes(b"%PDF-1.4 verified-report")

    class Bucket:
        corrupt = False
        acl = "private"

        def put_object_from_file(self, key, filename, headers):
            assert headers["x-oss-object-acl"] == "private"
            assert headers["Cache-Control"] == "private, no-store"
            self.data = path.read_bytes()
            self.headers = headers

        def head_object(self, key):
            return SimpleNamespace(content_length=len(self.data), headers=self.headers)

        def get_object_acl(self, key):
            return SimpleNamespace(acl=self.acl)

        def get_object(self, key):
            return BytesIO(b"broken" if self.corrupt else self.data)

    client = OSSClient()
    bucket = Bucket()
    client._bucket = bucket
    info = client.upload_private_file(path, "report-pdfs/test.pdf", "application/pdf")
    assert info["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    bucket.corrupt = True
    with pytest.raises(RuntimeError, match="内容校验失败"):
        client.upload_private_file(path, "report-pdfs/test.pdf", "application/pdf")
    bucket.acl = "public-read"
    with pytest.raises(RuntimeError, match="未设置为私有"):
        client.upload_private_file(path, "report-pdfs/test.pdf", "application/pdf")


def test_restore_rejects_corruption_and_keeps_original_file(tmp_path):
    import hashlib

    class Bucket:
        data = b"restored-video"

        def get_object_to_file(self, key, filename):
            from pathlib import Path

            Path(filename).write_bytes(self.data)

    target = tmp_path / "video.mp4"
    client = OSSClient()
    bucket = Bucket()
    client._bucket = bucket
    digest = hashlib.sha256(bucket.data).hexdigest()
    client.download_private_file("private-video", target, digest)
    assert target.read_bytes() == b"restored-video"
    bucket.data = b"broken"
    with pytest.raises(RuntimeError, match="恢复校验失败"):
        client.download_private_file("private-video", target, digest)
    assert target.read_bytes() == b"restored-video"
    assert not list(tmp_path.glob("*.tmp"))
