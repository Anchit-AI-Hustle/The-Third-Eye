"""Creates the backend's dedicated Postgres schema before migrations run.

Only does anything when DB_SCHEMA is set to something other than "public" —
the case when this service shares a single free-tier Postgres instance (e.g.
the same Supabase project the frontend already uses) instead of a second,
billed database of its own. Alembic manages tables inside a schema; it does
not create the schema itself.
"""

import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings


async def main() -> None:
    settings = get_settings()
    if settings.db_schema == "public":
        return
    engine = create_async_engine(settings.database_url)
    try:
        async with engine.connect() as conn:
            await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{settings.db_schema}"'))
            await conn.commit()
    finally:
        await engine.dispose()


if __name__ == "__main__":  # pragma: no cover — exercised via the Docker CMD, not pytest
    asyncio.run(main())
