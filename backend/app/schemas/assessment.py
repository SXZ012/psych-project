"""测评 API 的 Pydantic 请求/响应模型。"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AssessmentCreate(BaseModel):
    subject_id: str | None = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=64, description="姓名（必填）")
    id_card: str = Field(pattern=r"^\d{17}[\dXx]$", description="身份证号（必填，18 位）")
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
    name: str | None = None
    id_card: str | None = None
    status: str
    provider_mode: str
    created_at: datetime
    completed_at: datetime | None = None
    error_message: str | None = None
    review_status: str = "pending"  # 后台处理状态
    admin_note: str | None = None  # 管理员内部备注


class AssessmentDetail(AssessmentOut):
    result: AssessmentResultOut | None = None
