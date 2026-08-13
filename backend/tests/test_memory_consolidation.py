"""
Tests for memory consolidation job:
- Episodic >7 days consolidated into semantic facts
- Episodic >90 days pruned
- Consolidation report written to audit_log
"""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuditLog, User
from app.memory.consolidation import (
    CONSOLIDATION_THRESHOLD_DAYS,
    MIN_GROUP_SIZE,
    PRUNE_AFTER_DAYS,
    consolidate_for_user,
)
from app.memory.models import (
    EpisodicMemory,
    MemoryConsolidationLog,
    SemanticMemory,
)
from app.router.model_router import RouterLogEntry


@pytest.fixture
async def test_user_for_consolidation(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"consol-{uuid.uuid4()}@test.local",
        name="Consolidation User",
        is_active=True,
        is_verified=True,
        max_permission_level=2,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _make_episodic(
    user_id: uuid.UUID, role: str, content: str, *, days_ago: int, session_id: str = "s1"
) -> EpisodicMemory:
    return EpisodicMemory(
        id=uuid.uuid4(),
        user_id=user_id,
        session_id=session_id,
        role=role,
        content=content,
        importance_score=1.0,
        accessed_count=0,
        consolidated=False,
        created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
        updated_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
    )


@pytest.mark.asyncio
async def test_consolidation_summarizes_old_session_into_semantic_facts(
    db: AsyncSession, test_user_for_consolidation: User
):
    user = test_user_for_consolidation

    # 5 old (>7d) episodic memories in one session
    for i in range(5):
        msg = _make_episodic(
            user.id,
            "user" if i % 2 == 0 else "assistant",
            f"Message {i}: I love hiking on weekends.",
            days_ago=14,
            session_id="trip-session",
        )
        db.add(msg)
    await db.commit()

    fake_log = RouterLogEntry(
        task_type="document_summarization",
        model_used="gemini-1.5-flash",
        provider="google",
        prompt_tokens=50,
        completion_tokens=20,
        latency_ms=100,
        estimated_cost_usd=0.001,
        attempts=1,
    )
    fake_response = (
        "The user enjoys hiking on weekends.\n"
        "The user discusses outdoor activities frequently."
    )

    with patch(
        "app.router.model_router.model_router.complete",
        new_callable=AsyncMock,
        return_value=(fake_response, fake_log),
    ):
        stats = await consolidate_for_user(db, user_id=user.id)

    await db.commit()

    assert stats.episodic_processed == 5
    assert stats.semantic_created == 2

    # Verify semantic facts created
    result = await db.execute(
        select(SemanticMemory).where(SemanticMemory.user_id == user.id)
    )
    facts = result.scalars().all()
    assert len(facts) == 2
    assert all(f.source and f.source.startswith("consolidation:") for f in facts)
    assert any("hiking" in f.content.lower() for f in facts)


@pytest.mark.asyncio
async def test_consolidation_skips_small_groups(
    db: AsyncSession, test_user_for_consolidation: User
):
    """A session with fewer than MIN_GROUP_SIZE interactions should not be summarized."""
    user = test_user_for_consolidation

    # Only 2 old memories (below MIN_GROUP_SIZE=3)
    for i in range(MIN_GROUP_SIZE - 1):
        msg = _make_episodic(
            user.id, "user", f"Quick note {i}", days_ago=10, session_id="tiny-session"
        )
        db.add(msg)
    await db.commit()

    with patch(
        "app.router.model_router.model_router.complete",
        new_callable=AsyncMock,
    ) as mock_complete:
        stats = await consolidate_for_user(db, user_id=user.id)
        await db.commit()

    # LLM should not have been called
    mock_complete.assert_not_called()
    assert stats.semantic_created == 0
    # But records are still marked as consolidated
    assert stats.episodic_processed == MIN_GROUP_SIZE - 1


@pytest.mark.asyncio
async def test_consolidation_prunes_expired_episodic(
    db: AsyncSession, test_user_for_consolidation: User
):
    user = test_user_for_consolidation

    # Add 3 very old memories (>90 days) — should be pruned
    for i in range(3):
        db.add(
            _make_episodic(
                user.id, "user", f"Ancient message {i}", days_ago=PRUNE_AFTER_DAYS + 10
            )
        )

    # Add 2 medium-old memories (>7d, <90d) — should be summarized & consolidated
    for i in range(2):
        db.add(
            _make_episodic(user.id, "user", f"Mid-age message {i}", days_ago=30, session_id="recent")
        )

    # Add 2 recent memories (<7d) — should be untouched
    for i in range(2):
        db.add(_make_episodic(user.id, "user", f"Fresh message {i}", days_ago=1, session_id="recent"))

    await db.commit()

    fake_log = RouterLogEntry(
        task_type="document_summarization",
        model_used="gemini-1.5-flash",
        provider="google",
        prompt_tokens=10,
        completion_tokens=5,
        latency_ms=50,
        estimated_cost_usd=0.0,
        attempts=1,
    )

    with patch(
        "app.router.model_router.model_router.complete",
        new_callable=AsyncMock,
        return_value=("The user sent some messages.", fake_log),
    ):
        stats = await consolidate_for_user(db, user_id=user.id)
        await db.commit()

    # Pruned the 3 ancient
    assert stats.episodic_pruned == 3

    # Verify remaining count: 2 recent + (2 medium that got consolidated but kept until 90d cutoff)
    result = await db.execute(
        select(EpisodicMemory).where(EpisodicMemory.user_id == user.id)
    )
    remaining = result.scalars().all()
    assert len(remaining) == 4  # 2 fresh + 2 medium-aged (consolidated but within retention)


@pytest.mark.asyncio
async def test_consolidation_writes_audit_and_log_records(
    db: AsyncSession, test_user_for_consolidation: User
):
    user = test_user_for_consolidation

    for i in range(4):
        db.add(_make_episodic(user.id, "user", f"Message {i}", days_ago=10))
    await db.commit()

    fake_log = RouterLogEntry(
        task_type="document_summarization",
        model_used="gemini-1.5-flash",
        provider="google",
        prompt_tokens=10,
        completion_tokens=5,
        latency_ms=50,
        estimated_cost_usd=0.0,
        attempts=1,
    )

    with patch(
        "app.router.model_router.model_router.complete",
        new_callable=AsyncMock,
        return_value=("Fact one extracted.", fake_log),
    ):
        await consolidate_for_user(db, user_id=user.id)
        await db.commit()

    # Verify MemoryConsolidationLog entry
    result = await db.execute(
        select(MemoryConsolidationLog).where(MemoryConsolidationLog.user_id == user.id)
    )
    log_entries = result.scalars().all()
    assert len(log_entries) == 1
    assert log_entries[0].episodic_processed == 4

    # Verify audit_log entry
    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.user_id == user.id,
            AuditLog.action_type == "memory_consolidation",
        )
    )
    audit_entries = audit_result.scalars().all()
    assert len(audit_entries) == 1
    assert audit_entries[0].agent_name == "consolidation_job"


@pytest.mark.asyncio
async def test_consolidation_does_not_reprocess_consolidated_memories(
    db: AsyncSession, test_user_for_consolidation: User
):
    user = test_user_for_consolidation

    # Already-consolidated old memory
    already = _make_episodic(user.id, "user", "Old already-done", days_ago=20)
    already.consolidated = True
    db.add(already)
    await db.commit()

    stats = await consolidate_for_user(db, user_id=user.id)
    await db.commit()

    # Should not count the already-consolidated record as processed
    assert stats.episodic_processed == 0
    assert stats.semantic_created == 0


# ─── run_consolidation, scheduling, and LLM failure paths ────────────────────


@pytest.mark.asyncio
async def test_run_consolidation_processes_every_user_with_work(monkeypatch, test_engine):
    from contextlib import asynccontextmanager

    from sqlalchemy.ext.asyncio import async_sessionmaker

    import app.memory.consolidation as consolidation

    maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    @asynccontextmanager
    async def session():
        async with maker() as s:
            yield s

    monkeypatch.setattr(consolidation, "AsyncSessionLocal", session)

    users = [uuid.uuid4(), uuid.uuid4()]

    async def fake_find(db):
        return users

    async def fake_consolidate(db, *, user_id):
        return consolidation.ConsolidationStats(user_id=user_id)

    monkeypatch.setattr(consolidation, "_find_users_with_consolidation_work", fake_find)
    monkeypatch.setattr(consolidation, "consolidate_for_user", fake_consolidate)

    stats = await consolidation.run_consolidation()
    assert [s.user_id for s in stats] == users


@pytest.mark.asyncio
async def test_run_consolidation_is_a_no_op_when_nothing_is_due(monkeypatch, test_engine):
    from contextlib import asynccontextmanager

    from sqlalchemy.ext.asyncio import async_sessionmaker

    import app.memory.consolidation as consolidation

    maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    @asynccontextmanager
    async def session():
        async with maker() as s:
            yield s

    monkeypatch.setattr(consolidation, "AsyncSessionLocal", session)

    async def none(db):
        return []

    monkeypatch.setattr(consolidation, "_find_users_with_consolidation_work", none)
    assert await consolidation.run_consolidation() == []


@pytest.mark.asyncio
async def test_find_users_with_consolidation_work_selects_only_stale_unconsolidated(
    db: AsyncSession, test_user_for_consolidation: User
):
    import app.memory.consolidation as consolidation
    from app.memory.models import EpisodicMemory

    user_id = test_user_for_consolidation.id
    old = datetime.now(timezone.utc) - timedelta(days=CONSOLIDATION_THRESHOLD_DAYS + 5)

    db.add(EpisodicMemory(user_id=user_id, role="user", content="stale", created_at=old))
    db.add(
        EpisodicMemory(
            user_id=user_id, role="user", content="already done",
            created_at=old, consolidated=True,
        )
    )
    db.add(EpisodicMemory(user_id=user_id, role="user", content="fresh"))
    await db.flush()

    found = await consolidation._find_users_with_consolidation_work(db)
    assert found == [user_id]


@pytest.mark.asyncio
async def test_summarize_returns_nothing_when_the_model_fails(monkeypatch):
    import app.memory.consolidation as consolidation

    async def boom(**kwargs):
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(consolidation.model_router, "complete", boom)

    from app.memory.models import EpisodicMemory

    facts = await consolidation._summarize_session(
        user_id=uuid.uuid4(),
        memories=[EpisodicMemory(user_id=uuid.uuid4(), role="user", content="hello")],
    )
    assert facts == []


@pytest.mark.asyncio
async def test_summarize_filters_and_caps_the_facts_it_keeps(monkeypatch):
    import app.memory.consolidation as consolidation

    lines = ["- short", "- " + "x" * 600] + [f"- Fact number {i} about the user." for i in range(30)]

    async def fake_complete(**kwargs):
        return "\n".join(lines), None

    monkeypatch.setattr(consolidation.model_router, "complete", fake_complete)

    from app.memory.models import EpisodicMemory

    facts = await consolidation._summarize_session(
        user_id=uuid.uuid4(),
        memories=[EpisodicMemory(user_id=uuid.uuid4(), role="user", content="hello")],
    )
    # The 20-line safety cap is applied before the length filter, so the two
    # unusable lines consume cap slots and 18 facts survive rather than 20.
    assert len(facts) == 18
    assert all(10 <= len(f.content) <= 500 for f in facts)
    assert all(f.source.startswith("consolidation:") for f in facts)


def test_schedule_consolidation_job_registers_a_nightly_cron():
    from app.memory.consolidation import run_consolidation, schedule_consolidation_job

    captured = {}

    class FakeScheduler:
        def add_job(self, func, **kwargs):
            captured["func"] = func
            captured.update(kwargs)

    schedule_consolidation_job(FakeScheduler())

    assert captured["func"] is run_consolidation
    assert captured["trigger"] == "cron"
    assert (captured["hour"], captured["minute"]) == (3, 0)
    assert captured["id"] == "memory_consolidation"
    assert captured["replace_existing"] is True
