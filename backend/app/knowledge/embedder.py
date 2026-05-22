"""
Batched embedder for document chunks.
Uses text-embedding-3-small (1536d) with batches of up to 100 chunks per API call.
"""

import asyncio
from typing import Iterable

import structlog

from app.knowledge.chunker import Chunk
from app.router.model_router import model_router

log = structlog.get_logger()

MAX_BATCH_SIZE = 100  # OpenAI embeddings API limit is 2048 but we keep it small for latency


async def embed_chunks(chunks: list[Chunk]) -> list[list[float]]:
    """Embed a list of chunks in batches; returns a list of vectors in the same order."""
    if not chunks:
        return []

    embeddings: list[list[float]] = []
    for batch in _batched([c.content for c in chunks], MAX_BATCH_SIZE):
        try:
            vecs = await model_router.embed(batch)
        except Exception as e:
            log.error("embedder_batch_failed", error=str(e), batch_size=len(batch))
            # On failure, append empty vectors so caller can detect missing
            vecs = [[] for _ in batch]
        embeddings.extend(vecs)

    if len(embeddings) != len(chunks):
        raise RuntimeError(
            f"Embedder returned {len(embeddings)} vectors for {len(chunks)} chunks"
        )
    return embeddings


async def embed_query(query: str) -> list[float]:
    vecs = await model_router.embed([query])
    return vecs[0] if vecs else []


def _batched(seq: list, size: int) -> Iterable[list]:
    for i in range(0, len(seq), size):
        yield seq[i : i + size]
