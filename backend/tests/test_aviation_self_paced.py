"""航空自定节奏升级的后端测试：

1. /api/v1/pairs/aviation/pool 返回足量题目（按 pair 去重，不按维度去重），
   且社区 /pairs/session 的维度+图片去重规则不受影响；
2. /submit 的 client_token 幂等：同 token 重试更新原记录，不重复创建。
"""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assessment import Assessment, ProcessingTask
from app.models.image_bank import Image, Pair
from tests.community_helpers import fake_video


# 造 12 道题：3 张图 × 4 题，覆盖 2 个维度（维度数远小于题数，
# 正是旧 session 接口"count=40 只回 2 题"的形状）
def _seed_rows() -> list[tuple[Pair, Image]]:
    rows: list[tuple[Pair, Image]] = []
    for i in range(3):
        image = Image(oss_key=f"local/aviation/pool-img-{i}.jpg", url=f"/static/x{i}.jpg")
        for j in range(4):
            rows.append(
                (
                    Pair(
                        image=image,
                        question=f"题{i}-{j}",
                        option_a="甲",
                        option_b="乙",
                        dimension=f"维度{i % 2}",
                        scenario="情境",
                        scene="aviation",
                    ),
                    image,
                )
            )
    return rows


async def test_aviation_pool_returns_more_than_dimension_count(
    client: AsyncClient, db: AsyncSession
) -> None:
    for pair, _image in _seed_rows():
        db.add(pair)
    await db.commit()

    response = await client.get("/api/v1/pairs/aviation/pool?count=12")
    assert response.status_code == 200, response.text
    body = response.json()
    pairs = body["pairs"]
    assert len(pairs) == 12, "按 pair 去重应返回全部 12 题（维度只有 2 个）"
    pair_ids = [p["pair_id"] for p in pairs]
    assert len(set(pair_ids)) == 12, "题目互不重复"


async def test_aviation_pool_prefers_unique_images(client: AsyncClient, db: AsyncSession) -> None:
    for pair, _image in _seed_rows():
        db.add(pair)
    await db.commit()

    response = await client.get("/api/v1/pairs/aviation/pool?count=8")
    pairs = response.json()["pairs"]
    image_ids = {p["image_id"] for p in pairs}
    assert len(image_ids) == 3, "count≤图片数时图片不重复"


async def test_community_session_rules_unaffected(client: AsyncClient, db: AsyncSession) -> None:
    """社区 /pairs/session 场景隔离不变；抽题两遍：维度多样优先，图片绝不复用。"""
    for pair, _image in _seed_rows():
        db.add(pair)
    await db.commit()

    response = await client.get("/api/v1/pairs/session?count=12&scene=community")
    assert response.status_code == 200
    assert response.json()["count"] == 0, "社区题库不受航空题影响"

    response = await client.get("/api/v1/pairs/session?count=12&scene=aviation")
    pairs = response.json()["pairs"]
    # 3 道航空题（2 个维度、3 张不同图）：两遍抽取补足到 3，图片不重复；
    # 题库不足 count 时宁可少返回（终端明确提示素材不足，不重复凑数）。
    assert len(pairs) == 3, "不足 count 时按实际数量返回，不重复凑数"
    assert len({p["image_id"] for p in pairs}) == 3, "同一会话图片不得复用"
    assert len({p["pair_id"] for p in pairs}) == 3, "同一会话题目不得复用"


async def test_submit_client_token_idempotent_retry(client: AsyncClient, db: AsyncSession) -> None:
    """同 token 重试：更新同一条记录并 +1 retry_count，不新建。"""
    form = {
        "name": "张三",
        "subject_id": "E001",
        "gender": "男",
        "age": "30",
        "selections": '[{"question_id":"q1","picked":["q1-a"],"outcome":"selected"}]',
        "duration_seconds": "60",
        "effective_duration_seconds": "60",
        "client_token": "token-abc",
        "protocol_version": "strict-continuous-v2",
    }
    first = await client.post(
        "/api/v1/assessments/submit",
        data=form,
        files={"video": fake_video()},
    )
    assert first.status_code == 201, first.text
    assessment_id = first.json()["id"]
    first_code = first.json()["access_code"]
    assert first_code

    second = await client.post(
        "/api/v1/assessments/submit",
        data={**form, "duration_seconds": "61"},
        files={"video": fake_video()},
    )
    assert second.status_code == 200, second.text
    assert second.json()["id"] == assessment_id, "同 token 不重复创建"
    assert second.json()["access_code"]
    assert second.json()["access_code"] != first_code, "响应丢失后的重试应轮换查询码"

    rows = (await db.execute(select(Assessment))).scalars().all()
    assert len(rows) == 1
    assert rows[0].retry_count == 1
    assert rows[0].duration_seconds == 61
    quality = rows[0].selections_data["capture_quality"]
    assert quality["protocol_version"] == "strict-continuous-v2"
    tasks = (await db.execute(select(ProcessingTask))).scalars().all()
    assert len(tasks) == 1
    assert tasks[0].assessment_id == rows[0].id


async def test_submit_without_token_creates_each_time(
    client: AsyncClient, db: AsyncSession
) -> None:
    """旧终端不带 token：行为与原先完全一致（每次新建）。"""
    for _ in range(2):
        response = await client.post(
            "/api/v1/assessments/submit",
            data={"name": "李四"},
            files={"video": fake_video()},
        )
        assert response.status_code == 201, response.text
    rows = (await db.execute(select(Assessment))).scalars().all()
    assert len(rows) == 2
