import asyncio
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.assessment import Assessment, AssessmentResult, AssessmentStatus
from app.services.pdf.report import generate_pdf_sync


async def main():
    if settings.ENV == "prod":
        raise RuntimeError("Demo records are not allowed in production")
    out = Path(__file__).resolve().parents[2] / "outputs/report-center-qa"
    aid = UUID((out / "latest-assessment-id.txt").read_text().strip())
    source = create_async_engine(
        settings.sqlalchemy_database_url.rsplit("/", 1)[0] + "/psych_report_qa"
    )
    target = create_async_engine(settings.sqlalchemy_database_url)
    async with async_sessionmaker(source)() as db:
        qa = await db.get(Assessment, aid)
        result = (
            await db.execute(select(AssessmentResult).where(AssessmentResult.assessment_id == aid))
        ).scalar_one()
        summary = result.summary_json
        submitted = qa.submitted_at
    async with async_sessionmaker(target, expire_on_commit=False)() as db:
        a = await db.get(Assessment, aid)
        if a and a.name != "报告闭环演示（模拟数据）":
            raise RuntimeError("Existing non-demo record; refusing to modify")
        if not a:
            a = Assessment(
                id=aid,
                name="报告闭环演示（模拟数据）",
                scene="community",
                status=AssessmentStatus.completed,
                provider_mode="mock",
                result_valid=True,
                duration_seconds=60,
                submitted_at=submitted,
                report_type="customer_pdf",
                report_status="ready",
            )
            db.add(a)
            await db.flush()
            db.add(
                AssessmentResult(
                    assessment_id=aid,
                    summary_json=summary,
                    algorithm_version="demo-report-center",
                    overall_score=64.61,
                    overall_level_label="偏高",
                )
            )
        # Published demos must survive cleanup of QA screenshots and temporary PDFs.
        published_result = (
            await db.execute(select(AssessmentResult).where(AssessmentResult.assessment_id == aid))
        ).scalar_one()
        pdf_path, error = await asyncio.to_thread(generate_pdf_sync, published_result, a)
        if pdf_path is None:
            raise RuntimeError(error or "Demo PDF generation failed")
        a.report_pdf_key = str(pdf_path)
        await db.commit()
        print("Demo report available:", aid.hex[:8].upper())
    await source.dispose()
    await target.dispose()


asyncio.run(main())
