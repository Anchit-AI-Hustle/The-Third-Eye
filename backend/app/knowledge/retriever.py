"""
RAG retriever — cosine similarity top-k=10, re-ranked by recency + relevance, returns top-5.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.knowledge.embedder import embed_query

log = structlog.get_logger()

TOP_K_SEARCH = 10
TOP_K_RETURN = 5

RECENCY_WEIGHT = 0.2
RELEVANCE_WEIGHT = 0.8
RECENCY_HALF_LIFE_DAYS = 30


async def retrieve_chunks(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    query: str,
    top_k: int = TOP_K_RETURN,
    document_ids: Optional[list[uuid.UUID]] = None,
) -> list[dict]:
    """
    Retrieves the most relevant chunks for a query.
    Returns: [{document_id, document_title, chunk_index, content, score}, ...]
    """
    query_vec = await embed_query(query)
    if not query_vec:
        log.warning("retriever_no_query_embedding")
        return []

    doc_filter_sql = ""
    params: dict = {
        "vec": str(query_vec),
        "uid": str(user_id),
        "k": TOP_K_SEARCH,
    }
    if document_ids:
        doc_filter_sql = "AND dc.document_id = ANY(CAST(:doc_ids AS uuid[]))"
        params["doc_ids"] = [str(d) for d in document_ids]

    sql = f"""
        SELECT
            dc.id,
            dc.document_id,
            dc.chunk_index,
            dc.content,
            dc.created_at,
            d.title AS document_title,
            1 - (dc.embedding <=> CAST(:vec AS vector)) AS similarity
        FROM document_chunks dc
        JOIN documents d ON d.id = dc.document_id
        WHERE dc.user_id = :uid
          AND dc.embedding IS NOT NULL
          {doc_filter_sql}
        ORDER BY dc.embedding <=> CAST(:vec AS vector)
        LIMIT :k
    """

    result = await db.execute(text(sql), params)
    rows = result.fetchall()

    now = datetime.now(timezone.utc)
    ranked = []
    for row in rows:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age_days = (now - created).total_seconds() / 86400
        recency_score = 0.5 ** (age_days / RECENCY_HALF_LIFE_DAYS)

        final_score = (
            RELEVANCE_WEIGHT * float(row.similarity)
            + RECENCY_WEIGHT * recency_score
        )
        ranked.append({
            "document_id": row.document_id,
            "document_title": row.document_title,
            "chunk_index": row.chunk_index,
            "content": row.content,
            "score": final_score,
        })

    ranked.sort(key=lambda r: r["score"], reverse=True)
    return ranked[:top_k]


def format_chunks_for_context(results: list[dict]) -> str:
    """Format retrieved chunks as a citation-aware context block."""
    if not results:
        return ""

    lines = ["<documents>", "Relevant passages from your knowledge base:"]
    for i, r in enumerate(results, 1):
        lines.append(f"\n[{i}] {r['document_title']} (chunk {r['chunk_index']}, score={r['score']:.2f})")
        lines.append(r["content"])
    lines.append("</documents>")
    return "\n".join(lines)
