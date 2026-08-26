from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Core
    environment: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"
    secret_key: str = Field(..., min_length=32)
    financial_encryption_key: str = Field(..., min_length=32)

    # Database
    database_url: str
    database_url_sync: str = ""
    # Dedicated Postgres schema for this service's tables, set via the
    # connection's search_path (below) rather than schema-qualifying every
    # model. Lets the backend share a single free-tier Postgres instance —
    # e.g. the same Supabase project the frontend already uses — without its
    # tables colliding with the frontend's own `public` schema, instead of
    # requiring a second, billed database just for this service.
    db_schema: str = "public"

    @field_validator("db_schema")
    @classmethod
    def validate_db_schema(cls, v: str) -> str:
        if not v.replace("_", "").isalnum() or not v[:1].isalpha():
            raise ValueError("db_schema must be a plain identifier (letters, digits, underscore)")
        return v

    # Redis
    redis_url: str

    # NextAuth bridge
    nextauth_secret: str = Field(..., min_length=32)
    # Audience a Google ID token must carry. The frontend posts
    # `account.id_token` to /api/v1/auth/session, and such a token only means
    # anything to us if Google minted it for *this* OAuth client — otherwise a
    # token issued to any other Google app would authenticate here. Same value
    # as the frontend's GOOGLE_CLIENT_ID. Empty disables Google-token exchange,
    # which then rejects rather than trusting an unverifiable token.
    google_client_id: str = ""

    # AI Providers
    google_ai_api_key: str = Field(..., min_length=1)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    ollama_base_url: str = "http://ollama:11434"
    # Gemini model used for the Google-Search-grounded route. Overridable so
    # the grounded model can be refreshed without a code change.
    google_grounded_model: str = "gemini-2.5-flash"
    # Let the research agent answer via Gemini's google_search tool when no
    # SERPER_API_KEY is configured, instead of degrading to "search unavailable".
    enable_google_grounding: bool = True

    # Rate limiting
    ai_rate_limit_rpm: int = 60
    default_monthly_token_budget: int = 0  # 0 = unlimited

    # Feature flags
    enable_voice: bool = False
    enable_local_ai: bool = False
    enable_financial_module: bool = False

    # CORS — comma-separated origins
    cors_origins: str = "http://localhost:3000"

    # Shared secret for the external cron trigger (see api/health.py's
    # /internal/run-consolidation). Empty disables the endpoint entirely —
    # needed on free scale-to-zero compute (Cloud Run et al.), where an
    # in-process APScheduler job only fires if the instance happens to
    # already be warm at the scheduled time, which it usually won't be.
    internal_cron_secret: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @field_validator("database_url_sync", mode="before")
    @classmethod
    def derive_sync_url(cls, v: str, info) -> str:
        if v:
            return v
        # Derive sync URL from async URL for Alembic
        async_url = info.data.get("database_url", "")
        return async_url.replace("postgresql+asyncpg://", "postgresql://")

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
