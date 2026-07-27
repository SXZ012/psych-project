from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    # / 现在是 HTML 落地页（含 Demo 入口）
    assert "Demo" in response.text or "测评" in response.text


def test_health_endpoint_exists():
    # 不依赖真实数据库：连不上时返回 degraded，但仍为 200
    response = client.get("/health")
    assert response.status_code == 200
    assert "status" in response.json()
