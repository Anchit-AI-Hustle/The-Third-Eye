"""
Nightly memory consolidation job.

Steps:
  1. Find episodic memories older than 7 days that haven't been consolidated
  2. Group by user and session, summarize via LLM into semantic facts
  3. Prune episodic memories whose expires_at has passed
  4. Write a consolidation_report entry to audit_log
"""

import hashlib
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import append_audit_log
from app.database import AsyncSessionLocal
from app.memory.models import (
    EpisodicMemory,
    MemoryConsolidationLog,
    SemanticMemory,
)
from app.router.model_router import TaskType, model_router

log = structlog.get_logger()

CONSOLIDATION_THRESHOLD_DAYS = 7
PRUNE_AFTER_DAYS = 90
MIN_GROUP_SIZE = 3  # don't summarize sessions with fewer than this many interactions


@dataclass
class ConsolidationStats:
    user_id: uuid.UUID
    episodic_processed: int = 0
    semantic_created: int = 0
    episodic_pruned: int = 0


async def run_consolidation() -> list[ConsolidationStats]:
    """Run consolidation across all users. Returns per-user stats."""
    async with AsyncSessionLocal() as db:
        users_with_old_memories = await _find_users_with_consolidation_work(db)
        all_stats: list[ConsolidationStats] = []

        for user_id in users_with_old_memories:
            stats = await consolidate_for_user(db, user_id=user_id)
            all_stats.append(stats)

        await db.commit()
        log.info("consolidation_complete", users_processed=len(all_stats))
        return all_stats


async def _find_users_with_consolidation_work(db: AsyncSession) -> list[uuid.UUID]:
    threshold = datetime.now(timezone.utc) - timedelta(days=CONSOLIDATION_THRESHOLD_DAYS)
    result = await db.execute(
        select(EpisodicMemory.user_id)
        .where(
            EpisodicMemory.consolidated == False,
            EpisodicMemory.created_at < threshold,
        )
        .distinct()
    )
    return [row[0] for row in result.all()]


async def consolidate_for_user(db: AsyncSession, *, user_id: uuid.UUID) -> ConsolidationStats:
    stats = ConsolidationStats(user_id=user_id)
    now = datetime.now(timezone.utc)

    # 1. Find unconsolidated episodic memories older than threshold
    threshold = now - timedelta(days=CONSOLIDATION_THRESHOLD_DAYS)
    result = await db.execute(
        select(EpisodicMemory)
        .where(
            EpisodicMemory.user_id == user_id,
            EpisodicMemory.consolidated == False,
            EpisodicMemory.created_at < threshold,
        )
        .order_by(EpisodicMemory.session_id, EpisodicMemory.created_at)
    )
    episodic = list(result.scalars().all())
    stats.episodic_processed = len(episodic)

    # 2. Group by session, summarize each group >= MIN_GROUP_SIZE
    by_session: dict[str | None, list[EpisodicMemory]] = defaultdict(list)
    for m in episodic:
        by_session[m.session_id].append(m)

    for session_id, memories in by_session.items():
        if len(memories) < MIN_GROUP_SIZE:
            # Mark as consolidated even if we don't summarize — they've been considered
            for m in memories:
                m.consolidated = True
            continue

        semantic_facts = await _summarize_session(user_id=user_id, memories=memories)
        for fact in semantic_facts:
            db.add(fact)
            stats.semantic_created += 1

        for m in memories:
            m.consolidated = True

    # 3. Prune episodic past the retention window
    cutoff = now - timedelta(days=PRUNE_AFTER_DAYS)
    prune_result = await db.execute(
        delete(EpisodicMemory).where(
            EpisodicMemory.user_id == user_id,
            EpisodicMemory.created_at < cutoff,
        )
    )
    stats.episodic_pruned = prune_result.rowcount or 0

    # 4. Write consolidation_report entry
    db.add(
        MemoryConsolidationLog(
            user_id=user_id,
            episodic_processed=stats.episodic_processed,
            semantic_created=stats.semantic_created,
            episodic_pruned=stats.episodic_pruned,
            summary=(
                f"Processed {stats.episodic_processed} episodic, "
                f"created {stats.semantic_created} semantic facts, "
                f"pruned {stats.episodic_pruned} expired records."
            ),
        )
    )

    # Append audit_log entry
    await append_audit_log(
        db,
        user_id=user_id,
        action_type="memory_consolidation",
        permission_level_used=1,
        agent_name="consolidation_job",
        metadata=(
            f"processed={stats.episodic_processed},created={stats.semantic_created},"
            f"pruned={stats.episodic_pruned}"
        ),
    )

    await db.flush()
    return stats


async def _summarize_session(
    *, user_id: uuid.UUID, memories: list[EpisodicMemory]
) -> list[SemanticMemory]:
    """Use LLM to summarize a session's worth of interactions into discrete facts."""
    transcript = "\n".join(f"[{m.role}]: {m.content}" for m in memories)
    prompt = (
        "Extract discrete, stand-alone facts and preferences about the user from "
        "the conversation below. Each fact must be a single sentence in third "
        "person. Return one fact per line, no numbering, no commentary. "
        "If no durable facts exist, return an empty response.\n\n"
        f"Conversation:\n{transcript}"
    )

    try:
        response_text, _ = await model_router.complete(
            task_type=TaskType.DOCUMENT_SUMMARIZATION,
            messages=[
                {"role": "system", "content": "You extract durable user facts from conversations."},
                {"role": "user", "content": prompt},
            ],
            user_id=str(user_id),
        )
    except Exception as e:
        log.error("consolidation_llm_failed", error=str(e), user_id=str(user_id))
        return []

    fact_lines = [
        line.strip().lstrip("-•").strip()
        for line in response_text.split("\n")
        if line.strip()
    ]

    source_hash = hashlib.sha256(transcript.encode()).hexdigest()[:16]

    semantic_records: list[SemanticMemory] = []
    for fact in fact_lines[:20]:  # safety cap
        if len(fact) < 10 or len(fact) > 500:
            continue
        concept = fact.split(".")[0][:200]
        semantic_records.append(
            SemanticMemory(
                user_id=user_id,
                concept=concept,
                content=fact,
                source=f"consolidation:{source_hash}",
                confidence_score=0.8,
            )
        )

    return semantic_records


# ─── Scheduler integration ─────────────────────────────────────────────────────

def schedule_consolidation_job(scheduler) -> None:
    """Register the nightly consolidation job with an APScheduler instance."""
    scheduler.add_job(
        run_consolidation,
        trigger="cron",
        hour=3,
        minute=0,
        id="memory_consolidation",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    log.info("consolidation_job_scheduled", cron="0 3 * * *")
