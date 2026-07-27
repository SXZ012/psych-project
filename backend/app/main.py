"""FastAPI 应用入口。"""
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

# 导入模型，使其注册到 Base.metadata（供启动时 create_all）
import app.models  # noqa: F401
from app.api.routes import assessments, health, pairs, uploads
from app.core.config import settings
from app.core.log import setup_logging
from app.db.base import Base, engine

# 结构化日志：控制台 + 滚动文件 logs/app.log
setup_logging()
logger = logging.getLogger("app.main")

_DEMO_HTML = Path(__file__).resolve().parent / "static" / "demo.html"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # dev 便捷：启动即建表（生产应关闭并改用 Alembic 迁移）
    if settings.CREATE_TABLES_ON_START:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
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


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def root() -> HTMLResponse:
    return HTMLResponse(
        f"<h3>{settings.APP_NAME}</h3>"
        f"<p>env={settings.ENV} | provider={settings.PROVIDER_MODE}</p>"
        f"<p><a href='/demo'>▶ 打开测评 Demo</a> | "
        f"<a href='/docs'>API 文档</a></p>"
    )


@app.get("/demo", response_class=HTMLResponse, include_in_schema=False)
async def demo_page() -> HTMLResponse:
    return HTMLResponse(_DEMO_HTML.read_text(encoding="utf-8"))
