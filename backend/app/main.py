"""FastAPI 应用入口。"""
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
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

_STATIC_DIR = Path(__file__).resolve().parent / "static"


def _serve_spa(dist_name: str, path: str, label: str):
    """返回 SPA 静态资源；未知子路径回落到 index.html 交给前端路由处理。"""
    dist_dir = _STATIC_DIR / dist_name
    requested = (dist_dir / path).resolve()
    if path and requested.is_relative_to(dist_dir.resolve()) and requested.is_file():
        return FileResponse(requested)
    index = dist_dir / "index.html"
    if not index.exists():
        return HTMLResponse(f"{label}尚未构建，请先运行对应前端目录的 npm run build。", status_code=503)
    return FileResponse(index)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # dev 便捷：启动即建表（生产应关闭并改用 Alembic 迁移）
    if settings.CREATE_TABLES_ON_START:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Development compatibility for databases created before the
            # asynchronous video/report states were added. Production should
            # run the equivalent migration before deployment.
            for value in ("video_processing", "queued", "report_generating", "invalid_result"):
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
                ("video_qa_json", "JSONB"),
                ("result_valid", "BOOLEAN"),
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

# 本地前端依赖（人脸检测脚本、模型和 WASM），避免终端依赖境外 CDN。
app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


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
        f"<p><a href='/login/'>▶ 测评端</a> | "
        f"<a href='/admin/'>🛠 后台</a> | "
        f"<a href='/docs'>API</a></p>"
    )


@app.get("/demo", include_in_schema=False)
async def demo_page() -> RedirectResponse:
    """旧测评页地址；新版已将身份录入与测评整合到 /login/。"""
    return RedirectResponse(url="/login/", status_code=307)

@app.get("/admin", include_in_schema=False)
async def admin_page():
    """正式管理后台入口。"""
    return _serve_spa("admin-v2", "", "管理后台")


@app.get("/admin/{path:path}", include_in_schema=False)
async def admin_spa_page(path: str = ""):
    return _serve_spa("admin-v2", path, "管理后台")


@app.get("/login", include_in_schema=False)
async def login_page():
    """正式测评入口。"""
    return _serve_spa("terminal-v2", "", "测评端")


@app.get("/login/{path:path}", include_in_schema=False)
async def login_spa_page(path: str = ""):
    return _serve_spa("terminal-v2", path, "测评端")
