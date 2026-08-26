from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth.middleware import get_current_user
from app.auth.models import User
from app.auth.schemas import TokenResponse, UserResponse, VerifyTokenRequest
from app.auth.service import (
    create_session,
    get_or_create_oauth_user,
    verify_google_id_token,
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
    Exchanges a sign-in token for a JARVIS backend session token. Called by the
    frontend right after a successful NextAuth login.

    Accepts either token the frontend might hold. In practice it posts Google's
    `account.id_token` (RS256, signed by Google), so that is tried first; the
    NextAuth HS256 path is kept for any caller holding one of those instead.
    Both failures are reported, because "invalid token" without saying which
    verifier rejected it is what let this endpoint fail silently for so long.
    """
    try:
        payload = verify_google_id_token(body.token)
    except Exception as google_error:
        try:
            payload = verify_nextauth_token(body.token)
        except Exception as nextauth_error:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=(
                    f"Token rejected. As a Google ID token: {google_error}. "
                    f"As a NextAuth token: {nextauth_error}."
                ),
            ) from google_error

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
