"""社区场景 ORM：终端设备、微信用户、测评会话、支付订单。

与航空场景的关系：共用 assessments/assessment_results/pairs 主干表，
通过 scene 字段区分，社区专用数据放这四张表。
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Device(Base):
    """终端设备注册与场景绑定。部署时由管理后台一次性注册。"""

    __tablename__ = "devices"

    device_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    scene: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    location: Mapped[str | None] = mapped_column(String(256), nullable=True)
    organization_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # 设备鉴权令牌哈希，不允许仅凭 device_id 读取配置
    token_hash: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    sessions: Mapped[list["AssessmentSession"]] = relationship(back_populates="device")


class Customer(Base):
    """社区微信用户。"""

    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    openid: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    nickname: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sessions: Mapped[list["AssessmentSession"]] = relationship(back_populates="customer")
    orders: Mapped[list["PaymentOrder"]] = relationship(back_populates="customer")


class AssessmentSession(Base):
    """测评会话：串联终端、用户、订单和测评，防止串单。"""

    __tablename__ = "assessment_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    scene: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    device_id: Mapped[str | None] = mapped_column(
        ForeignKey("devices.device_id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    product_id: Mapped[str | None] = mapped_column(String(64), nullable=True)  # 测评产品/题库版本
    # JSON；社区会话固定题组
    selected_pair_ids: Mapped[str | None] = mapped_column(Text, nullable=True)
    # created → awaiting_payment → authorized → assessing → submitted → expired
    status: Mapped[str] = mapped_column(String(32), default="created", nullable=False, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    device: Mapped[Device | None] = relationship(back_populates="sessions")
    customer: Mapped[Customer | None] = relationship(back_populates="sessions")
    orders: Mapped[list["PaymentOrder"]] = relationship(back_populates="session")


class PaymentOrder(Base):
    """社区支付订单。金额单位为分(400 = ¥4.00)。"""

    __tablename__ = "payment_orders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assessment_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("assessment_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    amount_fen: Mapped[int] = mapped_column(Integer, nullable=False)  # 400 = ¥4.00
    # created → paid → refunded / expired
    status: Mapped[str] = mapped_column(String(20), default="created", nullable=False, index=True)
    wechat_txn_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    assessment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("assessments.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    customer: Mapped[Customer] = relationship(back_populates="orders")
    session: Mapped[AssessmentSession | None] = relationship(back_populates="orders")
