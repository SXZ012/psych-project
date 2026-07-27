"""测评接口：创建（后台触发 Mock/Real 流程）、列表、查询状态与结果。"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.base import get_db
from app.models.assessment import Assessment, AssessmentStatus
from app.schemas.assessment import (
    AssessmentCreate,
    AssessmentDetail,
    AssessmentOut,
)
from app.services.assessment import run_assessment

router = APIRouter()


@router.post("", response_model=AssessmentOut, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    payload: AssessmentCreate,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Assessment:
    """创建测评，立即返回；后台异步执行 Provider 全流程并落库。"""
    assessment = Assessment(
        subject_id=payload.subject_id,
        sds_score=payload.sds_score,
        sas_score=payload.sas_score,
        status=AssessmentStatus.pending,
        provider_mode=settings.PROVIDER_MODE,
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    background_tasks.add_task(run_assessment, assessment.id)
    return assessment


@router.get("", response_model=list[AssessmentOut])
async def list_assessments(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
) -> list[Assessment]:
    stmt = select(Assessment).order_by(Assessment.created_at.desc()).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


@router.get("/{assessment_id}", response_model=AssessmentDetail)
async def get_assessment(
    assessment_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Assessment:
    stmt = (
        select(Assessment)
        .options(selectinload(Assessment.result))
        .where(Assessment.id == assessment_id)
    )
    assessment = (await db.execute(stmt)).scalar_one_or_none()
    if assessment is None:
        raise HTTPException(status_code=404, detail="assessment not found")
    return assessment
