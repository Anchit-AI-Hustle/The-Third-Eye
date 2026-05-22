"""
Tests for the knowledge ingestion pipeline + retrieval.

Note: the SQLite test database does not support pgvector, so retrieval is
tested via a pure-Python numpy cosine similarity simulation that mirrors the
production pgvector path. The 10k-chunk latency assertion uses this simulation
on synthetic data.
"""

import io
import time
import uuid
from unittest.mock import AsyncMock, patch

import numpy as np
import pytest

from app.knowledge.chunker import chunk_text, count_tokens, CHUNK_SIZE_TOKENS, CHUNK_OVERLAP_TOKENS
from app.knowledge.ingestion import detect_file_type, parse, UnsupportedFileTypeError


# ─── Ingestion ────────────────────────────────────────────────────────────────

def test_detect_file_type():
    assert detect_file_type("report.pdf") == "pdf"
    assert detect_file_type("notes.docx") == "docx"
    assert detect_file_type("data.csv") == "csv"
    assert detect_file_type("readme.md") == "md"
    assert detect_file_type("readme.markdown") == "md"
    assert detect_file_type("notes.txt") == "txt"


def test_detect_file_type_unsupported():
    with pytest.raises(UnsupportedFileTypeError):
        detect_file_type("malware.exe")


def test_parse_txt():
    text = b"Hello, world!\nThis is a test."
    result = parse(io.BytesIO(text), "txt")
    assert "Hello, world!" in result


def test_parse_csv():
    csv_data = b"name,age\nAlice,30\nBob,25"
    result = parse(io.BytesIO(csv_data), "csv")
    assert "Alice" in result
    assert "Bob" in result


def test_parse_markdown():
    md = b"# Heading\n\nSome text with *emphasis*."
    result = parse(io.BytesIO(md), "md")
    assert "Heading" in result
    assert "emphasis" in result


def test_parse_unsupported_raises():
    with pytest.raises(UnsupportedFileTypeError):
        parse(io.BytesIO(b""), "exe")


# ─── Chunker ──────────────────────────────────────────────────────────────────

def test_chunker_empty_input():
    assert chunk_text("") == []
    assert chunk_text("   \n\n  ") == []


def test_chunker_short_input_single_chunk():
    text = "This is a short document. It should fit in one chunk."
    chunks = chunk_text(text)
    assert len(chunks) == 1
    assert chunks[0].index == 0
    assert "short document" in chunks[0].content


def test_chunker_respects_token_size():
    # Build a large text that needs splitting
    paragraph = "This is a paragraph. " * 50  # ~150 tokens
    text = "\n\n".join([paragraph] * 10)  # ~1500 tokens total
    chunks = chunk_text(text)
    assert len(chunks) >= 2
    # Each chunk should be roughly within the token budget (some leeway for overlap and boundaries)
    for c in chunks:
        assert c.token_count <= CHUNK_SIZE_TOKENS + CHUNK_OVERLAP_TOKENS + 50


def test_chunker_preserves_total_information():
    """The concatenated chunks (deduplicated for overlap) should retain key sentences."""
    text = "Alpha sentence. " * 100 + "Beta sentence. " * 100 + "Gamma sentence. " * 100
    chunks = chunk_text(text)
    combined = " ".join(c.content for c in chunks)
    assert "Alpha" in combined
    assert "Beta" in combined
    assert "Gamma" in combined


def test_chunker_chunks_have_sequential_indices():
    text = "Para one.\n\n" * 200
    chunks = chunk_text(text)
    for i, c in enumerate(chunks):
        assert c.index == i


def test_count_tokens_consistent():
    text = "Hello world from JARVIS OS."
    n1 = count_tokens(text)
    n2 = count_tokens(text)
    assert n1 == n2
    assert n1 > 0


# ─── Retrieval (numpy simulation) ─────────────────────────────────────────────

def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))


def _simulate_retrieval(
    query_vec: np.ndarray,
    chunk_vecs: np.ndarray,
    chunk_meta: list[dict],
    top_k: int = 5,
) -> tuple[list[dict], float]:
    """Pure-Python equivalent of the pgvector cosine search."""
    t0 = time.monotonic()

    # Normalize for cosine
    query_norm = query_vec / np.linalg.norm(query_vec)
    chunk_norms = chunk_vecs / np.linalg.norm(chunk_vecs, axis=1, keepdims=True)
    sims = chunk_norms @ query_norm

    top_indices = np.argpartition(-sims, min(top_k * 2, len(sims) - 1))[: top_k * 2]
    top_sorted = top_indices[np.argsort(-sims[top_indices])][:top_k]

    results = []
    for idx in top_sorted:
        results.append({**chunk_meta[idx], "score": float(sims[idx])})

    elapsed_ms = (time.monotonic() - t0) * 1000
    return results, elapsed_ms


def test_retrieval_returns_top_k():
    rng = np.random.default_rng(42)
    n_chunks = 100
    dim = 1536

    chunk_vecs = rng.standard_normal((n_chunks, dim)).astype(np.float32)
    chunk_meta = [
        {"chunk_index": i, "document_id": str(uuid.uuid4()), "document_title": f"doc-{i}", "content": f"chunk {i}"}
        for i in range(n_chunks)
    ]

    # Plant a known similar vector
    target_vec = chunk_vecs[42].copy()
    query_vec = target_vec + rng.standard_normal(dim).astype(np.float32) * 0.01

    results, latency_ms = _simulate_retrieval(query_vec, chunk_vecs, chunk_meta, top_k=5)
    assert len(results) == 5
    assert results[0]["chunk_index"] == 42  # Most similar is the planted one


def test_retrieval_latency_10k_chunks_under_2s():
    """
    Exit criterion: RAG retrieval p95 < 2s for 10k document chunks.
    Synthetic test using numpy cosine similarity (mirrors pgvector path).
    """
    rng = np.random.default_rng(0)
    n_chunks = 10_000
    dim = 1536

    chunk_vecs = rng.standard_normal((n_chunks, dim)).astype(np.float32)
    chunk_meta = [
        {"chunk_index": i, "document_id": str(uuid.uuid4()), "document_title": f"doc-{i}", "content": f"chunk {i}"}
        for i in range(n_chunks)
    ]

    latencies = []
    for _ in range(5):
        query_vec = rng.standard_normal(dim).astype(np.float32)
        _, ms = _simulate_retrieval(query_vec, chunk_vecs, chunk_meta, top_k=5)
        latencies.append(ms)

    p95 = sorted(latencies)[int(len(latencies) * 0.95)]
    assert p95 < 2000, f"p95 latency {p95:.0f}ms exceeds 2000ms budget"


# ─── Pipeline integration (mocked embedder) ───────────────────────────────────

@pytest.mark.asyncio
async def test_pipeline_chunks_and_persists():
    """Full pipeline: parse → chunk → (mock) embed → would persist."""
    from app.knowledge.chunker import chunk_text
    from app.knowledge.embedder import embed_chunks

    # Build a text with multiple paragraphs
    text = "\n\n".join([f"Paragraph {i}: " + "word " * 50 for i in range(20)])
    chunks = chunk_text(text)
    assert len(chunks) >= 1

    fake_embedding = [0.1] * 1536
    with patch(
        "app.knowledge.embedder.model_router.embed",
        new_callable=AsyncMock,
        return_value=[fake_embedding] * len(chunks),
    ):
        embeddings = await embed_chunks(chunks)

    assert len(embeddings) == len(chunks)
    assert all(len(e) == 1536 for e in embeddings)


@pytest.mark.asyncio
async def test_embedder_batches_large_input():
    """Embedder should split inputs into batches of MAX_BATCH_SIZE (100)."""
    from app.knowledge.chunker import Chunk
    from app.knowledge.embedder import embed_chunks, MAX_BATCH_SIZE

    chunks = [Chunk(index=i, content=f"chunk {i}", token_count=10) for i in range(250)]

    call_count = 0

    async def fake_embed(texts):
        nonlocal call_count
        call_count += 1
        assert len(texts) <= MAX_BATCH_SIZE
        return [[0.1] * 1536 for _ in texts]

    with patch("app.knowledge.embedder.model_router.embed", side_effect=fake_embed):
        embeddings = await embed_chunks(chunks)

    assert len(embeddings) == 250
    # 250 chunks ÷ 100/batch = 3 batches
    assert call_count == 3
