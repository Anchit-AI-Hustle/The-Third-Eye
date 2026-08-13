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


# ─── password hashing ────────────────────────────────────────────────────────


def test_password_hash_is_salted_and_verifiable():
    from app.auth.service import hash_password, verify_password

    hashed = hash_password("correct horse battery staple")
    assert hashed.startswith("$2b$")
    assert verify_password("correct horse battery staple", hashed)
    assert not verify_password("wrong", hashed)


def test_password_hash_differs_per_call():
    from app.auth.service import hash_password

    assert hash_password("same") != hash_password("same")


def test_password_longer_than_the_bcrypt_limit_still_round_trips():
    from app.auth.service import hash_password, verify_password

    long_password = "a" * 200
    assert verify_password(long_password, hash_password(long_password))


def test_password_truncation_is_applied_identically_on_both_sides():
    from app.auth.service import hash_password, verify_password

    # bcrypt only reads the first 72 bytes, so these are the same secret to it.
    assert verify_password("b" * 72, hash_password("b" * 200))


def test_multibyte_password_that_straddles_the_byte_limit_round_trips():
    from app.auth.service import hash_password, verify_password

    accented = "é" * 50  # 100 bytes, cut mid-character at 72
    assert verify_password(accented, hash_password(accented))


def test_verify_password_returns_false_for_a_malformed_stored_hash():
    from app.auth.service import verify_password

    assert verify_password("anything", "not-a-bcrypt-hash") is False


# ─── health ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_reports_healthy_when_both_services_answer(client: AsyncClient, monkeypatch):
    import app.api.health as health

    async def db_ok():
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

    monkeypatch.setattr(health, "check_db_connection", db_ok)
    monkeypatch.setattr(health, "aioredis", RedisModule)

    response = await client.get("/health")
    body = response.json()
    assert body["status"] == "healthy"
    assert body["services"]["redis"] == "ok"
    assert body["services"]["postgres"] == "ok"


# ─── tasks API remainder ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_tasks_filters_by_status(client: AsyncClient, test_user, db):
    from app.tasks.models import Task

    db.add(Task(user_id=test_user.id, title="Open", status="todo", priority="low"))
    db.add(Task(user_id=test_user.id, title="Closed", status="done", priority="low"))
    await db.flush()

    with as_user(test_user):
        response = await client.get(
            "/api/v1/tasks?status=done", headers=auth_headers(test_user)
        )

    assert [t["title"] for t in response.json()] == ["Closed"]


@pytest.mark.asyncio
async def test_update_task_404s_when_absent(client: AsyncClient, test_user):
    with as_user(test_user):
        response = await client.patch(
            f"/api/v1/tasks/{uuid.uuid4()}",
            json={"status": "done"},
            headers=auth_headers(test_user),
        )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_task_404s_when_absent(client: AsyncClient, test_user):
    with as_user(test_user):
        response = await client.delete(
            f"/api/v1/tasks/{uuid.uuid4()}", headers=auth_headers(test_user)
        )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_projects_returns_the_callers_own(client: AsyncClient, test_user, db):
    from app.tasks.models import Project

    db.add(Project(user_id=test_user.id, name="Mine"))
    db.add(Project(user_id=uuid.uuid4(), name="Theirs"))
    await db.flush()

    with as_user(test_user):
        response = await client.get("/api/v1/projects", headers=auth_headers(test_user))

    assert [p["name"] for p in response.json()] == ["Mine"]


# ─── documents: nameless upload ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_rejects_an_upload_whose_filename_is_empty(db, test_user):
    # FastAPI's own validation catches a missing filename before the handler in
    # a real request, so the guard is exercised by calling the handler directly.
    from fastapi import BackgroundTasks, HTTPException

    import app.api.documents as documents

    class NamelessUpload:
        filename = ""

    with pytest.raises(HTTPException) as excinfo:
        await documents.upload_document(
            background_tasks=BackgroundTasks(),
            current_user=test_user,
            db=db,
            file=NamelessUpload(),
        )
    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "No filename provided"


@pytest.mark.asyncio
async def test_health_reports_degraded_when_redis_is_unreachable(client: AsyncClient, monkeypatch):
    import app.api.health as health

    async def db_ok():
        return True

    class RefusingRedis:
        @staticmethod
        def from_url(url):
            raise OSError("connection refused")

    monkeypatch.setattr(health, "check_db_connection", db_ok)
    monkeypatch.setattr(health, "aioredis", RefusingRedis)

    body = (await client.get("/health")).json()
    assert body["status"] == "degraded"
    assert body["services"]["redis"] == "error"
    assert body["services"]["postgres"] == "ok"


# ─── engine options ──────────────────────────────────────────────────────────


def test_engine_kwargs_omit_pool_sizing_for_sqlite():
    from app.database import build_engine_kwargs

    kwargs = build_engine_kwargs("sqlite+aiosqlite:///:memory:", "test")
    assert "pool_size" not in kwargs
    assert "max_overflow" not in kwargs
    assert kwargs["pool_pre_ping"] is True


def test_engine_kwargs_add_pool_sizing_for_a_server_database():
    from app.database import build_engine_kwargs

    kwargs = build_engine_kwargs("postgresql+asyncpg://u:p@h/db", "test")
    assert kwargs["pool_size"] == 10
    assert kwargs["max_overflow"] == 20


def test_engine_echo_follows_the_environment():
    from app.database import build_engine_kwargs

    assert build_engine_kwargs("sqlite://", "development")["echo"] is True
    assert build_engine_kwargs("sqlite://", "production")["echo"] is False


@pytest.mark.asyncio
async def test_get_task_returns_the_callers_own_task(client: AsyncClient, test_user, db):
    from app.tasks.models import Task

    task = Task(user_id=test_user.id, title="Findable", status="todo", priority="low")
    db.add(task)
    await db.flush()
    await db.refresh(task)

    with as_user(test_user):
        response = await client.get(f"/api/v1/tasks/{task.id}", headers=auth_headers(test_user))

    assert response.status_code == 200
    assert response.json()["title"] == "Findable"


@pytest.mark.asyncio
async def test_get_task_404s_for_someone_elses(client: AsyncClient, test_user, db):
    from app.tasks.models import Task

    task = Task(user_id=uuid.uuid4(), title="Theirs", status="todo", priority="low")
    db.add(task)
    await db.flush()
    await db.refresh(task)

    with as_user(test_user):
        response = await client.get(f"/api/v1/tasks/{task.id}", headers=auth_headers(test_user))

    assert response.status_code == 404
