"""测评 API 的 Pydantic 请求/响应模型。"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AssessmentCreate(BaseModel):
    subject_id: str | None = Field(default=None, max_length=64)
    sds_score: float | None = Field(default=None, ge=0, le=100)
    sas_score: float | None = Field(default=None, ge=0, le=100)


class AssessmentResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    algorithm_version: str | None = None
    overall_score: float | None = None
    overall_level_label: str | None = None
    depression_classification: str | None = None
    depression_label: str | None = None
    depression_score: float | None = None
    anxiety_classification: str | None = None
    anxiety_label: str | None = None
    anxiety_score: float | None = None
    summary_json: dict | None = None  # V3 全量 summary，供前端做可视化
    qwen_report: str | None = None


class AssessmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    subject_id: str | None = None
    status: str
    provider_mode: str
    created_at: datetime
    completed_at: datetime | None = None
    error_message: str | None = None


class AssessmentDetail(AssessmentOut):
    result: AssessmentResultOut | None = None
