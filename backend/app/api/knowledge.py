import time
from typing import Annotated, List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import get_current_user
from app.auth.models import User
from app.database import get_db
from app.knowledge.models import Document
from app.knowledge.retriever import retrieve_chunks
from app.knowledge.schemas import (
    DocumentResponse,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    SearchResult,
)

router = APIRouter()


@router.post("/knowledge/search", response_model=KnowledgeSearchResponse)
async def search_knowledge(
    request: KnowledgeSearchRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> KnowledgeSearchResponse:
    t0 = time.monotonic()
    results = await retrieve_chunks(
        db,
        user_id=current_user.id,
        query=request.query,
        top_k=request.top_k,
        document_ids=request.document_ids,
    )
    latency_ms = int((time.monotonic() - t0) * 1000)

    return KnowledgeSearchResponse(
        query=request.query,
        results=[
            SearchResult(
                document_id=r["document_id"],
                document_title=r["document_title"],
                chunk_index=r["chunk_index"],
                content=r["content"],
                score=r["score"],
            )
            for r in results
        ],
        latency_ms=latency_ms,
    )


@router.get("/knowledge/", response_model=List[DocumentResponse])
async def list_knowledge(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[DocumentResponse]:
    """Returns all ready documents the user has uploaded."""
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.id, Document.processing_status == "ready")
        .order_by(Document.created_at.desc())
    )
    return result.scalars().all()
