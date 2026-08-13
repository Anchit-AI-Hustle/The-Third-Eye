"""Memory retrieval: embedding, pgvector search, re-ranking, recency fallback."""

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.memory import service as mem
from app.memory.models import EpisodicMemory

NOW = datetime.now(timezone.utc)


class _StubResult:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _StubSession:
    """Stands in for AsyncSession on the pgvector path, which SQLite cannot run."""

    def __init__(self, rows):
        self._rows = rows
        self.executed = []

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        # The first call is the similarity search; the second is the access-count
        # update, whose return value is not used.
        if len(self.executed) == 1:
            return _StubResult(self._rows)
        return None


def _row(content="c", role="user", created_at=None, similarity=0.9, importance=0.0):
    return SimpleNamespace(
        id=uuid.uuid4(),
        content=content,
        role=role,
        created_at=created_at or NOW.replace(tzinfo=None),
        importance_score=importance,
        similarity=similarity,
    )


# ─── store_episodic ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_store_episodic_persists_and_attaches_an_embedding(db, test_user, monkeypatch):
    async def fake_embed(texts):
        return [[0.1, 0.2, 0.3]]

    monkeypatch.setattr(mem.model_router, "embed", fake_embed)

    entry = await mem.store_episodic(
        db, user_id=test_user.id, role="user", content="remember this"
    )
    assert entry.id is not None
    assert entry.content == "remember this"
    assert entry.embedding == [0.1, 0.2, 0.3]


@pytest.mark.asyncio
async def test_store_episodic_sets_expiry_from_the_retention_window(db, test_user, monkeypatch):
    async def fake_embed(texts):
        return [[0.0]]

    monkeypatch.setattr(mem.model_router, "embed", fake_embed)

    entry = await mem.store_episodic(
        db, user_id=test_user.id, role="user", content="x", retention_days=7
    )
    delta = entry.expires_at.replace(tzinfo=timezone.utc) - NOW
    assert timedelta(days=6) < delta < timedelta(days=8)


@pytest.mark.asyncio
async def test_store_episodic_still_saves_when_embedding_fails(db, test_user, monkeypatch):
    async def boom(texts):
        raise RuntimeError("embedding provider down")

    monkeypatch.setattr(mem.model_router, "embed", boom)

    entry = await mem.store_episodic(db, user_id=test_user.id, role="user", content="x")
    assert entry.id is not None
    assert entry.embedding is None


@pytest.mark.asyncio
async def test_store_episodic_records_the_session(db, test_user, monkeypatch):
    async def fake_embed(texts):
        return [[0.0]]

    monkeypatch.setattr(mem.model_router, "embed", fake_embed)

    entry = await mem.store_episodic(
        db, user_id=test_user.id, role="assistant", content="x", session_id="s-1"
    )
    assert entry.session_id == "s-1"


# ─── retrieve_relevant_memories ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_retrieve_ranks_recent_and_similar_above_old_and_distant(monkeypatch):
    async def fake_embed(texts):
        return [[0.1]]

    monkeypatch.setattr(mem.model_router, "embed", fake_embed)

    fresh_similar = _row(content="fresh", similarity=0.9, created_at=NOW.replace(tzinfo=None))
    stale_similar = _row(
        content="stale", similarity=0.9,
        created_at=(NOW - timedelta(days=30)).replace(tzinfo=None),
    )
    session = _StubSession([stale_similar, fresh_similar])

    out = await mem.retrieve_relevant_memories(session, user_id=uuid.uuid4(), query="q")
    assert [m["content"] for m in out] == ["fresh", "stale"]


@pytest.mark.asyncio
async def test_retrieve_scores_combine_similarity_and_recency(monkeypatch):
    async def fake_embed(texts):
        return [[0.1]]

    monkeypatch.setattr(mem.model_router, "embed", fake_embed)

    session = _StubSession([_row(similarity=1.0, created_at=NOW.replace(tzinfo=None))])
    out = await mem.retrieve_relevant_memories(session, user_id=uuid.uuid4(), query="q")
    # similarity 1.0 * 0.6 + recency ~1.0 * 0.4
    assert out[0]["score"] == pytest.approx(1.0, abs=0.01)


@pytest.mark.asyncio
async def test_retrieve_floors_the_recency_weight_for_very_old_rows(monkeypatch):
    async def fake_embed(texts):
        return [[0.1]]

    monkeypatch.setattr(mem.model_router, "embed", fake_embed)

    ancient = _row(similarity=1.0, created_at=(NOW - timedelta(days=365)).replace(tzinfo=None))
    session = _StubSession([ancient])
    out = await mem.retrieve_relevant_memories(session, user_id=uuid.uuid4(), query="q")
    # Recency contributes nothing once clamped at zero, leaving similarity alone.
    assert out[0]["score"] == pytest.approx(0.6, abs=0.01)


@pytest.mark.asyncio
async def test_retrieve_truncates_to_the_requested_top_k(monkeypatch):
    async def fake_embed(texts):
        return [[0.1]]

    monkeypatch.setattr(mem.model_router, "embed", fake_embed)

    session = _StubSession([_row(content=str(i)) for i in range(10)])
    out = await mem.retrieve_relevant_memories(session, user_id=uuid.uuid4(), query="q", top_k=3)
    assert len(out) == 3


@pytest.mark.asyncio
async def test_retrieve_bumps_access_counts_for_the_rows_it_returned(monkeypatch):
    async def fake_embed(texts):
        return [[0.1]]

    monkeypatch.setattr(mem.model_router, "embed", fake_embed)

    session = _StubSession([_row()])
    await mem.retrieve_relevant_memories(session, user_id=uuid.uuid4(), query="q")
    assert len(session.executed) == 2  # search, then the access-count update


@pytest.mark.asyncio
async def test_retrieve_skips_the_access_update_when_nothing_matched(monkeypatch):
    async def fake_embed(texts):
        return [[0.1]]

    monkeypatch.setattr(mem.model_router, "embed", fake_embed)

    session = _StubSession([])
    out = await mem.retrieve_relevant_memories(session, user_id=uuid.uuid4(), query="q")
    assert out == []
    assert len(session.executed) == 1


@pytest.mark.asyncio
async def test_retrieve_falls_back_to_recency_when_embedding_fails(db, test_user, monkeypatch):
    async def embed_ok(texts):
        return [[0.0]]

    monkeypatch.setattr(mem.model_router, "embed", embed_ok)
    for i in range(3):
        await mem.store_episodic(db, user_id=test_user.id, role="user", content=f"m{i}")

    async def boom(texts):
        raise RuntimeError("embeddings unavailable")

    monkeypatch.setattr(mem.model_router, "embed", boom)

    out = await mem.retrieve_relevant_memories(db, user_id=test_user.id, query="q")
    assert len(out) == 3
    assert {m["score"] for m in out} == {0.5}


# ─── _fallback_recency_retrieval ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_fallback_returns_newest_first_and_respects_top_k(db, test_user):
    for i in range(4):
        db.add(
            EpisodicMemory(
                user_id=test_user.id,
                role="user",
                content=f"m{i}",
                created_at=NOW - timedelta(days=4 - i),
            )
        )
    await db.flush()

    out = await mem._fallback_recency_retrieval(db, user_id=test_user.id, top_k=2)
    assert [m["content"] for m in out] == ["m3", "m2"]


@pytest.mark.asyncio
async def test_fallback_is_scoped_to_the_owner(db, test_user):
    db.add(EpisodicMemory(user_id=test_user.id, role="user", content="mine"))
    await db.flush()

    out = await mem._fallback_recency_retrieval(db, user_id=uuid.uuid4(), top_k=5)
    assert out == []


# ─── format_memory_context ───────────────────────────────────────────────────


def test_format_memory_context_returns_empty_for_no_memories():
    assert mem.format_memory_context([]) == ""


def test_format_memory_context_wraps_and_labels_each_line():
    block = mem.format_memory_context(
        [{"role": "user", "content": "likes tea"}, {"role": "assistant", "content": "noted"}]
    )
    assert block.startswith("<memory>")
    assert block.endswith("</memory>")
    assert "[user]: likes tea" in block
    assert "[assistant]: noted" in block
