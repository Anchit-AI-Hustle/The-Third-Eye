from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import DateTime, func

from app.config import get_settings

settings = get_settings()

def build_engine_kwargs(database_url: str, environment: str, schema: str = "public") -> dict:
    """Engine options for a DSN. SQLite takes no pool sizing — its aiosqlite
    driver rejects those arguments — so they apply to server databases only.

    When `schema` isn't "public", every connection's search_path is pinned to
    it, so unqualified DDL/DML from SQLAlchemy and Alembic lands in that
    schema without schema-qualifying every model — see Settings.db_schema."""
    kwargs = {
        "echo": environment == "development",
        "pool_pre_ping": True,
    }
    if not database_url.startswith("sqlite"):
        kwargs["pool_size"] = 10
        kwargs["max_overflow"] = 20
        if schema != "public":
            kwargs["connect_args"] = {"server_settings": {"search_path": schema}}
    return kwargs


engine = create_async_engine(
    settings.database_url,
    **build_engine_kwargs(settings.database_url, settings.environment, settings.db_schema),
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base model with audit timestamps."""

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def check_db_connection() -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
