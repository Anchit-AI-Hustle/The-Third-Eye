import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    avatar_url: Mapped[Optional[str]] = mapped_column(Text)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # OAuth providers
    google_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    microsoft_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True)

    # MFA
    totp_secret: Mapped[Optional[str]] = mapped_column(String(255))
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Token budget
    monthly_token_budget: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tokens_used_this_month: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Permission level (1-4)
    max_permission_level: Mapped[int] = mapped_column(Integer, default=2, nullable=False)

    # Privacy mode
    privacy_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    sessions: Mapped[list["UserSession"]] = relationship(
        "UserSession", back_populates="user", cascade="all, delete-orphan"
    )


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    refresh_token_hash: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(Text)

    user: Mapped[User] = relationship("User", back_populates="sessions")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    agent_name: Mapped[Optional[str]] = mapped_column(String(100))
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    permission_level_used: Mapped[int] = mapped_column(Integer, nullable=False)
    resource_type: Mapped[Optional[str]] = mapped_column(String(100))
    resource_id: Mapped[Optional[str]] = mapped_column(String(255))
    input_hash: Mapped[Optional[str]] = mapped_column(String(64))
    output_hash: Mapped[Optional[str]] = mapped_column(String(64))
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    metadata: Mapped[Optional[str]] = mapped_column(Text)
    # AuditLog is append-only; no update is ever issued on this table
