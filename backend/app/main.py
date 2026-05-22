import structlog
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
import redis.asyncio as aioredis

from app.config import get_settings
from app.database import check_db_connection, engine

# Importing the agents package triggers registry registration
from app.agents import registry  # noqa: F401
from app.memory.consolidation import schedule_consolidation_job

from app.api import (
    auth as auth_router,
    chat,
    documents,
    health,
    knowledge,
    tasks as tasks_router,
)

settings = get_settings()
log = structlog.get_logger()

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("jarvis_starting", environment=settings.environment)

    if not await check_db_connection():
        raise RuntimeError("Cannot connect to PostgreSQL on startup")
    log.info("db_connected")

    try:
        redis = aioredis.from_url(settings.redis_url)
        await redis.ping()
        await redis.aclose()
        log.info("redis_connected")
    except Exception as e:
        raise RuntimeError(f"Cannot connect to Redis on startup: {e}") from e

    # Schedule nightly memory consolidation (skip in test environment)
    if settings.environment != "test":
        schedule_consolidation_job(scheduler)
        scheduler.start()
        log.info("scheduler_started")

    yield

    if scheduler.running:
        scheduler.shutdown(wait=False)
    await engine.dispose()
    log.info("jarvis_shutdown")


app = FastAPI(
    title="JARVIS OS API",
    version="0.2.0",
    description="JARVIS OS — AI-powered personal operating system",
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url="/api/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(auth_router.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(tasks_router.router, prefix="/api/v1", tags=["tasks"])
app.include_router(documents.router, prefix="/api/v1", tags=["documents"])
app.include_router(knowledge.router, prefix="/api/v1", tags=["knowledge"])
