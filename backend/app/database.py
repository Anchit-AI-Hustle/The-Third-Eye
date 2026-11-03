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
        connect_args: dict = {}
        # Supabase pooler presents a chain asyncpg's default context rejects
        # (CERTIFICATE_VERIFY_FAILED). Require TLS but skip hostname/CA check.
        if "localhost" not in database_url and "127.0.0.1" not in database_url:
            import ssl

            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            connect_args["ssl"] = ctx
        # PgBouncer transaction poolers (Supabase :6543) reject prepared stmts.
        if ":6543" in database_url or "pooler.supabase" in database_url:
            connect_args["statement_cache_size"] = 0
        if schema != "public":
            connect_args["server_settings"] = {"search_path": schema}
        if connect_args:
            kwargs["connect_args"] = connect_args
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
