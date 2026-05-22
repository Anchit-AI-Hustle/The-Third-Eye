# ───────────────────────────────────────────────────────────────────────────────
#  conftest.py — Test setup
#
#  Patches pgvector.Vector → SQLite-compatible Text BEFORE any models are
#  imported, so create_all() works against the in-memory SQLite test database.
# ───────────────────────────────────────────────────────────────────────────────

import os
os.environ.setdefault("ENVIRONMENT", "test")

# ─── pgvector compatibility shim for SQLite ───────────────────────────────────
import pgvector.sqlalchemy
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator


class _SQLiteVector(TypeDecorator):
    """Stand-in for pgvector.Vector under SQLite — stores as JSON text."""
    impl = Text
    cache_ok = True

    def __init__(self, dim=None, *args, **kwargs):
        super().__init__()

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(list(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        try:
            return [float(x) for x in value.strip("[]").split(",") if x.strip()]
        except Exception:
            return None


pgvector.sqlalchemy.Vector = _SQLiteVector

# ─── Standard imports ─────────────────────────────────────────────────────────
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Now safe to import models / app — they will use the patched Vector type
from app.auth.models import User
from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def test_engine():
    """Fresh in-memory engine per test for full isolation."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db(test_engine) -> AsyncGenerator[AsyncSession, None]:
    session_maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session


@pytest_asyncio.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"test-{uuid.uuid4()}@jarvis.local",
        name="Test User",
        is_active=True,
        is_verified=True,
        max_permission_level=4,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
