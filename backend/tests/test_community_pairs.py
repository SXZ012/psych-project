"""社区题库隔离：scene=community 与 aviation 互不可见，默认为 aviation。"""

from uuid import uuid4

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes import pairs as routes
from app.models.community import AssessmentSession
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


async def test_local_static_image_served_directly(db, client, monkeypatch, tmp_path):
    """旧接口在未配置 CDN 时保留本地兼容路径；临时取图不走此路径。"""
    monkeypatch.setattr(type(routes.settings), "static_asset_base_url", property(lambda _: ""))
    monkeypatch.setattr(routes, "_COMMUNITY_ASSETS_DIR", tmp_path)
    (tmp_path / "ux").mkdir()
    (tmp_path / "ux" / "5392095.jpg").write_bytes(b"fixture-jpeg" * 1000)
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
                db,
                "community",
                f"{dimension}题目{i}",
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
            db,
            "community",
            f"普通题目{i}",
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
            db,
            "community",
            f"仅有的题{i}",
            url=f"/static/assets/community/images/bank/{uuid4().hex}.jpg",
        )

    response = await client.get("/api/v1/pairs/session", params={"count": 12, "scene": "community"})
    assert response.status_code == 200
    pairs = response.json()["pairs"]
    assert len(pairs) == 3
    assert len({pair["image_id"] for pair in pairs}) == 3


async def test_partial_pool_remains_fixed_after_new_questions_added(db, client):
    for i in range(3):
        await _make_pair(
            db, "community", f"固定题{i}", url=f"/static/assets/community/ux/{uuid4().hex}.jpg"
        )
    session = AssessmentSession(scene="community")
    db.add(session)
    await db.commit()
    params = {"count": 30, "scene": "community", "session_id": str(session.id)}
    first = (await client.get("/api/v1/pairs/session", params=params)).json()["pairs"]
    await _make_pair(
        db, "community", "新增题", url=f"/static/assets/community/ux/{uuid4().hex}.jpg"
    )
    second = (await client.get("/api/v1/pairs/session", params=params)).json()["pairs"]
    assert len(first) == 3
    assert [p["pair_id"] for p in first] == [p["pair_id"] for p in second]


async def test_temporary_formal_and_practice_images_use_cloud_no_store(db, client, monkeypatch):
    pair = await _make_pair(db, "community", "临时云端图片")
    monkeypatch.setattr(
        type(routes.settings),
        "static_asset_base_url",
        property(lambda _: "https://assets.example.test"),
    )
    requested = []

    def upstream(request):
        requested.append(str(request.url))
        return httpx.Response(200, content=b"cloud-picture", headers={"Content-Type": "image/jpeg"})

    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        routes.httpx,
        "AsyncClient",
        lambda **kw: original_client(transport=httpx.MockTransport(upstream), **kw),
    )
    for path in (
        f"/api/v1/pairs/images/{pair.image_id}?temporary=true",
        "/api/v1/pairs/practice-images/1",
    ):
        response = await client.get(path)
        assert response.status_code == 200
        assert response.content == b"cloud-picture"
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-asset-source"] == "oss"
    assert requested == ["https://assets.example.test/static-assets/community/ux/5392095.jpg"] * 2


async def test_cloud_failure_does_not_fall_back_to_local_image(db, client, monkeypatch):
    pair = await _make_pair(db, "community", "禁止本地回退")
    monkeypatch.setattr(
        type(routes.settings),
        "static_asset_base_url",
        property(lambda _: "https://assets.example.test"),
    )
    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        routes.httpx,
        "AsyncClient",
        lambda **kw: original_client(
            transport=httpx.MockTransport(lambda _: httpx.Response(503)), **kw
        ),
    )
    response = await client.get(f"/api/v1/pairs/images/{pair.image_id}?temporary=true")
    assert response.status_code == 502


async def test_community_deduplicates_prompt_and_image_aliases(db, client):
    await _make_pair(db, "community", "今天感觉如何？", url="/static/assets/community/ux/a.jpg")
    await _make_pair(db, "community", " 今天 感觉如何? ", url="/static/assets/community/ux/b.jpg")
    await _make_pair(db, "community", "一个不同的题目", url="/static/assets/community/ux/c.jpg?v=1")
    await _make_pair(
        db, "community", "同图不同编号的题目", url="/static/assets/community/ux/c.jpg?v=2"
    )
    await _make_pair(db, "community", "训练题？", url="/static/assets/community/ux/d.jpg")
    response = await client.get(
        "/api/v1/pairs/session",
        params={"count": 30, "scene": "community", "exclude_questions": "训练题?"},
    )
    pairs = response.json()["pairs"]
    assert len(pairs) == 2
    assert sum("今天" in p["question"] for p in pairs) == 1
    assert not any("训练题" in p["question"] for p in pairs)


async def test_legacy_fixed_pool_is_also_deduplicated(db, client):
    first = await _make_pair(db, "community", "重复问题？", url="/static/assets/community/ux/a.jpg")
    second = await _make_pair(
        db, "community", "重复 问题?", url="/static/assets/community/ux/b.jpg"
    )
    practice = await _make_pair(
        db, "community", "预训练题", url="/static/assets/community/ux/practice.jpg"
    )
    session = AssessmentSession(
        scene="community",
        selected_pair_ids=routes.json.dumps(
            [str(first.id), str(second.id), str(first.id), str(practice.id)]
        ),
    )
    db.add(session)
    await db.commit()
    response = await client.get(
        "/api/v1/pairs/session",
        params={
            "count": 30,
            "scene": "community",
            "session_id": str(session.id),
            "exclude_questions": "预训练题",
        },
    )
    assert [p["pair_id"] for p in response.json()["pairs"]] == [str(first.id)]
