"""Phase 1 — initial schema

Revision ID: 0001_phase1
Revises:
Create Date: 2026-05-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_phase1"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMBEDDING_DIM = 1536


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ─── Core: users ─────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(255)),
        sa.Column("avatar_url", sa.Text),
        sa.Column("hashed_password", sa.String(255)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_verified", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("google_id", sa.String(255), unique=True),
        sa.Column("microsoft_id", sa.String(255), unique=True),
        sa.Column("totp_secret", sa.String(255)),
        sa.Column("totp_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("monthly_token_budget", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tokens_used_this_month", sa.Integer, nullable=False, server_default="0"),
        sa.Column("max_permission_level", sa.Integer, nullable=False, server_default="2"),
        sa.Column("privacy_mode", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # ─── Core: sessions ────────────────────────────────────────────────────────
    op.create_table(
        "user_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("refresh_token_hash", sa.String(255), unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("ip_address", sa.String(45)),
        sa.Column("user_agent", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])

    # ─── Core: audit_log (append-only) ─────────────────────────────────────────
    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("agent_name", sa.String(100)),
        sa.Column("action_type", sa.String(100), nullable=False),
        sa.Column("permission_level_used", sa.Integer, nullable=False),
        sa.Column("resource_type", sa.String(100)),
        sa.Column("resource_id", sa.String(255)),
        sa.Column("input_hash", sa.String(64)),
        sa.Column("output_hash", sa.String(64)),
        sa.Column("duration_ms", sa.Integer),
        sa.Column("metadata", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_log_user_id", "audit_log", ["user_id"])
    # Enforce append-only semantics at the DB level
    op.execute("""
        CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;
        CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
    """)

    # ─── Tasks: projects ────────────────────────────────────────────────────────
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("color", sa.String(7)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_projects_user_id", "projects", ["user_id"])

    # ─── Tasks ──────────────────────────────────────────────────────────────────
    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL")),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("status", sa.String(50), nullable=False, server_default="todo"),
        sa.Column("priority", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("due_date", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("parent_task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tasks_user_id", "tasks", ["user_id"])
    op.create_index("ix_tasks_status", "tasks", ["status"])
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"])

    # ─── Tasks: goals ────────────────────────────────────────────────────────────
    op.create_table(
        "goals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("target_date", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("progress_percent", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_goals_user_id", "goals", ["user_id"])

    # ─── Tasks: reminders ────────────────────────────────────────────────────────
    op.create_table(
        "reminders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE")),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("remind_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ─── Tasks: recurring_tasks ───────────────────────────────────────────────────
    op.create_table(
        "recurring_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("cron_expression", sa.String(100), nullable=False),
        sa.Column("last_generated_at", sa.DateTime(timezone=True)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ─── Memory: episodic ─────────────────────────────────────────────────────────
    op.create_table(
        "episodic_memory",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(255)),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", sa.Text),  # stored as vector type via raw SQL below
        sa.Column("importance_score", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("accessed_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("consolidated", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_episodic_memory_user_id", "episodic_memory", ["user_id"])
    op.create_index("ix_episodic_memory_session_id", "episodic_memory", ["session_id"])
    # Replace text column with proper vector type
    op.execute(f"ALTER TABLE episodic_memory ALTER COLUMN embedding TYPE vector({EMBEDDING_DIM}) USING NULL")
    op.execute("CREATE INDEX ix_episodic_embedding_hnsw ON episodic_memory USING hnsw (embedding vector_cosine_ops)")

    # ─── Memory: semantic ─────────────────────────────────────────────────────────
    op.create_table(
        "semantic_memory",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("concept", sa.String(500), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("source", sa.String(100)),
        sa.Column("embedding", sa.Text),
        sa.Column("confidence_score", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("access_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_semantic_memory_user_id", "semantic_memory", ["user_id"])
    op.execute(f"ALTER TABLE semantic_memory ALTER COLUMN embedding TYPE vector({EMBEDDING_DIM}) USING NULL")
    op.execute("CREATE INDEX ix_semantic_embedding_hnsw ON semantic_memory USING hnsw (embedding vector_cosine_ops)")

    # ─── Memory: preference ───────────────────────────────────────────────────────
    op.create_table(
        "preference_memory",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("inferred", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("confidence_score", sa.Float, nullable=False, server_default="0.8"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_preference_memory_user_id", "preference_memory", ["user_id"])

    # ─── Memory: project_memory ───────────────────────────────────────────────────
    op.create_table(
        "project_memory",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE")),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("memory_type", sa.String(50), nullable=False),
        sa.Column("embedding", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.execute(f"ALTER TABLE project_memory ALTER COLUMN embedding TYPE vector({EMBEDDING_DIM}) USING NULL")

    # ─── Memory: consolidation_log ────────────────────────────────────────────────
    op.create_table(
        "memory_consolidation_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("episodic_processed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("semantic_created", sa.Integer, nullable=False, server_default="0"),
        sa.Column("episodic_pruned", sa.Integer, nullable=False, server_default="0"),
        sa.Column("summary", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ─── Finance (Phase 3 — structure created now, populated in Phase 3) ─────────
    # FINANCIAL_MODULE: verify encryption and disclaimer presence
    op.create_table(
        "accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("account_type", sa.String(50), nullable=False),
        sa.Column("institution", sa.String(255)),
        sa.Column("balance_encrypted", sa.Text),  # AES-256 encrypted
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount_encrypted", sa.Text, nullable=False),  # AES-256 encrypted
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("description", sa.String(500)),
        sa.Column("category", sa.String(100)),
        sa.Column("transaction_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_recurring", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "budgets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("amount_encrypted", sa.Text, nullable=False),  # AES-256 encrypted
        sa.Column("period", sa.String(20), nullable=False, server_default="monthly"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("amount_encrypted", sa.Text, nullable=False),  # AES-256 encrypted
        sa.Column("billing_period", sa.String(20), nullable=False, server_default="monthly"),
        sa.Column("next_billing_date", sa.DateTime(timezone=True)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "financial_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("net_worth_encrypted", sa.Text),  # AES-256 encrypted
        sa.Column("total_assets_encrypted", sa.Text),
        sa.Column("total_liabilities_encrypted", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ─── Agents ──────────────────────────────────────────────────────────────────
    op.create_table(
        "agent_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_name", sa.String(100), nullable=False),
        sa.Column("task_type", sa.String(100)),
        sa.Column("input_hash", sa.String(64)),
        sa.Column("output_hash", sa.String(64)),
        sa.Column("duration_ms", sa.Integer),
        sa.Column("permission_level_used", sa.Integer, nullable=False),
        sa.Column("success", sa.Boolean, nullable=False),
        sa.Column("error", sa.Text),
        sa.Column("model_used", sa.String(100)),
        sa.Column("tokens_used", sa.Integer),
        sa.Column("cost_usd", sa.Float),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_agent_runs_user_id", "agent_runs", ["user_id"])

    op.create_table(
        "agent_delegations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_agent", sa.String(100), nullable=False),
        sa.Column("to_agent", sa.String(100), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True)),
        sa.Column("depth", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "agent_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_name", sa.String(100), nullable=False),
        sa.Column("task_type", sa.String(100), nullable=False),
        sa.Column("content", sa.Text),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ─── Automation (Phase 4 structure) ──────────────────────────────────────────
    op.create_table(
        "workflows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("n8n_workflow_id", sa.String(255)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "workflow_executions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("error", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "connectors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("connector_type", sa.String(100), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("config_encrypted", sa.Text),  # AES-256 encrypted OAuth tokens
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "webhook_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflows.id", ondelete="SET NULL")),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("payload", sa.Text),
        sa.Column("processed", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ─── Knowledge (Phase 2 structure) ────────────────────────────────────────────
    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("file_type", sa.String(20)),
        sa.Column("file_size_bytes", sa.Integer),
        sa.Column("storage_path", sa.Text),
        sa.Column("processing_status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("chunk_count", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "document_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.execute(f"ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector({EMBEDDING_DIM}) USING NULL")
    op.execute("CREATE INDEX ix_doc_chunks_embedding_hnsw ON document_chunks USING hnsw (embedding vector_cosine_ops)")


def downgrade() -> None:
    # Drop in reverse dependency order
    op.execute("DROP INDEX IF EXISTS ix_doc_chunks_embedding_hnsw")
    op.drop_table("document_chunks")
    op.drop_table("documents")
    op.drop_table("webhook_events")
    op.drop_table("connectors")
    op.drop_table("workflow_executions")
    op.drop_table("workflows")
    op.drop_table("agent_tasks")
    op.drop_table("agent_delegations")
    op.drop_table("agent_runs")
    op.drop_table("financial_snapshots")
    op.drop_table("subscriptions")
    op.drop_table("budgets")
    op.drop_table("transactions")
    op.drop_table("accounts")
    op.drop_table("memory_consolidation_log")
    op.drop_table("project_memory")
    op.drop_table("preference_memory")
    op.execute("DROP INDEX IF EXISTS ix_semantic_embedding_hnsw")
    op.drop_table("semantic_memory")
    op.execute("DROP INDEX IF EXISTS ix_episodic_embedding_hnsw")
    op.drop_table("episodic_memory")
    op.drop_table("recurring_tasks")
    op.drop_table("reminders")
    op.drop_table("goals")
    op.drop_table("tasks")
    op.drop_table("projects")
    op.execute("DROP RULE IF EXISTS audit_log_no_update ON audit_log")
    op.execute("DROP RULE IF EXISTS audit_log_no_delete ON audit_log")
    op.drop_table("audit_log")
    op.drop_table("user_sessions")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS vector")
