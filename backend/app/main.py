import structlog
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import get_settings
from app.database import check_db_connection, engine
import redis.asyncio as aioredis

from app.api import health, chat, tasks as tasks_router, auth as auth_router

settings = get_settings()
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("jarvis_starting", environment=settings.environment)

    # Verify DB
    if not await check_db_connection():
        raise RuntimeError("Cannot connect to PostgreSQL on startup")
    log.info("db_connected")

    # Verify Redis
    try:
        redis = aioredis.from_url(settings.redis_url)
        await redis.ping()
        await redis.aclose()
        log.info("redis_connected")
    except Exception as e:
        raise RuntimeError(f"Cannot connect to Redis on startup: {e}") from e

    yield

    await engine.dispose()
    log.info("jarvis_shutdown")


app = FastAPI(
    title="JARVIS OS API",
    version="0.1.0",
    description="JARVIS OS — AI-powered personal operating system",
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url="/api/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# ─── Middleware ──────────────────────────────────────────────────────────────

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ─────────────────────────────────────────────────────────────────

app.include_router(health.router, tags=["health"])
app.include_router(auth_router.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(tasks_router.router, prefix="/api/v1", tags=["tasks"])
