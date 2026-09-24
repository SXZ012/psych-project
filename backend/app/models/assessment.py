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
    # 终端幂等令牌：同一次测评的提交/重试复用同一 token，按此去重防止重复建记录
    client_token: Mapped[str | None] = mapped_column(
        String(64), unique=True, index=True, nullable=True
    )
    subject_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    # —— 一体化产品可追溯字段（同一 assessment_id 贯通采集→结果→报告→复核）——
    # 知情同意版本（提交时随表单上报；旧数据为 NULL）
    consent_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 采集协议版本（strict-continuous-v2 等；旧数据回填 'legacy'）
    capture_protocol_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 题目调度协议版本（aviation-self-paced-v1 等）
    question_protocol_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 题库内容版本（content.json 的 content_version）
    content_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 报告快照状态：none 未生成 / generating / ready / failed（与 status 的任务态解耦）
    report_status: Mapped[str] = mapped_column(String(16), default="none", nullable=False)
    # 报告查询凭证：只存安全摘要（SHA-256 + 服务端 pepper），明文仅在创建时返回一次
    report_access_token_hash: Mapped[str | None] = mapped_column(
        String(128), index=True, nullable=True
    )
    report_access_token_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    report_access_token_revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 后台处理尝试次数与最后错误（任务表 processing_tasks 为执行事实，这里为审计冗余）
    processing_attempts: Mapped[int] = mapped_column(default=0, nullable=False)
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

    # —— 双场景字段(全部可空,航空模式不填) ——
    scene: Mapped[str] = mapped_column(
        String(20), default="aviation", nullable=False, index=True
    )  # aviation | community
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )  # 社区微信用户(航空为空)
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("payment_orders.id", ondelete="SET NULL"), nullable=True
    )  # 社区支付订单(航空为空)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # 使用的终端设备
    report_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # admin | customer_pdf
    report_pdf_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # PDF 在 OSS 的 key
    report_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )  # PDF 推送时间
    assessment_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("assessment_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )  # 关联测评会话,防止终端/订单/测评串单

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    @property
    def basic_info(self) -> dict | None:
        """终端登录页四项基础信息中的性别/年龄（存于 selections_data.basic_info）。

        仅展示用途；旧记录无此数据时返回 None，不影响历史报告。
        """
        data = self.selections_data
        info = data.get("basic_info") if isinstance(data, dict) else None
        return info if isinstance(info, dict) else None

    @property
    def capture_quality(self) -> dict | None:
        """终端记录的有效采集时长与人脸偏离暂停次数（仅管理端质量审计）。"""
        data = self.selections_data
        quality = data.get("capture_quality") if isinstance(data, dict) else None
        return quality if isinstance(quality, dict) else None
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
    # 报告模板版本（生成报告快照时的模板标识，用于历史报告解读口径追溯）
    report_template_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
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


class ProcessingTask(Base):
    """持久化后台处理任务（替代"仅请求内 BackgroundTasks"的演示机制）。

    - 测评与任务在同一事务创建；服务重启后 pending/running 任务可被重新领取；
    - 领取使用 SELECT ... FOR UPDATE SKIP LOCKED：同一任务并发只有一个 worker 成功；
    - attempts/max_attempts/next_run_at 实现最大重试与退避；超限进入 dead 终态；
    - 合作方幂等说明：V3 无服务端幂等键，靠"已持久化的 v3_task_id 续查"
      避免重复创建；上传中断等"远端是否创建成功不确定"的场景标记
      uncertain_remote，由人工/管理端决定续查或作废。
    """

    __tablename__ = "processing_tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    scene: Mapped[str] = mapped_column(String(20), default="aviation", nullable=False)
    # 当前所处阶段：video_processing → uploading → processing → report_generating
    stage: Mapped[str] = mapped_column(String(32), default="video_processing", nullable=False)
    # pending 待领取 / running 执行中 / done 成功 / failed 可重试失败 / dead 超过最大重试
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(default=3, nullable=False)
    # 退避：下次可领取时间；到期前不被 worker 认领
    next_run_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    # 领取租约：worker 标识 + 租期；崩溃后租期过期的 running 任务可被重新领取
    locked_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 租约时长（秒）；超过视为 worker 已死，任务可被其他 worker 重新领取
    lease_seconds: Mapped[int] = mapped_column(default=600, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 远端任务状态不确定（上传后未拿到确认）：需续查而非盲目重试，避免重复计费
    uncertain_remote: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )
