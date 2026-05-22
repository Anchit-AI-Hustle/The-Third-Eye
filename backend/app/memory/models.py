"""
Memory system: four stores — episodic, semantic, preference, project.
All backed by PostgreSQL + pgvector.
"""

import uuid
from datetime import datetime
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

EMBEDDING_DIM = 1536  # text-embedding-3-small output dimension


class EpisodicMemory(Base):
    __tablename__ = "episodic_memory"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user | assistant | system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(EMBEDDING_DIM))
    importance_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    accessed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    consolidated: Mapped[bool] = mapped_column(default=False, nullable=False)


class SemanticMemory(Base):
    __tablename__ = "semantic_memory"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    concept: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[Optional[str]] = mapped_column(String(100))  # conversation | document | user
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(EMBEDDING_DIM))
    confidence_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    access_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_accessed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class PreferenceMemory(Base):
    __tablename__ = "preference_memory"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "communication_style"
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    inferred: Mapped[bool] = mapped_column(default=True, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.8, nullable=False)


class ProjectMemory(Base):
    __tablename__ = "project_memory"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    memory_type: Mapped[str] = mapped_column(String(50), nullable=False)  # goal | milestone | context
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(EMBEDDING_DIM))


class MemoryConsolidationLog(Base):
    __tablename__ = "memory_consolidation_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    episodic_processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    semantic_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    episodic_pruned: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text)
