"""FastAPI 应用入口。"""
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from sqlalchemy import text

# 导入模型，使其注册到 Base.metadata（供启动时 create_all）
import app.models  # noqa: F401
from app.api.routes import admin, assessments, health, pairs, uploads
from app.core.config import settings
from app.core.log import setup_logging
from app.db.base import Base, engine

# 结构化日志：控制台 + 滚动文件 logs/app.log
setup_logging()
logger = logging.getLogger("app.main")

_DEMO_HTML = Path(__file__).resolve().parent / "static" / "demo.html"
_ADMIN_HTML = Path(__file__).resolve().parent / "static" / "admin.html"
_LOGIN_HTML = Path(__file__).resolve().parent / "static" / "login.html"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # dev 便捷：启动即建表（生产应关闭并改用 Alembic 迁移）
    if settings.CREATE_TABLES_ON_START:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Development compatibility for databases created before the
            # asynchronous video/report states were added. Production should
            # run the equivalent migration before deployment.
            for value in ("video_processing", "queued", "report_generating"):
                await conn.execute(
                    text(
                        "ALTER TYPE assessment_status ADD VALUE IF NOT EXISTS "
                        f"'{value}'"
                    )
                )
            for column, sql_type in (
                ("video_storage_key", "VARCHAR(256)"),
                ("backup_storage_key", "VARCHAR(256)"),
                ("backup_status", "VARCHAR(32)"),
                ("partner_upload_status", "VARCHAR(32)"),
                ("partner_file_id", "VARCHAR(128)"),
                ("video_status", "VARCHAR(32)"),
                ("selections_data", "JSONB"),
                ("duration_seconds", "INTEGER"),
                ("retry_count", "INTEGER NOT NULL DEFAULT 0"),
                ("error_code", "VARCHAR(64)"),
                ("submitted_at", "TIMESTAMPTZ"),
                ("processing_started_at", "TIMESTAMPTZ"),
                ("report_generated_at", "TIMESTAMPTZ"),
            ):
                await conn.execute(
                    text(
                        f"ALTER TABLE assessments ADD COLUMN IF NOT EXISTS "
                        f"{column} {sql_type}"
                    )
                )
    logger.info("应用启动 | env=%s provider=%s", settings.ENV, settings.PROVIDER_MODE)
    yield
    logger.info("应用关闭")


app = FastAPI(
    title=settings.APP_NAME,
    debug=settings.DEBUG,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
        logger.info(
            "%s %s -> %d (%.1fms)",
            request.method,
            request.url.path,
            response.status_code,
            (time.perf_counter() - start) * 1000,
        )
        return response
    except Exception:
        logger.exception(
            "%s %s 失败 (%.1fms)",
            request.method,
            request.url.path,
            (time.perf_counter() - start) * 1000,
        )
        raise


app.include_router(health.router, tags=["health"])
app.include_router(
    assessments.router,
    prefix=f"{settings.API_V1_PREFIX}/assessments",
    tags=["assessments"],
)
app.include_router(
    uploads.router,
    prefix=f"{settings.API_V1_PREFIX}/uploads",
    tags=["uploads"],
)
app.include_router(
    pairs.router,
    prefix=f"{settings.API_V1_PREFIX}/pairs",
    tags=["pairs"],
)

app.include_router(
    admin.router,
    prefix=f"{settings.API_V1_PREFIX}/admin",
    tags=["admin"],
)


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def root() -> HTMLResponse:
    return HTMLResponse(
        f"<h3>{settings.APP_NAME}</h3>"
        f"<p>env={settings.ENV} | provider={settings.PROVIDER_MODE}</p>"
        f"<p><a href='/demo'>▶ 测评端</a> | "
        f"<a href='/admin'>🛠 后台</a> | "
        f"<a href='/docs'>API</a></p>"
    )


@app.get("/demo", response_class=HTMLResponse, include_in_schema=False)
async def demo_page() -> HTMLResponse:
    return HTMLResponse(_DEMO_HTML.read_text(encoding="utf-8"))


@app.get("/admin", response_class=HTMLResponse, include_in_schema=False)
async def admin_page() -> HTMLResponse:
    """后台：工作人员查看每个被测者的详细测评报告。"""
    return HTMLResponse(_ADMIN_HTML.read_text(encoding="utf-8"))


@app.get("/login", response_class=HTMLResponse, include_in_schema=False)
async def login_page() -> HTMLResponse:
    """测评入口：被测者录入身份信息后进入测评。"""
    return HTMLResponse(_LOGIN_HTML.read_text(encoding="utf-8"))
