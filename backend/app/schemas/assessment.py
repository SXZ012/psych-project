"""测评 API 的 Pydantic 请求/响应模型。"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer


def mask_id_card(value: str | None) -> str | None:
    if not value:
        return value
    if len(value) == 18:
        return f"{value[:3]}{'*' * 11}{value[-4:]}"
    return "*" * len(value)


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
    timeline_json: dict | None = None  # V3 五页报告的曲线、候选帧与分段证据层
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
    video_status: str | None = None
    backup_status: str | None = None
    partner_upload_status: str | None = None
    duration_seconds: int | None = None
    retry_count: int = 0
    error_code: str | None = None
    error_message: str | None = None
    result_valid: bool | None = None  # V3 结果是否可作为正式可解释报告
    submitted_at: datetime | None = None
    processing_started_at: datetime | None = None
    report_generated_at: datetime | None = None
    review_status: str = "pending"  # 后台处理状态
    admin_note: str | None = None  # 管理员内部备注

    @field_serializer("id_card")
    def serialize_id_card(self, value: str | None) -> str | None:
        return mask_id_card(value)


class AssessmentDetail(AssessmentOut):
    result: AssessmentResultOut | None = None
    video_qa_json: dict | None = None  # 上传前 ffprobe 质检 + ffmpeg 修复报告（审计用）
