"""测评相关 ORM 模型。"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AssessmentStatus(str, enum.Enum):
    pending = "pending"              # 数据已提交，待处理
    video_processing = "video_processing"  # 视频转码中
    uploading = "uploading"          # 上传合作方 OSS
    queued = "queued"                # V3 任务已创建排队
    processing = "processing"        # V3 模型分析中
    report_generating = "report_generating"  # 生成报告中
    completed = "completed"          # 报告已生成
    invalid_result = "invalid_result"  # 合作方未正确识别视频时长/分析结果无效，不作正式报告
    failed = "failed"                # 处理失败


class Assessment(Base):
    """一次测评任务（采集 → V3 分析 → 报告 的生命周期）。"""

    __tablename__ = "assessments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    subject_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    name: Mapped[str | None] = mapped_column(String(64), nullable=True)  # 姓名（API 必填）
    id_card: Mapped[str | None] = mapped_column(String(18), index=True, nullable=True)  # 身份证号
    status: Mapped[AssessmentStatus] = mapped_column(
        Enum(AssessmentStatus, name="assessment_status"),
        default=AssessmentStatus.pending,
        nullable=False,
        index=True,
    )
    provider_mode: Mapped[str] = mapped_column(String(16), default="mock", nullable=False)
    v3_task_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    v3_file_id: Mapped[int | None] = mapped_column(nullable=True)
    video_filename: Mapped[str | None] = mapped_column(String(256), nullable=True)
    video_storage_key: Mapped[str | None] = mapped_column(String(256), nullable=True)
    backup_storage_key: Mapped[str | None] = mapped_column(String(256), nullable=True)
    backup_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    partner_upload_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    partner_file_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    video_status: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )  # received/qa_failed/ready/deleted/retained_local_only/...
    # 上传前 ffprobe 质检 + ffmpeg 修复报告（原始/修复后参数、处理耗时、最终文件）
    video_qa_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # V3 返回结果是否可作为正式可解释报告（时长 0/异常时为 False）
    result_valid: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    selections_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # 答题+反应时
    duration_seconds: Mapped[int | None] = mapped_column(nullable=True)
    retry_count: Mapped[int] = mapped_column(default=0, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    processing_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    report_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # —— 后台管理字段（仅管理员可见/操作，不进入用户报告）——
    review_status: Mapped[str] = mapped_column(
        String(16), default="pending", nullable=False, index=True
    )  # pending 待查看 / following 跟进中 / closed 已结案
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)  # 内部回访备注
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    result: Mapped["AssessmentResult | None"] = relationship(
        back_populates="assessment", uselist=False, cascade="all, delete-orphan"
    )


class AssessmentResult(Base):
    """V3 结构化分析结果（一对一关联测评）。"""

    __tablename__ = "assessment_results"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    algorithm_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    overall_score: Mapped[float | None] = mapped_column(nullable=True)
    overall_level_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    depression_classification: Mapped[str | None] = mapped_column(String(64), nullable=True)
    depression_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    depression_score: Mapped[float | None] = mapped_column(nullable=True)
    anxiety_classification: Mapped[str | None] = mapped_column(String(64), nullable=True)
    anxiety_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    anxiety_score: Mapped[float | None] = mapped_column(nullable=True)
    summary_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # V3 summary 全量
    timeline_url: Mapped[str | None] = mapped_column(Text, nullable=True)  # real: 转存后的 OSS URL
    timeline_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # mock: 内联 timeline
    qwen_report: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # 预留，不参与当前1.0报告生成
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    assessment: Mapped["Assessment"] = relationship(back_populates="result")
