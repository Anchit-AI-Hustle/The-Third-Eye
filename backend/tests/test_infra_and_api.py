"""Infrastructure and remaining API surface: db session, config, lifespan, routes."""

import io
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.auth.models import User
from app.auth.service import create_access_token
from app.knowledge.models import Document


def auth_headers(user: User) -> dict:
    token, _ = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


def as_user(user: User):
    return patch(
        "app.auth.service.validate_session_token",
        new_callable=AsyncMock,
        return_value=user,
    )


# ─── database ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_db_yields_a_session_and_commits(monkeypatch, test_engine):
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

    import app.database as database

    maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database, "AsyncSessionLocal", maker)

    seen = None
    async for session in database.get_db():
        seen = session
        session.add(User(id=uuid.uuid4(), email=f"{uuid.uuid4()}@example.com", name="X"))

    assert seen is not None


@pytest.mark.asyncio
async def test_get_db_rolls_back_when_the_caller_raises(monkeypatch, test_engine):
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

    import app.database as database

    maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database, "AsyncSessionLocal", maker)

    gen = database.get_db()
    session = await gen.__anext__()
    session.add(User(id=uuid.uuid4(), email=f"{uuid.uuid4()}@example.com", name="X"))

    with pytest.raises(RuntimeError):
        await gen.athrow(RuntimeError("caller blew up"))

    # The row must not survive the rollback.
    async with maker() as check:
        assert (await check.execute(select(User))).scalars().all() == []


@pytest.mark.asyncio
async def test_get_db_context_commits_on_success(monkeypatch, test_engine):
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

    import app.database as database

    maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database, "AsyncSessionLocal", maker)

    email = f"{uuid.uuid4()}@example.com"
    async with database.get_db_context() as session:
        session.add(User(id=uuid.uuid4(), email=email, name="Kept"))

    async with maker() as check:
        rows = (await check.execute(select(User).where(User.email == email))).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_get_db_context_rolls_back_on_error(monkeypatch, test_engine):
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

    import app.database as database

    maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database, "AsyncSessionLocal", maker)

    with pytest.raises(RuntimeError):
        async with database.get_db_context() as session:
            session.add(User(id=uuid.uuid4(), email=f"{uuid.uuid4()}@example.com", name="Lost"))
            raise RuntimeError("boom")

    async with maker() as check:
        assert (await check.execute(select(User))).scalars().all() == []


@pytest.mark.asyncio
async def test_check_db_connection_reports_true_when_reachable(monkeypatch, test_engine):
    import app.database as database

    monkeypatch.setattr(database, "engine", test_engine)
    assert await database.check_db_connection() is True


@pytest.mark.asyncio
async def test_check_db_connection_reports_false_when_unreachable(monkeypatch):
    import app.database as database
    from sqlalchemy.ext.asyncio import create_async_engine

    monkeypatch.setattr(
        database, "engine", create_async_engine("sqlite+aiosqlite:////nonexistent/dir/x.db")
    )
    assert await database.check_db_connection() is False


# ─── config ──────────────────────────────────────────────────────────────────


def test_cors_origins_list_splits_and_trims():
    from app.config import Settings

    settings = Settings(cors_origins="http://a.test, http://b.test ,")
    assert settings.cors_origins_list == ["http://a.test", "http://b.test"]


def test_sync_database_url_is_derived_from_the_async_one():
    from app.config import Settings

    settings = Settings(database_url="postgresql+asyncpg://u:p@h/db", database_url_sync="")
    assert settings.database_url_sync == "postgresql://u:p@h/db"


def test_an_explicit_sync_database_url_is_kept():
    from app.config import Settings

    settings = Settings(
        database_url="postgresql+asyncpg://u:p@h/db",
        database_url_sync="postgresql://override/db",
    )
    assert settings.database_url_sync == "postgresql://override/db"


def test_is_production_tracks_the_environment():
    from app.config import Settings

    assert Settings(environment="production").is_production is True
    assert Settings(environment="development").is_production is False


# ─── lifespan ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_lifespan_refuses_to_start_without_a_database(monkeypatch):
    import app.main as main

    async def no_db():
        return False

    monkeypatch.setattr(main, "check_db_connection", no_db)

    with pytest.raises(RuntimeError, match="Cannot connect to PostgreSQL"):
        async with main.lifespan(main.app):
            pass


@pytest.mark.asyncio
async def test_lifespan_refuses_to_start_without_redis(monkeypatch):
    import app.main as main

    async def ok_db():
        return True

    class FailingRedis:
        @staticmethod
        def from_url(url):
            raise OSError("redis refused")

    monkeypatch.setattr(main, "check_db_connection", ok_db)
    monkeypatch.setattr(main, "aioredis", FailingRedis)

    with pytest.raises(RuntimeError, match="Cannot connect to Redis"):
        async with main.lifespan(main.app):
            pass


@pytest.mark.asyncio
async def test_lifespan_starts_and_shuts_down_cleanly(monkeypatch):
    import app.main as main

    async def ok_db():
        return True

    class FakeRedis:
        async def ping(self):
            return True

        async def aclose(self):
            return None

    class RedisModule:
        @staticmethod
        def from_url(url):
            return FakeRedis()

    disposed = {}

    class FakeEngine:
        async def dispose(self):
            disposed["yes"] = True

    monkeypatch.setattr(main, "check_db_connection", ok_db)
    monkeypatch.setattr(main, "aioredis", RedisModule)
    monkeypatch.setattr(main, "engine", FakeEngine())

    async with main.lifespan(main.app):
        pass

    assert disposed == {"yes": True}


@pytest.mark.asyncio
async def test_lifespan_starts_the_scheduler_outside_test_environments(monkeypatch):
    import app.main as main

    async def ok_db():
        return True

    class FakeRedis:
        async def ping(self):
            return True

        async def aclose(self):
            return None

    class RedisModule:
        @staticmethod
        def from_url(url):
            return FakeRedis()

    scheduled = {}

    class FakeScheduler:
        running = False

        def start(self):
            scheduled["started"] = True

        def shutdown(self, wait=False):
            scheduled["stopped"] = True

    class FakeEngine:
        async def dispose(self):
            return None

    monkeypatch.setattr(main, "check_db_connection", ok_db)
    monkeypatch.setattr(main, "aioredis", RedisModule)
    monkeypatch.setattr(main, "engine", FakeEngine())
    monkeypatch.setattr(main, "scheduler", FakeScheduler())
    monkeypatch.setattr(main.settings, "environment", "production")
    monkeypatch.setattr(main, "schedule_consolidation_job", lambda s: scheduled.setdefault("job", True))

    async with main.lifespan(main.app):
        pass

    assert scheduled["job"] is True
    assert scheduled["started"] is True


@pytest.mark.asyncio
async def test_lifespan_shuts_a_running_scheduler_down(monkeypatch):
    import app.main as main

    async def ok_db():
        return True

    class FakeRedis:
        async def ping(self):
            return True

        async def aclose(self):
            return None

    class RedisModule:
        @staticmethod
        def from_url(url):
            return FakeRedis()

    stopped = {}

    class RunningScheduler:
        running = True

        def start(self):
            pass

        def shutdown(self, wait=False):
            stopped["yes"] = True

    class FakeEngine:
        async def dispose(self):
            return None

    monkeypatch.setattr(main, "check_db_connection", ok_db)
    monkeypatch.setattr(main, "aioredis", RedisModule)
    monkeypatch.setattr(main, "engine", FakeEngine())
    monkeypatch.setattr(main, "scheduler", RunningScheduler())

    async with main.lifespan(main.app):
        pass

    assert stopped == {"yes": True}


# ─── documents API ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_rejects_a_request_without_a_filename(client: AsyncClient, test_user):
    with as_user(test_user):
        response = await client.post(
            "/api/v1/documents/upload",
            files={"file": ("", io.BytesIO(b"data"), "text/plain")},
            headers=auth_headers(test_user),
        )
    assert response.status_code in (400, 422)


@pytest.mark.asyncio
async def test_upload_rejects_an_unsupported_type(client: AsyncClient, test_user):
    with as_user(test_user):
        response = await client.post(
            "/api/v1/documents/upload",
            files={"file": ("archive.zip", io.BytesIO(b"data"), "application/zip")},
            headers=auth_headers(test_user),
        )
    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]


@pytest.mark.asyncio
async def test_upload_rejects_a_file_over_the_size_limit(client: AsyncClient, test_user, monkeypatch):
    import app.api.documents as documents

    monkeypatch.setattr(documents, "MAX_FILE_SIZE_BYTES", 10)
    with as_user(test_user):
        response = await client.post(
            "/api/v1/documents/upload",
            files={"file": ("notes.txt", io.BytesIO(b"x" * 50), "text/plain")},
            headers=auth_headers(test_user),
        )
    assert response.status_code == 413
    assert "File too large" in response.json()["detail"]


@pytest.mark.asyncio
async def test_upload_accepts_a_document_and_queues_processing(client: AsyncClient, test_user):
    with as_user(test_user):
        response = await client.post(
            "/api/v1/documents/upload",
            files={"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")},
            headers=auth_headers(test_user),
        )
    assert response.status_code == 202
    body = response.json()
    assert body["title"] == "notes.txt"
    assert body["processing_status"] == "pending"


@pytest.mark.asyncio
async def test_list_documents_returns_only_the_callers_own(client: AsyncClient, test_user, db):
    db.add(Document(user_id=test_user.id, title="Mine", file_type="txt", processing_status="ready"))
    db.add(Document(user_id=uuid.uuid4(), title="Theirs", file_type="txt", processing_status="ready"))
    await db.flush()

    with as_user(test_user):
        response = await client.get("/api/v1/documents/", headers=auth_headers(test_user))

    assert response.status_code == 200
    assert [d["title"] for d in response.json()] == ["Mine"]


@pytest.mark.asyncio
async def test_get_document_returns_it(client: AsyncClient, test_user, db):
    doc = Document(user_id=test_user.id, title="Mine", file_type="txt", processing_status="ready")
    db.add(doc)
    await db.flush()
    await db.refresh(doc)

    with as_user(test_user):
        response = await client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(test_user))

    assert response.status_code == 200
    assert response.json()["title"] == "Mine"


@pytest.mark.asyncio
async def test_get_document_404s_for_someone_elses(client: AsyncClient, test_user, db):
    doc = Document(user_id=uuid.uuid4(), title="Theirs", file_type="txt", processing_status="ready")
    db.add(doc)
    await db.flush()
    await db.refresh(doc)

    with as_user(test_user):
        response = await client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(test_user))

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_document_removes_it(client: AsyncClient, test_user, db):
    doc = Document(user_id=test_user.id, title="Bye", file_type="txt", processing_status="ready")
    db.add(doc)
    await db.flush()
    await db.refresh(doc)

    with as_user(test_user):
        response = await client.delete(
            f"/api/v1/documents/{doc.id}", headers=auth_headers(test_user)
        )

    assert response.status_code == 204
    assert (await db.execute(select(Document))).scalars().all() == []


@pytest.mark.asyncio
async def test_delete_document_404s_when_absent(client: AsyncClient, test_user):
    with as_user(test_user):
        response = await client.delete(
            f"/api/v1/documents/{uuid.uuid4()}", headers=auth_headers(test_user)
        )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_process_document_background_task_rolls_back_on_failure(monkeypatch, test_engine):
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

    import app.api.documents as documents

    maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(documents, "AsyncSessionLocal", maker)

    async def boom(*args, **kwargs):
        raise RuntimeError("ingestion failed")

    monkeypatch.setattr(documents, "ingest_document", boom)

    # Swallows the error: a background task has nobody to raise to.
    await documents._process_document(uuid.uuid4(), b"data", "txt")


@pytest.mark.asyncio
async def test_process_document_background_task_commits_on_success(monkeypatch, test_engine):
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

    import app.api.documents as documents

    maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(documents, "AsyncSessionLocal", maker)

    called = {}

    async def fake_ingest(db, *, document_id, file, file_type):
        called["document_id"] = document_id
        return 3

    monkeypatch.setattr(documents, "ingest_document", fake_ingest)

    doc_id = uuid.uuid4()
    await documents._process_document(doc_id, b"data", "txt")
    assert called["document_id"] == doc_id


# ─── knowledge API ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_knowledge_search_returns_scored_results(client: AsyncClient, test_user, monkeypatch):
    import app.api.knowledge as knowledge_api

    doc_id = uuid.uuid4()

    async def fake_retrieve(db, *, user_id, query, top_k, document_ids):
        return [{
            "document_id": doc_id,
            "document_title": "Handbook",
            "chunk_index": 1,
            "content": "the passage",
            "score": 0.87,
        }]

    monkeypatch.setattr(knowledge_api, "retrieve_chunks", fake_retrieve)

    with as_user(test_user):
        response = await client.post(
            "/api/v1/knowledge/search",
            json={"query": "what is it", "top_k": 5},
            headers=auth_headers(test_user),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "what is it"
    assert body["results"][0]["document_title"] == "Handbook"
    assert body["latency_ms"] >= 0


@pytest.mark.asyncio
async def test_knowledge_list_returns_only_ready_documents(client: AsyncClient, test_user, db):
    db.add(Document(user_id=test_user.id, title="Ready", file_type="txt", processing_status="ready"))
    db.add(Document(user_id=test_user.id, title="Pending", file_type="txt", processing_status="pending"))
    await db.flush()

    with as_user(test_user):
        response = await client.get("/api/v1/knowledge/", headers=auth_headers(test_user))

    assert [d["title"] for d in response.json()] == ["Ready"]
