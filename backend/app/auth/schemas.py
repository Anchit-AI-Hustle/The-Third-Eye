import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    email: EmailStr
    name: Optional[str] = None


class UserCreate(UserBase):
    password: Optional[str] = Field(None, min_length=12)
    google_id: Optional[str] = None


class UserResponse(UserBase):
    id: uuid.UUID
    is_active: bool
    is_verified: bool
    totp_enabled: bool
    max_permission_level: int
    privacy_mode: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class NextAuthSessionPayload(BaseModel):
    """Payload from NextAuth.js session token (validated on backend)."""
    sub: str  # user email or ID
    email: EmailStr
    name: Optional[str] = None
    picture: Optional[str] = None
    iat: int
    exp: int


class VerifyTokenRequest(BaseModel):
    token: str


class UserSessionResponse(BaseModel):
    id: uuid.UUID
    user: UserResponse
    expires_at: datetime

    model_config = {"from_attributes": True}
