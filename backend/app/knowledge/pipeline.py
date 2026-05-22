"""
Document ingestion pipeline: parse → chunk → embed → store.
Updates document.processing_status as it progresses.
"""

import uuid
from typing import BinaryIO

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.knowledge.chunker import chunk_text
from app.knowledge.embedder import embed_chunks
from app.knowledge.ingestion import parse
from app.knowledge.models import Document, DocumentChunk

log = structlog.get_logger()


async def ingest_document(
    db: AsyncSession,
    *,
    document_id: uuid.UUID,
    file: BinaryIO,
    file_type: str,
) -> int:
    """
    Runs the full pipeline for a single document.
    Returns the number of chunks created.
    """
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one()

    try:
        doc.processing_status = "parsing"
        await db.flush()

        text = parse(file, file_type)
        if not text.strip():
            doc.processing_status = "failed"
            await db.flush()
            log.warning("document_empty", document_id=str(document_id))
            return 0

        doc.processing_status = "chunking"
        await db.flush()

        chunks = chunk_text(text)
        if not chunks:
            doc.processing_status = "failed"
            await db.flush()
            return 0

        doc.processing_status = "embedding"
        await db.flush()

        embeddings = await embed_chunks(chunks)

        # Persist chunks
        for chunk, embedding in zip(chunks, embeddings):
            db_chunk = DocumentChunk(
                user_id=doc.user_id,
                document_id=doc.id,
                chunk_index=chunk.index,
                content=chunk.content,
                embedding=embedding if embedding else None,
            )
            db.add(db_chunk)

        doc.chunk_count = len(chunks)
        doc.processing_status = "ready"
        await db.flush()

        log.info("document_ingested", document_id=str(document_id), chunk_count=len(chunks))
        return len(chunks)

    except Exception as e:
        doc.processing_status = "failed"
        await db.flush()
        log.error("ingestion_failed", document_id=str(document_id), error=str(e))
        raise
