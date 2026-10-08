"""Local-only browser QA server: isolated DB, fake camera input and demo result.
Run from backend: ../.venv/bin/python scripts/report_center_qa_server.py
Never mount these substitutions into the normal app server.
"""

import asyncio
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import uvicorn
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.api.routes.assessments as routes
import app.services.pdf.report as pdf
from app.core.config import settings
from app.db.base import Base, get_db
from app.main import app
from app.models.assessment import Assessment, AssessmentResult, AssessmentStatus
from app.models.community import Device
from app.models.image_bank import Image, Pair
from tests.test_community_pdf import REAL_SUMMARY

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "outputs/report-center-qa"
OUTPUT.mkdir(parents=True, exist_ok=True)
SOURCE_URL = settings.sqlalchemy_database_url
QA_URL = SOURCE_URL.rsplit("/", 1)[0] + "/psych_report_qa"
engine = create_async_engine(QA_URL, poolclass=NullPool)
maker = async_sessionmaker(engine, expire_on_commit=False)


async def init():
    source = create_async_engine(SOURCE_URL, isolation_level="AUTOCOMMIT", poolclass=NullPool)
    async with source.connect() as conn:
        if not (
            await conn.execute(text("SELECT 1 FROM pg_database WHERE datname='psych_report_qa'"))
        ).scalar():
            await conn.execute(text("CREATE DATABASE psych_report_qa"))
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with source.connect() as source_conn, engine.begin() as target:
        for model in (Image, Pair):
            existing = set((await target.execute(select(model.id))).scalars())
            rows = (await source_conn.execute(select(model.__table__))).mappings().all()
            for row in rows:
                if row["id"] not in existing:
                    await target.execute(model.__table__.insert().values(**dict(row)))
    async with maker() as db:
        if not (
            await db.execute(select(Device).where(Device.device_id == "report-qa-terminal"))
        ).scalar_one_or_none():
            db.add(
                Device(
                    device_id="report-qa-terminal",
                    name="报告闭环测试终端",
                    scene="community",
                    is_active=True,
                )
            )
            await db.commit()
    await source.dispose()


async def override_db():
    async with maker() as db:
        yield db


async def fake_qa(key):
    return key, {"ok": True, "bypassed": "isolated-demo-only"}


async def complete(aid):
    await asyncio.sleep(12)  # observable processing screen; the real provider remains unchanged
    async with maker() as db:
        a = await db.get(Assessment, aid)
        if not a:
            return
        a.name = "报告闭环演示（模拟数据）"
        a.status = AssessmentStatus.completed
        a.result_valid = True
        a.completed_at = datetime.now(timezone.utc)
        result = AssessmentResult(
            assessment_id=aid,
            summary_json=REAL_SUMMARY,
            algorithm_version="demo-report-center",
            overall_score=64.61,
            overall_level_label="偏高",
        )
        db.add(result)
        await db.commit()
        path, error = pdf.generate_pdf_sync(result, a)
        if not path:
            raise RuntimeError(error)
        a.report_pdf_key = str(path)
        a.report_status = "ready"
        await db.commit()
        (OUTPUT / "latest-report-id.txt").write_text(aid.hex[:8].upper())
        (OUTPUT / "latest-assessment-id.txt").write_text(str(aid))
        print("DEMO REPORT READY", aid.hex[:8].upper(), flush=True)


jobs = set()


async def enqueue(db, aid, scene):
    task = asyncio.create_task(complete(aid))
    jobs.add(task)
    task.add_done_callback(jobs.discard)


@asynccontextmanager
async def lifespan(app):
    await init()
    yield
    await engine.dispose()


settings.ASSET_CDN_BASE_URL = ""
settings.ASSET_OSS_BUCKET_NAME = ""
settings.INPROCESS_WORKER = False
settings.OSS_BACKUP_ENABLED = False
pdf._OUTPUT_DIR = OUTPUT
routes._REPO_ROOT = OUTPUT
routes._validate_uploaded_video = fake_qa
routes.enqueue_assessment_task = enqueue
app.dependency_overrides[get_db] = override_db
app.router.lifespan_context = lifespan
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="warning")
