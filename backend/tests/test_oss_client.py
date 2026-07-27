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
