import pytest
from pydantic import ValidationError

from app.config import Settings


def _base_kwargs() -> dict:
    return dict(
        secret_key="x" * 32,
        financial_encryption_key="y" * 32,
        database_url="sqlite+aiosqlite:///:memory:",
        redis_url="redis://localhost:6379/0",
        nextauth_secret="z" * 32,
        google_ai_api_key="k",
    )


def test_db_schema_defaults_to_public():
    assert Settings(**_base_kwargs()).db_schema == "public"


def test_db_schema_accepts_valid_identifier():
    assert Settings(**_base_kwargs(), db_schema="backend_app").db_schema == "backend_app"


def test_db_schema_rejects_punctuation():
    with pytest.raises(ValidationError):
        Settings(**_base_kwargs(), db_schema="bad-schema!")


def test_db_schema_rejects_leading_digit():
    with pytest.raises(ValidationError):
        Settings(**_base_kwargs(), db_schema="1backend")
