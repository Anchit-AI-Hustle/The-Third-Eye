import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.service import (
    create_access_token,
    decode_access_token,
    get_or_create_oauth_user,
    hash_password,
    verify_password,
)
from app.config import get_settings

settings = get_settings()


def test_password_hashing():
    plain = "SuperSecurePassword123!"
    hashed = hash_password(plain)
    assert hashed != plain
    assert verify_password(plain, hashed)
    assert not verify_password("wrong-password", hashed)


def test_create_access_token():
    user_id = uuid.uuid4()
    token, expires_at = create_access_token(user_id)
    assert token
    assert expires_at > datetime.now(timezone.utc)

    decoded = decode_access_token(token)
    assert decoded["sub"] == str(user_id)
    assert decoded["type"] == "access"


def test_decode_invalid_token():
    with pytest.raises(Exception):
        decode_access_token("invalid.token.here")


@pytest.mark.asyncio
async def test_get_or_create_oauth_user_creates_new(db: AsyncSession):
    user = await get_or_create_oauth_user(
        db,
        email="newuser@example.com",
        name="New User",
        avatar_url=None,
        google_id="google-123",
    )
    assert user.email == "newuser@example.com"
    assert user.google_id == "google-123"
    assert user.is_verified is True


@pytest.mark.asyncio
async def test_get_or_create_oauth_user_returns_existing(db: AsyncSession):
    # Create first
    user1 = await get_or_create_oauth_user(
        db, email="existing@example.com", name="Existing", avatar_url=None
    )
    await db.commit()

    # Fetch second time
    user2 = await get_or_create_oauth_user(
        db, email="existing@example.com", name="Existing", avatar_url=None
    )
    assert user1.id == user2.id


@pytest.mark.asyncio
async def test_auth_me_requires_auth(client: AsyncClient):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_auth_me_with_valid_token(client: AsyncClient, test_user: User, db: AsyncSession):
    token, _ = create_access_token(test_user.id)

    # Patch session validation to return test_user
    with patch("app.auth.service.validate_session_token", new_callable=AsyncMock, return_value=test_user):
        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["email"] == test_user.email
