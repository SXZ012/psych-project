"""图题库 ORM：图片元数据 + 图题配对包。

选项(option_a/option_b)仅存展示文本，**不涉及任何分值**（按方案）。
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Image(Base):
    __tablename__ = "images"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    oss_key: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    url: Mapped[str] = mapped_column(String(512), nullable=False)  # 公共读直链
    category: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    pairs: Mapped[list["Pair"]] = relationship(
        back_populates="image", cascade="all, delete-orphan"
    )


class Pair(Base):
    """图题配对包：1 张图 + 1 题 + 2 选项（选项仅展示，不参与评分）。"""

    __tablename__ = "pairs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    image_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("images.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question: Mapped[str] = mapped_column(String(256), nullable=False)
    option_a: Mapped[str] = mapped_column(String(128), nullable=False)
    option_b: Mapped[str] = mapped_column(String(128), nullable=False)
    # 航空情境题元数据。全部保持可空，兼容既有题库和合作方继续迭代期间的草案题。
    dimension: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    scenario: Mapped[str | None] = mapped_column(String(64), nullable=True)
    audio_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    content_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_note: Mapped[str | None] = mapped_column(String(256), nullable=True)
    scoring_mode: Mapped[str] = mapped_column(
        String(32), default="observation_only", nullable=False
    )
    active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    image: Mapped["Image"] = relationship(back_populates="pairs")
