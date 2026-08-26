import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuditLog, User, UserSession
from app.auth.schemas import NextAuthSessionPayload
from app.config import get_settings

settings = get_settings()

_TOKEN_EXPIRY_HOURS = 24

# bcrypt hashes at most 72 bytes. Older releases truncated silently; 5.x raises
# instead, so we truncate explicitly and identically on both sides — otherwise a
# long password would hash fine and then fail to verify.
_BCRYPT_MAX_BYTES = 72


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _password_bytes(plain: str) -> bytes:
    return plain.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_password_bytes(plain), hashed.encode("utf-8"))
    except ValueError:
        # Malformed or non-bcrypt hash in the row — treat as a failed login
        # rather than a 500.
        return False


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_password_bytes(plain), bcrypt.gensalt()).decode("utf-8")


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


# Google publishes the public keys for its ID tokens here. PyJWKClient caches
# them and refetches when it sees an unknown key id, which is what Google's key
# rotation looks like from our side.
GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"

# Google mints ID tokens with either spelling of the issuer; both are valid and
# no other value is.
GOOGLE_ISSUERS = frozenset({"accounts.google.com", "https://accounts.google.com"})

_jwks_client: jwt.PyJWKClient | None = None


def _google_jwks_client() -> jwt.PyJWKClient:
    """Cached JWKS client. A separate function so tests can substitute keys."""
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(GOOGLE_CERTS_URL, cache_keys=True)
    return _jwks_client


def verify_google_id_token(token: str) -> NextAuthSessionPayload:
    """
    Validates an ID token issued by Google, applying the checks Google requires:
    an RS256 signature against their published keys, `aud` equal to this OAuth
    client id, `iss` one of the two accepted spellings, and an unexpired `exp`.

    This exists because /api/v1/auth/session is posted `account.id_token`, which
    Google signs RS256 with its own key — while verify_nextauth_token above
    decodes HS256 with our shared secret. Those can never agree: PyJWT raises
    InvalidAlgorithmError before it even inspects the signature, so the exchange
    endpoint failed for every user and the frontend never obtained a backend
    token. The NextAuth verifier is still correct for the Bearer tokens the API
    middleware sees, so the two live side by side.

    `email_verified` is required because users are looked up and created by
    email: accepting an address Google has not confirmed would let someone
    claim another person's account.
    """
    if not settings.google_client_id:
        raise jwt.InvalidTokenError(
            "Google token exchange is not configured (GOOGLE_CLIENT_ID unset on the backend)."
        )

    signing_key = _google_jwks_client().get_signing_key_from_jwt(token)
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=settings.google_client_id,
        options={"require": ["exp", "iat", "sub", "aud", "iss"]},
    )

    issuer = payload.get("iss")
    if issuer not in GOOGLE_ISSUERS:
        raise jwt.InvalidIssuerError(f"Unexpected ID token issuer: {issuer!r}")

    if not payload.get("email"):
        raise jwt.InvalidTokenError("ID token carries no email claim.")
    if payload.get("email_verified") is not True:
        raise jwt.InvalidTokenError("Google has not verified this account's email address.")

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
            UserSession.is_active.is_(True),
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
        metadata_json=metadata,
    )
    db.add(entry)
    # Flush but do not commit here; caller owns the transaction
    await db.flush()
