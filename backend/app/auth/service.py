import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuditLog, User, UserSession
from app.auth.schemas import NextAuthSessionPayload
from app.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_TOKEN_EXPIRY_HOURS = 24


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def create_access_token(user_id: uuid.UUID) -> tuple[str, datetime]:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=_TOKEN_EXPIRY_HOURS)
    payload = {
        "sub": str(user_id),
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    token = jwt.encode(payload, settings.secret_key, algorithm="HS256")
    return token, expires_at


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


def verify_nextauth_token(token: str) -> NextAuthSessionPayload:
    """Validates a JWT issued by NextAuth.js using the shared NEXTAUTH_SECRET."""
    payload = jwt.decode(token, settings.nextauth_secret, algorithms=["HS256"])
    return NextAuthSessionPayload(**payload)


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_or_create_oauth_user(
    db: AsyncSession,
    *,
    email: str,
    name: str | None,
    avatar_url: str | None,
    google_id: str | None = None,
) -> User:
    user = await get_user_by_email(db, email)
    if user:
        if google_id and not user.google_id:
            user.google_id = google_id
        user.last_login_at = datetime.now(timezone.utc)
        return user

    user = User(
        email=email,
        name=name,
        avatar_url=avatar_url,
        google_id=google_id,
        is_verified=True,
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return user


async def create_session(
    db: AsyncSession,
    user: User,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> tuple[str, UserSession]:
    token, expires_at = create_access_token(user.id)
    session = UserSession(
        user_id=user.id,
        token_hash=_hash_token(token),
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(session)
    await db.flush()
    return token, session


async def validate_session_token(db: AsyncSession, token: str) -> User | None:
    token_hash = _hash_token(token)
    result = await db.execute(
        select(UserSession)
        .where(
            UserSession.token_hash == token_hash,
            UserSession.is_active == True,
            UserSession.expires_at > datetime.now(timezone.utc),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return None
    return await get_user_by_id(db, session.user_id)


async def append_audit_log(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None,
    action_type: str,
    permission_level_used: int,
    agent_name: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    input_hash: str | None = None,
    output_hash: str | None = None,
    duration_ms: int | None = None,
    metadata: str | None = None,
) -> None:
    entry = AuditLog(
        user_id=user_id,
        action_type=action_type,
        permission_level_used=permission_level_used,
        agent_name=agent_name,
        resource_type=resource_type,
        resource_id=resource_id,
        input_hash=input_hash,
        output_hash=output_hash,
        duration_ms=duration_ms,
        metadata=metadata,
    )
    db.add(entry)
    # Flush but do not commit here; caller owns the transaction
    await db.flush()
