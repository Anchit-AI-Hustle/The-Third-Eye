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

    # Redis
    redis_url: str

    # NextAuth bridge
    nextauth_secret: str = Field(..., min_length=32)

    # AI Providers
    google_ai_api_key: str = Field(..., min_length=1)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    ollama_base_url: str = "http://ollama:11434"

    # Rate limiting
    ai_rate_limit_rpm: int = 60
    default_monthly_token_budget: int = 0  # 0 = unlimited

    # Feature flags
    enable_voice: bool = False
    enable_local_ai: bool = False
    enable_financial_module: bool = False

    # CORS — comma-separated origins
    cors_origins: str = "http://localhost:3000"

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
