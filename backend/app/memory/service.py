"""
Memory retrieval pipeline:
  Query → embed → cosine similarity search (top-k=10)
        → re-rank by recency + relevance → inject top-5 into context
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.memory.models import EpisodicMemory, SemanticMemory
from app.router.model_router import model_router

log = structlog.get_logger()

TOP_K_SEARCH = 10
TOP_K_CONTEXT = 5


async def store_episodic(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    role: str,
    content: str,
    session_id: str | None = None,
    retention_days: int = 90,
) -> EpisodicMemory:
    expires_at = datetime.now(timezone.utc) + timedelta(days=retention_days)
    entry = EpisodicMemory(
        user_id=user_id,
        session_id=session_id,
        role=role,
        content=content,
        expires_at=expires_at,
    )
    db.add(entry)
    await db.flush()

    # Embed asynchronously in background — embedding is best-effort
    try:
        embeddings = await model_router.embed([content])
        entry.embedding = embeddings[0]
    except Exception as e:
        log.warning("embedding_failed", error=str(e))

    return entry


async def retrieve_relevant_memories(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    query: str,
    top_k: int = TOP_K_CONTEXT,
) -> list[dict]:
    """
    Retrieves the top-k most relevant episodic + semantic memories for a query.
    Falls back to recency-based retrieval if embeddings are unavailable.
    """
    try:
        query_embedding = await model_router.embed([query])
        embedding_vec = query_embedding[0]
    except Exception as e:
        log.warning("query_embedding_failed", error=str(e))
        return await _fallback_recency_retrieval(db, user_id=user_id, top_k=top_k)

    # pgvector cosine similarity search
    result = await db.execute(
        text("""
            SELECT id, content, role, created_at, importance_score,
                   1 - (embedding <=> CAST(:vec AS vector)) AS similarity
            FROM episodic_memory
            WHERE user_id = :uid
              AND embedding IS NOT NULL
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY embedding <=> CAST(:vec AS vector)
            LIMIT :k
        """),
        {"vec": str(embedding_vec), "uid": str(user_id), "k": TOP_K_SEARCH},
    )
    rows = result.fetchall()

    # Re-rank: score = similarity * 0.6 + recency_weight * 0.4
    now = datetime.now(timezone.utc)
    scored = []
    for row in rows:
        age_hours = (now - row.created_at.replace(tzinfo=timezone.utc)).total_seconds() / 3600
        recency_weight = max(0.0, 1.0 - age_hours / (24 * 7))  # decay over 7 days
        final_score = row.similarity * 0.6 + recency_weight * 0.4
        scored.append({"content": row.content, "role": row.role, "score": final_score})

    scored.sort(key=lambda x: x["score"], reverse=True)

    # Update access counts
    ids = [str(row.id) for row in rows]
    if ids:
        await db.execute(
            update(EpisodicMemory)
            .where(EpisodicMemory.id.in_(ids))
            .values(accessed_count=EpisodicMemory.accessed_count + 1)
        )

    return scored[:top_k]


async def _fallback_recency_retrieval(
    db: AsyncSession, *, user_id: uuid.UUID, top_k: int
) -> list[dict]:
    """Returns most recent episodic memories when embeddings are unavailable."""
    result = await db.execute(
        select(EpisodicMemory)
        .where(EpisodicMemory.user_id == user_id)
        .order_by(EpisodicMemory.created_at.desc())
        .limit(top_k)
    )
    memories = result.scalars().all()
    return [{"content": m.content, "role": m.role, "score": 0.5} for m in memories]


def format_memory_context(memories: list[dict]) -> str:
    """Formats retrieved memories as a context block for injection into prompts."""
    if not memories:
        return ""
    lines = ["<memory>", "Relevant context from previous interactions:"]
    for m in memories:
        lines.append(f"[{m['role']}]: {m['content']}")
    lines.append("</memory>")
    return "\n".join(lines)
