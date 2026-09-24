"""社区题库隔离：scene=community 与 aviation 互不可见，默认为 aviation。"""

from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.image_bank import Image, Pair


async def _make_pair(
    db: AsyncSession,
    scene: str,
    question: str,
    url: str | None = None,
    dimension: str = "测试维度",
) -> Pair:
    image = Image(
        oss_key=f"test/{scene}/{uuid4().hex}",
        url=url or "/static/assets/community/ux/5392095.jpg",
        category="TEST",
    )
    db.add(image)
    await db.flush()
    pair = Pair(
        image_id=image.id,
        question=question,
        option_a="选项甲",
        option_b="选项乙",
        dimension=dimension,
        scene=scene,
        active=True,
    )
    db.add(pair)
    await db.commit()
    return pair


async def test_community_scene_returns_only_community_pairs(db, client):
    community = await _make_pair(db, "community", "社区专属题目")
    aviation = await _make_pair(db, "aviation", "航空专属题目")

    response = await client.get("/api/v1/pairs/session", params={"count": 10, "scene": "community"})
    assert response.status_code == 200
    questions = [pair["question"] for pair in response.json()["pairs"]]
    assert community.question in questions
    assert aviation.question not in questions
    assert all(pair["scene"] == "community" for pair in response.json()["pairs"])


async def test_aviation_scene_returns_only_aviation_pairs(db, client):
    community = await _make_pair(db, "community", "社区专属题目")
    aviation = await _make_pair(db, "aviation", "航空专属题目")

    response = await client.get("/api/v1/pairs/session", params={"count": 10, "scene": "aviation"})
    assert response.status_code == 200
    questions = [pair["question"] for pair in response.json()["pairs"]]
    assert aviation.question in questions
    assert community.question not in questions


async def test_default_scene_is_aviation(db, client):
    """不声明 scene 的既有航空终端，即使库里已有社区题也只拿到航空题。"""
    community = await _make_pair(db, "community", "社区专属题目")
    aviation = await _make_pair(db, "aviation", "航空专属题目")

    response = await client.get("/api/v1/pairs/session", params={"count": 10})
    assert response.status_code == 200
    questions = [pair["question"] for pair in response.json()["pairs"]]
    assert aviation.question in questions
    assert community.question not in questions


async def test_invalid_scene_rejected(db, client):
    response = await client.get("/api/v1/pairs/session", params={"scene": "hospital"})
    assert response.status_code == 422
    next_response = await client.get("/api/v1/pairs/next", params={"scene": "school"})
    assert next_response.status_code == 422


async def test_local_static_image_served_directly(db, client):
    """社区占位图(/static/...)不依赖 OSS，由本服务直接读盘返回。"""
    pair = await _make_pair(db, "community", "本地图片题")
    response = await client.get(f"/api/v1/pairs/images/{pair.image_id}")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/jpeg")
    assert len(response.content) > 10000


async def test_session_pool_fills_beyond_dimension_count(db, client):
    """题池扩容：维度不足时按图片去重补足到 count，图片绝不复用。"""
    # 2 个维度 × 8 张图 = 16 道；请求 12 道，第一遍只能取 2 道，需第二遍补足
    for dimension in ("情绪状态", "压力水平"):
        for i in range(8):
            await _make_pair(
                db, "community", f"{dimension}题目{i}",
                url=f"/static/assets/community/images/bank/{uuid4().hex}.jpg",
                dimension=dimension,
            )

    response = await client.get("/api/v1/pairs/session", params={"count": 12, "scene": "community"})
    assert response.status_code == 200
    pairs = response.json()["pairs"]
    assert len(pairs) == 12
    image_ids = [pair["image_id"] for pair in pairs]
    pair_ids = [pair["pair_id"] for pair in pairs]
    assert len(set(image_ids)) == 12, "同一会话图片不得复用"
    assert len(set(pair_ids)) == 12, "同一会话题目不得复用"


async def test_session_pool_excludes_practice_images(db, client):
    """exclude_images：正式题池排除预训练用过的图片（正式题与预训练不重复）。"""
    practice_file = f"{uuid4().hex}.jpg"
    await _make_pair(
        db,
        "community",
        "预训练同图题",
        url=f"/static/assets/community/ux/{practice_file}",
    )
    for i in range(3):
        await _make_pair(
            db, "community", f"普通题目{i}",
            url=f"/static/assets/community/images/bank/{uuid4().hex}.jpg",
        )

    response = await client.get(
        "/api/v1/pairs/session",
        params={"count": 3, "scene": "community", "exclude_images": practice_file},
    )
    assert response.status_code == 200
    pairs = response.json()["pairs"]
    assert pairs, "排除后仍应返回其余题目"
    assert all(practice_file not in (pair.get("oss_key") or "") for pair in pairs)
    assert all(pair["question"] != "预训练同图题" for pair in pairs)


async def test_session_pool_returns_fewer_when_insufficient(db, client):
    """题库不足时宁可少返回（终端据此明确提示素材不足），不重复凑数。"""
    for i in range(3):
        await _make_pair(
            db, "community", f"仅有的题{i}",
            url=f"/static/assets/community/images/bank/{uuid4().hex}.jpg",
        )

    response = await client.get("/api/v1/pairs/session", params={"count": 12, "scene": "community"})
    assert response.status_code == 200
    pairs = response.json()["pairs"]
    assert len(pairs) == 3
    assert len({pair["image_id"] for pair in pairs}) == 3
