"""Business content lives in PostgreSQL; file bytes live in object storage."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StoredAsset(Base):
    __tablename__ = "stored_assets"

    object_key: Mapped[str] = mapped_column(String(512), primary_key=True)
    bucket: Mapped[str] = mapped_column(String(128), nullable=False)
    category: Mapped[str] = mapped_column(String(32), index=True)
    visibility: Mapped[str] = mapped_column(String(16), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    assessment_id: Mapped[UUID | None] = mapped_column(index=True, nullable=True)
    source: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ContentVersion(Base):
    __tablename__ = "content_versions"
    __table_args__ = (
        Index("ix_content_versions_active", "name", unique=True, postgresql_where=text("active")),
    )

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    version: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
