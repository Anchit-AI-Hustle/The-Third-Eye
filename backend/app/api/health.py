from typing import Annotated

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.database import check_db_connection

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    services: dict[str, str]


@router.get("/health", response_model=HealthResponse)
async def health_check(
    settings: Annotated[Settings, Depends(get_settings)],
) -> HealthResponse:
    db_ok = await check_db_connection()

    redis_ok = False
    try:
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        await r.aclose()
        redis_ok = True
    except Exception:
        pass

    status = "healthy" if (db_ok and redis_ok) else "degraded"

    return HealthResponse(
        status=status,
        version="0.1.0",
        environment=settings.environment,
        services={
            "postgres": "ok" if db_ok else "error",
            "redis": "ok" if redis_ok else "error",
        },
    )
