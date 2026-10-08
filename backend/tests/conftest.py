"""社区链路测试夹具。

策略：
- 使用与开发实例同一个 PostgreSQL，但建独立的 psych_test 库，测试间互不污染；
- httpx.AsyncClient + ASGITransport 直连 FastAPI app（不触发 lifespan，
  不会碰开发库，也不会执行启动期的补列 SQL）；
- get_db 依赖覆盖到测试引擎；提交路由的后台分析任务(run_assessment)
  替换为 no-op，视频落盘目录重定向到 tmp_path。
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401  # 注册全部 ORM 模型
from app.core.config import settings
from app.db.base import Base, get_db

TEST_DB_NAME = "psych_test"


@pytest.fixture(autouse=True)
def isolate_file_storage(monkeypatch):
    """Tests never upload fabricated reports or videos to the configured live OSS."""
    monkeypatch.setattr(settings, "REPORT_STORAGE_MODE", "local")
    monkeypatch.setattr(settings, "OSS_BACKUP_ENABLED", False)


def _test_database_url() -> str:
    if settings.DATABASE_URL:
        # postgresql+asyncpg://user:pass@host/db → 指向 psych_test
        head, _, _current = settings.DATABASE_URL.rpartition("/")
        return f"{head}/{TEST_DB_NAME}"
    user = settings.POSTGRES_USER
    password = settings.POSTGRES_PASSWORD
    host = settings.POSTGRES_HOST
    return f"postgresql+asyncpg://{user}:{password}@{host}/{TEST_DB_NAME}"


@pytest.fixture(scope="session", autouse=True)
def _ensure_test_database():
    """在开发 PG 实例上确保 psych_test 存在（复用，不删除）。"""

    async def _create() -> None:
        engine = create_async_engine(
            settings.sqlalchemy_database_url,
            poolclass=NullPool,
            isolation_level="AUTOCOMMIT",  # CREATE DATABASE 不能在事务里执行
        )
        async with engine.connect() as conn:
            exists = (
                await conn.execute(
                    text("SELECT 1 FROM pg_database WHERE datname = :name"),
                    {"name": TEST_DB_NAME},
                )
            ).scalar()
            if not exists:
                await conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
        await engine.dispose()

    asyncio.run(_create())
    yield


@pytest.fixture
async def db_engine() -> AsyncGenerator:
    """每个测试独享引擎与干净表（create_all + 结尾 TRUNCATE）。"""
    engine = create_async_engine(_test_database_url(), poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # create_all 不会给已存在表补列；保持复用测试库时与生产迁移一致。
        await conn.execute(
            text("ALTER TABLE assessment_sessions ADD COLUMN IF NOT EXISTS selected_pair_ids TEXT")
        )
        await conn.execute(
            text("ALTER TABLE assessments ADD COLUMN IF NOT EXISTS client_token VARCHAR(64)")
        )
        for ddl in (
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS consent_version VARCHAR(32)",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS capture_protocol_version VARCHAR(64)",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS "
            "question_protocol_version VARCHAR(64)",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS content_version VARCHAR(64)",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS "
            "report_status VARCHAR(16) NOT NULL DEFAULT 'none'",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS "
            "report_access_token_hash VARCHAR(128)",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS "
            "report_access_token_created_at TIMESTAMPTZ",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS "
            "report_access_token_revoked_at TIMESTAMPTZ",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS "
            "processing_attempts INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS "
            "report_template_version VARCHAR(32)",
        ):
            await conn.execute(text(ddl))
        await conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_assessments_client_token "
                "ON assessments (client_token)"
            )
        )
    yield engine
    # assessments ↔ payment_orders 存在互相外键(会话绑定)，TRUNCATE CASCADE 与顺序无关
    table_names = ", ".join(f'"{table.name}"' for table in Base.metadata.tables.values())
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {table_names} RESTART IDENTITY CASCADE"))
    await engine.dispose()


@pytest.fixture
async def db(db_engine) -> AsyncGenerator[AsyncSession]:
    """直接操作数据库的会话（造设备/用户/会话等测试数据）。"""
    maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session


@pytest.fixture
async def client(db_engine, monkeypatch, tmp_path) -> AsyncGenerator[httpx.AsyncClient]:
    from app.main import app
    from app.services.report_access import _buckets

    _buckets.clear()

    maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_db() -> AsyncGenerator[AsyncSession, None]:
        async with maker() as session:
            yield session

    app.dependency_overrides[get_db] = _override_db

    import app.api.routes.assessments as assessments_routes
    import app.services.processing as processing_service

    async def _noop_run_assessment(assessment_id) -> None:  # noqa: ARG001
        return None

    # 后台处理已从请求内 BackgroundTasks 移到持久化 worker；测试替换 worker 的执行体。
    monkeypatch.setattr(processing_service, "run_assessment", _noop_run_assessment)
    monkeypatch.setattr(assessments_routes, "_REPO_ROOT", tmp_path)

    # 上传前视频质检门禁直通：本套件上传的是假字节（考察会话绑定/字段透传，
    # 不考察视频质量）。真实质检由 tests/test_video_qa.py 直测 validate_and_repair。
    async def _bypass_video_qa(storage_key: str) -> tuple[str, dict]:
        return storage_key, {"ok": True, "bypassed": "test-fixture"}

    monkeypatch.setattr(assessments_routes, "_validate_uploaded_video", _bypass_video_qa)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as http:
        yield http

    app.dependency_overrides.pop(get_db, None)
