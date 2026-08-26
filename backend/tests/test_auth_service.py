"""Auth service and middleware: tokens, OAuth users, sessions, audit log."""

import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from httpx import AsyncClient

from app.auth import service
from app.auth.middleware import require_permission_level
from app.auth.models import User, UserSession
from app.config import get_settings

settings = get_settings()


def _nextauth_token(**claims) -> str:
    now = int(datetime.now(timezone.utc).timestamp())
    payload = {
        "sub": claims.get("email", "oauth@example.com"),
        "email": "oauth@example.com",
        "name": "OAuth User",
        "iat": now,
        "exp": now + 3600,
        **claims,
    }
    return jwt.encode(payload, settings.nextauth_secret, algorithm="HS256")


# ─── Tokens ──────────────────────────────────────────────────────────────────


def test_access_token_round_trips_the_user_id():
    user_id = uuid.uuid4()
    token, expires_at = service.create_access_token(user_id)
    decoded = service.decode_access_token(token)
    assert decoded["sub"] == str(user_id)
    assert decoded["type"] == "access"
    assert expires_at > datetime.now(timezone.utc)


def test_decode_access_token_rejects_another_signing_key():
    forged = jwt.encode({"sub": "x"}, "a-different-secret", algorithm="HS256")
    with pytest.raises(jwt.PyJWTError):
        service.decode_access_token(forged)


def test_verify_nextauth_token_parses_the_payload():
    payload = service.verify_nextauth_token(_nextauth_token(picture="http://img/1.png"))
    assert payload.email == "oauth@example.com"
    assert payload.picture == "http://img/1.png"


def test_verify_nextauth_token_rejects_a_bad_signature():
    forged = jwt.encode({"email": "x@example.com"}, "wrong-secret", algorithm="HS256")
    with pytest.raises(jwt.PyJWTError):
        service.verify_nextauth_token(forged)


# ─── Lookup ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_user_by_email_finds_and_misses(db, test_user):
    assert (await service.get_user_by_email(db, test_user.email)).id == test_user.id
    assert await service.get_user_by_email(db, "nobody@example.com") is None


@pytest.mark.asyncio
async def test_get_user_by_id_finds_and_misses(db, test_user):
    assert (await service.get_user_by_id(db, test_user.id)).email == test_user.email
    assert await service.get_user_by_id(db, uuid.uuid4()) is None


# ─── OAuth users ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_or_create_oauth_user_creates_a_verified_user(db):
    user = await service.get_or_create_oauth_user(
        db, email="new@example.com", name="New", avatar_url=None
    )
    assert user.id is not None
    assert user.is_verified is True
    assert user.last_login_at is not None


@pytest.mark.asyncio
async def test_get_or_create_oauth_user_reuses_an_existing_account(db, test_user):
    same = await service.get_or_create_oauth_user(
        db, email=test_user.email, name="Ignored", avatar_url=None
    )
    assert same.id == test_user.id
    assert same.name == "Test User"  # not overwritten


@pytest.mark.asyncio
async def test_get_or_create_oauth_user_backfills_a_missing_google_id(db, test_user):
    user = await service.get_or_create_oauth_user(
        db, email=test_user.email, name=None, avatar_url=None, google_id="g-1"
    )
    assert user.google_id == "g-1"


@pytest.mark.asyncio
async def test_get_or_create_oauth_user_keeps_an_existing_google_id(db):
    first = await service.get_or_create_oauth_user(
        db, email="g@example.com", name=None, avatar_url=None, google_id="original"
    )
    again = await service.get_or_create_oauth_user(
        db, email="g@example.com", name=None, avatar_url=None, google_id="replacement"
    )
    assert again.google_id == "original"
    assert again.id == first.id


# ─── Sessions ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_session_stores_only_a_token_hash(db, test_user):
    token, session = await service.create_session(
        db, test_user, ip_address="10.0.0.1", user_agent="pytest"
    )
    assert session.token_hash != token
    assert token not in session.token_hash
    assert session.ip_address == "10.0.0.1"
    assert session.user_agent == "pytest"


@pytest.mark.asyncio
async def test_validate_session_token_accepts_a_live_session(db, test_user):
    token, _ = await service.create_session(db, test_user)
    assert (await service.validate_session_token(db, token)).id == test_user.id


@pytest.mark.asyncio
async def test_validate_session_token_rejects_an_unknown_token(db):
    assert await service.validate_session_token(db, "never-issued") is None


@pytest.mark.asyncio
async def test_validate_session_token_rejects_an_expired_session(db, test_user):
    token, session = await service.create_session(db, test_user)
    session.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    await db.flush()
    assert await service.validate_session_token(db, token) is None


@pytest.mark.asyncio
async def test_validate_session_token_rejects_a_revoked_session(db, test_user):
    token, session = await service.create_session(db, test_user)
    session.is_active = False
    await db.flush()
    assert await service.validate_session_token(db, token) is None


@pytest.mark.asyncio
async def test_validate_session_token_returns_none_when_the_user_is_gone(db, test_user):
    token, session = await service.create_session(db, test_user)
    session.user_id = uuid.uuid4()
    await db.flush()
    assert await service.validate_session_token(db, token) is None


# ─── Audit log ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_append_audit_log_records_the_action(db, test_user):
    from sqlalchemy import select

    from app.auth.models import AuditLog

    await service.append_audit_log(
        db,
        user_id=test_user.id,
        action_type="document.delete",
        permission_level_used=3,
        agent_name="executive",
        resource_type="document",
        resource_id="doc-1",
        duration_ms=12,
    )

    entry = (await db.execute(select(AuditLog))).scalars().one()
    assert entry.action_type == "document.delete"
    assert entry.permission_level_used == 3
    assert entry.resource_id == "doc-1"


@pytest.mark.asyncio
async def test_append_audit_log_accepts_an_anonymous_actor(db):
    from sqlalchemy import select

    from app.auth.models import AuditLog

    await service.append_audit_log(
        db, user_id=None, action_type="system.boot", permission_level_used=1
    )
    entry = (await db.execute(select(AuditLog))).scalars().one()
    assert entry.user_id is None


# ─── Permission levels ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_require_permission_level_allows_a_sufficient_user(test_user):
    check = await require_permission_level(2)
    assert await check(test_user) is test_user


@pytest.mark.asyncio
async def test_require_permission_level_blocks_an_insufficient_user(test_user):
    test_user.max_permission_level = 1
    check = await require_permission_level(4)
    with pytest.raises(Exception) as excinfo:
        await check(test_user)
    assert "Permission level 4 required" in str(excinfo.value.detail)


# ─── Middleware through the app ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_request_without_credentials_is_rejected(client: AsyncClient):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


@pytest.mark.asyncio
async def test_a_garbage_bearer_token_is_rejected(client: AsyncClient):
    response = await client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"}
    )
    assert response.status_code == 401
    assert "Invalid token" in response.json()["detail"]


@pytest.mark.asyncio
async def test_a_nextauth_token_creates_the_user_and_authenticates(client: AsyncClient, db):
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {_nextauth_token(email='fresh@example.com')}"},
    )
    assert response.status_code == 200
    assert response.json()["email"] == "fresh@example.com"


@pytest.mark.asyncio
async def test_a_disabled_account_is_refused(client: AsyncClient, db):
    db.add(User(id=uuid.uuid4(), email="off@example.com", name="Off", is_active=False))
    await db.flush()

    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {_nextauth_token(email='off@example.com')}"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Account disabled"


@pytest.mark.asyncio
async def test_a_jarvis_session_token_authenticates(client: AsyncClient, db, test_user):
    token, _ = await service.create_session(db, test_user)
    response = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == test_user.email


# ─── /auth/session exchange ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_session_exchange_issues_a_backend_token(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/session", json={"token": _nextauth_token(email="swap@example.com")}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["expires_in"] == 24 * 60 * 60


@pytest.mark.asyncio
async def test_session_exchange_rejects_an_invalid_token(client: AsyncClient):
    forged = jwt.encode({"email": "x@example.com"}, "wrong-secret", algorithm="HS256")
    response = await client.post("/api/v1/auth/session", json={"token": forged})
    assert response.status_code == 401
    # The endpoint now tries the token as a Google ID token first and falls back
    # to NextAuth, reporting both refusals. Naming only one verifier is what let
    # the Google path fail unnoticed for every user.
    detail = response.json()["detail"]
    assert "Token rejected" in detail
    assert "As a Google ID token" in detail
    assert "As a NextAuth token" in detail


@pytest.mark.asyncio
async def test_session_exchange_persists_a_session_row(client: AsyncClient, db):
    from sqlalchemy import select

    await client.post(
        "/api/v1/auth/session", json={"token": _nextauth_token(email="rowcheck@example.com")}
    )
    rows = (await db.execute(select(UserSession))).scalars().all()
    assert len(rows) >= 1
