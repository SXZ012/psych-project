import asyncio
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.services.pdf.report as pdf
from app.core.config import settings
from app.models.assessment import Assessment, AssessmentResult


async def main():
    out = Path(__file__).resolve().parents[2] / "outputs/report-center-qa"
    engine = create_async_engine(
        settings.sqlalchemy_database_url.rsplit("/", 1)[0] + "/psych_report_qa"
    )
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        aid = UUID((out / "latest-assessment-id.txt").read_text().strip())
        a = await db.get(Assessment, aid)
        result = (
            await db.execute(select(AssessmentResult).where(AssessmentResult.assessment_id == aid))
        ).scalar_one()
        pdf._OUTPUT_DIR = out
        path, error = pdf.generate_pdf_sync(result, a)
        assert path, error
        a.report_pdf_key = str(path)
        await db.commit()
        (out / "community-report-demo.pdf").write_bytes(path.read_bytes())
        print("PDF generated:", path.name)
    await engine.dispose()


asyncio.run(main())
