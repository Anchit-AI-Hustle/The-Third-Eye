import hmac
from typing import Annotated

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.database import check_db_connection
from app.memory.consolidation import run_consolidation

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


@router.post("/internal/run-consolidation")
async def trigger_consolidation(
    settings: Annotated[Settings, Depends(get_settings)],
    x_cron_secret: Annotated[str | None, Header(alias="X-Cron-Secret")] = None,
) -> dict:
    """External trigger for the nightly memory-consolidation job.

    On free scale-to-zero compute an in-process APScheduler job only fires if
    the instance happens to already be warm at the scheduled time — it
    usually won't be. A free external cron (this repo's own GitHub Actions,
    see .github/workflows/consolidation-cron.yml) hits this endpoint instead,
    which wakes the instance and runs the job for real. Disabled unless
    INTERNAL_CRON_SECRET is set; a wrong or missing secret reads as 404
    rather than 401/403 so the endpoint's existence isn't advertised.
    """
    if not settings.internal_cron_secret or not x_cron_secret or not hmac.compare_digest(
        x_cron_secret, settings.internal_cron_secret
    ):
        raise HTTPException(status_code=404)
    stats = await run_consolidation()
    return {"users_processed": len(stats)}
