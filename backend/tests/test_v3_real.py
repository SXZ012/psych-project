import hashlib
import json

import httpx
import pytest

from app.services.v3.real import RealV3Client, V3ConfigurationError, V3TaskError


def make_client(handler, *, poll_interval=0.001):
    return RealV3Client(
        api_root="https://partner.test",
        token="secret-token",
        alg_service_uuid="service-uuid",
        poll_interval=poll_interval,
        poll_timeout=1,
        transport=httpx.MockTransport(handler),
    )


def test_real_client_requires_both_credentials():
    with pytest.raises(V3ConfigurationError, match="V3_BASIC_TOKEN"):
        RealV3Client("https://partner.test", "", "service-uuid")
    with pytest.raises(V3ConfigurationError, match="V3_ALG_SERVICE_UUID"):
        RealV3Client("https://partner.test", "token", "")


async def test_real_client_full_flow_and_stream_upload(tmp_path):
    video = tmp_path / "sample.webm"
    video.write_bytes(b"video-bytes")
    calls = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path))
        if request.url.path.endswith("/put-presignurl"):
            payload = json.loads((await request.aread()).decode())
            assert payload["file_md5"] == hashlib.md5(b"video-bytes").hexdigest()
            assert request.headers["Authorization"] == "Token secret-token"
            return httpx.Response(200, json={"id": 42, "presigned_put_url": "https://storage.test/upload"})
        if request.url.host == "storage.test" and request.method == "PUT":
            assert await request.aread() == b"video-bytes"
            assert "authorization" not in request.headers
            return httpx.Response(200)
        if request.url.path.endswith("/oss-file/42"):
            return httpx.Response(200, json={"presigned_get_url": "https://storage.test/video"})
        if request.url.path.endswith("/start-task"):
            payload = json.loads((await request.aread()).decode())
            assert isinstance(payload["input_params"], str)
            assert json.loads(payload["input_params"])["file_id"] == 42
            return httpx.Response(200, json={"id": 99, "status": 3})
        if request.url.path.endswith("/task-record/99"):
            result = {"summary": {"overall": {"score": 61.2}}, "timeline": "https://storage.test/timeline"}
            return httpx.Response(200, json={"id": 99, "status": 0, "result": json.dumps(result)})
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    client = make_client(handler)
    result = await client.run(video)

    assert result["summary"]["overall"]["score"] == 61.2
    assert ("PUT", "/upload") in calls


async def test_real_client_raises_on_failed_task():
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"id": 9, "status": 2, "result": {"message": "failed"}})

    client = make_client(handler)
    with pytest.raises(V3TaskError, match="处理异常"):
        await client.wait_task(9)
