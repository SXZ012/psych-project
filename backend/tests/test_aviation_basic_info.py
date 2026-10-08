"""终端四项基础信息：工号/性别/年龄的提交、落库、详情暴露与旧式兼容。"""

from uuid import UUID

from app.core.config import settings
from app.models.assessment import Assessment
from tests.community_helpers import fake_video


async def _login_admin(client) -> None:
    response = await client.post("/api/v1/admin/login", json={"password": settings.ADMIN_PASSWORD})
    assert response.status_code == 200


async def test_submit_with_basic_info_fields(db, client):
    """v4 终端：姓名+工号+性别+年龄（不再传身份证号）。"""
    response = await client.post(
        "/api/v1/assessments/submit",
        data={
            "name": "张三",
            "subject_id": "1024",
            "gender": "男",
            "age": "30",
            "selections": '[{"question_id":"q1","picked":["q1a"],"answered_ms":3200}]',
            "duration_seconds": "61",
        },
        files={"video": fake_video()},
    )
    assert response.status_code == 201, response.text
    assessment = await db.get(Assessment, UUID(response.json()["id"]))
    assert assessment.name == "张三"
    assert assessment.subject_id == "1024"
    assert assessment.id_card is None
    assert assessment.selections_data["basic_info"] == {"gender": "男", "age": 30}
    # 作答时间随 selections 原样保留
    assert assessment.selections_data["selections"][0]["answered_ms"] == 3200


async def test_detail_exposes_basic_info(db, client):
    await _login_admin(client)
    created = await client.post(
        "/api/v1/assessments/submit",
        data={
            "name": "李四",
            "subject_id": "2048",
            "gender": "女",
            "age": "41",
            "selections": "[]",
            "duration_seconds": "60",
        },
        files={"video": fake_video()},
    )
    assert created.status_code == 201
    detail = (await client.get(f"/api/v1/assessments/{created.json()['id']}")).json()
    assert detail["subject_id"] == "2048"
    assert detail["basic_info"] == {"gender": "女", "age": 41}


async def test_legacy_submit_without_new_fields_unchanged(db, client):
    """旧终端（只传姓名+身份证号）行为完全不变；非法性别/年龄被忽略。"""
    legacy = await client.post(
        "/api/v1/assessments/submit",
        data={
            "name": "旧终端",
            "id_card": "110101199001011234",
            "selections": "[]",
            "duration_seconds": "60",
            "gender": "未知",
            "age": "abc",
        },
        files={"video": fake_video()},
    )
    assert legacy.status_code == 201
    row = await db.get(Assessment, UUID(legacy.json()["id"]))
    assert row.id_card == "110101199001011234"
    assert row.subject_id is None
    assert "basic_info" not in row.selections_data
