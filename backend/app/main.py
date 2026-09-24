"""FastAPI 应用入口。"""
import asyncio
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
from app.api.routes import (
    admin,
    assessments,
    community,
    health,
    pairs,
    reports,
    session_config,
    uploads,
)
from app.core.config import settings
from app.core.log import setup_logging
from app.db.base import Base, engine

# 结构化日志：控制台 + 滚动文件 logs/app.log
setup_logging()
logger = logging.getLogger("app.main")

_STATIC_DIR = Path(__file__).resolve().parent / "static"
# 社区素材与前后端代码分离，放在项目根目录的独立文件夹中。
_COMMUNITY_ASSETS_DIR = Path(__file__).resolve().parents[2] / "community-assets"
_CDN_MEDIA_SUFFIXES = {
    ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".wav", ".mp3", ".mp4", ".webm", ".ogg", ".m4a",
}


def _serve_spa(dist_name: str, path: str, label: str):
    """返回 SPA 静态资源；未知子路径回落到 index.html 交给前端路由处理。

    index.html 必须每次回源校验（no-cache）：终端 WebView 的启发式缓存会让
    "重构建前端、无需重装 APK"失效——页面一直跑旧 bundle。带哈希的静态资源
    文件名随内容变化，可放心让浏览器长缓存。
    """
    dist_dir = _STATIC_DIR / dist_name
    requested = (dist_dir / path).resolve()
    if path and requested.is_relative_to(dist_dir.resolve()) and requested.is_file():
        return FileResponse(requested, headers={"Cache-Control": "no-cache"})
    index = dist_dir / "index.html"
    if not index.exists():
        return HTMLResponse(
            f"{label}尚未构建，请先运行对应前端目录的 npm run build。",
            status_code=503,
        )
    return FileResponse(index, headers={"Cache-Control": "no-cache"})


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
            # 航空情境题扩展字段；均为向后兼容字段，旧题库无需重灌即可继续使用。
            for column, sql_type in (
                ("dimension", "VARCHAR(64)"),
                ("scenario", "VARCHAR(64)"),
                ("audio_url", "VARCHAR(512)"),
                ("content_version", "VARCHAR(32)"),
                ("source_note", "VARCHAR(256)"),
                ("scoring_mode", "VARCHAR(32) NOT NULL DEFAULT 'observation_only'"),
                ("scene", "VARCHAR(20) NOT NULL DEFAULT 'aviation'"),
                ("content_type", "VARCHAR(20) NOT NULL DEFAULT 'image'"),
                ("media_url", "VARCHAR(512)"),
            ):
                await conn.execute(
                    text(
                        f"ALTER TABLE pairs ADD COLUMN IF NOT EXISTS "
                        f"{column} {sql_type}"
                    )
                )
            # 双场景：assessments 表扩展字段
            for column, sql_type in (
                ("scene", "VARCHAR(20) NOT NULL DEFAULT 'aviation'"),
                ("customer_id", "UUID"),
                ("order_id", "UUID"),
                ("device_id", "VARCHAR(64)"),
                ("report_type", "VARCHAR(20)"),
                ("report_pdf_key", "VARCHAR(512)"),
                ("report_sent_at", "TIMESTAMPTZ"),
                ("assessment_session_id", "UUID"),
                # 终端幂等令牌（提交重试不重复建测评记录）
                ("client_token", "VARCHAR(64)"),
            ):
                await conn.execute(
                    text(
                        f"ALTER TABLE assessments ADD COLUMN IF NOT EXISTS "
                        f"{column} {sql_type}"
                    )
                )
            await conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_assessments_client_token "
                    "ON assessments (client_token)"
                )
            )
            # 一体化产品升级：追溯字段 + 报告查询凭证（显式迁移见 migrations/005，
            # 此处保持 dev 库自动补齐，二者幂等）
            for column, sql_type in (
                ("consent_version", "VARCHAR(32)"),
                ("capture_protocol_version", "VARCHAR(64)"),
                ("question_protocol_version", "VARCHAR(64)"),
                ("content_version", "VARCHAR(64)"),
                ("report_status", "VARCHAR(16) NOT NULL DEFAULT 'none'"),
                ("report_access_token_hash", "VARCHAR(128)"),
                ("report_access_token_created_at", "TIMESTAMPTZ"),
                ("report_access_token_revoked_at", "TIMESTAMPTZ"),
                ("processing_attempts", "INTEGER NOT NULL DEFAULT 0"),
            ):
                await conn.execute(
                    text(
                        f"ALTER TABLE assessments ADD COLUMN IF NOT EXISTS "
                        f"{column} {sql_type}"
                    )
                )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_assessments_report_token "
                    "ON assessments (report_access_token_hash)"
                )
            )
            await conn.execute(
                text(
                    "ALTER TABLE assessment_results "
                    "ADD COLUMN IF NOT EXISTS report_template_version VARCHAR(32)"
                )
            )
            # 旧库补任务表 + 为处理中的旧测评补任务行（processing_tasks 由 create_all 建表；
            # 补行逻辑与 migrations/005 一致）
            await conn.execute(
                text(
                    """
                    INSERT INTO processing_tasks
                        (id, assessment_id, scene, stage, status, attempts,
                         max_attempts, lease_seconds, uncertain_remote, next_run_at)
                    SELECT gen_random_uuid(), a.id, a.scene,
                           'video_processing', 'pending', 0, :max_attempts,
                           :lease_seconds, FALSE, now()
                    FROM assessments a
                    WHERE a.status IN ('pending','video_processing','uploading',
                                       'queued','processing','report_generating')
                      AND NOT EXISTS (SELECT 1 FROM processing_tasks t WHERE t.assessment_id = a.id)
                    """
                )
                , {"max_attempts": settings.TASK_MAX_ATTEMPTS,
                   "lease_seconds": settings.TASK_LEASE_SECONDS}
            )
            # 外键约束(IF NOT EXISTS 兼容: PG 不支持 ADD CONSTRAINT IF NOT EXISTS, 用 DO 块)
            await conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint
                            WHERE conname = 'fk_assessments_customer'
                        ) THEN
                            ALTER TABLE assessments
                            ADD CONSTRAINT fk_assessments_customer
                            FOREIGN KEY (customer_id)
                            REFERENCES customers(id) ON DELETE SET NULL;
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint
                            WHERE conname = 'fk_assessments_session'
                        ) THEN
                            ALTER TABLE assessments
                            ADD CONSTRAINT fk_assessments_session
                            FOREIGN KEY (assessment_session_id)
                            REFERENCES assessment_sessions(id) ON DELETE SET NULL;
                        END IF;
                    END $$;
                    """
                )
            )
    logger.info("应用启动 | env=%s provider=%s", settings.ENV, settings.PROVIDER_MODE)
    # 持久化任务 worker：开发内嵌于 API 进程；生产改 INPROCESS_WORKER=false
    # 并以 `python -m app.worker` 独立部署（同一任务行锁保证不重复执行）。
    inprocess_worker = None
    worker_task = None
    if settings.INPROCESS_WORKER:
        from app.services.processing import ProcessingWorker

        inprocess_worker = ProcessingWorker(worker_id="inprocess")
        worker_task = asyncio.create_task(inprocess_worker.run_forever())
    yield
    if inprocess_worker is not None and worker_task is not None:
        inprocess_worker.stop()
        try:
            await asyncio.wait_for(worker_task, timeout=10)
        except asyncio.TimeoutError:
            worker_task.cancel()
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

# 社区素材优先单独映射，URL 保持不变，终端和题库数据库无需改写。
app.mount(
    "/static/assets/community",
    StaticFiles(directory=_COMMUNITY_ASSETS_DIR),
    name="community-assets",
)

# 本地前端依赖（人脸检测脚本、模型和 WASM），避免终端依赖境外 CDN。
app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


@app.middleware("http")
async def redirect_static_assets_to_cdn(request: Request, call_next):
    """保留已有静态 URL，将媒体请求转到资源 CDN；未配置时继续本地服务。"""
    cdn_base = settings.static_asset_base_url
    path = request.url.path
    if cdn_base and request.method in {"GET", "HEAD"}:
        if path.startswith("/static/assets/community/"):
            object_path = "static-assets/community/" + path.removeprefix(
                "/static/assets/community/"
            )
        elif path.startswith("/static/assets/"):
            object_path = "static-assets/assets/" + path.removeprefix(
                "/static/assets/"
            )
        else:
            object_path = ""
        if object_path and Path(path).suffix.lower() in _CDN_MEDIA_SUFFIXES:
            target = f"{cdn_base}/{object_path}"
            if request.url.query:
                target = f"{target}?{request.url.query}"
            return RedirectResponse(
                target,
                status_code=307,
                headers={"Cache-Control": "public, max-age=300"},
            )
    return await call_next(request)


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
app.include_router(session_config.router)
app.include_router(community.router)
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
    reports.router,
    prefix=f"{settings.API_V1_PREFIX}/reports",
    tags=["reports"],
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
        f"<a href='/community/'>📄 社区报告</a> | "
        f"<a href='/docs'>API</a></p>"
    )


@app.get("/admin", include_in_schema=False)
async def admin_page():
    """正式管理后台入口。"""
    return _serve_spa("admin", "", "管理后台")


@app.get("/admin/{path:path}", include_in_schema=False)
async def admin_spa_page(path: str = ""):
    return _serve_spa("admin", path, "管理后台")


@app.get("/login", include_in_schema=False)
async def login_page():
    """正式测评入口。"""
    return _serve_spa("terminal", "", "测评端")


@app.get("/login/{path:path}", include_in_schema=False)
async def login_spa_page(path: str = ""):
    return _serve_spa("terminal", path, "测评端")


@app.get("/community", include_in_schema=False)
async def community_page():
    """社区用户报告 H5，独立于航空管理后台。"""
    return _serve_spa("community", "", "社区报告")


@app.get("/community/{path:path}", include_in_schema=False)
async def community_spa_page(path: str = ""):
    return _serve_spa("community", path, "社区报告")
