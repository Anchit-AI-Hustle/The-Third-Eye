from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.models import User
from app.auth.service import validate_session_token, verify_nextauth_token
from app.database import AsyncSession, get_db

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """
    Accepts either:
    - A JARVIS-issued JWT (signed with SECRET_KEY)
    - A NextAuth.js JWT (signed with NEXTAUTH_SECRET) for server-side calls
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Attempt JARVIS session validation first
    user = await validate_session_token(db, token)
    if user:
        return user

    # Fall back to NextAuth JWT
    try:
        payload = verify_nextauth_token(token)
    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    from app.auth.service import get_or_create_oauth_user

    user = await get_or_create_oauth_user(
        db,
        email=payload.email,
        name=payload.name,
        avatar_url=payload.picture,
    )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return user


async def require_permission_level(required_level: int):
    """Factory: returns a dependency that enforces minimum permission level."""

    async def _check(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.max_permission_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission level {required_level} required",
            )
        return user

    return _check
