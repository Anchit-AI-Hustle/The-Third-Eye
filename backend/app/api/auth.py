from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth.middleware import get_current_user
from app.auth.models import User
from app.auth.schemas import TokenResponse, UserResponse, VerifyTokenRequest
from app.auth.service import (
    create_session,
    get_or_create_oauth_user,
    verify_nextauth_token,
)
from app.database import AsyncSession, get_db

router = APIRouter()


@router.post("/session", response_model=TokenResponse)
async def exchange_nextauth_token(
    body: VerifyTokenRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """
    Exchanges a NextAuth.js JWT for a JARVIS backend session token.
    Called by the frontend after a successful NextAuth login.
    """
    try:
        payload = verify_nextauth_token(body.token)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid NextAuth token: {e}",
        ) from e

    user = await get_or_create_oauth_user(
        db,
        email=payload.email,
        name=payload.name,
        avatar_url=payload.picture,
    )

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    token, session = await create_session(db, user, ip_address=ip, user_agent=ua)

    expiry_seconds = 24 * 60 * 60
    return TokenResponse(access_token=token, expires_in=expiry_seconds)


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserResponse:
    return current_user
